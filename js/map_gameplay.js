// js/map_gameplay.js
// C12 — Map-specific gameplay systems.
// Reactor Courtyard receives a randomized containment contract zone,
// warning-based steam vents, and a purchasable coolant override defense.

import * as THREE from 'three';
import { getObjectiveSnapshot } from './objectives.js';
import { scaleEconomyPrice } from './economy_balance.js';
import { walls, mapMeshes } from './map.js';
import {
  GAMEPLAY3_PATCH,
  getGameplay3MapProfile
} from './gameplay3_map_evolution_core.js';

const REACTOR_MAP_ID = 'reactor_courtyard';
const BASE_DEFENSE_COST = 1250;

function getDefenseCost() {
  return scaleEconomyPrice(BASE_DEFENSE_COST, 'MAP_DEFENSE');
}
const DEFENSE_DURATION = 8.0;
const DEFENSE_COOLDOWN = 36.0;
const DEFENSE_RADIUS = 9.2;
const VENT_WARNING_DURATION = 1.55;
const VENT_ACTIVE_DURATION = 3.2;
const VENT_IDLE_MIN = 8.5;
const VENT_IDLE_MAX = 13.0;
const VENT_RADIUS = 3.4;
const GAMEPLAY2_HAZARD_PLAYER_TICK = 0.65;
const GAMEPLAY2_HAZARD_ENEMY_TICK = 0.45;

const REACTOR_VENTS = Object.freeze([
  Object.freeze({ x: -28, z: -17, label: 'NW STEAM VENT' }),
  Object.freeze({ x: 28, z: -17, label: 'NE STEAM VENT' }),
  Object.freeze({ x: -28, z: 17, label: 'SW STEAM VENT' }),
  Object.freeze({ x: 28, z: 17, label: 'SE STEAM VENT' })
]);

const DEFENSE_CONSOLES = Object.freeze([
  Object.freeze({ x: -13, z: 28, label: 'NORTH COOLANT CONSOLE' }),
  Object.freeze({ x: 13, z: -28, label: 'SOUTH COOLANT CONSOLE' })
]);

const state = {
  active: false,
  mapId: 'unknown',
  scene: null,
  objects: [],
  zoneMarker: null,
  zoneAnchor: null,
  vents: [],
  ventPhase: 'OFFLINE',
  ventTimer: 0,
  activeVentIndex: -1,
  ventEvents: 0,
  ventPlayerHits: 0,
  ventEnemyHits: 0,
  ventPlayerTick: 0,
  ventEnemyTick: 0,
  defenseConsole: null,
  defenseState: 'OFFLINE',
  defenseTimer: 0,
  defenseActivations: 0,
  defenseEnemyHits: 0,
  defenseEnemyTick: 0,
  defenseField: null,
  gameplay2Snapshot: null,
  gameplay2HazardRing: null,
  gameplay2HazardPhase: 'OFFLINE',
  gameplay2HazardPlayerTick: 0,
  gameplay2HazardEnemyTick: 0,
  gameplay2HazardPlayerHits: 0,
  gameplay2HazardEnemyHits: 0,
  gameplay2HazardAnnouncementKey: '',
  gameplay3Snapshot: null,
  gameplay3Profile: null,
  gameplay3Control: null,
  gameplay3RouteA: null,
  gameplay3RouteB: null,
  gameplay3Cover: null,
  gameplay3HazardRing: null,
  gameplay3CollisionObjects: [],
  gameplay3HazardPlayerTick: 0,
  gameplay3HazardEnemyTick: 0,
  gameplay3HazardPlayerHits: 0,
  gameplay3HazardEnemyHits: 0,
  gameplay3AnnouncementKey: '',
  gameplay3LastRevision: -1,
  pendingEvents: [],
  lastEvent: 'IDLE'
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function flatDistanceSq(ax, az, bx, bz) {
  const dx = finite(ax) - finite(bx);
  const dz = finite(az) - finite(bz);
  return dx * dx + dz * dz;
}

function addObject(object) {
  if (!object || !state.scene) return object;
  state.scene.add(object);
  state.objects.push(object);
  return object;
}

function createRing(x, z, radius, color, opacity = 0.5) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.055, z);
  mesh.userData.isMapGameplay = true;
  mesh.userData.playerNonBlockingProjectile = true;
  return addObject(mesh);
}

function createConsole(anchor) {
  const group = new THREE.Group();
  group.name = 'reactor_coolant_override_console';
  group.position.set(anchor.x, 0, anchor.z);
  group.userData.isMapGameplay = true;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.3, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x26323a, roughness: 0.7, metalness: 0.24 })
  );
  base.position.y = 0.65;

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.42, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x22ff88 })
  );
  screen.position.set(0, 0.88, -0.42);
  screen.userData.consoleScreen = true;

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.5, 10),
    new THREE.MeshBasicMaterial({ color: 0x22ff88 })
  );
  beacon.position.y = 1.55;
  beacon.userData.consoleBeacon = true;

  group.add(base, screen, beacon);
  addObject(group);

  return {
    kind: 'REACTOR_DEFENSE',
    label: anchor.label,
    pos: new THREE.Vector3(anchor.x, 0, anchor.z),
    group,
    screen,
    beacon
  };
}

function createVent(anchor, index) {
  const ring = createRing(anchor.x, anchor.z, VENT_RADIUS, 0x552200, 0.16);
  ring.visible = true;
  ring.name = `reactor_steam_vent_${index}`;

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.95, 0.12, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a3f43, roughness: 0.76, metalness: 0.4 })
  );
  cap.position.set(anchor.x, 0.06, anchor.z);
  cap.userData.isMapGameplay = true;
  cap.userData.playerNonBlockingProjectile = true;
  addObject(cap);

  return { ...anchor, ring, cap, index };
}

