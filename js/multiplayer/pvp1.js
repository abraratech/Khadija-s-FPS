// PVP.1 R1 — isolated private Team Elimination runtime.

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import {
  PVP1_MODE,
  PVP1_PATCH,
  classifyPvp1StateUpdate,
  derivePvp1Presentation,
  normalizePvp1State,
  roomUsesPvp1,
  shouldPresentPvp1Summary
} from './pvp1_core.js';
import {
  PVP5_COMPETITIVE_MAPS,
  PVP5_PATCH,
  selectPvp5SpectatorTarget
} from './pvp5_core.js';

function cleanText(value, fallback = '', limit = 120) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class MultiplayerPvp1Manager {
  constructor({
    eventBus,
    transport,
    runtime,
    session,
    player,
    remotePlayers,
    adapter = {}
  } = {}) {
    this.eventBus = eventBus;
    this.transport = transport;
    this.runtime = runtime;
    this.session = session;
    this.player = player;
    this.remotePlayers = remotePlayers;
    this.adapter = adapter || {};
    this.room = null;
    this.state = null;
    this.active = false;
    this.lastSpawnSerial = 0;
    this.lastRevision = -1;
    this.unsubscribe = [];
    this.hud = null;
    this.matchSummary = null;
    this.lastSummaryRunId = '';
    this.activeRunId = '';
    this.spectatorTargetId = null;
    this.spectatorPosition = globalThis.THREE ? new globalThis.THREE.Vector3() : null;
    this.rematchVotePending = false;
    this.keyHandler = (event) => {
      if (!this.active || this.state?.players?.[this.localPlayerId]?.alive !== false) return;
      if (event.code === 'KeyQ' || event.code === 'ArrowLeft') {
        event.preventDefault();
        this.cycleSpectator(-1);
      } else if (event.code === 'KeyE' || event.code === 'ArrowRight') {
        event.preventDefault();
        this.cycleSpectator(1);
      }
    };
    globalThis.addEventListener?.('keydown', this.keyHandler);

    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, (event) => {
        this.syncRoom(event?.payload?.room || null);
      }) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_EVENTS.TRANSPORT_CONTROL, (event) => {
        const message = event?.payload || {};
        this.handleControl(message.action, message.payload || {});
      }) || (() => {})
    );
  }

  get localPlayerId() {
    return this.runtime?.localPlayerId || '';
  }

  isPvpRoom(room = this.room || this.runtime?.room?.getSnapshot?.()) {
    return roomUsesPvp1(room);
  }

  getState() {
    return this.state;
  }

  getSnapshot(now = Date.now()) {
    const presentation = derivePvp1Presentation(
      this.state || {},
      this.localPlayerId,
      now
    );
    return Object.freeze({
      patch: PVP1_PATCH,
      mode: this.isPvpRoom() ? PVP1_MODE : 'coop',
      active: this.active,
      state: this.state,
      presentation
    });
  }

  beginRun() {
    this.room = this.runtime?.room?.getSnapshot?.() || this.room;
    this.active = this.isPvpRoom(this.room);
    this.activeRunId = String(
      this.session?.run?.runId
      || this.room?.runId
      || ''
    );
    this.lastSpawnSerial = 0;
    this.spectatorTargetId = null;
    this.rematchVotePending = false;
    this.hideMatchSummary();
    this.setNativeHudIsolation(this.active);
    if (!this.active) {
      this.hideHud();
      return false;
    }

    if (this.activeRunId && this.state?.runId !== this.activeRunId) {
      this.state = null;
      this.lastRevision = -1;
    }

    if (
      this.room?.pvp
      && (
        !this.activeRunId
        || String(this.room.pvp.runId || '') === this.activeRunId
      )
    ) {
      this.applyState(this.room.pvp, { force: true });
    }
    this.ensureHud();
    this.render();
    return true;
  }

  endRun() {
    this.active = false;
    this.lastSpawnSerial = 0;
    this.spectatorTargetId = null;
    this.rematchVotePending = false;
    this.adapter.clearPvpRules?.();
    this.hideHud();
    this.setNativeHudIsolation(false);
  }

  syncRoom(room) {
    if (!room) return;
    this.room = room;
    if (room.pvp) {
      this.applyState(room.pvp);
    } else if (!roomUsesPvp1(room)) {
      this.state = null;
      this.lastRevision = -1;
    }
    this.render();
  }

  handleControl(action, payload) {
    if (action === 'pvp-state' && payload?.state) {
      this.applyState(payload.state);
      return;
    }

    // The room lobby opens immediately after the authoritative run-ended
    // control. Re-present the embedded final PvP state here so a dropped or
    // reordered hit/state packet cannot suppress the match result.
    if (action === 'run-ended' && payload?.pvp) {
      const finalState = normalizePvp1State(payload.pvp);
      const expectedRunId = String(
        this.activeRunId
        || this.session?.run?.runId
        || finalState.runId
        || ''
      );
      if (finalState.runId && finalState.runId === expectedRunId) {
        this.applyState(finalState, { force: true });
        if (finalState.phase === 'COMPLETE') {
          this.lastSummaryRunId = finalState.runId;
          this.showMatchSummary(finalState);
        }
      }
      return;
    }

    if (action === 'pvp-rematch-status') {
      if (payload?.state) this.applyState(payload.state, { force: true });
      const received = Math.max(0, Number(payload?.votesReceived) || 0);
      const required = Math.max(0, Number(payload?.votesRequired) || 0);
      this.rematchVotePending = payload?.voterId === this.localPlayerId || this.rematchVotePending;
      this.adapter.showToast?.(
        payload?.ready === true
          ? `REMATCH STARTING · ${cleanText(payload.selectedMapId, 'NEXT ARENA').replace(/_/g, ' ').toUpperCase()}`
          : `REMATCH VOTES · ${received}/${required}`,
        payload?.ready === true ? '#7df2a5' : '#72e4ff',
        1800
      );
      this.renderMatchSummaryVoteStatus(payload);
      return;
    }

    if (action === 'pvp-rematch-rejected') {
      this.rematchVotePending = false;
      this.adapter.showToast?.(
        cleanText(payload?.reason, 'REMATCH UNAVAILABLE').replace(/_/g, ' '),
        '#ff9cab',
        1800
      );
      this.renderMatchSummaryVoteStatus(payload);
      return;
    }

    if (action === 'pvp-pickup-result') {
      const event = payload?.event || {};
      if (event.playerId === this.localPlayerId) {
        const label = event.kind === 'WEAPON'
          ? `${cleanText(event.weaponFamily, 'WEAPON')} ACQUIRED`
          : event.kind === 'ARMOR'
            ? `ARMOR ACQUIRED · ${Math.max(0, Number(event.detail) || 0)}`
            : 'MAX AMMO ACQUIRED';
        this.adapter.showToast?.(
          label,
          event.kind === 'ARMOR' ? '#69a7ff' : event.kind === 'AMMO' ? '#ffd166' : '#7df2a5',
          1700
        );
      } else {
        this.adapter.showToast?.(
          `${cleanText(event.playerTeam, 'OPPONENT')} CLAIMED ${event.kind === 'WEAPON' ? cleanText(event.weaponFamily, 'WEAPON') : cleanText(event.kind, 'PICKUP')}`,
          '#ff9cab',
          1100
        );
      }
      if (event.nextLocationId) {
        this.adapter.showToast?.(
          `HOT DROP RELOCATING · ${Math.max(1, Math.ceil((Number(event.availableAt) - Number(event.serverTime || Date.now())) / 1000))}s`,
          '#72e4ff',
          1500
        );
      }
      if (payload?.state) this.applyState(payload.state, { force: true });
      return;
    }

    if (action === 'pvp-pickup-rejected') {
      this.adapter.handlePvpPickupRejected?.(payload || {});
      return;
    }

    if (action === 'pvp-hit-result') {
      const event = payload?.event || {};
      if (event.shooterId === this.localPlayerId) {
        const suffix = event.eliminated
          ? ' · ELIMINATION'
          : event.headshot
            ? ' · HEADSHOT'
            : '';
        this.adapter.showToast?.(
          `PVP HIT · ${Math.max(0, Number(event.damage) || 0)}${suffix}`,
          event.eliminated ? '#7df2a5' : '#00d4ff',
          event.eliminated ? 1700 : 900
        );
      }
      if (Array.isArray(event.assistPlayerIds) && event.assistPlayerIds.includes(this.localPlayerId)) {
        this.adapter.showToast?.('ASSIST', '#72e4ff', 1200);
      }
      if (event.targetId === this.localPlayerId && event.eliminated) {
        this.spectatorTargetId = cleanText(event.spectatorTargetId, '', 180) || null;
        this.adapter.showToast?.(
          'ELIMINATED · Q/E TO SPECTATE',
          '#ff6b6b',
          2200
        );
      }
      if (event.roundEnded) {
        this.adapter.showToast?.(
          `${cleanText(event.roundWinnerTeam, 'TEAM')} WINS THE ROUND`,
          '#ffd166',
          2200
        );
      }
      if (event.matchEnded) {
        this.adapter.showToast?.(
          `${cleanText(event.winnerTeam, 'TEAM')} WINS THE MATCH`,
          '#7df2a5',
          3500
        );
      }
      if (payload?.state) this.applyState(payload.state, { force: true });
    }
  }

  applyState(value, { force = false } = {}) {
    const activeRunId = this.active
      ? String(this.activeRunId || this.session?.run?.runId || '')
      : '';
    const decision = classifyPvp1StateUpdate({
      currentState: this.state,
      incomingState: value,
      activeRunId,
      force
    });
    if (!decision.accepted) return false;

    const next = decision.incoming;
    if (decision.runChanged) {
      this.lastSpawnSerial = 0;
      this.lastRevision = -1;
    }
    this.state = next;
    this.lastRevision = next.revision;
    if (this.active || this.session?.run?.active === true) {
      this.applyLocalState();
    }
    if (shouldPresentPvp1Summary({
      state: next,
      activeRunId,
      lastSummaryRunId: this.lastSummaryRunId
    })) {
      this.lastSummaryRunId = next.runId;
      this.showMatchSummary(next);
    }
    this.render();
    return true;
  }

  applyLocalState() {
    if (!this.player || !this.state) return false;
    const local = this.state.players[this.localPlayerId];
    if (!local) return false;

    const shouldSpawn = (
      local.spawnSerial > this.lastSpawnSerial
      && this.state.phase !== 'COMPLETE'
    );
    if (shouldSpawn) {
      this.lastSpawnSerial = local.spawnSerial;
      this.adapter.placePvpSpawn?.({
        team: local.team,
        slot: local.slot,
        round: this.state.round,
        spawnSerial: local.spawnSerial
      });
    }

    this.player.maxHealth = Math.max(1, Number(local.maxHealth) || 100);
    this.player.health = Math.max(
      0,
      Math.min(this.player.maxHealth, Number(local.health) || 0)
    );
    this.player.alive = local.alive === true;
    this.player.isDowned = false;
    this.player.isSpectating = local.alive !== true;
    this.player.multiplayerLifeState = local.alive === true
      ? 'ACTIVE'
      : 'SPECTATING';
    if (local.alive === true) {
      this.spectatorTargetId = null;
    } else if (!this.spectatorTargetId) {
      this.spectatorTargetId = local.spectatingTargetId
        || selectPvp5SpectatorTarget(this.state, {
          playerId: this.localPlayerId
        });
    }
    if (local.alive !== true) {
      this.player.vel?.set?.(0, 0, 0);
      this.player.isADS = false;
      this.player.isSprinting = false;
    }
    this.adapter.applyPvpRules?.({
      state: this.state,
      localPlayer: local,
      localPlayerId: this.localPlayerId
    });
    this.adapter.syncHud?.();
    return true;
  }

  requestPickup(pickupId) {
    if (!this.active || !this.state) return false;
    const presentation = derivePvp1Presentation(
      this.state,
      this.localPlayerId,
      Date.now()
    );
    if (presentation.inputBlocked) return false;
    const cleanPickupId = cleanText(pickupId, '', 80);
    if (!cleanPickupId) return false;
    this.transport?.sendControl?.('pvp-pickup', {
      pickupId: cleanPickupId,
      claimId: `${this.localPlayerId}:${this.state.runId}:${cleanPickupId}:${Date.now().toString(36)}`
    });
    return true;
  }

  attemptShot({
    camera,
    weaponFamily,
    shotId,
    maximumDistance = 180
  } = {}) {
    if (!this.active || !this.state || !camera) return false;
    const presentation = derivePvp1Presentation(
      this.state,
      this.localPlayerId,
      Date.now()
    );
    if (presentation.inputBlocked) return true;

    const local = this.state.players[this.localPlayerId];
    if (!local) return true;
    const opponentIds = Object.values(this.state.players)
      .filter((entry) => entry.team !== local.team && entry.alive === true)
      .map((entry) => entry.playerId);

    const hit = this.remotePlayers?.raycastPvpTarget?.({
      camera,
      opponentIds,
      maximumDistance
    }) || null;

    if (hit?.playerId) {
      this.transport?.sendControl?.('pvp-shot', {
        targetPlayerId: hit.playerId,
        weaponFamily: cleanText(weaponFamily, 'PISTOL', 20).toUpperCase(),
        shotId: cleanText(
          `${this.localPlayerId}:${this.state.runId}:${shotId}`,
          '',
          200
        ),
        headshot: hit.headshot === true,
        distance: Math.max(0, Number(hit.distance) || 0)
      });
    }
    return true;
  }

  update(now = Date.now()) {
    if (!this.active || !this.state) return;
    this.applyLocalState();
    this.updateSpectatorCamera(now);
    this.render(now);
  }

  cycleSpectator(direction = 1) {
    if (!this.state || this.state.players?.[this.localPlayerId]?.alive !== false) return false;
    const next = selectPvp5SpectatorTarget(this.state, {
      playerId: this.localPlayerId,
      currentTargetId: this.spectatorTargetId,
      direction
    });
    if (!next) return false;
    this.spectatorTargetId = next;
    this.render();
    return true;
  }

  updateSpectatorCamera(now = Date.now()) {
    if (
      !this.active
      || this.state?.players?.[this.localPlayerId]?.alive !== false
      || !this.adapter.camera
    ) return false;
    if (!this.spectatorTargetId) this.cycleSpectator(1);
    const sampled = this.runtime?.sampleRemotePlayer?.(
      this.spectatorTargetId,
      Number(now)
    )?.state;
    if (!sampled?.position) return false;
    const camera = this.adapter.camera;
    const yaw = Number(sampled.yaw || 0);
    const targetX = Number(sampled.position.x || 0);
    const targetY = Number(sampled.position.y || 1.65);
    const targetZ = Number(sampled.position.z || 0);
    const desiredX = targetX - Math.sin(yaw) * 4.2;
    const desiredY = targetY + 1.5;
    const desiredZ = targetZ + Math.cos(yaw) * 4.2;
    if (this.spectatorPosition?.set && camera.position?.lerp) {
      this.spectatorPosition.set(desiredX, desiredY, desiredZ);
      camera.position.lerp(this.spectatorPosition, 0.12);
    } else if (camera.position) {
      camera.position.x += (desiredX - Number(camera.position.x || 0)) * 0.12;
      camera.position.y += (desiredY - Number(camera.position.y || 0)) * 0.12;
      camera.position.z += (desiredZ - Number(camera.position.z || 0)) * 0.12;
    }
    camera.lookAt?.(targetX, targetY, targetZ);
    return true;
  }

  isInputBlocked(now = Date.now()) {
    if (!this.active) return false;
    return derivePvp1Presentation(
      this.state || {},
      this.localPlayerId,
      now
    ).inputBlocked;
  }

  ensureHud() {
    if (typeof document === 'undefined') return null;
    if (this.hud?.isConnected) return this.hud;

    const element = document.createElement('section');
    element.id = 'ka-pvp1-hud';
    element.className = 'ka-pvp1-hud';
    element.hidden = true;
    element.setAttribute('aria-live', 'polite');
    element.innerHTML = `
      <div class="ka-pvp1-mode">TEAM ELIMINATION</div>
      <div class="ka-pvp1-score">
        <span data-pvp-team="ALPHA">ALPHA <strong>0</strong></span>
        <b data-pvp-round>ROUND 1</b>
        <span data-pvp-team="BRAVO">BRAVO <strong>0</strong></span>
      </div>
      <div class="ka-pvp1-status">WAITING</div>
    `;
    document.body.appendChild(element);
    this.hud = element;
    return element;
  }

  hideHud() {
    if (this.hud) this.hud.hidden = true;
  }

  ensureMatchSummary() {
    if (typeof document === 'undefined') return null;
    if (this.matchSummary?.isConnected) return this.matchSummary;

    const overlay = document.createElement('section');
    overlay.id = 'ka-pvp-match-summary';
    overlay.hidden = true;
    overlay.setAttribute('aria-live', 'polite');
    Object.assign(overlay.style, {
      // Multiplayer lobby: 12000; Co-Op scoreboard: 12100. The final PvP
      // result must remain above both until CONTINUE reveals the lobby below.
      position: 'fixed', inset: '0', zIndex: '12250', display: 'grid',
      placeItems: 'center', padding: '20px', background: 'rgba(1, 5, 12, .72)',
      fontFamily: 'system-ui, sans-serif', color: '#edf8ff'
    });

    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'PvP match summary');
    Object.assign(panel.style, {
      width: 'min(520px, 92vw)', padding: '24px', borderRadius: '14px',
      border: '1px solid rgba(0, 212, 255, .48)',
      background: 'linear-gradient(180deg, rgba(7, 19, 32, .98), rgba(3, 9, 18, .98))',
      boxShadow: '0 20px 70px rgba(0,0,0,.62)', textAlign: 'center'
    });

    const outcome = document.createElement('div');
    outcome.dataset.pvpSummaryOutcome = '';
    Object.assign(outcome.style, {
      fontWeight: '900', fontSize: '28px', letterSpacing: '.08em', color: '#ffd166'
    });
    const score = document.createElement('div');
    score.dataset.pvpSummaryScore = '';
    Object.assign(score.style, {
      marginTop: '10px', fontWeight: '800', fontSize: '20px', color: '#9edbff'
    });
    const stats = document.createElement('div');
    stats.dataset.pvpSummaryStats = '';
    Object.assign(stats.style, {
      marginTop: '16px', padding: '12px', borderRadius: '9px',
      background: 'rgba(255,255,255,.06)', lineHeight: '1.7', color: '#d8edf7'
    });
    const scoreboard = document.createElement('div');
    scoreboard.dataset.pvpSummaryScoreboard = '';
    Object.assign(scoreboard.style, {
      marginTop: '12px', maxHeight: '210px', overflow: 'auto',
      border: '1px solid rgba(114, 228, 255, .25)', borderRadius: '9px',
      background: 'rgba(0,0,0,.18)', textAlign: 'left'
    });
    const note = document.createElement('div');
    note.textContent = 'Competitive result recorded by arena authority.';
    Object.assign(note.style, { marginTop: '12px', fontSize: '12px', color: '#83a9ba' });
    const mapLabel = document.createElement('label');
    mapLabel.textContent = 'REMATCH ARENA';
    Object.assign(mapLabel.style, {
      display: 'grid', gap: '6px', marginTop: '14px',
      fontSize: '11px', fontWeight: '800', letterSpacing: '.08em',
      color: '#83a9ba', textAlign: 'left'
    });
    const mapSelect = document.createElement('select');
    mapSelect.dataset.pvpRematchMap = '';
    Object.assign(mapSelect.style, {
      width: '100%', padding: '10px', borderRadius: '7px',
      border: '1px solid rgba(114, 228, 255, .42)',
      background: '#071522', color: '#edf8ff', fontWeight: '700'
    });
    PVP5_COMPETITIVE_MAPS.forEach((mapId) => {
      const option = document.createElement('option');
      option.value = mapId;
      option.textContent = mapId.replace(/_/g, ' ').toUpperCase();
      mapSelect.appendChild(option);
    });
    mapLabel.appendChild(mapSelect);

    const voteStatus = document.createElement('div');
    voteStatus.dataset.pvpRematchStatus = '';
    voteStatus.textContent = 'Every connected player must vote for a rematch.';
    Object.assign(voteStatus.style, {
      marginTop: '9px', fontSize: '12px', color: '#9edbff'
    });

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
      gap: '10px', marginTop: '16px'
    });
    const rematch = document.createElement('button');
    rematch.type = 'button';
    rematch.dataset.pvpRematchVote = '';
    rematch.textContent = 'VOTE REMATCH';
    Object.assign(rematch.style, {
      minWidth: '170px', padding: '11px 20px',
      borderRadius: '8px', border: '1px solid #7df2a5',
      background: 'rgba(125, 242, 165, .12)', color: '#edf8ff',
      fontWeight: '800', cursor: 'pointer'
    });
    rematch.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.rematchVotePending) return;
      this.rematchVotePending = true;
      rematch.disabled = true;
      voteStatus.textContent = 'REMATCH VOTE SENT · WAITING FOR PLAYERS';
      this.transport?.sendControl?.('pvp-rematch-vote', {
        mapId: mapSelect.value || PVP5_COMPETITIVE_MAPS[0],
        runId: this.state?.runId || ''
      });
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.pvpReturnLobby = '';
    close.textContent = 'RETURN TO LOBBY';
    Object.assign(close.style, {
      minWidth: '170px', padding: '11px 20px',
      borderRadius: '8px', border: '1px solid #00d4ff',
      background: 'rgba(0, 212, 255, .12)', color: '#edf8ff',
      fontWeight: '800', cursor: 'pointer'
    });
    close.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.transport?.sendControl?.('pvp-return-lobby', {
        runId: this.state?.runId || ''
      });
      this.hideMatchSummary();
    });
    actions.append(rematch, close);
    panel.append(outcome, score, stats, scoreboard, note, mapLabel, voteStatus, actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this.matchSummary = overlay;
    return overlay;
  }

  hideMatchSummary() {
    if (!this.matchSummary) return false;
    this.matchSummary.hidden = true;
    this.matchSummary.style.display = 'none';
    this.matchSummary.setAttribute('aria-hidden', 'true');
    this.matchSummary.querySelector('button')?.blur?.();
    return true;
  }

  renderMatchSummaryVoteStatus(payload = {}) {
    const overlay = this.matchSummary;
    if (!overlay) return false;
    const status = overlay.querySelector('[data-pvp-rematch-status]');
    const button = overlay.querySelector('[data-pvp-rematch-vote]');
    const received = Math.max(0, Number(payload?.votesReceived) || 0);
    const required = Math.max(0, Number(payload?.votesRequired) || 0);
    if (status) {
      status.textContent = payload?.ready === true
        ? 'REMATCH APPROVED · LOADING NEXT ARENA'
        : received || required
          ? `REMATCH VOTES ${received}/${required}`
          : this.rematchVotePending
            ? 'REMATCH VOTE SENT · WAITING FOR PLAYERS'
            : 'Every connected player must vote for a rematch.';
    }
    if (button) {
      button.disabled = this.rematchVotePending || payload?.ready === true;
      button.textContent = payload?.ready === true
        ? 'REMATCH STARTING'
        : this.rematchVotePending
          ? 'VOTE RECORDED'
          : 'VOTE REMATCH';
    }
    return true;
  }

  setNativeHudIsolation(active) {
    if (typeof document === 'undefined') return false;
    document.body?.classList?.toggle('ka-pvp-native-hud-isolated', active === true);
    return true;
  }

  showMatchSummary(state = this.state) {
    const overlay = this.ensureMatchSummary();
    if (!overlay || !state) return false;
    const local = state.players?.[this.localPlayerId] || null;
    const winner = cleanText(state.winnerTeam, 'MATCH');
    const outcome = !local
      ? 'MATCH COMPLETE'
      : winner === local.team
        ? 'VICTORY'
        : state.winnerTeam
          ? 'DEFEAT'
          : 'DRAW';
    const outcomeEl = overlay.querySelector('[data-pvp-summary-outcome]');
    const scoreEl = overlay.querySelector('[data-pvp-summary-score]');
    const statsEl = overlay.querySelector('[data-pvp-summary-stats]');
    const scoreboardEl = overlay.querySelector('[data-pvp-summary-scoreboard]');
    const mapSelect = overlay.querySelector('[data-pvp-rematch-map]');
    if (outcomeEl) outcomeEl.textContent = outcome;
    if (scoreEl) {
      scoreEl.textContent = `ALPHA ${state.teams?.ALPHA?.roundWins || 0} — ${state.teams?.BRAVO?.roundWins || 0} BRAVO`;
    }
    if (statsEl) {
      statsEl.textContent = local
        ? `${local.team} · KILLS ${local.eliminations} · ASSISTS ${local.assists || 0} · DEATHS ${local.deaths} · DAMAGE ${local.damageDealt} · HEADSHOTS ${local.headshots}`
        : `${winner} WINS THE MATCH`;
    }
    if (scoreboardEl) {
      const rows = derivePvp1Presentation(state, this.localPlayerId, Date.now()).scoreboard || [];
      scoreboardEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1.4fr repeat(5,.65fr);gap:6px;padding:8px 10px;font-size:10px;font-weight:900;color:#83a9ba">
          <span>PLAYER</span><span>K</span><span>A</span><span>D</span><span>DMG</span><span>HS</span>
        </div>
        ${rows.map((entry) => `
          <div style="display:grid;grid-template-columns:1.4fr repeat(5,.65fr);gap:6px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.06);font-size:12px">
            <strong>${entry.playerId === this.localPlayerId ? 'YOU' : escapeHtml(cleanText(entry.playerId, 'PLAYER', 10))} · ${escapeHtml(entry.team)}${entry.playerId === this.localPlayerId ? '' : ` <button type="button" class="ka-pvp-social-add" data-social-add-player="${escapeHtml(entry.playerId)}">+ FRIEND</button>`}</strong>
            <span>${entry.eliminations}</span><span>${entry.assists}</span><span>${entry.deaths}</span><span>${entry.damageDealt}</span><span>${entry.headshots}</span>
          </div>
        `).join('')}
      `;
      scoreboardEl.onclick = (event) => {
        const button = event.target instanceof Element
          ? event.target.closest('[data-social-add-player]')
          : null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('ka:social-add-player', {
          detail: { playerId: button.dataset.socialAddPlayer || '' }
        }));
      };
    }
    if (mapSelect) {
      const current = state.pvp5?.currentMapId || state.mapId || PVP5_COMPETITIVE_MAPS[0];
      const index = Math.max(0, PVP5_COMPETITIVE_MAPS.indexOf(current));
      mapSelect.value = PVP5_COMPETITIVE_MAPS[(index + 1) % PVP5_COMPETITIVE_MAPS.length];
    }
    this.rematchVotePending = Boolean(state.pvp5?.rematch?.votes?.[this.localPlayerId]);
    this.renderMatchSummaryVoteStatus({
      votesReceived: Object.keys(state.pvp5?.rematch?.votes || {}).length,
      votesRequired: Object.keys(state.players || {}).length,
      ready: state.pvp5?.rematch?.ready === true
    });
    overlay.dataset.patch = PVP5_PATCH;
    overlay.dataset.runId = state.runId || '';
    overlay.hidden = false;
    overlay.style.display = 'grid';
    overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('button')?.focus?.();
    return true;
  }

  render(now = Date.now()) {
    const hud = this.ensureHud();
    if (!hud) return;

    const visible = this.active && this.isPvpRoom();
    hud.hidden = !visible;
    if (!visible) return;

    const presentation = derivePvp1Presentation(
      this.state || {},
      this.localPlayerId,
      now
    );
    hud.dataset.team = presentation.localTeam || '';
    const alpha = hud.querySelector('[data-pvp-team="ALPHA"] strong');
    const bravo = hud.querySelector('[data-pvp-team="BRAVO"] strong');
    const round = hud.querySelector('[data-pvp-round]');
    const status = hud.querySelector('.ka-pvp1-status');
    if (alpha) alpha.textContent = String(presentation.alphaWins);
    if (bravo) bravo.textContent = String(presentation.bravoWins);
    if (round) round.textContent = `ROUND ${presentation.round}`;
    if (status) {
      const clock = presentation.phase === 'ACTIVE'
        ? ` · ${presentation.roundRemainingSeconds}s`
        : '';
      const protection = presentation.spawnProtected ? ' · SPAWN PROTECTED' : '';
      const armor = presentation.localArmor > 0 ? ` · ARMOR ${presentation.localArmor}` : '';
      const weapon = presentation.localWeapons?.length > 1
        ? ` · ${presentation.localWeapons[presentation.localWeapons.length - 1]}`
        : ' · PISTOL';
      const spectator = presentation.localAlive === false
        ? ` · SPECTATING ${cleanText(this.spectatorTargetId, 'PLAYER', 12)} · Q/E SWITCH`
        : '';
      status.textContent = `${presentation.headline}${clock} · ${presentation.localTeam || 'UNASSIGNED'}${armor}${weapon}${protection}${spectator}`;
    }
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    this.hud?.remove?.();
    this.hud = null;
    this.matchSummary?.remove?.();
    this.matchSummary = null;
    this.lastSummaryRunId = '';
    this.activeRunId = '';
    globalThis.removeEventListener?.('keydown', this.keyHandler);
    this.keyHandler = null;
    this.setNativeHudIsolation(false);
  }
}
