// js/weapons/rifle.js
import * as THREE from 'three';
import {
  makeStandardMaterial,
  makeBoxPart,
  makeCylinderPart,
  getPartBasePosition
} from './procedural_helpers.js';

export function createProceduralRifleMesh({ upgraded = false } = {}) {
  const group = new THREE.Group();
  group.userData.isProceduralWeapon = true;
  group.userData.weaponFamily = 'RIFLE';

  const receiverColor = upgraded ? 0x4a2630 : 0x27323a;
  const woodColor = upgraded ? 0x3b1d23 : 0x5a351f;
  const darkColor = 0x07090b;
  const magColor = upgraded ? 0x28121c : 0x11161b;
  const accentColor = upgraded ? 0xff3355 : 0x00d4ff;
  const skinColor = 0xd2b48c;

  const receiverMat = makeStandardMaterial({
    color: receiverColor,
    metalness: 0.30,
    roughness: 0.46,
    emissive: upgraded ? 0x260008 : 0x000000,
    emissiveIntensity: upgraded ? 0.18 : 0
  });

  const woodMat = makeStandardMaterial({ color: woodColor, metalness: 0.04, roughness: 0.82 });
  const darkMat = makeStandardMaterial({ color: darkColor, metalness: 0.24, roughness: 0.60 });
  const magMat = makeStandardMaterial({ color: magColor, metalness: 0.18, roughness: 0.66 });
  const accentMat = makeStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: upgraded ? 0.72 : 0.22,
    roughness: 0.34
  });
  const skinMat = makeStandardMaterial({ color: skinColor, roughness: 0.82 });

  // C9.5 hotfix: rebuild rifle into a tighter AK-style silhouette.
  const receiver = makeBoxPart(
    group,
    'rifle_receiver',
    new THREE.Vector3(0.132, 0.086, 0.360),
    new THREE.Vector3(0.000, 0.018, -0.082),
    receiverMat
  );

  const upper = makeBoxPart(
    group,
    'rifle_dust_cover',
    new THREE.Vector3(0.118, 0.030, 0.285),
    new THREE.Vector3(0.000, 0.078, -0.090),
    darkMat
  );

  makeBoxPart(
    group,
    'rifle_stock_tang',
    new THREE.Vector3(0.082, 0.052, 0.080),
    new THREE.Vector3(0.000, -0.002, 0.125),
    darkMat
  );

  const stock = makeBoxPart(
    group,
    'rifle_ak_stock',
    new THREE.Vector3(0.118, 0.100, 0.275),
    new THREE.Vector3(0.000, -0.028, 0.300),
    woodMat,
    new THREE.Vector3(0.10, 0, 0)
  );

  const stockPad = makeBoxPart(
    group,
    'rifle_stock_pad',
    new THREE.Vector3(0.126, 0.112, 0.026),
    new THREE.Vector3(0.000, -0.014, 0.455),
    darkMat,
    new THREE.Vector3(0.10, 0, 0)
  );

  const lowerHandguard = makeBoxPart(
    group,
    'rifle_lower_handguard',
    new THREE.Vector3(0.122, 0.066, 0.265),
    new THREE.Vector3(0.000, -0.010, -0.345),
    woodMat,
    new THREE.Vector3(-0.025, 0, 0)
  );

  const upperHandguard = makeBoxPart(
    group,
    'rifle_upper_handguard',
    new THREE.Vector3(0.104, 0.036, 0.220),
    new THREE.Vector3(0.000, 0.064, -0.350),
    woodMat
  );

  const gasTube = makeCylinderPart(
    group,
    'rifle_gas_tube',
    0.016,
    0.340,
    new THREE.Vector3(0.000, 0.092, -0.395),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    darkMat,
    18
  );

  const barrel = makeCylinderPart(
    group,
    'rifle_barrel',
    0.014,
    0.430,
    new THREE.Vector3(0.000, 0.030, -0.545),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    darkMat,
    24
  );

  const frontSightBlock = makeBoxPart(
    group,
    'rifle_front_sight_block',
    new THREE.Vector3(0.052, 0.060, 0.030),
    new THREE.Vector3(0.000, 0.060, -0.610),
    darkMat
  );

  const muzzle = makeCylinderPart(
    group,
    'rifle_muzzle',
    0.026,
    0.060,
    new THREE.Vector3(0.000, 0.030, -0.780),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    upgraded ? accentMat : darkMat,
    24
  );

  const grip = makeBoxPart(
    group,
    'rifle_pistol_grip',
    new THREE.Vector3(0.066, 0.142, 0.060),
    new THREE.Vector3(0.000, -0.104, 0.028),
    woodMat,
    new THREE.Vector3(-0.34, 0, 0)
  );

  const magazine = makeBoxPart(
    group,
    'rifle_magazine',
    new THREE.Vector3(0.070, 0.096, 0.062),
    new THREE.Vector3(0.000, -0.088, -0.090),
    magMat,
    new THREE.Vector3(-0.18, 0, 0)
  );

  const magazineMid = makeBoxPart(
    group,
    'rifle_magazine_mid',
    new THREE.Vector3(0.070, 0.105, 0.062),
    new THREE.Vector3(0.000, -0.171, -0.118),
    magMat,
    new THREE.Vector3(-0.30, 0, 0)
  );

  const magazineLower = makeBoxPart(
    group,
    'rifle_magazine_lower',
    new THREE.Vector3(0.068, 0.090, 0.060),
    new THREE.Vector3(0.000, -0.251, -0.162),
    magMat,
    new THREE.Vector3(-0.42, 0, 0)
  );

  const magBase = makeBoxPart(
    group,
    'rifle_mag_base',
    new THREE.Vector3(0.078, 0.026, 0.070),
    new THREE.Vector3(0.000, -0.302, -0.200),
    darkMat,
    new THREE.Vector3(-0.42, 0, 0)
  );

  makeBoxPart(
    group,
    'rifle_magwell_bridge',
    new THREE.Vector3(0.074, 0.030, 0.070),
    new THREE.Vector3(0.000, -0.052, -0.066),
    darkMat,
    new THREE.Vector3(-0.08, 0, 0)
  );

  makeBoxPart(
    group,
    'rifle_trigger_guard',
    new THREE.Vector3(0.082, 0.040, 0.032),
    new THREE.Vector3(0.000, -0.052, 0.004),
    darkMat
  );

  makeBoxPart(
    group,
    'rifle_trigger',
    new THREE.Vector3(0.020, 0.042, 0.016),
    new THREE.Vector3(0.000, -0.070, 0.028),
    darkMat,
    new THREE.Vector3(-0.28, 0, 0)
  );

  makeBoxPart(
    group,
    'rifle_front_sight',
    new THREE.Vector3(0.034, 0.022, 0.016),
    new THREE.Vector3(0.000, 0.108, -0.612),
    upgraded ? accentMat : darkMat
  );

  makeBoxPart(
    group,
    'rifle_front_sight_dot',
    new THREE.Vector3(0.010, 0.006, 0.005),
    new THREE.Vector3(0.000, 0.124, -0.616),
    accentMat
  );

  makeBoxPart(
    group,
    'rifle_rear_sight',
    new THREE.Vector3(0.062, 0.016, 0.026),
    new THREE.Vector3(0.000, 0.100, 0.018),
    darkMat
  );

  makeBoxPart(
    group,
    'rifle_rear_sight_notch',
    new THREE.Vector3(0.020, 0.006, 0.006),
    new THREE.Vector3(0.000, 0.112, 0.008),
    accentMat
  );

  const bolt = makeBoxPart(
    group,
    'rifle_bolt',
    new THREE.Vector3(0.022, 0.020, 0.112),
    new THREE.Vector3(0.076, 0.040, -0.055),
    upgraded ? accentMat : darkMat
  );

  const chargingHandle = makeBoxPart(
    group,
    'rifle_charging_handle',
    new THREE.Vector3(0.048, 0.022, 0.024),
    new THREE.Vector3(0.108, 0.046, -0.118),
    upgraded ? accentMat : darkMat
  );

  makeBoxPart(
    group,
    'rifle_receiver_accent_left',
    new THREE.Vector3(0.005, 0.008, 0.150),
    new THREE.Vector3(-0.070, 0.058, -0.095),
    accentMat
  );

  makeBoxPart(
    group,
    'rifle_receiver_accent_right',
    new THREE.Vector3(0.005, 0.008, 0.150),
    new THREE.Vector3(0.070, 0.058, -0.095),
    accentMat
  );

  makeBoxPart(
    group,
    'rifle_handguard_accent',
    new THREE.Vector3(0.006, 0.010, 0.115),
    new THREE.Vector3(0.065, 0.020, -0.350),
    accentMat
  );

  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: upgraded ? 0xff3355 : 0xffaa00,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.170, 0.170), muzzleFlashMat);
  muzzleFlash.name = 'muzzleFlashMesh';
  muzzleFlash.position.set(0.000, 0.030, -0.850);
  muzzleFlash.rotation.y = Math.PI;
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  const gripHand = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.052, 0.095), skinMat);
  gripHand.name = 'rifle_grip_hand';
  gripHand.userData.isProceduralHand = true;
  gripHand.userData.defaultVisible = true;
  gripHand.position.set(0.000, -0.120, 0.055);
  gripHand.rotation.x = -0.34;
  group.add(gripHand);

  const supportHand = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.050, 0.105), skinMat);
  supportHand.name = 'rifle_support_hand';
  supportHand.userData.isProceduralHand = true;
  supportHand.userData.defaultVisible = true;
  supportHand.position.set(-0.010, -0.052, -0.335);
  supportHand.rotation.x = -0.08;
  group.add(supportHand);

  group.userData.parts = {
    receiver,
    upper,
    lowerHandguard,
    upperHandguard,
    gasTube,
    barrel,
    muzzle,
    frontSightBlock,
    stock,
    stockPad,
    grip,
    magazine,
    magazineMid,
    magazineLower,
    magBase,
    bolt,
    chargingHandle
  };

  return group;
}