function removeArrayItem(array, item) {
  const index = array.indexOf(item);
  if (index >= 0) array.splice(index, 1);
}

function setGameplay3Collision(item, active) {
  if (!item?.mesh || !item?.wall) return;
  item.mesh.visible = active === true;
  if (active === true) {
    if (!mapMeshes.includes(item.mesh)) mapMeshes.push(item.mesh);
    if (!walls.includes(item.wall)) walls.push(item.wall);
  } else {
    removeArrayItem(mapMeshes, item.mesh);
    removeArrayItem(walls, item.wall);
  }
}

function createGameplay3Barrier(definition, color = 0x00d4ff) {
  if (!definition || !state.scene) return null;
  const width = Math.max(0.5, finite(definition.w, 1));
  const height = Math.max(0.8, finite(definition.h, 2.4));
  const depth = Math.max(0.5, finite(definition.d, 1));
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.34,
      transparent: true,
      opacity: 0.84,
      roughness: 0.42,
      metalness: 0.44
    })
  );
  mesh.name = String(definition.id || 'gameplay3_barrier');
  mesh.position.set(finite(definition.x), height / 2, finite(definition.z));
  mesh.userData.isMapGameplay = true;
  mesh.userData.gameplay3 = true;
  mesh.userData.playerNonWalkable = true;
  addObject(mesh);

  const wall = {
    minX: mesh.position.x - width / 2,
    maxX: mesh.position.x + width / 2,
    maxY: height,
    minZ: mesh.position.z - depth / 2,
    maxZ: mesh.position.z + depth / 2,
    isDoor: false,
    playerClimbable: false,
    playerNonWalkable: true,
    supportTag: 'gameplay3_dynamic_barrier',
    mesh,
    pos: new THREE.Vector3(mesh.position.x, 0, mesh.position.z)
  };
  const item = { mesh, wall, definition: { ...definition }, active: false };
  state.gameplay3CollisionObjects.push(item);
  setGameplay3Collision(item, false);
  return item;
}

function createGameplay3Control(definition) {
  if (!definition || !state.scene) return null;
  const group = new THREE.Group();
  group.name = String(definition.id || 'gameplay3_control');
  group.position.set(finite(definition.x), 0, finite(definition.z));
  group.userData.isMapGameplay = true;
  group.userData.gameplay3 = true;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.25, 0.75),
    new THREE.MeshStandardMaterial({
      color: 0x1f2a32,
      roughness: 0.68,
      metalness: 0.35
    })
  );
  base.position.y = 0.625;

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.38, 0.045),
    new THREE.MeshBasicMaterial({ color: 0x22ff88 })
  );
  screen.position.set(0, 0.82, -0.40);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.10, 0.42, 10),
    new THREE.MeshBasicMaterial({ color: 0x22ff88 })
  );
  beacon.position.y = 1.47;

  group.add(base, screen, beacon);
  addObject(group);
  return {
    group,
    screen,
    beacon,
    pos: new THREE.Vector3(group.position.x, 0, group.position.z),
    definition: { ...definition }
  };
}

function clearGameplay3Runtime() {
  for (const item of state.gameplay3CollisionObjects) {
    setGameplay3Collision(item, false);
  }
  state.gameplay3CollisionObjects.length = 0;
  state.gameplay3Control = null;
  state.gameplay3RouteA = null;
  state.gameplay3RouteB = null;
  state.gameplay3Cover = null;
  state.gameplay3HazardRing = null;
  state.gameplay3Profile = null;
}

function ensureGameplay3Runtime() {
  const snapshot = state.gameplay3Snapshot;
  if (
    !snapshot
    || snapshot.patch !== GAMEPLAY3_PATCH
    || snapshot.active !== true
    || !state.scene
  ) return false;

  const profile = snapshot.profile || getGameplay3MapProfile(snapshot.mapId);
  if (!profile || profile.mapId !== state.mapId) return false;
  if (
    state.gameplay3Profile?.mapId === profile.mapId
    && state.gameplay3Control
    && state.gameplay3RouteA
    && state.gameplay3RouteB
    && state.gameplay3Cover
    && state.gameplay3HazardRing
  ) return true;

  clearGameplay3Runtime();
  state.gameplay3Profile = JSON.parse(JSON.stringify(profile));
  state.gameplay3Control = createGameplay3Control(profile.control);
  state.gameplay3RouteA = createGameplay3Barrier(profile.routeA, 0xffaa00);
  state.gameplay3RouteB = createGameplay3Barrier(profile.routeB, 0x00d4ff);
  state.gameplay3Cover = createGameplay3Barrier(profile.cover, 0x22ff88);
  state.gameplay3HazardRing = createRing(
    profile.hazard.x,
    profile.hazard.z,
    profile.hazard.radius,
    0xffaa00,
    0.20
  );
  if (state.gameplay3HazardRing) {
    state.gameplay3HazardRing.name = String(profile.hazard.id || 'gameplay3_hazard');
    state.gameplay3HazardRing.visible = false;
  }
  return true;
}

function gameplay3Snapshot() {
  const snapshot = state.gameplay3Snapshot;
  return (
    snapshot
    && snapshot.patch === GAMEPLAY3_PATCH
    && snapshot.active === true
  ) ? snapshot : null;
}

