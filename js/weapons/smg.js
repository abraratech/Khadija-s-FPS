// js/weapons/smg.js
import * as THREE from 'three';
import {
  makeStandardMaterial,
  makeBoxPart,
  makeCylinderPart,
  getPartBasePosition
} from './procedural_helpers.js';

export function createProceduralSMGMesh({ upgraded = false } = {}) {
  const group = new THREE.Group();
  group.userData.isProceduralWeapon = true;
  group.userData.weaponFamily = 'SMG';
  group.userData.thirdPersonMuzzle = Object.freeze({ x: 0.000, y: 0.030, z: -0.440 });
  group.userData.thirdPersonMuzzleSize = 0.145;

  const receiverColor = upgraded ? 0x2f4252 : 0x1e252b;
  const frameColor = upgraded ? 0x142c26 : 0x11161a;
  const magColor = upgraded ? 0x14352e : 0x151a1f;
  const darkColor = 0x050708;
  const accentColor = upgraded ? 0x00ffaa : 0x00d4ff;
  const skinColor = 0xd2b48c;

  const receiverMat = makeStandardMaterial({
    color: receiverColor,
    metalness: 0.28,
    roughness: 0.48,
    emissive: upgraded ? 0x002211 : 0x000000,
    emissiveIntensity: upgraded ? 0.12 : 0
  });

  const frameMat = makeStandardMaterial({
    color: frameColor,
    metalness: 0.18,
    roughness: 0.62
  });

  const magMat = makeStandardMaterial({
    color: magColor,
    metalness: 0.18,
    roughness: 0.68
  });

  const darkMat = makeStandardMaterial({
    color: darkColor,
    metalness: 0.22,
    roughness: 0.60
  });

  const accentMat = makeStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: upgraded ? 0.72 : 0.20,
    roughness: 0.34
  });

  const skinMat = makeStandardMaterial({
    color: skinColor,
    roughness: 0.82
  });

  // Compact box/cylinder SMG: readable silhouette, long magazine, stubby barrel.
  const receiver = makeBoxPart(
    group,
    'smg_receiver',
    new THREE.Vector3(0.126, 0.078, 0.330),
    new THREE.Vector3(0.000, 0.022, -0.085),
    receiverMat
  );

  const topRail = makeBoxPart(
    group,
    'smg_top_rail',
    new THREE.Vector3(0.105, 0.018, 0.250),
    new THREE.Vector3(0.000, 0.080, -0.095),
    darkMat
  );

  const rearBlock = makeBoxPart(
    group,
    'smg_rear_block',
    new THREE.Vector3(0.116, 0.072, 0.060),
    new THREE.Vector3(0.000, 0.010, 0.120),
    darkMat
  );

  const barrel = makeCylinderPart(
    group,
    'smg_barrel',
    0.018,
    0.185,
    new THREE.Vector3(0.000, 0.030, -0.285),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    darkMat,
    24
  );

  const muzzle = makeCylinderPart(
    group,
    'smg_muzzle',
    0.028,
    0.040,
    new THREE.Vector3(0.000, 0.030, -0.390),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    upgraded ? accentMat : darkMat,
    24
  );

  const barrelSleeve = makeCylinderPart(
    group,
    'smg_barrel_sleeve',
    0.030,
    0.085,
    new THREE.Vector3(0.000, 0.030, -0.230),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    frameMat,
    20
  );

  const grip = makeBoxPart(
    group,
    'smg_grip',
    new THREE.Vector3(0.070, 0.155, 0.062),
    new THREE.Vector3(0.000, -0.100, 0.035),
    frameMat,
    new THREE.Vector3(-0.12, 0, 0)
  );

  const magazine = makeBoxPart(
    group,
    'smg_magazine',
    new THREE.Vector3(0.058, 0.250, 0.052),
    new THREE.Vector3(0.000, -0.200, -0.045),
    magMat,
    new THREE.Vector3(-0.03, 0, 0)
  );

  const magBase = makeBoxPart(
    group,
    'smg_mag_base',
    new THREE.Vector3(0.070, 0.028, 0.064),
    new THREE.Vector3(0.000, -0.340, -0.038),
    darkMat,
    new THREE.Vector3(-0.03, 0, 0)
  );

  const triggerGuard = makeBoxPart(
    group,
    'smg_trigger_guard',
    new THREE.Vector3(0.076, 0.038, 0.030),
    new THREE.Vector3(0.000, -0.054, -0.004),
    darkMat
  );

  const trigger = makeBoxPart(
    group,
    'smg_trigger',
    new THREE.Vector3(0.020, 0.040, 0.016),
    new THREE.Vector3(0.000, -0.070, 0.018),
    darkMat,
    new THREE.Vector3(-0.25, 0, 0)
  );

  const frontSight = makeBoxPart(
    group,
    'smg_front_sight',
    new THREE.Vector3(0.036, 0.016, 0.018),
    new THREE.Vector3(0.000, 0.080, -0.248),
    upgraded ? accentMat : darkMat
  );

  makeBoxPart(
    group,
    'smg_front_sight_dot',
    new THREE.Vector3(0.010, 0.006, 0.005),
    new THREE.Vector3(0.000, 0.094, -0.252),
    accentMat
  );

  const rearSight = makeBoxPart(
    group,
    'smg_rear_sight',
    new THREE.Vector3(0.056, 0.014, 0.024),
    new THREE.Vector3(0.000, 0.085, 0.048),
    darkMat
  );

  makeBoxPart(
    group,
    'smg_rear_sight_notch',
    new THREE.Vector3(0.020, 0.006, 0.006),
    new THREE.Vector3(0.000, 0.096, 0.038),
    accentMat
  );

  const bolt = makeBoxPart(
    group,
    'smg_bolt',
    new THREE.Vector3(0.020, 0.018, 0.082),
    new THREE.Vector3(0.073, 0.040, -0.050),
    upgraded ? accentMat : darkMat
  );

  const chargingHandle = makeBoxPart(
    group,
    'smg_charging_handle',
    new THREE.Vector3(0.040, 0.020, 0.020),
    new THREE.Vector3(0.102, 0.044, -0.095),
    upgraded ? accentMat : darkMat
  );

  makeBoxPart(
    group,
    'smg_accent_left',
    new THREE.Vector3(0.005, 0.008, 0.215),
    new THREE.Vector3(-0.068, 0.058, -0.105),
    accentMat
  );

  makeBoxPart(
    group,
    'smg_accent_right',
    new THREE.Vector3(0.005, 0.008, 0.215),
    new THREE.Vector3(0.068, 0.058, -0.105),
    accentMat
  );

  makeBoxPart(
    group,
    'smg_mag_accent',
    new THREE.Vector3(0.006, 0.170, 0.006),
    new THREE.Vector3(0.033, -0.205, -0.074),
    accentMat,
    new THREE.Vector3(-0.03, 0, 0)
  );

  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: upgraded ? 0x00ffaa : 0xffaa00,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.145), muzzleFlashMat);
  muzzleFlash.name = 'muzzleFlashMesh';
  muzzleFlash.position.set(0.000, 0.030, -0.440);
  muzzleFlash.rotation.y = Math.PI;
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  const gripHand = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.052, 0.095), skinMat);
  gripHand.name = 'smg_grip_hand';
  gripHand.userData.isProceduralHand = true;
  gripHand.userData.defaultVisible = true;
  gripHand.position.set(0.000, -0.115, 0.052);
  gripHand.rotation.x = -0.12;
  group.add(gripHand);

  const supportHand = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.048, 0.090), skinMat);
  supportHand.name = 'smg_support_hand';
  supportHand.userData.isProceduralHand = true;
  supportHand.userData.defaultVisible = true;
  supportHand.position.set(-0.010, -0.050, -0.205);
  supportHand.rotation.x = -0.10;
  group.add(supportHand);

  group.userData.parts = {
    receiver,
    barrel,
    muzzle,
    barrelSleeve,
    grip,
    magazine,
    magBase,
    bolt,
    chargingHandle,
    trigger,
    triggerGuard,
    frontSight,
    rearSight
  };

  return group;
}

