// js/weapons/sniper.js
import * as THREE from 'three';
import {
  makeStandardMaterial,
  makeBoxPart,
  makeCylinderPart,
  getPartBasePosition
} from './procedural_helpers.js';

export function createProceduralSniperMesh({ upgraded = false } = {}) {
  const group = new THREE.Group();
  group.userData.isProceduralWeapon = true;
  group.userData.weaponFamily = 'SNIPER';

  const receiverColor = upgraded ? 0x27304c : 0x222a32;
  const stockColor = upgraded ? 0x20112f : 0x2b221c;
  const darkColor = 0x07090b;
  const metalColor = upgraded ? 0x4b5878 : 0x59666c;
  const accentColor = upgraded ? 0x66ccff : 0x00d4ff;
  const lensColor = upgraded ? 0x7df8ff : 0x2ee6ff;
  const skinColor = 0xd2b48c;

  const receiverMat = makeStandardMaterial({
    color: receiverColor,
    metalness: 0.32,
    roughness: 0.46,
    emissive: upgraded ? 0x00132a : 0x000000,
    emissiveIntensity: upgraded ? 0.16 : 0
  });

  const stockMat = makeStandardMaterial({ color: stockColor, metalness: 0.06, roughness: 0.78 });
  const darkMat = makeStandardMaterial({ color: darkColor, metalness: 0.26, roughness: 0.60 });
  const metalMat = makeStandardMaterial({ color: metalColor, metalness: 0.42, roughness: 0.38 });
  const accentMat = makeStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: upgraded ? 0.82 : 0.25,
    roughness: 0.30
  });
  const lensMat = makeStandardMaterial({
    color: lensColor,
    metalness: 0.08,
    roughness: 0.18,
    emissive: lensColor,
    emissiveIntensity: upgraded ? 0.62 : 0.24
  });
  const skinMat = makeStandardMaterial({ color: skinColor, roughness: 0.82 });

  const receiver = makeBoxPart(
    group,
    'sniper_receiver',
    new THREE.Vector3(0.126, 0.082, 0.365),
    new THREE.Vector3(0.000, 0.025, -0.085),
    receiverMat
  );

  const cheekRest = makeBoxPart(
    group,
    'sniper_cheek_rest',
    new THREE.Vector3(0.112, 0.044, 0.235),
    new THREE.Vector3(0.000, 0.040, 0.250),
    stockMat,
    new THREE.Vector3(0.035, 0, 0)
  );

  const stock = makeBoxPart(
    group,
    'sniper_stock',
    new THREE.Vector3(0.128, 0.108, 0.320),
    new THREE.Vector3(0.000, -0.034, 0.305),
    stockMat,
    new THREE.Vector3(0.055, 0, 0)
  );

  const stockPad = makeBoxPart(
    group,
    'sniper_stock_pad',
    new THREE.Vector3(0.138, 0.126, 0.026),
    new THREE.Vector3(0.000, -0.022, 0.485),
    darkMat,
    new THREE.Vector3(0.055, 0, 0)
  );

  const handguard = makeBoxPart(
    group,
    'sniper_handguard',
    new THREE.Vector3(0.112, 0.055, 0.295),
    new THREE.Vector3(0.000, 0.004, -0.345),
    stockMat
  );

  const barrel = makeCylinderPart(
    group,
    'sniper_barrel',
    0.014,
    0.660,
    new THREE.Vector3(0.000, 0.034, -0.650),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    metalMat,
    24
  );

  const barrelSleeve = makeCylinderPart(
    group,
    'sniper_barrel_sleeve',
    0.024,
    0.165,
    new THREE.Vector3(0.000, 0.034, -0.345),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    darkMat,
    20
  );

  const muzzleBrake = makeBoxPart(
    group,
    'sniper_muzzle_brake',
    new THREE.Vector3(0.062, 0.044, 0.038),
    new THREE.Vector3(0.000, 0.034, -0.980),
    upgraded ? accentMat : darkMat
  );

  const muzzlePortLeft = makeBoxPart(
    group,
    'sniper_muzzle_port_left',
    new THREE.Vector3(0.006, 0.028, 0.030),
    new THREE.Vector3(-0.034, 0.034, -0.980),
    darkMat
  );

  const muzzlePortRight = makeBoxPart(
    group,
    'sniper_muzzle_port_right',
    new THREE.Vector3(0.006, 0.028, 0.030),
    new THREE.Vector3(0.034, 0.034, -0.980),
    darkMat
  );

  const scopeTube = makeCylinderPart(
    group,
    'sniper_scope_tube',
    0.030,
    0.300,
    new THREE.Vector3(0.000, 0.145, -0.105),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    darkMat,
    24
  );

  const scopeFront = makeCylinderPart(
    group,
    'sniper_scope_front_lens',
    0.038,
    0.018,
    new THREE.Vector3(0.000, 0.145, -0.268),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    lensMat,
    24
  );

  const scopeRear = makeCylinderPart(
    group,
    'sniper_scope_rear_lens',
    0.034,
    0.018,
    new THREE.Vector3(0.000, 0.145, 0.058),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    lensMat,
    24
  );

  const scopeMountFront = makeBoxPart(
    group,
    'sniper_scope_mount_front',
    new THREE.Vector3(0.050, 0.060, 0.026),
    new THREE.Vector3(0.000, 0.100, -0.205),
    darkMat
  );

  const scopeMountRear = makeBoxPart(
    group,
    'sniper_scope_mount_rear',
    new THREE.Vector3(0.050, 0.060, 0.026),
    new THREE.Vector3(0.000, 0.100, 0.005),
    darkMat
  );

  const bolt = makeBoxPart(
    group,
    'sniper_bolt',
    new THREE.Vector3(0.024, 0.022, 0.125),
    new THREE.Vector3(0.078, 0.045, -0.035),
    upgraded ? accentMat : darkMat
  );

  const boltHandle = makeBoxPart(
    group,
    'sniper_bolt_handle',
    new THREE.Vector3(0.070, 0.022, 0.022),
    new THREE.Vector3(0.122, 0.030, -0.010),
    upgraded ? accentMat : darkMat,
    new THREE.Vector3(0, 0, -0.20)
  );

  const grip = makeBoxPart(
    group,
    'sniper_grip',
    new THREE.Vector3(0.070, 0.145, 0.062),
    new THREE.Vector3(0.000, -0.108, 0.035),
    stockMat,
    new THREE.Vector3(-0.26, 0, 0)
  );

  const magazine = makeBoxPart(
    group,
    'sniper_magazine',
    new THREE.Vector3(0.070, 0.120, 0.060),
    new THREE.Vector3(0.000, -0.145, -0.092),
    darkMat,
    new THREE.Vector3(-0.08, 0, 0)
  );

  const magBase = makeBoxPart(
    group,
    'sniper_mag_base',
    new THREE.Vector3(0.082, 0.024, 0.072),
    new THREE.Vector3(0.000, -0.218, -0.085),
    darkMat,
    new THREE.Vector3(-0.08, 0, 0)
  );

  makeBoxPart(
    group,
    'sniper_trigger_guard',
    new THREE.Vector3(0.086, 0.040, 0.034),
    new THREE.Vector3(0.000, -0.054, -0.002),
    darkMat
  );

  makeBoxPart(
    group,
    'sniper_trigger',
    new THREE.Vector3(0.020, 0.042, 0.016),
    new THREE.Vector3(0.000, -0.072, 0.020),
    darkMat,
    new THREE.Vector3(-0.30, 0, 0)
  );

  makeBoxPart(
    group,
    'sniper_receiver_accent_left',
    new THREE.Vector3(0.005, 0.008, 0.150),
    new THREE.Vector3(-0.067, 0.064, -0.095),
    accentMat
  );

  makeBoxPart(
    group,
    'sniper_receiver_accent_right',
    new THREE.Vector3(0.005, 0.008, 0.150),
    new THREE.Vector3(0.067, 0.064, -0.095),
    accentMat
  );

  const bipodLeft = makeBoxPart(
    group,
    'sniper_bipod_left',
    new THREE.Vector3(0.010, 0.180, 0.012),
    new THREE.Vector3(-0.046, -0.110, -0.455),
    darkMat,
    new THREE.Vector3(0.26, 0, 0.16)
  );

  const bipodRight = makeBoxPart(
    group,
    'sniper_bipod_right',
    new THREE.Vector3(0.010, 0.180, 0.012),
    new THREE.Vector3(0.046, -0.110, -0.455),
    darkMat,
    new THREE.Vector3(0.26, 0, -0.16)
  );

  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: upgraded ? 0x66ccff : 0xffaa00,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.260, 0.260), muzzleFlashMat);
  muzzleFlash.name = 'muzzleFlashMesh';
  muzzleFlash.position.set(0.000, 0.034, -1.040);
  muzzleFlash.rotation.y = Math.PI;
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  const gripHand = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.054, 0.104), skinMat);
  gripHand.name = 'sniper_grip_hand';
  gripHand.userData.isProceduralHand = true;
  gripHand.userData.defaultVisible = true;
  gripHand.position.set(0.000, -0.126, 0.060);
  gripHand.rotation.x = -0.26;
  group.add(gripHand);

  const supportHand = new THREE.Mesh(new THREE.BoxGeometry(0.070, 0.052, 0.124), skinMat);
  supportHand.name = 'sniper_support_hand';
  supportHand.userData.isProceduralHand = true;
  supportHand.userData.defaultVisible = true;
  supportHand.position.set(-0.010, -0.066, -0.340);
  supportHand.rotation.x = -0.06;
  group.add(supportHand);

  group.userData.parts = {
    receiver,
    stock,
    cheekRest,
    handguard,
    barrel,
    barrelSleeve,
    muzzleBrake,
    scopeTube,
    scopeFront,
    scopeRear,
    scopeMountFront,
    scopeMountRear,
    bolt,
    boltHandle,
    grip,
    magazine,
    magBase,
    bipodLeft,
    bipodRight
  };

  return group;
}