function updateGameplay3ControlVisuals(snapshot) {
  const control = state.gameplay3Control;
  if (!control) return;
  const controlState = String(snapshot?.control?.state || 'OFFLINE').toUpperCase();
  let color = 0x667788;
  if (controlState === 'READY') color = 0x22ff88;
  else if (controlState === 'ACTIVE') color = 0x00d4ff;
  else if (controlState === 'COOLDOWN') color = 0xffaa00;
  control.screen.material.color.setHex(color);
  control.beacon.material.color.setHex(color);
  control.beacon.scale.y = controlState === 'ACTIVE'
    ? 1.0 + Math.sin(performance.now() * 0.012) * 0.18
    : 1;
}

function renderGameplay3Evolution() {
  const snapshot = gameplay3Snapshot();
  if (!snapshot) {
    setGameplay3Collision(state.gameplay3RouteA, false);
    setGameplay3Collision(state.gameplay3RouteB, false);
    setGameplay3Collision(state.gameplay3Cover, false);
    if (state.gameplay3Control?.group) state.gameplay3Control.group.visible = false;
    if (state.gameplay3HazardRing) state.gameplay3HazardRing.visible = false;
    return false;
  }
  if (!ensureGameplay3Runtime()) return false;

  const routeVariant = Math.max(0, Math.min(1, Math.floor(finite(snapshot.routeVariant))));
  const shutterClosed = snapshot.shutterClosed === true;
  setGameplay3Collision(state.gameplay3RouteA, shutterClosed && routeVariant === 0);
  setGameplay3Collision(state.gameplay3RouteB, shutterClosed && routeVariant === 1);
  setGameplay3Collision(state.gameplay3Cover, snapshot.coverDeployed === true);
  if (state.gameplay3Control?.group) state.gameplay3Control.group.visible = true;
  updateGameplay3ControlVisuals(snapshot);

  const hazard = snapshot.hazard;
  const hazardVisible = Boolean(
    hazard?.enabled === true
    && ['WARNING', 'ACTIVE'].includes(String(hazard.phase || '').toUpperCase())
  );
  if (state.gameplay3HazardRing) {
    state.gameplay3HazardRing.visible = hazardVisible;
    if (hazardVisible) {
      const active = String(hazard.phase).toUpperCase() === 'ACTIVE';
      state.gameplay3HazardRing.position.set(
        finite(hazard.x, state.gameplay3Profile?.hazard?.x),
        0.07,
        finite(hazard.z, state.gameplay3Profile?.hazard?.z)
      );
      const baseRadius = Math.max(2, finite(state.gameplay3Profile?.hazard?.radius, 4));
      const radius = Math.max(2, finite(hazard.radius, baseRadius));
      state.gameplay3HazardRing.scale.set(radius / baseRadius, radius / baseRadius, radius / baseRadius);
      state.gameplay3HazardRing.material.color.setHex(active ? 0xff3344 : 0xffb000);
      state.gameplay3HazardRing.material.opacity = active
        ? 0.54 + Math.sin(performance.now() * 0.015) * 0.08
        : 0.22 + Math.sin(performance.now() * 0.010) * 0.06;
    }
  }

  const hazardKey = `${snapshot.revision}:${hazard?.cycle}:${hazard?.phase}`;
  if (
    hazardVisible
    && hazardKey !== state.gameplay3AnnouncementKey
  ) {
    state.gameplay3AnnouncementKey = hazardKey;
    const active = String(hazard.phase).toUpperCase() === 'ACTIVE';
    state.pendingEvents.push({
      type: active ? 'GAMEPLAY3_HAZARD_ACTIVE' : 'GAMEPLAY3_HAZARD_WARNING',
      text: active
        ? 'MAP HAZARD ACTIVE · CLEAR THE MARKED ZONE'
        : 'MAP HAZARD WARNING · FLOOR INSTABILITY DETECTED',
      color: active ? '#ff3344' : '#ffb000',
      duration: active ? 1700 : 1450
    });
  }

  if (snapshot.revision !== state.gameplay3LastRevision) {
    const previous = state.gameplay3LastRevision;
    state.gameplay3LastRevision = snapshot.revision;
    if (previous >= 0) {
      state.pendingEvents.push({
        type: 'GAMEPLAY3_MAP_SHIFT',
        text: snapshot.overrideActive === true
          ? `${String(snapshot.control?.label || 'MAP OVERRIDE').toUpperCase()} ACTIVE`
          : `MAP SHIFT · ${String(snapshot.phaseLabel || 'ROUTING UPDATED').toUpperCase()}`,
        color: snapshot.overrideActive === true ? '#22ff88' : '#00d4ff',
        duration: 1750
      });
    }
  }
  return true;
}

export function configureGameplay3MapEvolution(snapshot = null) {
  state.gameplay3Snapshot = snapshot && typeof snapshot === 'object'
    ? JSON.parse(JSON.stringify(snapshot))
    : null;
  if (!gameplay3Snapshot()) {
    state.gameplay3AnnouncementKey = '';
    state.gameplay3LastRevision = -1;
  }
  renderGameplay3Evolution();
  return state.gameplay3Snapshot;
}

