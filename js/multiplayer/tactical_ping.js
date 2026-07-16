// js/multiplayer/tactical_ping.js

import * as THREE from 'three';
import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';
import { TacticalPingStore, TACTICAL_PING_TYPES, normalizePingType, sanitizePingText } from './tactical_ping_core.js';

const TEAMMATE_MARKER_DISTANCE_M = 65;
const ENEMY_PING_MAX_DISTANCE_M = 95;
const MOVE_PING_MAX_DISTANCE_M = 80;
const ROOT_ID = 'multiplayer-tactical-awareness';

const _aimDir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _center = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _projected = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

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

function distance(a, b) {
  const dx = finite(a?.x) - finite(b?.x);
  const dy = finite(a?.y) - finite(b?.y);
  const dz = finite(a?.z) - finite(b?.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vectorPayload(vector) {
  return {
    x: finite(vector?.x),
    y: finite(vector?.y),
    z: finite(vector?.z)
  };
}

function makePingId(playerId, sequence) {
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `ping-${String(playerId || 'player').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}-${sequence}-${randomPart}`;
}

function formatMeters(value) {
  const meters = Math.max(0, finite(value));
  return meters < 10 ? `${meters.toFixed(1)}m` : `${Math.round(meters)}m`;
}

function healthPercent(health, maxHealth) {
  const max = Math.max(1, finite(maxHealth, 100));
  return Math.max(0, Math.min(100, finite(health, max) / max * 100));
}

function roomPlayerName(room, playerId, fallback = 'Player') {
  const match = (room?.players || []).find((entry) => entry?.playerId === playerId);
  return sanitizePingText(match?.displayName || fallback, 'Player');
}

function enemyMarkerHeight(enemy) {
  if (enemy?.type === 'GOLIATH') return 3.2;
  if (enemy?.type === 'BRUTE') return 2.35;
  if (enemy?.type === 'CRAWLER') return 1.0;
  return 1.85;
}

function teammateStatus({ roomPlayer, reviveEntry, state, hostPlayerId }) {
  if (roomPlayer?.connected === false) return 'RECONNECTING';
  const lifeState = String(reviveEntry?.lifeState || '').toUpperCase();
  if (lifeState === 'DOWNED') return 'DOWNED';
  if (lifeState === 'SPECTATING') return 'SPECTATING';
  if (lifeState === 'ELIMINATED') return 'ELIMINATED';
  if (state && state.alive === false) return 'ELIMINATED';
  if (roomPlayer?.isHost === true || roomPlayer?.playerId === hostPlayerId) return 'HOST';
  return 'ALLY';
}

function statusColor(status) {
  if (status === 'HOST') return '#ffd166';
  if (status === 'DOWNED' || status === 'ELIMINATED') return '#ff5c5c';
  if (status === 'SPECTATING') return '#9edbff';
  if (status === 'RECONNECTING') return '#ff4fd8';
  return '#6dff9f';
}

function setMarkerBoxStyle(el, color) {
  Object.assign(el.style, {
    position: 'absolute',
    transform: 'translate(-50%, -100%)',
    minWidth: '104px',
    padding: '5px 7px',
    border: `1px solid ${color}`,
    borderRadius: '6px',
    background: 'rgba(3, 10, 16, 0.84)',
    boxShadow: `0 0 12px ${color}55`,
    color: '#f4fbff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '11px',
    fontWeight: '800',
    lineHeight: '1.18',
    textAlign: 'center',
    textShadow: '0 1px 2px #000',
    whiteSpace: 'nowrap'
  });
}

export class MultiplayerTacticalAwareness {
  constructor({
    eventBus,
    runtime,
    session,
    players,
    player,
    camera,
    getActiveEnemies = () => [],
    getWorldTargets = () => [],
    getReviveSnapshot = () => null,
    getRoleForPlayer = () => 'VANGUARD',
    getPingLifetimeMultiplier = null,
    onTeamAction = () => {}
  } = {}) {
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.players = players;
    this.player = player;
    this.camera = camera;
    this.getActiveEnemies = getActiveEnemies;
    this.getWorldTargets = getWorldTargets;
    this.getReviveSnapshot = getReviveSnapshot;
    this.getRoleForPlayer = getRoleForPlayer;
    this.getPingLifetimeMultiplier = getPingLifetimeMultiplier;
    this.onTeamAction = onTeamAction;
    this.store = new TacticalPingStore();
    this.active = false;
    this.root = null;
    this.localPingSequence = 0;
    this.lastTeammateCount = 0;
    this.metrics = {
      localAccepted: 0,
      localRejected: 0,
      remoteAccepted: 0,
      remoteRejected: 0,
      duplicates: 0,
      rebroadcasts: 0
    };
    this.unsubscribe = [];

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_TACTICAL_PING_RECEIVED,
        (event) => this.handlePingEnvelope(event?.payload?.envelope)
      ) || (() => {})
    );
  }

  isOnlineRun() {
    return this.session?.run?.active === true
      && (this.session?.mode === 'host' || this.session?.mode === 'client');
  }

  beginRun() {
    this.active = true;
    this.store.reset();
    this.localPingSequence = 0;
    this.lastTeammateCount = 0;
    this.hideRoot();
  }

  endRun() {
    this.active = false;
    this.store.reset();
    this.lastTeammateCount = 0;
    this.hideRoot();
  }

  ensureRoot() {
    if (this.root || typeof document === 'undefined') return this.root;
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '44',
      pointerEvents: 'none',
      overflow: 'hidden'
    });
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  hideRoot() {
    if (!this.root) return;
    this.root.replaceChildren();
    this.root.style.display = 'none';
  }

  localOwnerName() {
    const room = this.runtime?.room?.getSnapshot?.() || {};
    const playerId = this.runtime?.localPlayerId || this.players?.localPlayerId || null;
    return roomPlayerName(
      room,
      playerId,
      this.players?.getLocalPlayerSnapshot?.()?.displayName || 'Player'
    );
  }

  placeContextualPing(now = nowMs()) {
    if (!this.active || !this.isOnlineRun() || this.player?.alive !== true) {
      this.metrics.localRejected += 1;
      return { accepted: false, reason: 'offline' };
    }

    const ownerPlayerId = this.runtime?.localPlayerId || this.players?.localPlayerId;
    if (!ownerPlayerId || !this.camera) {
      this.metrics.localRejected += 1;
      return { accepted: false, reason: 'not-ready' };
    }

    const aimedEnemy = this.findAimedEnemy();
    const position = aimedEnemy
      ? this.enemyPingPosition(aimedEnemy)
      : this.findMovePingPosition();

    this.localPingSequence += 1;
    const candidate = {
      pingId: makePingId(ownerPlayerId, this.localPingSequence),
      type: aimedEnemy ? TACTICAL_PING_TYPES.ENEMY : TACTICAL_PING_TYPES.MOVE,
      ownerPlayerId,
      ownerName: this.localOwnerName(),
      position: vectorPayload(position),
      targetId: aimedEnemy?.networkId || aimedEnemy?.mesh?.uuid || null,
      lifetimeMultiplier: (
        this.getPingLifetimeMultiplier?.(ownerPlayerId)
        || (this.getRoleForPlayer?.(ownerPlayerId) === 'RECON' ? 1.35 : (
          this.getRoleForPlayer?.(ownerPlayerId) === 'SUPPORT' ? 1.12 : 1
        ))
      ),
      createdAt: now
    };

    const result = this.store.addPing(candidate, {
      now,
      local: true,
      ownerPlayerId,
      ownerName: candidate.ownerName
    });

    if (!result.accepted) {
      this.metrics.localRejected += 1;
      return result;
    }

    this.metrics.localAccepted += 1;
    this.runtime?.sendTacticalPing?.(result.ping);
    this.onTeamAction?.('TACTICAL_PING', {
      actorId: ownerPlayerId,
      eventId: result.ping?.pingId,
      at: now
    });
    return result;
  }
  placeQuickMessage(type, now = nowMs()) {
    const normalizedType = normalizePingType(type);
    if (!normalizedType || !this.active || !this.isOnlineRun()) {
      this.metrics.localRejected += 1;
      return { accepted: false, reason: 'offline' };
    }

    const canUseWhileDowned = (
      normalizedType === TACTICAL_PING_TYPES.REVIVE_ME
      || normalizedType === TACTICAL_PING_TYPES.NEED_HELP
    );
    if (this.player?.alive !== true && !canUseWhileDowned) {
      this.metrics.localRejected += 1;
      return { accepted: false, reason: 'downed' };
    }

    const ownerPlayerId = this.runtime?.localPlayerId || this.players?.localPlayerId;
    if (!ownerPlayerId || !this.camera) {
      this.metrics.localRejected += 1;
      return { accepted: false, reason: 'not-ready' };
    }

    let aimedEnemy = null;
    let position = null;
    if (normalizedType === TACTICAL_PING_TYPES.ENEMY) {
      aimedEnemy = this.findAimedEnemy();
      position = aimedEnemy ? this.enemyPingPosition(aimedEnemy) : this.findMovePingPosition();
    } else if (normalizedType === TACTICAL_PING_TYPES.BUY_OPEN) {
      position = this.findMovePingPosition();
    } else {
      position = new THREE.Vector3(
        finite(this.player?.pos?.x),
        finite(this.player?.pos?.y) + 1.55,
        finite(this.player?.pos?.z)
      );
    }

    this.localPingSequence += 1;
    const candidate = {
      pingId: makePingId(ownerPlayerId, this.localPingSequence),
      type: normalizedType,
      ownerPlayerId,
      ownerName: this.localOwnerName(),
      position: vectorPayload(position),
      targetId: aimedEnemy?.networkId || aimedEnemy?.mesh?.uuid || null,
      lifetimeMultiplier: (
        this.getPingLifetimeMultiplier?.(ownerPlayerId)
        || (this.getRoleForPlayer?.(ownerPlayerId) === 'RECON' ? 1.35 : (
          this.getRoleForPlayer?.(ownerPlayerId) === 'SUPPORT' ? 1.12 : 1
        ))
      ),
      createdAt: now
    };
    const result = this.store.addPing(candidate, {
      now,
      local: true,
      ownerPlayerId,
      ownerName: candidate.ownerName
    });
    if (!result.accepted) {
      this.metrics.localRejected += 1;
      return result;
    }
    this.metrics.localAccepted += 1;
    this.runtime?.sendTacticalPing?.(result.ping);
    this.onTeamAction?.('TACTICAL_PING', {
      actorId: ownerPlayerId,
      eventId: result.ping?.pingId,
      at: now
    });
    return result;
  }



  findAimedEnemy() {
    const enemies = (this.getActiveEnemies?.() || [])
      .filter((enemy) => enemy?.alive === true && enemy.mesh);
    if (!enemies.length || !this.camera) return null;

    this.camera.getWorldDirection(_aimDir).normalize();
    _origin.copy(this.camera.position);

    const meshes = enemies.map((enemy) => enemy.mesh).filter(Boolean);
    if (meshes.length) {
      _raycaster.set(_origin, _aimDir);
      _raycaster.far = ENEMY_PING_MAX_DISTANCE_M;
      const hits = _raycaster.intersectObjects(meshes, true);
      for (const hit of hits) {
        const enemy = hit.object?.userData?.eRef;
        if (enemy?.alive === true) return enemy;
      }
    }

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    enemies.forEach((enemy) => {
      this.enemyPingPosition(enemy, _center);
      _toTarget.subVectors(_center, _origin);
      const dist = _toTarget.length();
      if (dist <= 0.001 || dist > ENEMY_PING_MAX_DISTANCE_M) return;
      _toTarget.multiplyScalar(1 / dist);
      const dot = Math.max(-1, Math.min(1, _aimDir.dot(_toTarget)));
      if (dot <= 0) return;
      const angle = Math.acos(dot);
      const cone = Math.max(
        0.028,
        Math.min(0.13, (finite(enemy.colRadius, 0.45) + 0.62) / dist)
      );
      if (angle > cone) return;
      const score = angle / cone + dist * 0.0025;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    });
    return best;
  }

  enemyPingPosition(enemy, out = new THREE.Vector3()) {
    out.copy(enemy?.mesh?.position || this.player?.pos || _origin);
    out.y += enemyMarkerHeight(enemy);
    return out;
  }

  findMovePingPosition() {
    if (!this.camera) return this.player?.pos || new THREE.Vector3();
    this.camera.getWorldDirection(_aimDir).normalize();
    _origin.copy(this.camera.position);
    _raycaster.set(_origin, _aimDir);
    _raycaster.far = MOVE_PING_MAX_DISTANCE_M;

    const targets = (this.getWorldTargets?.() || []).filter(Boolean);
    const hits = targets.length ? _raycaster.intersectObjects(targets, true) : [];
    if (hits.length) return hits[0].point.clone();

    return _origin.clone().addScaledVector(_aimDir, 24);
  }

  handlePingEnvelope(envelope) {
    if (!this.active || !this.isOnlineRun() || !envelope?.payload) return;
    if (envelope.runId && envelope.runId !== this.session?.run?.runId) return;

    const now = nowMs();
    const room = this.runtime?.room?.getSnapshot?.() || {};
    const ownerPlayerId = envelope.playerId || envelope.payload.ownerPlayerId;
    const ownerName = roomPlayerName(room, ownerPlayerId, envelope.payload.ownerName);
    const candidate = {
      ...envelope.payload,
      ownerPlayerId,
      ownerName,
      createdAt: now
    };
    const result = this.store.addPing(candidate, {
      now,
      ownerPlayerId,
      ownerName
    });

    if (result.accepted) {
      this.metrics.remoteAccepted += 1;
    } else {
      this.metrics.remoteRejected += 1;
      if (result.reason === 'duplicate') this.metrics.duplicates += 1;
    }
  }

  handleHostMigration() {
    if (!this.active || !this.isOnlineRun()) return false;
    const ownerPlayerId = this.runtime?.localPlayerId || null;
    const payloads = this.store.getRebroadcastPayloads(ownerPlayerId, nowMs());
    payloads.forEach((ping) => {
      this.runtime?.sendTacticalPing?.(ping);
      this.metrics.rebroadcasts += 1;
    });
    return payloads.length > 0;
  }

  project(position) {
    if (!this.camera || typeof window === 'undefined') return null;
    _projected.set(finite(position?.x), finite(position?.y), finite(position?.z));
    _projected.project(this.camera);
    if (_projected.z < -1 || _projected.z > 1) return null;
    return {
      x: (_projected.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_projected.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  renderPing(root, ping) {
    const point = this.project(ping.position);
    if (!point) return;

    const dist = distance(this.player?.pos, ping.position);
    const color = ping.color || '#34d8ff';
    const marker = document.createElement('div');
    setMarkerBoxStyle(marker, color);
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;

    const title = document.createElement('div');
    title.textContent = `${ping.label || ping.type} | ${sanitizePingText(ping.ownerName, 'Player')}`;
    title.style.color = color;
    const detail = document.createElement('div');
    detail.textContent = formatMeters(dist);
    detail.style.color = '#d9f6ff';
    detail.style.fontWeight = '700';
    marker.append(title, detail);
    root.appendChild(marker);
  }

  buildTeammates(now = nowMs()) {
    const room = this.runtime?.room?.getSnapshot?.() || {};
    const revive = this.getReviveSnapshot?.() || {};
    const revivePlayers = new Map(
      (revive.state?.players || []).map((entry) => [entry.playerId, entry])
    );
    const localPlayerId = this.runtime?.localPlayerId || null;
    const hostPlayerId = room.hostPlayerId || this.session?.hostPlayerId || null;
    const result = [];

    (room.players || []).forEach((roomPlayer) => {
      const playerId = roomPlayer?.playerId;
      if (!playerId || playerId === localPlayerId) return;

      const sampled = this.runtime?.sampleRemotePlayer?.(playerId, now);
      const state = sampled?.state || null;
      const reviveEntry = revivePlayers.get(playerId) || null;
      const position = state?.position || reviveEntry?.position || null;
      if (!position) return;

      const dist = distance(this.player?.pos, position);
      if (dist > TEAMMATE_MARKER_DISTANCE_M) return;

      const status = teammateStatus({
        roomPlayer,
        reviveEntry,
        state,
        hostPlayerId
      });

      result.push({
        playerId,
        displayName: roomPlayerName(room, playerId, roomPlayer.displayName),
        status,
        position: {
          x: finite(position.x),
          y: finite(position.y) + 0.9,
          z: finite(position.z)
        },
        distance: dist,
        health: finite(reviveEntry?.health, finite(state?.health, 100)),
        maxHealth: finite(reviveEntry?.maxHealth, finite(state?.maxHealth, 100))
      });
    });

    return result;
  }

  renderTeammate(root, teammate) {
    const point = this.project(teammate.position);
    if (!point) return;

    const color = statusColor(teammate.status);
    const marker = document.createElement('div');
    setMarkerBoxStyle(marker, color);
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;
    marker.style.minWidth = '126px';
    marker.style.opacity = teammate.status === 'RECONNECTING' ? '0.82' : '1';

    const title = document.createElement('div');
    title.textContent = `${teammate.displayName} | ${teammate.status}`;
    title.style.color = color;

    const detail = document.createElement('div');
    detail.textContent = `${formatMeters(teammate.distance)} | HP ${Math.round(teammate.health)}/${Math.round(teammate.maxHealth)}`;
    detail.style.color = '#d9f6ff';
    detail.style.fontWeight = '700';

    const bar = document.createElement('div');
    Object.assign(bar.style, {
      height: '3px',
      marginTop: '4px',
      borderRadius: '2px',
      overflow: 'hidden',
      background: 'rgba(255,255,255,.16)'
    });
    const fill = document.createElement('div');
    Object.assign(fill.style, {
      width: `${healthPercent(teammate.health, teammate.maxHealth)}%`,
      height: '100%',
      background: color
    });
    bar.appendChild(fill);
    marker.append(title, detail, bar);
    root.appendChild(marker);
  }

  update(now = nowMs()) {
    if (!this.active || !this.isOnlineRun()) {
      this.hideRoot();
      return;
    }

    this.store.prune(now);
    const root = this.ensureRoot();
    if (!root) return;
    root.style.display = 'block';
    root.replaceChildren();

    this.store.getActive(now).forEach((ping) => {
      this.renderPing(root, ping);
    });

    const teammates = this.buildTeammates(now);
    this.lastTeammateCount = teammates.length;
    teammates.forEach((teammate) => {
      this.renderTeammate(root, teammate);
    });
  }

  getSnapshot() {
    return {
      active: this.active,
      online: this.isOnlineRun(),
      teammatesRendered: this.lastTeammateCount,
      pings: this.store.getSnapshot(),
      metrics: { ...this.metrics }
    };
  }

  destroy() {
    this.endRun();
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    this.root?.remove?.();
    this.root = null;
  }
}
