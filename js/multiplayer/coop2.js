// js/multiplayer/coop2.js
// COOP.2 R1 — runtime roles, shared contracts and team-cohesion HUD.

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';
import { BOT1_PLAYER_ID, BOT1_DISPLAY_NAME } from './bot_core.js';
import {
  COOP2_PATCH,
  COOP2_ROLE_STORAGE_KEY,
  COOP2_ROLES,
  Coop2Authority,
  getCoop2CohesionPolicy,
  getCoop2RoleDefinition,
  normalizeCoop2Role
} from './coop2_core.js';
import { recordProgressionCoopContract } from '../progression.js';

const SNAPSHOT_INTERVAL_MS = 250;
const SNAPSHOT_REQUEST_INTERVAL_MS = 1000;
const COMMAND_INTERVAL_MS = 45;

function nowMs() {
  return (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
}

function cleanText(value, fallback = '', max = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function readRolePreference() {
  try {
    return normalizeCoop2Role(
      globalThis.localStorage?.getItem?.(COOP2_ROLE_STORAGE_KEY)
    );
  } catch {
    return 'VANGUARD';
  }
}

function saveRolePreference(roleId) {
  try {
    globalThis.localStorage?.setItem?.(
      COOP2_ROLE_STORAGE_KEY,
      normalizeCoop2Role(roleId)
    );
    return true;
  } catch {
    return false;
  }
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

export class MultiplayerCoop2Manager {
  constructor({
    eventBus,
    runtime,
    session,
    revive = null,
    bot = null,
    showToast = () => {}
  } = {}) {
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.revive = revive;
    this.bot = bot;
    this.showToast = showToast;
    this.core = new Coop2Authority();
    this.active = false;
    this.preferredRoleId = readRolePreference();
    this.latestSnapshot = null;
    this.authorityEpoch = 0;
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotReceivedAt = -Infinity;
    this.lastSnapshotRequestedAt = -Infinity;
    this.lastCommandSentAt = -Infinity;
    this.actionSerial = 0;
    this.awardedCompletionIds = new Set();
    this.hud = null;
    this.hudRole = null;
    this.hudContract = null;
    this.hudProgress = null;
    this.hudCohesion = null;
    this.hudTeam = null;
    this.unsubscribe = [];

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_COOP2_STATE_RECEIVED,
        (event) => this.handleEnvelope(event?.payload?.envelope)
      ) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED,
        () => this.syncRoomPlayers(nowMs())
      ) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED,
        (event) => {
          if (
            this.active
            && event?.payload?.state === 'connected'
            && !this.isAuthority()
          ) {
            this.requestSnapshot(true);
          }
        }
      ) || (() => {})
    );

    if (typeof window !== 'undefined') {
      const onRole = (event) => {
        this.setPreferredRole(event?.detail?.roleId);
      };
      const onAction = (event) => {
        this.recordAction(event?.detail?.kind, event?.detail || {});
      };
      window.addEventListener('ka:coop2-role-selected', onRole);
      window.addEventListener('ka:coop2-action', onAction);
      this.unsubscribe.push(() => {
        window.removeEventListener('ka:coop2-role-selected', onRole);
        window.removeEventListener('ka:coop2-action', onAction);
      });
    }
  }

  isAuthority() {
    return this.session?.mode === 'host';
  }

  isOnline() {
    return (
      this.session?.run?.active === true
      && ['host', 'client'].includes(this.session?.mode)
    );
  }

  localPlayerId() {
    return this.runtime?.localPlayerId || null;
  }

  beginRun() {
    this.active = this.isOnline();
    this.latestSnapshot = null;
    this.authorityEpoch = Math.max(
      0,
      Number(this.runtime?.authorityEpoch) || 0
    );
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotReceivedAt = -Infinity;
    this.lastSnapshotRequestedAt = -Infinity;
    this.lastCommandSentAt = -Infinity;
    this.actionSerial = 0;
    this.awardedCompletionIds.clear();

    const run = this.session?.run || {};
    this.core.reset({
      runId: run.runId,
      mapId: run.mapId,
      difficulty: run.difficulty,
      authorityEpoch: this.authorityEpoch,
      now: nowMs()
    });
    this.syncRoomPlayers(nowMs());
    this.ensureHud();

    if (!this.active) {
      this.hideHud();
      return false;
    }

    this.setPreferredRole(this.preferredRoleId, { broadcast: true });
    if (this.isAuthority()) {
      this.ensureBotRole(nowMs());
      this.publishSnapshot(true);
    } else {
      this.requestSnapshot(true);
    }
    this.updateHud(true);
    return true;
  }

  endRun() {
    this.active = false;
    this.latestSnapshot = null;
    this.core.reset();
    this.hideHud();
  }

  setPreferredRole(roleId, { broadcast = true } = {}) {
    const normalized = normalizeCoop2Role(roleId);
    this.preferredRoleId = normalized;
    saveRolePreference(normalized);
    const select = typeof document !== 'undefined'
      ? document.getElementById('ka-coop2-role')
      : null;
    if (select && select.value !== normalized) select.value = normalized;

    if (!this.active) return normalized;
    const playerId = this.localPlayerId();
    if (!playerId) return normalized;

    if (this.isAuthority()) {
      this.core.assignRole(playerId, normalized, {
        displayName: this.localDisplayName(),
        now: nowMs()
      });
      this.ensureBotRole(nowMs());
      if (broadcast) this.publishSnapshot(true);
    } else if (broadcast) {
      this.sendCommand({
        action: 'ROLE_SELECT',
        roleId: normalized
      }, true);
    }
    this.updateReviveRoles();
    this.updateHud(true);
    return normalized;
  }

  localDisplayName() {
    const room = this.runtime?.room?.getSnapshot?.();
    const localId = this.localPlayerId();
    return cleanText(
      room?.players?.find((entry) => entry?.playerId === localId)?.displayName,
      'Player',
      24
    );
  }

  syncRoomPlayers(now = nowMs()) {
    if (!this.active) return false;
    const room = this.runtime?.room?.getSnapshot?.();
    if (!room?.players) return false;
    const seen = new Set();

    room.players.forEach((entry) => {
      if (!entry?.playerId) return;
      seen.add(entry.playerId);
      const existing = this.core.players.get(entry.playerId);
      this.core.ensurePlayer(entry.playerId, {
        displayName: entry.displayName,
        connected: entry.connected !== false,
        isBot: entry.isBot === true,
        roleId: (
          entry.playerId === this.localPlayerId()
            ? this.preferredRoleId
            : existing?.roleId
        ),
        now
      });
      this.core.setConnected(
        entry.playerId,
        entry.connected !== false,
        now
      );
    });

    this.core.players.forEach((entry, playerId) => {
      if (!seen.has(playerId) && playerId !== BOT1_PLAYER_ID) {
        this.core.setConnected(playerId, false, now);
      }
    });

    if (this.isAuthority()) this.ensureBotRole(now);
    this.updateReviveRoles();
    return true;
  }

  ensureBotRole(now = nowMs()) {
    const room = this.runtime?.room?.getSnapshot?.();
    const botPresent = (
      room?.players?.some((entry) => entry?.playerId === BOT1_PLAYER_ID)
      || room?.virtualPlayers?.[BOT1_PLAYER_ID]
      || this.bot?.getSnapshot?.()?.active === true
    );
    if (!botPresent) {
      this.core.setConnected(BOT1_PLAYER_ID, false, now);
      return false;
    }
    this.core.ensurePlayer(BOT1_PLAYER_ID, {
      displayName: BOT1_DISPLAY_NAME,
      connected: true,
      isBot: true,
      now
    });
    this.core.ensureComplementaryBot(BOT1_PLAYER_ID, {
      displayName: BOT1_DISPLAY_NAME,
      now
    });
    return true;
  }

  getRoleForPlayer(playerId) {
    return (
      this.latestSnapshot?.players?.find(
        (entry) => entry?.playerId === playerId
      )?.roleId
      || this.core.players.get(String(playerId || ''))?.roleId
      || (playerId === this.localPlayerId() ? this.preferredRoleId : 'VANGUARD')
    );
  }


  getTacticalPingMultiplier(playerId) {
    const role = getCoop2RoleDefinition(this.getRoleForPlayer(playerId));
    const snapshot = this.isAuthority()
      ? this.core.getSnapshot(nowMs())
      : this.latestSnapshot;
    const cohesion = getCoop2CohesionPolicy(snapshot?.cohesion || 0);
    return Math.min(
      1.5,
      Math.max(0.75, role.pingDurationMultiplier * cohesion.pingDurationMultiplier)
    );
  }

  updateReviveRoles() {
    const snapshot = this.isAuthority()
      ? this.core.getSnapshot(nowMs())
      : this.latestSnapshot;
    this.revive?.applyCoop2Roles?.(
      snapshot?.players || [],
      snapshot?.cohesion || 0
    );
  }

  nextEventId(kind) {
    this.actionSerial += 1;
    return [
      this.session?.run?.runId || 'run',
      this.localPlayerId() || 'player',
      cleanText(kind, 'ACTION', 40),
      this.actionSerial
    ].join(':');
  }

  recordAction(kind, details = {}) {
    if (!this.active) return false;
    const normalizedKind = cleanText(kind, '', 40).toUpperCase();
    if (!normalizedKind) return false;
    const action = {
      kind: normalizedKind,
      amount: Math.max(0, Number(details.amount ?? 1) || 0),
      eventId: cleanText(
        details.eventId,
        this.nextEventId(normalizedKind),
        220
      ),
      at: Math.max(0, Number(details.at) || nowMs()),
      teamEliminated: details.teamEliminated === true
    };

    if (this.isAuthority()) {
      const accepted = this.core.recordAction({
        ...action,
        actorId: details.actorId || this.localPlayerId(),
        displayName: details.displayName || this.localDisplayName(),
        roleId: details.roleId || this.getRoleForPlayer(
          details.actorId || this.localPlayerId()
        ),
        isBot: details.isBot === true
      });
      if (accepted) {
        this.consumeAuthorityEvents();
        this.publishSnapshot(true);
      }
      return accepted;
    }

    return Boolean(this.sendCommand({
      action: 'TEAM_ACTION',
      teamAction: action
    }));
  }

  recordAuthorityAction(kind, details = {}) {
    if (!this.active || !this.isAuthority()) return false;
    return this.recordAction(kind, details);
  }

  sendCommand(payload, force = false) {
    const now = nowMs();
    if (!force && now - this.lastCommandSentAt < COMMAND_INTERVAL_MS) {
      return null;
    }
    this.lastCommandSentAt = now;
    return this.runtime?.sendCoop2State?.({
      kind: 'command',
      ...payload
    }) || null;
  }

  requestSnapshot(force = false) {
    const now = nowMs();
    if (
      !force
      && now - this.lastSnapshotRequestedAt < SNAPSHOT_REQUEST_INTERVAL_MS
    ) return null;
    this.lastSnapshotRequestedAt = now;
    return this.sendCommand({ action: 'SNAPSHOT_REQUEST' }, true);
  }

  publishSnapshot(force = false) {
    if (!this.active || !this.isAuthority()) return null;
    const now = nowMs();
    if (!force && now - this.lastSnapshotSentAt < SNAPSHOT_INTERVAL_MS) {
      return null;
    }
    this.lastSnapshotSentAt = now;
    this.core.authorityEpoch = Math.max(
      this.core.authorityEpoch,
      Number(this.runtime?.authorityEpoch) || 0
    );
    const snapshot = this.core.update(now);
    this.latestSnapshot = clone(snapshot);
    const envelope = this.runtime?.sendCoop2State?.({
      kind: 'snapshot',
      snapshot
    }) || null;
    this.updateHud(force);
    return envelope;
  }

  handleEnvelope(envelope) {
    if (!this.active || !envelope?.payload) return false;
    const payload = envelope.payload;
    if (payload.kind === 'command') {
      if (!this.isAuthority()) return false;
      const actorId = envelope.playerId;
      if (!actorId) return false;
      if (payload.action === 'ROLE_SELECT') {
        this.core.assignRole(actorId, payload.roleId, {
          displayName: this.displayNameFor(actorId),
          now: nowMs()
        });
        this.ensureBotRole(nowMs());
        this.publishSnapshot(true);
        return true;
      }
      if (payload.action === 'TEAM_ACTION' && payload.teamAction) {
        const accepted = this.core.recordAction({
          ...payload.teamAction,
          actorId,
          displayName: this.displayNameFor(actorId),
          roleId: this.getRoleForPlayer(actorId),
          isBot: false
        });
        if (accepted) {
          this.consumeAuthorityEvents();
          this.publishSnapshot(true);
        }
        return accepted;
      }
      if (payload.action === 'SNAPSHOT_REQUEST') {
        this.publishSnapshot(true);
        return true;
      }
      return false;
    }

    if (payload.kind !== 'snapshot' || this.isAuthority()) return false;
    if (envelope.playerId !== this.session?.hostPlayerId) return false;
    if (!this.core.replaceSnapshot(payload.snapshot)) return false;
    this.latestSnapshot = clone(this.core.getSnapshot(nowMs()));
    this.lastSnapshotReceivedAt = nowMs();
    this.updateReviveRoles();
    this.applyLocalContractReward();
    this.updateHud(true);
    return true;
  }

  displayNameFor(playerId) {
    const room = this.runtime?.room?.getSnapshot?.();
    return cleanText(
      room?.players?.find((entry) => entry?.playerId === playerId)?.displayName,
      playerId === BOT1_PLAYER_ID ? BOT1_DISPLAY_NAME : 'Operative',
      24
    );
  }

  consumeAuthorityEvents() {
    const events = this.core.consumeEvents();
    events.forEach((event) => {
      if (event.type === 'CONTRACT_COMPLETED') {
        this.showToast?.(
          `SHARED CONTRACT COMPLETE · ${event.contract?.label || 'TEAM OBJECTIVE'}`
        );
      }
    });
    this.applyLocalContractReward();
    return events;
  }

  applyLocalContractReward() {
    const contract = (
      this.isAuthority()
        ? this.core.getSnapshot(nowMs()).contract
        : this.latestSnapshot?.contract
    );
    if (!contract?.completed || !contract.completionId) return false;
    if (this.awardedCompletionIds.has(contract.completionId)) return false;
    this.awardedCompletionIds.add(contract.completionId);
    recordProgressionCoopContract({
      contractId: contract.id,
      completionId: contract.completionId,
      xp: contract.xp
    });
    this.showToast?.(
      `${contract.label.toUpperCase()} · +${contract.xp} XP`
    );
    return true;
  }

  handleHostMigration({
    authorityEpoch = 0,
    checkpoint = null,
    becameHost = false
  } = {}) {
    this.authorityEpoch = Math.max(
      this.authorityEpoch,
      Math.max(0, Number(authorityEpoch) || 0)
    );
    if (!this.active) return false;
    const snapshot = checkpoint?.coop2 || this.latestSnapshot;
    if (snapshot) {
      this.core.replaceSnapshot(snapshot);
      this.latestSnapshot = clone(this.core.getSnapshot(nowMs()));
    }
    this.core.authorityEpoch = this.authorityEpoch;
    this.syncRoomPlayers(nowMs());
    if (becameHost) this.publishSnapshot(true);
    else this.requestSnapshot(true);
    return true;
  }

  update(now = nowMs()) {
    if (!this.active) return;
    this.syncRoomPlayers(now);
    if (this.isAuthority()) {
      const revive = this.revive?.getSnapshot?.();
      this.core.setTeamEliminated(revive?.teamEliminated === true, now);
      this.publishSnapshot(false);
    } else if (now - this.lastSnapshotReceivedAt > 1600) {
      this.requestSnapshot(false);
    }
    this.updateHud(false);
  }

  ensureHud() {
    if (this.hud || typeof document === 'undefined') return;
    const root = document.createElement('aside');
    root.id = 'ka-coop2-hud';
    root.hidden = true;
    root.innerHTML = `
      <div class="ka-coop2-hud-head">
        <span>CO-OP ROLE</span>
        <strong data-coop2-role>VANGUARD</strong>
      </div>
      <div class="ka-coop2-contract">
        <span data-coop2-contract>SHARED CONTRACT</span>
        <strong data-coop2-progress>0 / 0</strong>
      </div>
      <div class="ka-coop2-meter"><i data-coop2-meter></i></div>
      <div class="ka-coop2-cohesion" data-coop2-cohesion>TEAM COHESION 0%</div>
      <div class="ka-coop2-team" data-coop2-team></div>
    `;
    document.body.appendChild(root);
    this.hud = root;
    this.hudRole = root.querySelector('[data-coop2-role]');
    this.hudContract = root.querySelector('[data-coop2-contract]');
    this.hudProgress = root.querySelector('[data-coop2-progress]');
    this.hudCohesion = root.querySelector('[data-coop2-cohesion]');
    this.hudTeam = root.querySelector('[data-coop2-team]');
    this.hudMeter = root.querySelector('[data-coop2-meter]');
  }

  updateHud(force = false) {
    if (!this.active) {
      this.hideHud();
      return;
    }
    this.ensureHud();
    const snapshot = this.isAuthority()
      ? this.core.getSnapshot(nowMs())
      : this.latestSnapshot;
    if (!snapshot) return;
    this.hud.hidden = false;
    const role = getCoop2RoleDefinition(this.getRoleForPlayer(
      this.localPlayerId()
    ));
    this.hudRole.textContent = role.label.toUpperCase();
    this.hudRole.style.color = role.accent;
    const contract = snapshot.contract || {};
    this.hudContract.textContent = cleanText(
      contract.completed
        ? `${contract.label} Complete`
        : contract.label,
      'Shared Contract',
      80
    ).toUpperCase();
    this.hudProgress.textContent = (
      `${Math.min(Number(contract.progress) || 0, Number(contract.target) || 0)}`
      + ` / ${Number(contract.target) || 0}`
    );
    const cohesion = Math.max(0, Math.min(100, Number(snapshot.cohesion) || 0));
    const cohesionPolicy = getCoop2CohesionPolicy(cohesion);
    this.hudCohesion.textContent = (
      `TEAM COHESION ${Math.round(cohesion)}% · ${cohesionPolicy.label.toUpperCase()}`
    );
    this.hudMeter.style.width = `${cohesion}%`;
    this.hudTeam.textContent = (snapshot.players || [])
      .filter((entry) => entry.connected !== false)
      .map((entry) => {
        const definition = getCoop2RoleDefinition(entry.roleId);
        return `${entry.displayName} · ${definition.shortLabel}`;
      })
      .join('  |  ');
  }

  hideHud() {
    if (this.hud) this.hud.hidden = true;
  }

  getSnapshot() {
    return {
      patch: COOP2_PATCH,
      active: this.active,
      isAuthority: this.isAuthority(),
      preferredRoleId: this.preferredRoleId,
      snapshot: clone(
        this.isAuthority()
          ? this.core.getSnapshot(nowMs())
          : this.latestSnapshot
      )
    };
  }

  destroy() {
    this.endRun();
    this.unsubscribe.splice(0).forEach((unsubscribe) => unsubscribe?.());
    this.hud?.remove?.();
    this.hud = null;
  }
}
