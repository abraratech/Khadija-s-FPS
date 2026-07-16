// js/content1.js
// CONTENT.1 R1 — runtime operation HUD, encounter authority and multiplayer sync.

import {
  CONTENT1_OPERATION_XP,
  CONTENT1_PATCH,
  Content1Authority
} from './content1_core.js';
import { recordProgressionContentOperation } from './progression.js';
import { getLive1RunDirective } from './live1_state.js';
import { MULTIPLAYER_EVENTS } from './multiplayer/event_bus.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './multiplayer/runtime.js';

const SNAPSHOT_INTERVAL_MS = 300;
const SNAPSHOT_REQUEST_INTERVAL_MS = 1000;
const COMMAND_INTERVAL_MS = 45;
const ZONE_TICK_INTERVAL_MS = 1000;

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

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function flatInside(position, anchor) {
  if (!position || !anchor) return false;
  const dx = finite(position.x) - finite(anchor.x);
  const dz = finite(position.z) - finite(anchor.z);
  const radius = Math.max(1, finite(anchor.radius, 8));
  return dx * dx + dz * dz <= radius * radius;
}

function roleColor(mapId) {
  const colors = {
    grid_bunker: '#ffb347',
    industrial_yard: '#ffd166',
    neon_depot: '#ff4fd8',
    parking_garage: '#6ee7ff',
    hospital_wing: '#5df2a5',
    reactor_courtyard: '#ff6b45'
  };
  return colors[String(mapId || '')] || '#00d4ff';
}

