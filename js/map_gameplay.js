// js/map_gameplay.js
// C12 — Map-specific gameplay systems.
// Reactor Courtyard receives a randomized containment contract zone,
// warning-based steam vents, and a purchasable coolant override defense.

import * as THREE from 'three';
import { getObjectiveSnapshot } from './objectives.js';

const REACTOR_MAP_ID = 'reactor_courtyard';
const DEFENSE_COST = 1250;
const DEFENSE_DURATION = 8.0;
const DEFENSE_COOLDOWN = 36.0;
const DEFENSE_RADIUS = 9.2;
const VENT_WARNING_DURATION = 1.55;
const VENT_ACTIVE_DURATION = 3.2;
const VENT_IDLE_MIN = 8.5;
const VENT_IDLE_MAX = 13.0;
const VENT_RADIUS = 3.4;

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

function clearObjects() {
  for (const object of state.objects) {
    if (object?.parent) object.parent.remove(object);
    object?.traverse?.((child) => {
      if (child.geometry?.dispose) child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
      else child.material?.dispose?.();
    });
  }
  state.objects.length = 0;
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
  state.pendingEvents.length = 0;
  state.lastEvent = state.active ? 'REACTOR SYSTEMS ONLINE' : 'OFFLINE';

  if (!state.active || !scene) return getMapGameplaySnapshot();

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
  state.pendingEvents.length = 0;
  state.lastEvent = 'ENDED';
}

export function updateMapGameplay(dt, {
  player = null,
  enemies = [],
  damagePlayer = null,
  killEnemy = null
} = {}) {
  if (!state.active) return;

  const safeDt = clamp(dt, 0, 0.05);
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
    cost: DEFENSE_COST
  };
}

export function getMapGameplayInteractionPrompt(interactable) {
  if (!interactable || interactable.kind !== 'REACTOR_DEFENSE') return '';
  if (state.defenseState === 'READY') {
    return `Press [E] to activate Coolant Override [${DEFENSE_COST} PTS]`;
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
    cost: DEFENSE_COST,
    duration: DEFENSE_DURATION,
    title: 'COOLANT OVERRIDE ACTIVE',
    body: `Central containment field armed for ${DEFENSE_DURATION.toFixed(0)}s`
  };
}

export function getMapGameplayMinimapMarkers() {
  if (!state.active) return [];
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
    defenseCost: DEFENSE_COST,
    defenseDuration: DEFENSE_DURATION,
    defenseCooldown: DEFENSE_COOLDOWN,
    defenseActivations: state.defenseActivations,
    defenseEnemyHits: state.defenseEnemyHits,
    lastEvent: state.lastEvent
  };
}

if (typeof window !== 'undefined') {
  window.KAGetMapGameplay = getMapGameplaySnapshot;
}
