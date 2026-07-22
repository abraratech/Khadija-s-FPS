// js/multiplayer/remote_players.js
// POST.2A R1 — corrected remote foot geometry and velocity-matched
// locomotion with directional gait and improved foot planting.

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';
import { roomUsesPvp1 } from './pvp1_core.js';
import {
  SURVIVOR_OPERATOR_PATCH,
  createRemoteOperatorRig,
} from '../actors/survivor_operator.js';

const PLAYER_EYE_HEIGHT = 1.65;
const REMOTE_WEAPON_FAMILIES = Object.freeze([
  'PISTOL',
  'SMG',
  'RIFLE',
  'SHOTGUN',
  'SNIPER',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function damp(current, target, rate, dt) {
  const factor = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  return current + (target - current) * factor;
}

function colorFromId(THREE, id) {
  let hash = 0;
  const text = String(id || 'player');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.58, 0.48);
}

function makeLabelTexture(THREE, label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(3, 12, 18, 0.90)';
  ctx.fillRect(20, 30, 472, 68);
  ctx.strokeStyle = 'rgba(53, 132, 154, 0.88)';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 30, 472, 68);
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8ed7e8';
  ctx.fillText(String(label || 'PLAYER').slice(0, 24), 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    } else {
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    }
  });
}

function makeWeaponMaterial(THREE, color, {
  metalness = 0.42,
  roughness = 0.50,
} = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    flatShading: true,
    envMapIntensity: 0.28,
  });
}

function addWeaponBox(THREE, parent, name, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material
  );
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addWeaponCylinder(
  THREE,
  parent,
  name,
  radius,
  length,
  position,
  material,
  rotation = [Math.PI / 2, 0, 0],
  segments = 8
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.06, length, segments),
    material
  );
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function resolveRemoteWeaponFamily(weaponKey) {
  const key = String(weaponKey || '').trim().toLowerCase();
  if (key.includes('melee') || key.includes('knife')) return 'MELEE';
  if (key.includes('sniper')) return 'SNIPER';
  if (key.includes('shotgun')) return 'SHOTGUN';
  if (key.includes('smg') || key.includes('submachine')) return 'SMG';
  if (key.includes('rifle') || key.includes('assault')) return 'RIFLE';
  return 'PISTOL';
}

function createPistolModel(THREE, materials) {
  const group = new THREE.Group();
  group.name = 'remote-weapon-model-pistol';
  addWeaponBox(THREE, group, 'remote-pistol-frame', [0.12, 0.10, 0.28], [0, 0, -0.02], materials.body);
  addWeaponBox(THREE, group, 'remote-pistol-slide', [0.115, 0.065, 0.34], [0, 0.055, -0.06], materials.metal);
  addWeaponBox(
    THREE,
    group,
    'remote-pistol-grip',
    [0.09, 0.22, 0.10],
    [0, -0.14, 0.07],
    materials.dark,
    [-0.16, 0, 0]
  );
  addWeaponCylinder(THREE, group, 'remote-pistol-barrel', 0.022, 0.16, [0, 0.03, -0.27], materials.metal);
  group.userData.muzzleZ = -0.36;
  return group;
}

function createSmgModel(THREE, materials) {
  const group = new THREE.Group();
  group.name = 'remote-weapon-model-smg';
  addWeaponBox(THREE, group, 'remote-smg-receiver', [0.17, 0.15, 0.38], [0, 0, -0.03], materials.body);
  addWeaponBox(THREE, group, 'remote-smg-handguard', [0.15, 0.13, 0.20], [0, 0.01, -0.27], materials.armor);
  addWeaponCylinder(THREE, group, 'remote-smg-barrel', 0.027, 0.26, [0, 0.01, -0.46], materials.metal);
  addWeaponBox(THREE, group, 'remote-smg-stock', [0.12, 0.08, 0.25], [0, 0.015, 0.29], materials.dark);
  addWeaponBox(
    THREE,
    group,
    'remote-smg-magazine',
    [0.09, 0.30, 0.10],
    [0, -0.23, -0.03],
    materials.dark,
    [-0.05, 0, 0]
  );
  group.userData.muzzleZ = -0.60;
  return group;
}