export function updateGameplay3MapEvolution(dt, {
  player = null,
  enemies = [],
  damagePlayer = null,
  killEnemy = null,
  affectEnemies = false
} = {}) {
  const snapshot = gameplay3Snapshot();
  renderGameplay3Evolution();
  const hazard = snapshot?.hazard;
  if (
    !hazard
    || hazard.enabled !== true
    || String(hazard.phase || '').toUpperCase() !== 'ACTIVE'
  ) return;

  const safeDt = clamp(dt, 0, 0.05);
  const radius = Math.max(2, finite(hazard.radius, 4));
  const damage = Math.max(1, finite(hazard.damage, 7));
  state.gameplay3HazardPlayerTick -= safeDt;

  if (player?.alive && state.gameplay3HazardPlayerTick <= 0) {
    state.gameplay3HazardPlayerTick = 0.65;
    if (
      flatDistanceSq(
        player.pos?.x,
        player.pos?.z,
        hazard.x,
        hazard.z
      ) <= radius * radius
    ) {
      if (typeof damagePlayer === 'function') {
        const source = state.gameplay3HazardRing?.position || {
          x: hazard.x,
          y: 0,
          z: hazard.z
        };
        damagePlayer(damage, source, 'MAP_EVOLUTION_HAZARD');
      }
      state.gameplay3HazardPlayerHits += 1;
    }
  }

  if (affectEnemies === true) {
    state.gameplay3HazardEnemyTick -= safeDt;
    if (state.gameplay3HazardEnemyTick <= 0) {
      state.gameplay3HazardEnemyTick = 0.45;
      state.gameplay3HazardEnemyHits += damageEnemiesInRadius(
        enemies,
        hazard.x,
        hazard.z,
        radius,
        damage * 2.0,
        killEnemy,
        'MAP_EVOLUTION_HAZARD'
      );
    }
  }
}

function gameplay2HazardSnapshot() {
  const hazard = state.gameplay2Snapshot?.hazard || null;
  return hazard?.enabled === true ? hazard : null;
}

function ensureGameplay2HazardRing() {
  if (state.gameplay2HazardRing || !state.scene) return state.gameplay2HazardRing;
  const ring = createRing(0, 0, 4.2, 0xffaa00, 0.24);
  ring.name = 'gameplay2_hazard_shift';
  ring.visible = false;
  state.gameplay2HazardRing = ring;
  return ring;
}

function renderGameplay2Hazard() {
  const hazard = gameplay2HazardSnapshot();
  const ring = ensureGameplay2HazardRing();
  if (!ring) return;
  const visible = Boolean(
    hazard
    && hazard.anchor
    && ['WARNING', 'ACTIVE'].includes(hazard.phase)
  );
  ring.visible = visible;
  if (!visible) {
    state.gameplay2HazardPhase = hazard?.phase || 'OFFLINE';
    return;
  }

  const radius = Math.max(2.5, finite(hazard.radius, 4.2));
  ring.position.set(finite(hazard.anchor.x), 0.065, finite(hazard.anchor.z));
  ring.scale.set(radius / 4.2, radius / 4.2, radius / 4.2);
  const active = hazard.phase === 'ACTIVE';
  ring.material.color.setHex(active ? 0xff3344 : 0xffb000);
  ring.material.opacity = active
    ? 0.58 + Math.sin(performance.now() * 0.014) * 0.08
    : 0.22 + Math.sin(performance.now() * 0.010) * 0.08;

  const announcementKey = `${hazard.cycle}:${hazard.phase}`;
  if (announcementKey !== state.gameplay2HazardAnnouncementKey) {
    state.gameplay2HazardAnnouncementKey = announcementKey;
    state.pendingEvents.push({
      type: active ? 'GAMEPLAY2_HAZARD_ACTIVE' : 'GAMEPLAY2_HAZARD_WARNING',
      text: active ? 'MUTATION HAZARD ACTIVE · CLEAR THE RED ZONE' : 'MUTATION HAZARD SHIFT · ZONE DESTABILIZING',
      color: active ? '#ff3344' : '#ffb000',
      duration: active ? 1800 : 1500
    });
  }
  state.gameplay2HazardPhase = hazard.phase;
}

export function configureGameplay2MapMutation(snapshot = null) {
  state.gameplay2Snapshot = snapshot && typeof snapshot === 'object'
    ? JSON.parse(JSON.stringify(snapshot))
    : null;
  const hazard = gameplay2HazardSnapshot();
  if (!hazard) {
    state.gameplay2HazardPhase = 'OFFLINE';
    state.gameplay2HazardAnnouncementKey = '';
    if (state.gameplay2HazardRing) state.gameplay2HazardRing.visible = false;
  } else {
    renderGameplay2Hazard();
  }
  return state.gameplay2Snapshot;
}

export function updateGameplay2MapMutation(dt, {
  player,
  enemies = [],
  damagePlayer = null,
  killEnemy = null,
  affectEnemies = false
} = {}) {
  const hazard = gameplay2HazardSnapshot();
  renderGameplay2Hazard();
  if (!hazard || hazard.phase !== 'ACTIVE' || !hazard.anchor) return;

  const safeDt = clamp(dt, 0, 0.05);
  const radius = Math.max(2.5, finite(hazard.radius, 4.2));
  const damage = Math.max(1, finite(hazard.damage, 7));
  state.gameplay2HazardPlayerTick -= safeDt;

  // Every machine evaluates its own local player so Co-op clients receive the
  // same synchronized environmental threat without trusting remote proxies.
  if (player?.alive && state.gameplay2HazardPlayerTick <= 0) {
    state.gameplay2HazardPlayerTick = GAMEPLAY2_HAZARD_PLAYER_TICK;
    if (flatDistanceSq(player.pos?.x, player.pos?.z, hazard.anchor.x, hazard.anchor.z) <= radius * radius) {
      if (typeof damagePlayer === 'function') {
        const source = state.gameplay2HazardRing?.position || { x: hazard.anchor.x, y: 0, z: hazard.anchor.z };
        damagePlayer(damage, source, 'MUTATION_HAZARD');
      }
      state.gameplay2HazardPlayerHits += 1;
    }
  }

  // Enemy damage remains host/solo authoritative to prevent duplicate hits.
  if (affectEnemies === true) {
    state.gameplay2HazardEnemyTick -= safeDt;
    if (state.gameplay2HazardEnemyTick <= 0) {
      state.gameplay2HazardEnemyTick = GAMEPLAY2_HAZARD_ENEMY_TICK;
      state.gameplay2HazardEnemyHits += damageEnemiesInRadius(
        enemies,
        hazard.anchor.x,
        hazard.anchor.z,
        radius,
        damage * 2.2,
        killEnemy,
        'MUTATION_HAZARD'
      );
    }
  }
}

