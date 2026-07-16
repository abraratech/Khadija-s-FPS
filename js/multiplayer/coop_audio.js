// js/multiplayer/coop_audio.js
// POST-FINAL.2 R1 — audible co-op awareness for human allies and AI Wingman.

import * as THREE from 'three';
import {
  areTeamAlertCaptionsEnabled,
  playTeamAlertCue
} from '../audio.js';
import { BOT1_DISPLAY_NAME, BOT1_PLAYER_ID } from './bot_core.js';
import {
  COOP_AUDIO_DOWN_REMINDER_MS,
  COOP_AUDIO_KINDS,
  COOP_AUDIO_PATCH,
  COOP_AUDIO_SCHEMA,
  CoopAudioArbiter,
  buildCoopAudioCaption,
  getCoopAudioPolicy,
  tacticalPingTypeToAudioKind
} from './coop_audio_core.js';

const CAPTION_ROOT_ID = 'ka-coop-audio-caption';
const BOT_ALERT_MAX_AGE_MS = 5000;
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function nowMs() {
  return (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clean(value, fallback = '', max = 80) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function clonePosition(value = null) {
  if (!value) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function distanceMeters(a, b) {
  if (!a || !b) return null;
  const dx = finite(a.x) - finite(b.x);
  const dy = finite(a.y) - finite(b.y);
  const dz = finite(a.z) - finite(b.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class MultiplayerCoopAudioManager {
  constructor({
    runtime,
    session,
    player,
    camera = null,
    getReviveSnapshot = () => null,
    getBotSnapshot = () => null
  } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.player = player;
    this.camera = camera;
    this.getReviveSnapshot = getReviveSnapshot;
    this.getBotSnapshot = getBotSnapshot;
    this.arbiter = new CoopAudioArbiter();
    this.active = false;
    this.previousLifeStates = new Map();
    this.downReminderAt = new Map();
    this.lastBotAlertSequence = 0;
    this.captionRoot = null;
    this.captionTimer = 0;
    this.metrics = {
      played: 0,
      captions: 0,
      downAlerts: 0,
      reminders: 0,
      pingAlerts: 0,
      botMarks: 0,
      reviveAlerts: 0
    };
  }

  isOnlineRun() {
    return this.session?.run?.active === true
      && (this.session?.mode === 'host' || this.session?.mode === 'client');
  }

  beginRun() {
    this.active = true;
    this.arbiter.reset();
    this.previousLifeStates.clear();
    this.downReminderAt.clear();
    this.lastBotAlertSequence = 0;
    this.hideCaption();
  }

  endRun() {
    this.active = false;
    this.previousLifeStates.clear();
    this.downReminderAt.clear();
    this.lastBotAlertSequence = 0;
    this.hideCaption();
  }

  ensureCaptionRoot() {
    if (this.captionRoot || typeof document === 'undefined') {
      return this.captionRoot;
    }
    const root = document.createElement('div');
    root.id = CAPTION_ROOT_ID;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    root.hidden = true;
    document.body.appendChild(root);
    this.captionRoot = root;
    return root;
  }

  hideCaption() {
    if (this.captionTimer) {
      clearTimeout(this.captionTimer);
      this.captionTimer = 0;
    }
    if (this.captionRoot) {
      this.captionRoot.hidden = true;
      this.captionRoot.textContent = '';
      this.captionRoot.removeAttribute('data-kind');
    }
  }

  showCaption(text, kind, durationMs) {
    if (!text || !areTeamAlertCaptionsEnabled()) return false;
    const root = this.ensureCaptionRoot();
    if (!root) return false;

    if (this.captionTimer) clearTimeout(this.captionTimer);
    root.textContent = text;
    root.dataset.kind = kind;
    root.hidden = false;
    this.captionTimer = setTimeout(() => {
      root.hidden = true;
      root.textContent = '';
      root.removeAttribute('data-kind');
      this.captionTimer = 0;
    }, Math.max(800, Number(durationMs) || 2000));
    this.metrics.captions += 1;
    return true;
  }

  roomSnapshot() {
    return this.runtime?.room?.getSnapshot?.() || {};
  }

  localPlayerId() {
    return this.runtime?.localPlayerId || null;
  }

  displayNameFor(playerId, fallback = 'ALLY') {
    if (playerId === BOT1_PLAYER_ID) return BOT1_DISPLAY_NAME;
    const room = this.roomSnapshot();
    return clean(
      (room.players || []).find((entry) => entry?.playerId === playerId)
        ?.displayName,
      fallback,
      28
    );
  }

  computePan(position) {
    const point = clonePosition(position);
    const origin = this.player?.pos;
    if (!point || !origin || !this.camera) return 0;

    _direction.set(
      point.x - finite(origin.x),
      0,
      point.z - finite(origin.z)
    );
    if (_direction.lengthSq() < 0.0001) return 0;
    _direction.normalize();

    this.camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 0.0001) return 0;
    _forward.normalize();
    _right.crossVectors(_forward, _up).normalize();

    return Math.max(-1, Math.min(1, _right.dot(_direction)));
  }

  emit({
    kind,
    actorId,
    actorName,
    position = null,
    eventId = '',
    now = nowMs(),
    force = false
  } = {}) {
    if (!this.active || !this.isOnlineRun()) {
      return { accepted: false, reason: 'offline' };
    }

    const policy = getCoopAudioPolicy(kind);
    if (!policy) return { accepted: false, reason: 'invalid-kind' };

    const result = this.arbiter.accept({
      kind,
      actorId,
      eventId,
      now,
      force
    });
    if (!result.accepted) return result;

    const distance = distanceMeters(this.player?.pos, position);
    const caption = buildCoopAudioCaption({
      kind,
      actorName,
      distanceMeters: distance
    });
    const pan = this.computePan(position);

    playTeamAlertCue(kind, {
      pan,
      cooldownKey: `coop-audio:${eventId || `${actorId}:${kind}`}`,
      cooldownMs: 0
    });
    this.showCaption(caption, kind, policy.captionMs);
    this.metrics.played += 1;
    return { ...result, caption, pan, distanceMeters: distance };
  }

  handleReviveEvent(event = {}) {
    if (!event?.type || event.playerId === this.localPlayerId()) return null;
    const position = this.findPlayerPosition(event.playerId);
    const actorName = this.displayNameFor(event.playerId);
    const at = Number(event.at) || nowMs();

    if (event.type === 'DOWNED') {
      this.previousLifeStates.set(event.playerId, 'DOWNED');
      this.downReminderAt.set(
        event.playerId,
        at + COOP_AUDIO_DOWN_REMINDER_MS
      );
      this.metrics.downAlerts += 1;
      return this.emit({
        kind: COOP_AUDIO_KINDS.ALLY_DOWN,
        actorId: event.playerId,
        actorName,
        position,
        eventId: event.eventId || `down:${event.playerId}:${Math.floor(at)}`,
        now: at,
        force: true
      });
    }

    if (event.type === 'REVIVED') {
      this.previousLifeStates.set(event.playerId, 'ACTIVE');
      this.downReminderAt.delete(event.playerId);
      this.metrics.reviveAlerts += 1;
      return this.emit({
        kind: COOP_AUDIO_KINDS.ALLY_REVIVED,
        actorId: event.playerId,
        actorName,
        position,
        eventId: event.eventId || `revived:${event.playerId}:${Math.floor(at)}`,
        now: at
      });
    }
    return null;
  }

  handleTacticalPing(ping = {}, {
    remote = true,
    now = nowMs()
  } = {}) {
    if (!remote) return { accepted: false, reason: 'local-ping' };
    const localId = this.localPlayerId();
    const ownerId = clean(ping.ownerPlayerId, '', 80);
    if (!ownerId || ownerId === localId) {
      return { accepted: false, reason: 'self-ping' };
    }

    const kind = tacticalPingTypeToAudioKind(ping.type);
    if (!kind) return { accepted: false, reason: 'unsupported-ping' };

    this.metrics.pingAlerts += 1;
    return this.emit({
      kind,
      actorId: ownerId,
      actorName: clean(
        ping.ownerName,
        this.displayNameFor(ownerId),
        28
      ),
      position: ping.position,
      eventId: ping.pingId || `ping:${ownerId}:${kind}:${Math.floor(now)}`,
      now
    });
  }

  findPlayerPosition(playerId) {
    const revive = this.getReviveSnapshot?.()?.state;
    const reviveEntry = revive?.players?.find?.(
      (entry) => entry?.playerId === playerId
    );
    if (reviveEntry?.position) return reviveEntry.position;

    if (playerId === BOT1_PLAYER_ID) {
      const localBot = this.getBotSnapshot?.()?.state;
      if (localBot?.position) return localBot.position;
    }

    return this.runtime?.sampleRemotePlayer?.(playerId, nowMs())?.state
      ?.position || null;
  }

  updateLifeStates(now) {
    const snapshot = this.getReviveSnapshot?.()?.state;
    const players = snapshot?.players || [];
    const localId = this.localPlayerId();
    const currentIds = new Set();

    players.forEach((entry) => {
      const playerId = clean(entry?.playerId, '', 80);
      if (!playerId || playerId === localId || entry?.connected === false) {
        return;
      }
      currentIds.add(playerId);

      const nextState = clean(entry.lifeState, 'ACTIVE', 24).toUpperCase();
      const previousState = this.previousLifeStates.get(playerId);
      const actorName = clean(
        entry.displayName,
        this.displayNameFor(playerId),
        28
      );
      const position = entry.position || this.findPlayerPosition(playerId);

      if (nextState === 'DOWNED' && previousState !== 'DOWNED') {
        this.metrics.downAlerts += 1;
        this.emit({
          kind: COOP_AUDIO_KINDS.ALLY_DOWN,
          actorId: playerId,
          actorName,
          position,
          eventId: `life-down:${playerId}:${finite(entry.downedAt, now)}`,
          now,
          force: true
        });
        this.downReminderAt.set(
          playerId,
          now + COOP_AUDIO_DOWN_REMINDER_MS
        );
      } else if (
        nextState === 'ACTIVE'
        && previousState === 'DOWNED'
      ) {
        this.metrics.reviveAlerts += 1;
        this.emit({
          kind: COOP_AUDIO_KINDS.ALLY_REVIVED,
          actorId: playerId,
          actorName,
          position,
          eventId: `life-revived:${playerId}:${finite(entry.respawnNonce)}:${Math.floor(now)}`,
          now
        });
        this.downReminderAt.delete(playerId);
      } else if (nextState !== 'DOWNED') {
        this.downReminderAt.delete(playerId);
      }

      if (
        nextState === 'DOWNED'
        && now >= (this.downReminderAt.get(playerId) || Infinity)
      ) {
        this.metrics.reminders += 1;
        this.emit({
          kind: COOP_AUDIO_KINDS.ALLY_DOWN_REMINDER,
          actorId: playerId,
          actorName,
          position,
          eventId: `life-reminder:${playerId}:${Math.floor(now / COOP_AUDIO_DOWN_REMINDER_MS)}`,
          now
        });
        this.downReminderAt.set(
          playerId,
          now + COOP_AUDIO_DOWN_REMINDER_MS
        );
      }

      this.previousLifeStates.set(playerId, nextState);
    });

    for (const playerId of this.previousLifeStates.keys()) {
      if (!currentIds.has(playerId)) {
        this.previousLifeStates.delete(playerId);
        this.downReminderAt.delete(playerId);
      }
    }
  }

  resolveBotState(now) {
    const local = this.getBotSnapshot?.();
    if (local?.active && local?.state) return local.state;
    return this.runtime?.sampleRemotePlayer?.(
      BOT1_PLAYER_ID,
      now
    )?.state || null;
  }

  updateBotAlert(now) {
    const state = this.resolveBotState(now);
    const sequence = Math.max(0, Math.floor(
      Number(state?.teamAlertSequence) || 0
    ));
    if (!sequence || sequence <= this.lastBotAlertSequence) return;

    this.lastBotAlertSequence = sequence;
    const alertAtEpochMs = Number(state?.teamAlertAtEpochMs) || Date.now();
    if (Date.now() - alertAtEpochMs > BOT_ALERT_MAX_AGE_MS) return;

    const kind = tacticalPingTypeToAudioKind(
      state?.teamAlertKind === 'ENEMY_MARK'
        ? 'ENEMY'
        : state?.teamAlertKind
    );
    if (!kind) return;

    this.metrics.botMarks += 1;
    this.emit({
      kind,
      actorId: BOT1_PLAYER_ID,
      actorName: BOT1_DISPLAY_NAME,
      position: state?.teamAlertPosition || state?.position,
      eventId: `bot-alert:${sequence}:${state?.teamAlertTargetId || ''}`,
      now
    });
  }

  update(now = nowMs()) {
    if (!this.active || !this.isOnlineRun()) return;
    this.updateLifeStates(now);
    this.updateBotAlert(now);
  }

  getSnapshot() {
    return {
      schema: COOP_AUDIO_SCHEMA,
      patch: COOP_AUDIO_PATCH,
      active: this.active,
      online: this.isOnlineRun(),
      trackedLifeStates: this.previousLifeStates.size,
      downReminders: this.downReminderAt.size,
      lastBotAlertSequence: this.lastBotAlertSequence,
      teamAlertsVolumeEnabled: true,
      captionsEnabled: areTeamAlertCaptionsEnabled(),
      metrics: { ...this.metrics },
      arbiter: this.arbiter.getSnapshot()
    };
  }

  destroy() {
    this.endRun();
    this.captionRoot?.remove?.();
    this.captionRoot = null;
  }
}