function createRifleModel(THREE, materials) {
  const group = new THREE.Group();
  group.name = 'remote-weapon-model-rifle';
  addWeaponBox(THREE, group, 'remote-rifle-receiver', [0.18, 0.16, 0.42], [0, 0, -0.01], materials.body);
  addWeaponBox(THREE, group, 'remote-rifle-stock', [0.15, 0.16, 0.34], [0, 0, 0.38], materials.dark);
  addWeaponBox(THREE, group, 'remote-rifle-handguard', [0.17, 0.14, 0.34], [0, 0.01, -0.34], materials.armor);
  addWeaponCylinder(THREE, group, 'remote-rifle-barrel', 0.028, 0.48, [0, 0.015, -0.72], materials.metal);
  addWeaponBox(
    THREE,
    group,
    'remote-rifle-magazine',
    [0.11, 0.31, 0.12],
    [0, -0.24, -0.04],
    materials.dark,
    [-0.20, 0, 0]
  );
  addWeaponBox(THREE, group, 'remote-rifle-sight', [0.07, 0.06, 0.14], [0, 0.13, -0.06], materials.metal);
  group.userData.muzzleZ = -0.97;
  return group;
}

function createShotgunModel(THREE, materials) {
  const group = new THREE.Group();
  group.name = 'remote-weapon-model-shotgun';
  addWeaponBox(THREE, group, 'remote-shotgun-receiver', [0.19, 0.17, 0.38], [0, 0, 0], materials.body);
  addWeaponBox(THREE, group, 'remote-shotgun-stock', [0.16, 0.17, 0.35], [0, 0, 0.38], materials.dark);
  addWeaponBox(THREE, group, 'remote-shotgun-pump', [0.18, 0.17, 0.25], [0, -0.01, -0.37], materials.armor);
  addWeaponCylinder(THREE, group, 'remote-shotgun-barrel-top', 0.032, 0.62, [0, 0.05, -0.62], materials.metal);
  addWeaponCylinder(THREE, group, 'remote-shotgun-barrel-bottom', 0.030, 0.59, [0, -0.035, -0.60], materials.metal);
  group.userData.muzzleZ = -0.96;
  return group;
}

function createSniperModel(THREE, materials) {
  const group = new THREE.Group();
  group.name = 'remote-weapon-model-sniper';
  addWeaponBox(THREE, group, 'remote-sniper-receiver', [0.17, 0.16, 0.42], [0, 0, 0], materials.body);
  addWeaponBox(THREE, group, 'remote-sniper-stock', [0.16, 0.17, 0.42], [0, -0.005, 0.44], materials.dark);
  addWeaponBox(THREE, group, 'remote-sniper-handguard', [0.13, 0.11, 0.34], [0, 0, -0.36], materials.armor);
  addWeaponCylinder(THREE, group, 'remote-sniper-barrel', 0.025, 0.80, [0, 0.005, -0.83], materials.metal);
  addWeaponCylinder(
    THREE,
    group,
    'remote-sniper-scope',
    0.050,
    0.34,
    [0, 0.16, -0.04],
    materials.metal,
    [Math.PI / 2, 0, 0],
    10
  );
  addWeaponBox(THREE, group, 'remote-sniper-magazine', [0.10, 0.24, 0.11], [0, -0.19, -0.03], materials.dark);
  group.userData.muzzleZ = -1.24;
  return group;
}

function createMeleeModel(THREE, materials) {
  const group = new THREE.Group();
  group.name = 'remote-weapon-model-melee';
  const blade = addWeaponBox(THREE, group, 'remote-field-knife-blade', [0.055, 0.035, 0.48], [0, 0, -0.24], materials.metal);
  blade.rotation.x = -0.08;
  addWeaponBox(THREE, group, 'remote-field-knife-guard', [0.20, 0.045, 0.055], [0, 0, 0.015], materials.armor);
  addWeaponBox(THREE, group, 'remote-field-knife-grip', [0.085, 0.095, 0.24], [0, 0, 0.16], materials.dark);
  group.rotation.z = -0.18;
  group.userData.muzzleZ = -0.54;
  return group;
}