function clearObjects() {
  clearGameplay3Runtime();
  for (const object of state.objects) {
    if (object?.parent) object.parent.remove(object);
    object?.traverse?.((child) => {
      if (child.geometry?.dispose) child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
      else child.material?.dispose?.();
    });
  }
  state.objects.length = 0;
  state.gameplay2HazardRing = null;
}

function chooseRandom(array) {
  if (!Array.isArray(array) || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

function scheduleNextVent() {
  state.ventPhase = 'IDLE';
  state.ventTimer = VENT_IDLE_MIN + Math.random() * (VENT_IDLE_MAX - VENT_IDLE_MIN);
  state.activeVentIndex = -1;
  state.ventPlayerTick = 0;
  state.ventEnemyTick = 0;
  state.lastEvent = 'STEAM VENTS IDLE';
}

function setVentVisuals() {
  for (const vent of state.vents) {
    const selected = vent.index === state.activeVentIndex;
    if (!selected) {
      vent.ring.material.color.setHex(0x552200);
      vent.ring.material.opacity = 0.12;
      vent.cap.material.emissive?.setHex?.(0x000000);
      continue;
    }

    if (state.ventPhase === 'WARNING') {
      const pulse = 0.22 + Math.sin(performance.now() * 0.018) * 0.08;
      vent.ring.material.color.setHex(0xffaa00);
      vent.ring.material.opacity = clamp(pulse, 0.12, 0.42);
      vent.cap.material.emissive?.setHex?.(0x663300);
      vent.cap.material.emissiveIntensity = 0.55;
    } else if (state.ventPhase === 'ACTIVE') {
      vent.ring.material.color.setHex(0xff5522);
      vent.ring.material.opacity = 0.58;
      vent.cap.material.emissive?.setHex?.(0xff3300);
      vent.cap.material.emissiveIntensity = 0.85;
    }
  }
}

function updateZoneMarker() {
  if (!state.zoneMarker) return;
  const objective = getObjectiveSnapshot();
  const complete = objective.completed === true;
  state.zoneMarker.material.color.setHex(complete ? 0x22ff88 : 0x00d4ff);
  state.zoneMarker.material.opacity = complete ? 0.18 : 0.34 + Math.sin(performance.now() * 0.003) * 0.08;
}

function updateDefenseVisuals() {
  if (!state.defenseConsole) return;

  let color = 0x22ff88;
  if (state.defenseState === 'ACTIVE') color = 0x00ddff;
  else if (state.defenseState === 'COOLDOWN') color = 0xffaa00;

  state.defenseConsole.screen.material.color.setHex(color);
  state.defenseConsole.beacon.material.color.setHex(color);

  if (state.defenseField) {
    state.defenseField.visible = state.defenseState === 'ACTIVE';
    if (state.defenseField.visible) {
      state.defenseField.rotation.z += 0.008;
      state.defenseField.material.opacity = 0.28 + Math.sin(performance.now() * 0.008) * 0.07;
    }
  }
}

function damageEnemiesInRadius(enemies, x, z, radius, damage, killEnemy, source) {
  const radiusSq = radius * radius;
  let hits = 0;

  for (const enemy of enemies || []) {
    if (!enemy?.alive || enemy.dyingT >= 0 || !enemy.mesh?.position) continue;
    if (flatDistanceSq(enemy.mesh.position.x, enemy.mesh.position.z, x, z) > radiusSq) continue;

    enemy.health -= damage;
    enemy.hitReactT = Math.max(enemy.hitReactT || 0, 0.12);
    hits++;

    if (enemy.health <= 0 && typeof killEnemy === 'function') {
      killEnemy(enemy, { source });
    }
  }

  return hits;
}

export function resetMapGameplay({ mapId = 'unknown', scene = null } = {}) {
  clearObjects();

  state.active = String(mapId) === REACTOR_MAP_ID;
  state.mapId = String(mapId || 'unknown');
  state.scene = scene;
  state.zoneMarker = null;
  state.zoneAnchor = null;
  state.vents = [];
  state.ventPhase = state.active ? 'IDLE' : 'OFFLINE';
  state.ventTimer = 0;
  state.activeVentIndex = -1;
  state.ventEvents = 0;
  state.ventPlayerHits = 0;
  state.ventEnemyHits = 0;
  state.defenseConsole = null;
  state.defenseState = state.active ? 'READY' : 'OFFLINE';
  state.defenseTimer = 0;
  state.defenseActivations = 0;
  state.defenseEnemyHits = 0;
  state.defenseField = null;
  state.gameplay2HazardRing = null;
  state.gameplay2HazardPhase = 'OFFLINE';
  state.gameplay2HazardPlayerTick = 0;
  state.gameplay2HazardEnemyTick = 0;
  state.gameplay2HazardPlayerHits = 0;
  state.gameplay2HazardEnemyHits = 0;
  state.gameplay2HazardAnnouncementKey = '';
  state.gameplay3Control = null;
  state.gameplay3RouteA = null;
  state.gameplay3RouteB = null;
  state.gameplay3Cover = null;
  state.gameplay3HazardRing = null;
  state.gameplay3CollisionObjects.length = 0;
  state.gameplay3HazardPlayerTick = 0;
  state.gameplay3HazardEnemyTick = 0;
  state.gameplay3HazardPlayerHits = 0;
  state.gameplay3HazardEnemyHits = 0;
  state.gameplay3AnnouncementKey = '';
  state.gameplay3LastRevision = -1;
  state.pendingEvents.length = 0;
  state.lastEvent = state.active ? 'REACTOR SYSTEMS ONLINE' : 'OFFLINE';

  if (scene && gameplay2HazardSnapshot()) ensureGameplay2HazardRing();
  if (scene && gameplay3Snapshot()) ensureGameplay3Runtime();
  if (!state.active || !scene) {
    renderGameplay2Hazard();
    renderGameplay3Evolution();
    return getMapGameplaySnapshot();
  }

  const objective = getObjectiveSnapshot();
  const anchor = objective.objective?.worldAnchor;
  if (anchor) {
    state.zoneAnchor = { ...anchor };
    state.zoneMarker = createRing(anchor.x, anchor.z, anchor.radius || 7, 0x00d4ff, 0.36);
    state.zoneMarker.name = 'reactor_contract_zone';
  }

  state.vents = REACTOR_VENTS.map((vent, index) => createVent(vent, index));

  const consoleAnchor = chooseRandom(DEFENSE_CONSOLES) || DEFENSE_CONSOLES[0];
  state.defenseConsole = createConsole(consoleAnchor);
  state.defenseField = createRing(0, 0, DEFENSE_RADIUS, 0x00ddff, 0.32);
  state.defenseField.name = 'reactor_defense_field';
  state.defenseField.visible = false;

  scheduleNextVent();
  return getMapGameplaySnapshot();
}

export function endMapGameplay() {
  clearObjects();
  state.active = false;
  state.mapId = 'unknown';
  state.scene = null;
  state.zoneMarker = null;
  state.zoneAnchor = null;
  state.vents = [];
  state.ventPhase = 'OFFLINE';
  state.defenseState = 'OFFLINE';
  state.defenseConsole = null;
  state.defenseField = null;
  state.gameplay2Snapshot = null;
  state.gameplay2HazardRing = null;
  state.gameplay2HazardPhase = 'OFFLINE';
  state.gameplay2HazardPlayerTick = 0;
  state.gameplay2HazardEnemyTick = 0;
  state.gameplay2HazardAnnouncementKey = '';
  state.gameplay3Snapshot = null;
  state.gameplay3Profile = null;
  state.gameplay3AnnouncementKey = '';
  state.gameplay3LastRevision = -1;
  state.pendingEvents.length = 0;
  state.lastEvent = 'ENDED';
}

export function updateMapGameplay(dt, {
  player = null,
  enemies = [],
  damagePlayer = null,
  killEnemy = null
} = {}) {
  const mutationHazardActive = gameplay2HazardSnapshot()?.enabled === true;
  if (!state.active && !mutationHazardActive) return;

  const safeDt = clamp(dt, 0, 0.05);
  if (!state.active) return;
  updateZoneMarker();

  state.ventTimer -= safeDt;
  if (state.ventPhase === 'IDLE' && state.ventTimer <= 0) {
    state.activeVentIndex = Math.floor(Math.random() * Math.max(1, state.vents.length));
    state.ventPhase = 'WARNING';
    state.ventTimer = VENT_WARNING_DURATION;
    state.ventEvents++;
    state.lastEvent = `STEAM WARNING ${state.activeVentIndex + 1}`;
    state.pendingEvents.push({
      type: 'VENT_WARNING',
      text: `STEAM VENT ${state.activeVentIndex + 1} PRESSURIZING`,
      color: '#ffaa00',
      duration: 1450
    });
  } else if (state.ventPhase === 'WARNING' && state.ventTimer <= 0) {
    state.ventPhase = 'ACTIVE';
    state.ventTimer = VENT_ACTIVE_DURATION;
    state.ventPlayerTick = 0;
    state.ventEnemyTick = 0;
    state.lastEvent = `STEAM ACTIVE ${state.activeVentIndex + 1}`;
    state.pendingEvents.push({
      type: 'VENT_ACTIVE',
      text: `STEAM VENT ${state.activeVentIndex + 1} ACTIVE · CLEAR THE PAD`,
      color: '#ff5533',
      duration: 1500
    });
  } else if (state.ventPhase === 'ACTIVE' && state.ventTimer <= 0) {
    scheduleNextVent();
  }

  setVentVisuals();

  if (state.ventPhase === 'ACTIVE' && state.activeVentIndex >= 0) {
    const vent = state.vents[state.activeVentIndex];
    state.ventPlayerTick -= safeDt;
    state.ventEnemyTick -= safeDt;

    if (player?.alive && state.ventPlayerTick <= 0) {
      state.ventPlayerTick = 0.65;
      if (flatDistanceSq(player.pos?.x, player.pos?.z, vent.x, vent.z) <= VENT_RADIUS * VENT_RADIUS) {
        if (typeof damagePlayer === 'function') damagePlayer(7, vent.cap.position, 'STEAM');
        state.ventPlayerHits++;
      }
    }

    if (state.ventEnemyTick <= 0) {
      state.ventEnemyTick = 0.45;
      const hits = damageEnemiesInRadius(enemies, vent.x, vent.z, VENT_RADIUS, 24, killEnemy, 'STEAM');
      state.ventEnemyHits += hits;
    }
  }

  if (state.defenseState === 'ACTIVE') {
    state.defenseTimer -= safeDt;
    state.defenseEnemyTick -= safeDt;

    if (state.defenseEnemyTick <= 0) {
      state.defenseEnemyTick = 0.42;
      const hits = damageEnemiesInRadius(enemies, 0, 0, DEFENSE_RADIUS, 28, killEnemy, 'COOLANT_OVERRIDE');
      state.defenseEnemyHits += hits;
    }

    if (state.defenseTimer <= 0) {
      state.defenseState = 'COOLDOWN';
      state.defenseTimer = DEFENSE_COOLDOWN;
      state.lastEvent = 'COOLANT OVERRIDE COOLDOWN';
    }
  } else if (state.defenseState === 'COOLDOWN') {
    state.defenseTimer = Math.max(0, state.defenseTimer - safeDt);
    if (state.defenseTimer <= 0) {
      state.defenseState = 'READY';
      state.lastEvent = 'COOLANT OVERRIDE READY';
    }
  }

  updateDefenseVisuals();
}

export function getClosestMapGameplayInteractable(playerPos, maxDistance = 2.8) {
  const evolution = gameplay3Snapshot();
  if (evolution?.active === true && state.gameplay3Control && playerPos) {
    const distance = Math.sqrt(flatDistanceSq(
      playerPos.x,
      playerPos.z,
      state.gameplay3Control.pos.x,
      state.gameplay3Control.pos.z
    ));
    const allowed = Math.max(
      maxDistance,
      finite(evolution.profile?.control?.radius, 3.2)
    );
    if (distance <= allowed) {
      return {
        kind: 'GAMEPLAY3_CONTROL',
        label: evolution.control?.label || evolution.profile?.control?.label || 'MAP CONTROL',
        distance,
        state: evolution.control?.state || 'OFFLINE',
        timer: Math.max(0, finite(evolution.control?.remainingMs) / 1000),
        cost: 0,
        controlId: evolution.control?.id || evolution.profile?.control?.id || '',
        phaseLabel: evolution.phaseLabel || 'MAP EVOLUTION'
      };
    }
  }

  if (!state.active || !state.defenseConsole || !playerPos) return null;
  const distance = Math.sqrt(flatDistanceSq(
    playerPos.x,
    playerPos.z,
    state.defenseConsole.pos.x,
    state.defenseConsole.pos.z
  ));
  if (distance > maxDistance) return null;

  return {
    kind: 'REACTOR_DEFENSE',
    label: state.defenseConsole.label,
    distance,
    state: state.defenseState,
    timer: state.defenseTimer,
    cost: getDefenseCost()
  };
}

export function getMapGameplayInteractionPrompt(interactable) {
  if (!interactable) return '';
  if (interactable.kind === 'GAMEPLAY3_CONTROL') {
    const controlState = String(interactable.state || 'OFFLINE').toUpperCase();
    if (controlState === 'READY') {
      return `Press [E] to activate ${String(interactable.label || 'Map Override')}`;
    }
    if (controlState === 'ACTIVE') {
      return `${String(interactable.label || 'MAP OVERRIDE').toUpperCase()} ACTIVE (${Math.ceil(finite(interactable.timer))}s)`;
    }
    if (controlState === 'COOLDOWN') {
      return `${String(interactable.label || 'MAP OVERRIDE').toUpperCase()} RECHARGING (${Math.ceil(finite(interactable.timer))}s)`;
    }
    return `${String(interactable.label || 'MAP CONTROL').toUpperCase()} OFFLINE`;
  }
  if (interactable.kind !== 'REACTOR_DEFENSE') return '';
  if (state.defenseState === 'READY') {
    return `Press [E] to activate Coolant Override [${getDefenseCost()} PTS]`;
  }
  if (state.defenseState === 'ACTIVE') {
    return `COOLANT OVERRIDE ACTIVE (${Math.ceil(state.defenseTimer)}s)`;
  }
  if (state.defenseState === 'COOLDOWN') {
    return `COOLANT OVERRIDE RECHARGING (${Math.ceil(state.defenseTimer)}s)`;
  }
  return 'COOLANT OVERRIDE OFFLINE';
}

export function activateMapGameplayInteractable(interactable) {
  if (interactable?.kind === 'GAMEPLAY3_CONTROL') {
    if (String(interactable.state || '').toUpperCase() !== 'READY') {
      return { success: false, reason: interactable.state || 'NOT_READY' };
    }
    const request = typeof window !== 'undefined'
      ? window.KARequestGameplay3Interaction
      : null;
    const accepted = typeof request === 'function'
      ? request(interactable.controlId)
      : false;
    return {
      success: accepted === true,
      reason: accepted === true ? 'ACCEPTED' : 'REJECTED',
      cost: 0,
      title: accepted === true
        ? `${String(interactable.label || 'MAP OVERRIDE').toUpperCase()} REQUESTED`
        : 'MAP OVERRIDE REJECTED',
      body: accepted === true
        ? 'Host-authoritative map routing update requested'
        : 'Map control is unavailable or out of range'
    };
  }

  if (!state.active || interactable?.kind !== 'REACTOR_DEFENSE') {
    return { success: false, reason: 'INVALID' };
  }
  if (state.defenseState !== 'READY') {
    return { success: false, reason: state.defenseState };
  }

  state.defenseState = 'ACTIVE';
  state.defenseTimer = DEFENSE_DURATION;
  state.defenseEnemyTick = 0;
  state.defenseActivations++;
  state.lastEvent = 'COOLANT OVERRIDE ACTIVE';
  updateDefenseVisuals();

  return {
    success: true,
    cost: getDefenseCost(),
    duration: DEFENSE_DURATION,
    title: 'COOLANT OVERRIDE ACTIVE',
    body: `Central containment field armed for ${DEFENSE_DURATION.toFixed(0)}s`
  };
}

export function getMapGameplayMinimapMarkers() {
  if (!state.active && !gameplay2HazardSnapshot() && !gameplay3Snapshot()) return [];
  const markers = [];

  if (state.zoneAnchor) {
    markers.push({
      type: 'OBJECTIVE_ZONE',
      x: state.zoneAnchor.x,
      z: state.zoneAnchor.z,
      color: getObjectiveSnapshot().completed ? '#22ff88' : '#00d4ff',
      radius: 4.2
    });
  }

  if (state.defenseConsole) {
    markers.push({
      type: 'DEFENSE',
      x: state.defenseConsole.pos.x,
      z: state.defenseConsole.pos.z,
      color: state.defenseState === 'READY' ? '#22ff88' : (state.defenseState === 'ACTIVE' ? '#00ddff' : '#ffaa00'),
      radius: 2.8
    });
  }

  if (state.activeVentIndex >= 0 && state.ventPhase !== 'IDLE') {
    const vent = state.vents[state.activeVentIndex];
    markers.push({
      type: 'HAZARD',
      x: vent.x,
      z: vent.z,
      color: state.ventPhase === 'ACTIVE' ? '#ff4422' : '#ffaa00',
      radius: 3.6
    });
  }

  const mutationHazard = gameplay2HazardSnapshot();
  if (mutationHazard?.anchor && ['WARNING', 'ACTIVE'].includes(mutationHazard.phase)) {
    markers.push({
      type: 'MUTATION_HAZARD',
      x: mutationHazard.anchor.x,
      z: mutationHazard.anchor.z,
      color: mutationHazard.phase === 'ACTIVE' ? '#ff3344' : '#ffb000',
      radius: Math.max(3, finite(mutationHazard.radius, 4.2))
    });
  }

  const evolution = gameplay3Snapshot();
  if (evolution?.profile?.control) {
    markers.push({
      type: 'MAP_CONTROL',
      x: evolution.profile.control.x,
      z: evolution.profile.control.z,
      color: evolution.control?.state === 'READY' ? '#22ff88' : '#00d4ff',
      radius: 2.8
    });
  }
  if (
    evolution?.hazard?.enabled === true
    && ['WARNING', 'ACTIVE'].includes(String(evolution.hazard.phase || '').toUpperCase())
  ) {
    markers.push({
      type: 'MAP_EVOLUTION_HAZARD',
      x: evolution.hazard.x,
      z: evolution.hazard.z,
      color: evolution.hazard.phase === 'ACTIVE' ? '#ff3344' : '#ffb000',
      radius: Math.max(3, finite(evolution.hazard.radius, 4.2))
    });
  }

  return markers;
}


export function consumeMapGameplayEvents() {
  if (state.pendingEvents.length === 0) return [];
  return state.pendingEvents.splice(0, state.pendingEvents.length);
}

export function getMapGameplaySnapshot() {
  return {
    active: state.active,
    mapId: state.mapId,
    zoneAnchor: state.zoneAnchor ? { ...state.zoneAnchor } : null,
    ventPhase: state.ventPhase,
    ventTimer: state.ventTimer,
    activeVentIndex: state.activeVentIndex,
    ventEvents: state.ventEvents,
    ventPlayerHits: state.ventPlayerHits,
    ventEnemyHits: state.ventEnemyHits,
    defenseState: state.defenseState,
    defenseTimer: state.defenseTimer,
    defenseCost: getDefenseCost(),
    defenseDuration: DEFENSE_DURATION,
    defenseCooldown: DEFENSE_COOLDOWN,
    defenseActivations: state.defenseActivations,
    defenseEnemyHits: state.defenseEnemyHits,
    gameplay2Hazard: gameplay2HazardSnapshot()
      ? JSON.parse(JSON.stringify(gameplay2HazardSnapshot()))
      : null,
    gameplay2HazardPlayerHits: state.gameplay2HazardPlayerHits,
    gameplay2HazardEnemyHits: state.gameplay2HazardEnemyHits,
    gameplay3: gameplay3Snapshot()
      ? JSON.parse(JSON.stringify(gameplay3Snapshot()))
      : null,
    gameplay3HazardPlayerHits: state.gameplay3HazardPlayerHits,
    gameplay3HazardEnemyHits: state.gameplay3HazardEnemyHits,
    lastEvent: state.lastEvent
  };
}

if (typeof window !== 'undefined') {
  window.KAGetMapGameplay = getMapGameplaySnapshot;
  window.KAConfigureGameplay2MapMutation = configureGameplay2MapMutation;
  window.KAConfigureGameplay3MapEvolution = configureGameplay3MapEvolution;
}