export function updateProceduralSMGReloadParts(weapon, progress) {
  const parts = weapon?.meshGroup?.userData?.parts || {};

  const magDrop = progress < 0.58
    ? THREE.MathUtils.smoothstep(progress / 0.58, 0, 1)
    : 1 - THREE.MathUtils.smoothstep((progress - 0.58) / 0.42, 0, 1);

  const boltPull = progress > 0.72 && progress < 0.94
    ? Math.sin(((progress - 0.72) / 0.22) * Math.PI)
    : 0;

  if (parts.magazine) {
    const basePos = getPartBasePosition(parts.magazine);
    parts.magazine.position.y = basePos.y - magDrop * 0.155;
    parts.magazine.position.z = basePos.z + magDrop * 0.028;
  }

  if (parts.magBase) {
    const basePos = getPartBasePosition(parts.magBase);
    parts.magBase.position.y = basePos.y - magDrop * 0.155;
    parts.magBase.position.z = basePos.z + magDrop * 0.028;
  }

  if (parts.bolt) {
    const basePos = getPartBasePosition(parts.bolt);
    parts.bolt.position.z = basePos.z + boltPull * 0.055;
  }

  if (parts.chargingHandle) {
    const basePos = getPartBasePosition(parts.chargingHandle);
    parts.chargingHandle.position.z = basePos.z + boltPull * 0.055;
  }
}

export function updateProceduralSMGFireParts(weapon, firePulse = 0) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const pulse = THREE.MathUtils.clamp(firePulse, 0, 1);

  // Muzzle points toward negative Z, so positive Z is rearward toward player.
  // This makes the visible right-side bolt/charging handle kick back with each shot.
  const boltKick = pulse * 0.060;

  if (parts.bolt) {
    const basePos = getPartBasePosition(parts.bolt);
    parts.bolt.position.z = basePos.z + boltKick;
  }

  if (parts.chargingHandle) {
    const basePos = getPartBasePosition(parts.chargingHandle);
    parts.chargingHandle.position.z = basePos.z + boltKick;
  }
}

export function resetProceduralSMGParts(weapon, dt = 0.016) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const magLerp = Math.min(1, dt * 16);
  const boltLerp = Math.min(1, dt * 20);

  if (parts.magazine) {
    const basePos = getPartBasePosition(parts.magazine);
    parts.magazine.position.y += (basePos.y - parts.magazine.position.y) * magLerp;
    parts.magazine.position.z += (basePos.z - parts.magazine.position.z) * magLerp;
  }

  if (parts.magBase) {
    const basePos = getPartBasePosition(parts.magBase);
    parts.magBase.position.y += (basePos.y - parts.magBase.position.y) * magLerp;
    parts.magBase.position.z += (basePos.z - parts.magBase.position.z) * magLerp;
  }

  if (parts.bolt) {
    const basePos = getPartBasePosition(parts.bolt);
    parts.bolt.position.z += (basePos.z - parts.bolt.position.z) * boltLerp;
  }

  if (parts.chargingHandle) {
    const basePos = getPartBasePosition(parts.chargingHandle);
    parts.chargingHandle.position.z += (basePos.z - parts.chargingHandle.position.z) * boltLerp;
  }
}