function createRemoteWeaponModels(THREE, weapon, muzzleFlash) {
  [...weapon.children].forEach((child) => {
    if (child !== muzzleFlash) child.visible = false;
  });

  const materials = {
    body: makeWeaponMaterial(THREE, 0x39454c, { metalness: 0.42, roughness: 0.52 }),
    armor: makeWeaponMaterial(THREE, 0x59666d, { metalness: 0.32, roughness: 0.56 }),
    metal: makeWeaponMaterial(THREE, 0x20282d, { metalness: 0.62, roughness: 0.38 }),
    dark: makeWeaponMaterial(THREE, 0x10171b, { metalness: 0.16, roughness: 0.72 }),
  };
  const modelsRoot = new THREE.Group();
  modelsRoot.name = 'remote-weapon-family-models';
  weapon.add(modelsRoot);

  const models = new Map([
    ['PISTOL', createPistolModel(THREE, materials)],
    ['SMG', createSmgModel(THREE, materials)],
    ['RIFLE', createRifleModel(THREE, materials)],
    ['SHOTGUN', createShotgunModel(THREE, materials)],
    ['SNIPER', createSniperModel(THREE, materials)],
    ['MELEE', createMeleeModel(THREE, materials)],
  ]);
  models.forEach((model, family) => {
    model.visible = family === 'PISTOL';
    model.userData.weaponFamily = family;
    modelsRoot.add(model);
  });
  muzzleFlash.position.set(0, 0.015, models.get('PISTOL').userData.muzzleZ);
  return models;
}

function normalizeRemoteBoots(THREE, rig) {
  const bootMaterial = rig.materials?.boot;
  const soleMaterial = rig.materials?.strap || bootMaterial;
  [rig.parts?.leftBoot, rig.parts?.rightBoot].forEach((boot, index) => {
    if (!boot || !bootMaterial) return;

    // The authored boot contains ankle/toe/sole detail that does not survive
    // the remote rig transforms cleanly. Hide every original mesh and replace
    // it with one compact, symmetrical third-person boot.
    boot.traverse?.((child) => {
      if (child?.isMesh === true) child.visible = false;
    });

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.205, 0.115, 0.285),
      bootMaterial
    );
    shell.name = `remote-boot-shell-${index}`;
    shell.position.set(0, -0.018, -0.030);
    shell.castShadow = true;
    boot.add(shell);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.195, 0.032, 0.265),
      soleMaterial
    );
    sole.name = `remote-boot-sole-${index}`;
    sole.position.set(0, -0.083, -0.024);
    sole.castShadow = true;
    boot.add(sole);
  });
}

function makeGaitState(THREE) {
  return {
    lastPosition: new THREE.Vector3(),
    hasLastPosition: false,
    lastUpdateAt: 0,
    phase: 0,
    phaseRate: 0,
    moveBlend: 0,
    smoothedSpeed: 0,
    smoothedVelocityX: 0,
    smoothedVelocityZ: 0,
    localMoveX: 0,
    localMoveZ: -1,
    leftHip: new THREE.Vector3(),
    rightHip: new THREE.Vector3(),
    leftKnee: new THREE.Vector3(),
    rightKnee: new THREE.Vector3(),
    leftFoot: new THREE.Vector3(),
    rightFoot: new THREE.Vector3(),
    midpoint: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
  };
}

function setSegmentBetween(mesh, start, end, gait) {
  gait.midpoint.copy(start).add(end).multiplyScalar(0.5);
  gait.direction.copy(end).sub(start);
  const length = gait.direction.length();
  mesh.position.copy(gait.midpoint);
  if (length > 0.0001) {
    mesh.quaternion.setFromUnitVectors(gait.up, gait.direction.normalize());
  }
  mesh.scale.set(1, length, 1);
}