export function updateProceduralRifleReloadParts(weapon, progress) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const magDrop = progress < 0.55
    ? THREE.MathUtils.smoothstep(progress / 0.55, 0, 1)
    : 1 - THREE.MathUtils.smoothstep((progress - 0.55) / 0.45, 0, 1);
  const boltPull = progress > 0.72 && progress < 0.94
    ? Math.sin(((progress - 0.72) / 0.22) * Math.PI)
    : 0;

  for (const key of ['magazine', 'magazineMid', 'magazineLower', 'magBase']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.y = basePos.y - magDrop * 0.130;
    part.position.z = basePos.z + magDrop * 0.025;
  }

  for (const key of ['bolt', 'chargingHandle']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.z = basePos.z + boltPull * 0.065;
  }
}

export function updateProceduralRifleFireParts(weapon, firePulse = 0) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const pulse = THREE.MathUtils.clamp(firePulse, 0, 1);
  const boltKick = pulse * 0.056;

  for (const key of ['bolt', 'chargingHandle']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.z = basePos.z + boltKick;
  }
}

export function resetProceduralRifleParts(weapon, dt = 0.016) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const magLerp = Math.min(1, dt * 16);
  const boltLerp = Math.min(1, dt * 20);

  for (const key of ['magazine', 'magazineMid', 'magazineLower', 'magBase']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.y += (basePos.y - part.position.y) * magLerp;
    part.position.z += (basePos.z - part.position.z) * magLerp;
  }

  for (const key of ['bolt', 'chargingHandle']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.z += (basePos.z - part.position.z) * boltLerp;
  }
}
