// PVP.1 R1 — isolated private Team Elimination runtime.

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import {
  PVP1_MODE,
  PVP1_PATCH,
  derivePvp1Presentation,
  normalizePvp1State,
  roomUsesPvp1
} from './pvp1_core.js';

function cleanText(value, fallback = '', limit = 120) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
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
    this.lastSpawnSerial = 0;
    if (!this.active) {
      this.hideHud();
      return false;
    }
    if (this.room?.pvp) {
      this.applyState(this.room.pvp, { force: true });
    }
    this.ensureHud();
    this.render();
    return true;
  }

  endRun() {
    this.active = false;
    this.lastSpawnSerial = 0;
    this.hideHud();
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
      if (event.targetId === this.localPlayerId && event.eliminated) {
        this.adapter.showToast?.(
          'ELIMINATED · SPECTATING ROUND',
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
    const next = normalizePvp1State(value);
    if (
      !force
      && this.state
      && next.revision < this.state.revision
    ) return false;

    this.state = next;
    this.lastRevision = next.revision;
    if (this.active || this.session?.run?.active === true) {
      this.applyLocalState();
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
    if (local.alive !== true) {
      this.player.vel?.set?.(0, 0, 0);
      this.player.isADS = false;
      this.player.isSprinting = false;
    }
    this.adapter.syncHud?.();
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
    this.render(now);
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
      status.textContent = `${presentation.headline}${clock} · ${presentation.localTeam || 'UNASSIGNED'}${protection}`;
    }
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    this.hud?.remove?.();
    this.hud = null;
  }
}