export class Content1Manager {
  constructor({
    eventBus,
    runtime,
    session,
    showToast = () => {}
  } = {}) {
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.showToast = showToast;
    this.core = new Content1Authority();
    this.active = false;
    this.latestSnapshot = null;
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotRequestedAt = -Infinity;
    this.lastCommandSentAt = -Infinity;
    this.lastZoneTickAt = -Infinity;
    this.actionSerial = 0;
    this.currentWave = 1;
    this.awardedCompletionIds = new Set();
    this.hud = null;
    this.hudOperation = null;
    this.hudProgress = null;
    this.hudEncounter = null;
    this.unsubscribe = [];

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_CONTENT1_STATE_RECEIVED,
        (event) => this.handleEnvelope(event?.payload?.envelope)
      ) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED,
        () => {
          if (
            this.active
            && this.isOnline()
            && !this.isAuthority()
          ) this.requestSnapshot();
        }
      ) || (() => {})
    );

    if (typeof window !== 'undefined') {
      const onCoopAction = (event) => {
        const detail = event?.detail || {};
        const kind = cleanText(detail.kind, '', 40).toUpperCase();
        if (!kind) return;
        this.recordAction(kind, detail);
      };
      window.addEventListener('ka:coop2-action', onCoopAction);
      this.unsubscribe.push(() => {
        window.removeEventListener('ka:coop2-action', onCoopAction);
      });

      window.KAGetContent1Snapshot = () => this.getSnapshot();
      window.KAGetContent1EncounterDirective = () => (
        this.isAuthority()
          ? this.core.getEncounterDirective()
          : this.directiveFromSnapshot()
      );
      window.KAContent1EnemySpawned = (enemy) => this.prepareEnemySpawn(enemy);
      window.KAContent1EnemyKilled = (details) => this.recordEnemyKill(details);
      window.KAContent1WaveStarted = (wave) => this.startWave(wave);
      window.KAContent1WaveCleared = (details) => this.recordWaveClear(details);
    }
  }

  isOnline() {
    return (
      this.session?.run?.active === true
      && ['host', 'client'].includes(this.session?.mode)
    );
  }

  isAuthority() {
    return !this.isOnline() || this.session?.mode === 'host';
  }

  localPlayerId() {
    return this.runtime?.localPlayerId || 'local';
  }

  beginRun({
    runId = '',
    mapId = 'grid_bunker',
    difficulty = 1
  } = {}) {
    const sessionRun = this.session?.run || {};
    this.active = true;
    this.latestSnapshot = null;
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotRequestedAt = -Infinity;
    this.lastCommandSentAt = -Infinity;
    this.lastZoneTickAt = -Infinity;
    this.currentWave = 1;
    this.actionSerial = 0;
    this.awardedCompletionIds.clear();
    this.core.reset({
      runId: cleanText(sessionRun.runId || runId, `content-${Date.now()}`, 160),
      mapId: cleanText(sessionRun.mapId || mapId, 'grid_bunker', 80),
      difficulty: finite(sessionRun.difficulty, difficulty),
      authorityEpoch: finite(this.runtime?.authorityEpoch, 0),
      live: getLive1RunDirective(
        cleanText(sessionRun.mapId || mapId, 'grid_bunker', 80)
      ),
      now: nowMs()
    });
    this.ensureHud();
    this.updateHud(true);
    if (this.isOnline() && !this.isAuthority()) {
      this.requestSnapshot(true);
    } else {
      this.publishSnapshot(true);
    }
    return this.getSnapshot();
  }

  endRun() {
    this.active = false;
    this.latestSnapshot = null;
    this.hideHud();
  }

  nextEventId(kind) {
    this.actionSerial += 1;
    return [
      this.session?.run?.runId || this.core.state?.runId || 'run',
      this.localPlayerId(),
      cleanText(kind, 'ACTION', 40),
      this.actionSerial
    ].join(':');
  }

  sendCommand(payload, force = false) {
    const now = nowMs();
    if (!force && now - this.lastCommandSentAt < COMMAND_INTERVAL_MS) {
      return null;
    }
    this.lastCommandSentAt = now;
    return this.runtime?.sendContent1State?.({
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
    const snapshot = this.core.update(now);
    this.latestSnapshot = clone(snapshot);
    const envelope = this.isOnline()
      ? this.runtime?.sendContent1State?.({
          kind: 'snapshot',
          snapshot
        })
      : null;
    this.applyLocalOperationReward();
    this.updateHud(force);
    return envelope || snapshot;
  }

  recordAction(kind, details = {}) {
    if (!this.active) return false;
    const normalizedKind = cleanText(kind, '', 40).toUpperCase();
    if (!normalizedKind) return false;
    const action = {
      kind: normalizedKind,
      amount: Math.max(0, finite(details.amount, 1)),
      healthRatio: Math.max(0, Math.min(1, finite(details.healthRatio, 0))),
      enemyId: cleanText(details.enemyId, '', 160),
      eventId: cleanText(
        details.eventId,
        this.nextEventId(normalizedKind),
        220
      ),
      at: Math.max(0, finite(details.at, nowMs()))
    };

    if (this.isAuthority()) {
      const accepted = this.core.recordAction({
        ...action,
        actorId: details.actorId || this.localPlayerId()
      });
      if (accepted) {
        this.consumeAuthorityEvents();
        this.publishSnapshot(true);
      }
      return accepted;
    }

    return Boolean(this.sendCommand({
      action: 'OPERATION_ACTION',
      operationAction: action
    }));
  }

  recordWaveClear({
    wave = this.currentWave,
    health = 0,
    maxHealth = 100
  } = {}) {
    const ratio = Math.max(0, finite(health)) / Math.max(1, finite(maxHealth, 100));
    return this.recordAction('WAVE_CLEAR', {
      amount: 1,
      healthRatio: ratio,
      eventId: `${this.session?.run?.runId || 'run'}:content-wave:${Math.max(1, Math.floor(finite(wave, 1)))}`
    });
  }

  startWave(wave = 1) {
    if (!this.active || !this.isAuthority()) return null;
    const normalizedWave = Math.max(1, Math.floor(finite(wave, 1)));
    if (normalizedWave === this.currentWave && this.core.state?.encounter?.wave === normalizedWave) {
      return this.core.state.encounter;
    }
    this.currentWave = normalizedWave;
    const encounter = this.core.startWave(normalizedWave, nowMs());
    this.consumeAuthorityEvents();
    this.publishSnapshot(true);
    return encounter;
  }

  recordEnemyKill({
    enemyId = '',
    elite = false,
    headshot = false,
    actorId = ''
  } = {}) {
    const baseId = cleanText(
      enemyId,
      `enemy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      160
    );
    this.recordAction('KILL', {
      actorId,
      amount: 1,
      headshot,
      eventId: `${this.session?.run?.runId || 'run'}:content-kill:${baseId}`
    });
    if (elite) {
      this.recordAction('ELITE_KILL', {
        actorId,
        amount: 1,
        enemyId: baseId,
        eventId: `${this.session?.run?.runId || 'run'}:content-elite-kill:${baseId}`
      });
    }
    return true;
  }

  prepareEnemySpawn(enemy) {
    if (!this.active || !this.isAuthority() || !enemy) return false;
    const directive = this.core.getEncounterDirective();
    if (!directive.elitePending) return false;
    const type = cleanText(enemy.type, '', 40).toUpperCase();
    if (type === 'CRAWLER' || type === 'EXPLODER') return false;
    const enemyId = cleanText(
      enemy.networkId || enemy.content1Id,
      `elite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      160
    );
    if (!this.core.markEliteSpawned(enemyId, nowMs())) return false;

    enemy.content1Id = enemyId;
    enemy.isContent1Elite = true;
    enemy.maxHealth = Math.max(1, Math.round(finite(enemy.maxHealth, enemy.health) * 1.65));
    enemy.health = enemy.maxHealth;
    enemy.speed = finite(enemy.speed, 1) * 1.08;
    enemy.damage = Math.max(1, Math.round(finite(enemy.damage, 1) * 1.08));
    enemy.scoreReward = Math.round(finite(enemy.scoreReward, 50) * 2);
    enemy.headshotReward = Math.round(finite(enemy.headshotReward, 100) * 1.65);
    enemy.mesh?.traverse?.((child) => {
      if (!child?.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material?.emissive?.setHex) {
          material.emissive.setHex(0xff8a22);
          material.emissiveIntensity = Math.max(
            finite(material.emissiveIntensity, 0),
            0.38
          );
        }
      });
    });
    this.consumeAuthorityEvents();
    this.publishSnapshot(true);
    return true;
  }

  handleHostMigration({
    authorityEpoch = 0,
    checkpoint = null,
    becameHost = false
  } = {}) {
    if (!this.active) return false;
    const snapshot = checkpoint?.content1 || null;
    if (snapshot) {
      this.core.replaceSnapshot(snapshot, nowMs());
      this.latestSnapshot = clone(this.core.getSnapshot(nowMs()));
    }
    this.core.state.authorityEpoch = Math.max(
      finite(this.core.state.authorityEpoch, 0),
      finite(authorityEpoch, 0)
    );
    if (becameHost) {
      this.publishSnapshot(true);
    } else if (this.isOnline()) {
      this.requestSnapshot(true);
    }
    this.applyLocalOperationReward();
    this.updateHud(true);
    return true;
  }

  handleEnvelope(envelope) {
    if (!this.active || !envelope?.payload) return false;
    const payload = envelope.payload;

    if (payload.kind === 'command') {
      if (!this.isAuthority()) return false;
      const actorId = envelope.playerId;
      if (!actorId) return false;
      if (payload.action === 'SNAPSHOT_REQUEST') {
        this.publishSnapshot(true);
        return true;
      }
      if (payload.action === 'OPERATION_ACTION' && payload.operationAction) {
        const accepted = this.core.recordAction({
          ...payload.operationAction,
          actorId
        });
        if (accepted) {
          this.consumeAuthorityEvents();
          this.publishSnapshot(true);
        }
        return accepted;
      }
      return false;
    }

    if (
      payload.kind !== 'snapshot'
      || this.isAuthority()
      || envelope.playerId !== this.session?.hostPlayerId
    ) return false;
    if (!this.core.replaceSnapshot(payload.snapshot, nowMs())) return false;
    this.latestSnapshot = clone(this.core.getSnapshot(nowMs()));
    this.applyLocalOperationReward();
    this.updateHud(true);
    return true;
  }

  update(dt = 0, {
    player = null,
    wave = this.currentWave
  } = {}) {
    if (!this.active) return null;
    const normalizedWave = Math.max(1, Math.floor(finite(wave, 1)));
    if (this.isAuthority() && normalizedWave !== this.currentWave) {
      this.startWave(normalizedWave);
    }

    const snapshot = this.isAuthority()
      ? this.core.getSnapshot(nowMs())
      : this.latestSnapshot;
    const operation = snapshot?.operation;
    if (
      this.isAuthority()
      && operation?.kind === 'ZONE_TIME'
      && !operation.completed
      && flatInside(player?.pos || player?.position, operation.anchor)
    ) {
      const now = nowMs();
      if (now - this.lastZoneTickAt >= ZONE_TICK_INTERVAL_MS) {
        this.lastZoneTickAt = now;
        this.recordAction('ZONE_TICK', {
          amount: 1,
          eventId: `${snapshot.runId}:zone:${Math.floor(now / ZONE_TICK_INTERVAL_MS)}`
        });
      }
    }

    if (this.isAuthority()) this.publishSnapshot(false);
    else if (this.isOnline()) this.requestSnapshot(false);
    this.updateHud(false);
    return this.getSnapshot();
  }

  consumeAuthorityEvents() {
    const events = this.core.consumeEvents();
    for (const event of events) {
      if (event.type === 'ENCOUNTER_STARTED') {
        this.showToast?.(event.encounter?.announcement || 'ENCOUNTER ACTIVE');
      } else if (event.type === 'ELITE_SPAWNED') {
        this.showToast?.('ELITE TARGET DEPLOYED');
      } else if (event.type === 'OPERATION_COMPLETED') {
        this.showToast?.(
          `OPERATION COMPLETE · ${event.operation?.label || 'ARENA OPERATION'}`
        );
      }
    }
    this.applyLocalOperationReward();
    return events;
  }

  applyLocalOperationReward() {
    const operation = this.getSnapshot()?.operation;
    if (!operation?.completed || !operation.completionId) return false;
    if (this.awardedCompletionIds.has(operation.completionId)) return false;
    this.awardedCompletionIds.add(operation.completionId);
    recordProgressionContentOperation({
      operationId: operation.id,
      completionId: operation.completionId,
      xp: operation.xp || CONTENT1_OPERATION_XP
    });
    this.showToast?.(
      `${String(operation.label || 'OPERATION').toUpperCase()} · +${operation.xp || CONTENT1_OPERATION_XP} XP`
    );
    return true;
  }

  directiveFromSnapshot() {
    const encounter = this.latestSnapshot?.encounter;
    return Object.freeze({
      patch: CONTENT1_PATCH,
      encounterId: encounter?.id || 'NONE',
      label: encounter?.label || 'Standard Pressure',
      wave: Math.max(1, Math.floor(finite(encounter?.wave, 1))),
      weightMultipliers: Object.freeze({ ...(encounter?.weights || {}) }),
      elitePending: this.latestSnapshot?.elite?.pending === true,
      eliteActiveIds: Object.freeze([
        ...(this.latestSnapshot?.elite?.activeIds || [])
      ])
    });
  }

  getSnapshot() {
    return clone(
      this.isAuthority()
        ? this.core.getSnapshot(nowMs())
        : this.latestSnapshot
    );
  }

  ensureHud() {
    if (typeof document === 'undefined') return null;
    if (this.hud?.isConnected) return this.hud;
    const hud = document.createElement('section');
    hud.id = 'ka-content1-hud';
    hud.className = 'ka-content1-hud';
    hud.innerHTML = `
      <div class="ka-content1-kicker">ARENA OPERATION</div>
      <div class="ka-content1-operation">STANDBY</div>
      <div class="ka-content1-progress">0 / 0</div>
      <div class="ka-content1-encounter">STANDARD PRESSURE</div>
    `;
    document.body.appendChild(hud);
    this.hud = hud;
    this.hudOperation = hud.querySelector('.ka-content1-operation');
    this.hudProgress = hud.querySelector('.ka-content1-progress');
    this.hudEncounter = hud.querySelector('.ka-content1-encounter');
    return hud;
  }

  updateHud(force = false) {
    if (typeof document === 'undefined') return;
    const hud = this.ensureHud();
    const snapshot = this.getSnapshot();
    if (!hud || !snapshot || !this.active) {
      this.hideHud();
      return;
    }
    hud.hidden = false;
    hud.style.setProperty('--ka-content1-accent', roleColor(snapshot.mapId));
    const operation = snapshot.operation || {};
    const progress = Math.min(
      finite(operation.target, 0),
      finite(operation.progress, 0)
    );
    if (this.hudOperation) {
      this.hudOperation.textContent = operation.completed
        ? `${operation.label || 'OPERATION'} · COMPLETE`
        : operation.label || 'ARENA OPERATION';
    }
    if (this.hudProgress) {
      const unit = operation.kind === 'ZONE_TIME' ? ' SEC' : '';
      this.hudProgress.textContent = `${Math.floor(progress)} / ${Math.floor(finite(operation.target, 0))}${unit}`;
    }
    if (this.hudEncounter) {
      const encounter = snapshot.encounter;
      this.hudEncounter.textContent = encounter
        ? `${encounter.liveFeatured ? 'LIVE · ' : ''}${encounter.label.toUpperCase()} · WAVE ${encounter.wave}`
        : 'STANDARD PRESSURE';
    }
    if (force) hud.classList.add('ka-content1-hud-pulse');
    setTimeout(() => hud.classList.remove('ka-content1-hud-pulse'), 280);
  }

  hideHud() {
    if (this.hud) this.hud.hidden = true;
  }

  dispose() {
    this.unsubscribe.splice(0).forEach((fn) => fn?.());
    this.hud?.remove?.();
    this.hud = null;
  }
}