function applyRemoteGait(THREE, remote, {
  now,
  x,
  z,
  yaw,
  velocityX,
  velocityZ,
  isSprinting,
  isADS,
  disabled,
} = {}) {
  const gait = remote.gait;
  const parts = remote.parts;
  if (!gait || !parts) return;

  const dt = gait.lastUpdateAt
    ? clamp((now - gait.lastUpdateAt) / 1000, 0.001, 0.10)
    : 1 / 60;

  let fallbackVelocityX = 0;
  let fallbackVelocityZ = 0;
  if (gait.hasLastPosition) {
    fallbackVelocityX = (x - gait.lastPosition.x) / dt;
    fallbackVelocityZ = (z - gait.lastPosition.z) / dt;
  }

  const reportedVelocityX = Number(velocityX);
  const reportedVelocityZ = Number(velocityZ);
  const hasReportedVelocity = (
    Number.isFinite(reportedVelocityX)
    && Number.isFinite(reportedVelocityZ)
  );
  const rawVelocityX = hasReportedVelocity
    ? reportedVelocityX
    : fallbackVelocityX;
  const rawVelocityZ = hasReportedVelocity
    ? reportedVelocityZ
    : fallbackVelocityZ;

  gait.lastPosition.set(x, 0, z);
  gait.hasLastPosition = true;
  gait.lastUpdateAt = now;
  gait.smoothedVelocityX = damp(
    gait.smoothedVelocityX,
    clamp(rawVelocityX, -8, 8),
    10,
    dt
  );
  gait.smoothedVelocityZ = damp(
    gait.smoothedVelocityZ,
    clamp(rawVelocityZ, -8, 8),
    10,
    dt
  );

  const instantSpeed = clamp(
    Math.hypot(gait.smoothedVelocityX, gait.smoothedVelocityZ),
    0,
    8
  );
  gait.smoothedSpeed = damp(gait.smoothedSpeed, instantSpeed, 10, dt);

  const heading = Number(yaw) || 0;
  const cosYaw = Math.cos(heading);
  const sinYaw = Math.sin(heading);
  const localVelocityX = (
    cosYaw * gait.smoothedVelocityX
    - sinYaw * gait.smoothedVelocityZ
  );
  const localVelocityZ = (
    sinYaw * gait.smoothedVelocityX
    + cosYaw * gait.smoothedVelocityZ
  );
  const localLength = Math.hypot(localVelocityX, localVelocityZ);
  if (localLength > 0.04) {
    gait.localMoveX = damp(
      gait.localMoveX,
      localVelocityX / localLength,
      12,
      dt
    );
    gait.localMoveZ = damp(
      gait.localMoveZ,
      localVelocityZ / localLength,
      12,
      dt
    );
  }

  const moving = !disabled && gait.smoothedSpeed > 0.08;
  const targetBlend = moving
    ? clamp(gait.smoothedSpeed / (isSprinting ? 4.6 : 3.2), 0.16, 1)
    : 0;
  gait.moveBlend = damp(gait.moveBlend, targetBlend, moving ? 12 : 9, dt);

  const amplitude = (isSprinting ? 0.265 : 0.205) * gait.moveBlend;
  const targetPhaseRate = moving
    ? clamp(
      gait.smoothedSpeed / Math.max(0.11, amplitude),
      isSprinting ? 11.5 : 9.5,
      isSprinting ? 19.5 : 18.0
    )
    : 0;
  gait.phaseRate = damp(gait.phaseRate, targetPhaseRate, moving ? 10 : 7, dt);
  gait.phase += dt * gait.phaseRate;

  const leftWave = Math.sin(gait.phase);
  const rightWave = -leftWave;
  const leftLift = Math.max(0, -leftWave) * 0.115 * gait.moveBlend;
  const rightLift = Math.max(0, -rightWave) * 0.115 * gait.moveBlend;
  const leftStride = leftWave * amplitude;
  const rightStride = rightWave * amplitude;
  const moveX = gait.localMoveX;
  const moveZ = gait.localMoveZ;

  gait.leftHip.set(-0.158, 0.82, 0);
  gait.rightHip.set(0.158, 0.82, 0);
  gait.leftKnee.set(
    -0.184 + moveX * leftStride * 0.46,
    0.45 + leftLift * 0.30,
    -0.038 + moveZ * leftStride * 0.46
  );
  gait.rightKnee.set(
    0.184 + moveX * rightStride * 0.46,
    0.45 + rightLift * 0.30,
    -0.038 + moveZ * rightStride * 0.46
  );
  gait.leftFoot.set(
    -0.212 + moveX * leftStride,
    0.10 + leftLift,
    -0.018 + moveZ * leftStride
  );
  gait.rightFoot.set(
    0.212 + moveX * rightStride,
    0.10 + rightLift,
    -0.018 + moveZ * rightStride
  );

  setSegmentBetween(parts.leftUpperLeg, gait.leftHip, gait.leftKnee, gait);
  setSegmentBetween(parts.leftLowerLeg, gait.leftKnee, gait.leftFoot, gait);
  setSegmentBetween(parts.rightUpperLeg, gait.rightHip, gait.rightKnee, gait);
  setSegmentBetween(parts.rightLowerLeg, gait.rightKnee, gait.rightFoot, gait);

  parts.leftBoot.position.copy(gait.leftFoot).setY(0.055 + leftLift);
  parts.rightBoot.position.copy(gait.rightFoot).setY(0.055 + rightLift);
  parts.leftBoot.rotation.x = -leftStride * 1.18 * Math.abs(moveZ);
  parts.rightBoot.rotation.x = -rightStride * 1.18 * Math.abs(moveZ);
  parts.leftBoot.rotation.z = leftStride * 0.78 * moveX;
  parts.rightBoot.rotation.z = rightStride * 0.78 * moveX;

  const bob = Math.abs(Math.sin(gait.phase * 2)) * 0.016 * gait.moveBlend;
  remote.body.position.y = damp(remote.body.position.y, bob, 13, dt);
  remote.body.rotation.z = damp(
    remote.body.rotation.z,
    -moveX * 0.025 * gait.moveBlend,
    11,
    dt
  );
  remote.arms.position.y = damp(remote.arms.position.y, 1.40 + bob, 13, dt);
  remote.arms.rotation.z = damp(
    remote.arms.rotation.z,
    isADS ? 0 : -moveX * 0.018 * gait.moveBlend,
    11,
    dt
  );
}