export function updateProceduralSniperReloadParts(weapon, progress) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const magDrop = progress < 0.58
    ? THREE.MathUtils.smoothstep(progress / 0.58, 0, 1)
    : 1 - THREE.MathUtils.smoothstep((progress - 0.58) / 0.42, 0, 1);

  const boltPull = progress > 0.68 && progress < 0.96
    ? Math.sin(((progress - 0.68) / 0.28) * Math.PI)
    : 0;

  for (const key of ['magazine', 'magBase']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.y = basePos.y - magDrop * 0.145;
    part.position.z = basePos.z + magDrop * 0.020;
  }

  for (const key of ['bolt', 'boltHandle']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.z = basePos.z + boltPull * 0.095;
    if (key === 'boltHandle') {
      part.rotation.z = -0.20 - boltPull * 0.55;
    }
  }
}

export function updateProceduralSniperFireParts(weapon, firePulse = 0) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const pulse = THREE.MathUtils.clamp(firePulse, 0, 1);
  const boltKick = pulse * 0.075;

  if (parts.bolt) {
    const basePos = getPartBasePosition(parts.bolt);
    parts.bolt.position.z = basePos.z + boltKick;
  }

  if (parts.boltHandle) {
    const basePos = getPartBasePosition(parts.boltHandle);
    parts.boltHandle.position.z = basePos.z + boltKick;
    parts.boltHandle.rotation.z = -0.20 - pulse * 0.35;
  }
}

export function resetProceduralSniperParts(weapon, dt = 0.016) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const magLerp = Math.min(1, dt * 15);
  const boltLerp = Math.min(1, dt * 18);

  for (const key of ['magazine', 'magBase']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.y += (basePos.y - part.position.y) * magLerp;
    part.position.z += (basePos.z - part.position.z) * magLerp;
  }

  for (const key of ['bolt', 'boltHandle']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.z += (basePos.z - part.position.z) * boltLerp;
    if (key === 'boltHandle') {
      part.rotation.z += (-0.20 - part.rotation.z) * boltLerp;
    }
  }
}