function createAvatar(THREE, player) {
  const accentColor = colorFromId(THREE, player.playerId);
  const rig = createRemoteOperatorRig(THREE, { accentColor });
  normalizeRemoteBoots(THREE, rig);

  const group = rig.group;
  group.name = `remote-player-${player.playerId}`;
  group.visible = false;
  group.userData.visualPatch = SURVIVOR_OPERATOR_PATCH;
  group.userData.pvpPlayerId = player.playerId;

  const labelText = player.isBot === true
    ? `${player.displayName || 'ARENA WINGMATE'} · AI`
    : player.displayName;
  const labelTexture = makeLabelTexture(THREE, labelText);
  const labelMaterial = new THREE.SpriteMaterial({
    map: labelTexture,
    transparent: true,
    opacity: 0.82,
    depthTest: false,
    toneMapped: true,
  });
  const label = new THREE.Sprite(labelMaterial);
  label.position.set(0, 2.10, 0);
  label.scale.set(1.52, 0.34, 1);
  group.add(label);

  const weaponModels = createRemoteWeaponModels(
    THREE,
    rig.weapon,
    rig.muzzleFlash
  );

  group.userData.remote = {
    body: rig.body,
    head: rig.parts.head,
    legs: rig.legs,
    arms: rig.arms,
    parts: rig.parts,
    weapon: rig.weapon,
    weaponModels,
    muzzleFlash: rig.muzzleFlash,
    muzzleFlashUntil: 0,
    lastWeaponFamily: 'PISTOL',
    meleeSwingStartedAt: 0,
    meleeSwingUntil: 0,
    label,
    gait: makeGaitState(THREE),
  };

  return group;
}

function updateWeaponShape(avatar, weaponKey) {
  const remote = avatar.userData.remote;
  if (!remote) return;
  const family = resolveRemoteWeaponFamily(weaponKey);
  if (remote.lastWeaponFamily === family) return;

  remote.lastWeaponFamily = family;
  remote.weaponModels?.forEach?.((model, key) => {
    model.visible = key === family;
  });
  const activeModel = remote.weaponModels?.get?.(family);
  if (activeModel) {
    remote.muzzleFlash.position.z = Number(activeModel.userData.muzzleZ) || -0.60;
  }
}

export class RemotePlayerManager {
  constructor({ scene, eventBus, runtime, localPlayerId } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.localPlayerId = localPlayerId;
    this.THREE = globalThis.THREE || null;
    this.avatars = new Map();
    this.pvpRaycaster = this.THREE ? new this.THREE.Raycaster() : null;
    this.pvpCenter = this.THREE ? new this.THREE.Vector2(0, 0) : null;
    this.roomPlayers = new Map();
    this.unsubscribe = [];
    this.active = false;

    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, (event) => {
        this.syncRoom(event?.payload?.room);
      }) || (() => {})
    );

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_SNAPSHOT_RECEIVED,
        (event) => {
          const envelope = event?.payload?.envelope;
          const state = envelope?.payload?.state;
          if (
            state?.isBot === true
            && envelope?.playerId
            && envelope.playerId !== this.localPlayerId
          ) {
            this.upsertVirtualPlayer({
              playerId: envelope.playerId,
              displayName: state.displayName || 'ARENA WINGMATE',
              connected: true,
              ready: true,
              isBot: true,
              botProfile: state.botProfile || null
            });
          }
        }
      ) || (() => {})
    );

    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ACTION_RECEIVED, (event) => {
        const envelope = event?.payload?.envelope;
        if (envelope?.payload?.action === 'FIRE') {
          this.flashMuzzle(envelope.playerId);
        } else if (envelope?.payload?.action === 'MELEE') {
          this.swingMelee(envelope.playerId);
        }
      }) || (() => {})
    );
  }

  beginRun() {
    this.active = true;
  }

  endRun() {
    this.active = false;
    this.avatars.forEach((avatar) => {
      avatar.visible = false;
    });
  }

  syncRoom(room) {
    if (!room?.players) return;

    const nextIds = new Set();
    room.players.forEach((player) => {
      if (!player?.playerId || player.playerId === this.localPlayerId) return;
      nextIds.add(player.playerId);
      this.roomPlayers.set(player.playerId, { ...player });

      if (!this.avatars.has(player.playerId)) {
        this.addPlayer(player);
      }
    });

    Array.from(this.avatars.keys()).forEach((playerId) => {
      if (!nextIds.has(playerId)) {
        this.removePlayer(playerId);
      }
    });
  }

  upsertVirtualPlayer(player) {
    if (!player?.playerId || player.playerId === this.localPlayerId) {
      return false;
    }
    const virtualPlayer = {
      ...player,
      isBot: true,
      connected: player.connected !== false
    };
    this.roomPlayers.set(player.playerId, virtualPlayer);
    this.runtime?.room?.upsertVirtualPlayer?.(virtualPlayer);
    if (!this.avatars.has(player.playerId)) {
      this.addPlayer(player);
    }
    return true;
  }

  addPlayer(player) {
    if (!this.THREE || !this.scene || this.avatars.has(player.playerId)) return;
    const avatar = createAvatar(this.THREE, player);
    this.avatars.set(player.playerId, avatar);
    this.scene.add(avatar);
  }

  removePlayer(playerId) {
    const avatar = this.avatars.get(playerId);
    if (avatar) {
      avatar.parent?.remove(avatar);
      disposeObject(avatar);
    }
    this.avatars.delete(playerId);
    this.roomPlayers.delete(playerId);
    this.runtime?.removeRemotePlayer?.(playerId);
  }

  swingMelee(playerId) {
    const avatar = this.avatars.get(playerId);
    const remote = avatar?.userData?.remote;
    if (!remote) return false;
    const now = performance.now();
    remote.meleeSwingStartedAt = now;
    remote.meleeSwingUntil = now + 360;
    return true;
  }

  flashMuzzle(playerId) {
    const avatar = this.avatars.get(playerId);
    const remote = avatar?.userData?.remote;
    if (!remote) return;
    remote.muzzleFlashUntil = performance.now() + 72;
    remote.muzzleFlash.visible = true;
  }

  update(now = performance.now()) {
    if (!this.active) return;

    const pvpRun = roomUsesPvp1(this.runtime?.room?.getSnapshot?.());
    this.avatars.forEach((avatar, playerId) => {
      const playerRecord = this.roomPlayers.get(playerId);
      const sampled = this.runtime?.sampleRemotePlayer?.(playerId, now);
      if (!sampled?.state) {
        avatar.visible = false;
        return;
      }

      const state = sampled.state;
      const isAway = playerRecord?.connected === false;
      const lifeState = String(
        state.lifeState
        || (state.alive === false ? 'DOWNED' : 'ACTIVE')
      );
      const isDowned = lifeState === 'DOWNED';
      const isSpectating = lifeState === 'SPECTATING';
      const positionX = Number(state.position?.x || 0);
      const positionY = Number(state.position?.y || PLAYER_EYE_HEIGHT);
      const positionZ = Number(state.position?.z || 0);

      avatar.visible = !isSpectating;
      avatar.position.set(
        positionX,
        positionY - PLAYER_EYE_HEIGHT,
        positionZ
      );
      avatar.rotation.y = Number(state.yaw || 0);
      avatar.rotation.z = isDowned ? Math.PI * 0.5 : 0;

      const remote = avatar.userData.remote;
      if (remote) {
        applyRemoteGait(this.THREE, remote, {
          now,
          x: positionX,
          z: positionZ,
          yaw: state.yaw,
          velocityX: state.velocity?.x,
          velocityZ: state.velocity?.z,
          isSprinting: state.isSprinting === true,
          isADS: state.isADS === true,
          disabled: isDowned || isAway || isSpectating,
        });

        remote.arms.rotation.x = Number(state.pitch || 0) * 0.72;
        remote.weapon.rotation.x = Number(state.pitch || 0) * 0.72;
        remote.weapon.position.y = (
          state.isADS ? 1.34 : 1.25
        ) + remote.body.position.y;
        remote.weapon.position.x = state.isADS ? 0.02 : 0.12;
        remote.body.scale.y = state.isSprinting ? 0.985 : 1;
        remote.arms.visible = !isDowned && !isAway;
        remote.weapon.visible = !isDowned && !isAway;
        remote.muzzleFlash.visible = (
          !isDowned
          && !isAway
          && now < remote.muzzleFlashUntil
        );
        if (remote.label) {
          // Competitive PvP intentionally removes overhead identity tracking.
          remote.label.visible = !pvpRun;
        }
        if (remote.label?.material) {
          remote.label.material.opacity = isAway ? 0.48 : 0.82;
        }
        if (now < Number(remote.meleeSwingUntil || 0)) {
          const duration = Math.max(1, Number(remote.meleeSwingUntil || 0) - Number(remote.meleeSwingStartedAt || 0));
          const progress = Math.max(0, Math.min(1, (now - Number(remote.meleeSwingStartedAt || 0)) / duration));
          const slash = Math.sin(progress * Math.PI);
          remote.lastWeaponFamily = 'MELEE';
          remote.weaponModels?.forEach?.((model, key) => {
            model.visible = key === 'MELEE';
          });
          remote.arms.rotation.x = Number(state.pitch || 0) * 0.72 - slash * 0.62;
          remote.arms.rotation.z = slash * 0.44;
          remote.weapon.rotation.x = Number(state.pitch || 0) * 0.72 - slash * 0.78;
          remote.weapon.rotation.y = -slash * 0.62;
          remote.weapon.rotation.z = slash * 0.55;
          remote.weapon.position.x = 0.15 - slash * 0.20;
          remote.weapon.position.y = 1.25 + remote.body.position.y + slash * 0.12;
        } else {
          remote.arms.rotation.z = 0;
          remote.weapon.rotation.y = 0;
          remote.weapon.rotation.z = 0;
          updateWeaponShape(avatar, state.weaponKey);
        }
      }
    });
  }


  raycastPvpTarget({
    camera,
    opponentIds = [],
    maximumDistance = 180
  } = {}) {
    if (!this.THREE || !this.pvpRaycaster || !camera) return null;
    const allowed = new Set(
      Array.isArray(opponentIds)
        ? opponentIds.map((entry) => String(entry || ''))
        : []
    );
    if (!allowed.size) return null;

    this.pvpRaycaster.near = 0;
    this.pvpRaycaster.far = Math.max(1, Number(maximumDistance) || 180);
    this.pvpRaycaster.setFromCamera(this.pvpCenter, camera);

    let best = null;
    this.avatars.forEach((avatar, playerId) => {
      if (!allowed.has(playerId) || avatar.visible !== true) return;
      const hits = this.pvpRaycaster.intersectObject(avatar, true)
        .filter((entry) => entry?.object?.isMesh === true);
      const hit = hits[0];
      if (!hit) return;
      if (best && best.distance <= hit.distance) return;

      const relativeHeight = Number(hit.point?.y || 0)
        - Number(avatar.position?.y || 0);
      const objectName = String(hit.object?.name || '').toLowerCase();
      best = {
        playerId,
        distance: Math.max(0, Number(hit.distance) || 0),
        headshot: (
          relativeHeight >= 1.48
          || objectName.includes('head')
          || objectName.includes('helmet')
        ),
        point: {
          x: Number(hit.point?.x || 0),
          y: Number(hit.point?.y || 0),
          z: Number(hit.point?.z || 0)
        }
      };
    });
    return best;
  }

  getSnapshot() {
    return {
      active: this.active,
      visualPatch: 'post2a-r1-remote-locomotion-foot-geometry',
      weaponFamilies: [...REMOTE_WEAPON_FAMILIES],
      remotePlayers: Array.from(this.avatars.keys())
    };
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    Array.from(this.avatars.keys()).forEach((playerId) => {
      this.removePlayer(playerId);
    });
  }
}
