// js/weapons/pistol.js
import * as THREE from 'three';
import {
  makeStandardMaterial,
  makeBoxPart,
  makeCylinderPart,
  getPartBasePosition,
  addTacticalHandRig,
  addWeaponPresentationDetails
} from './procedural_helpers.js';

export function createProceduralPistolMesh({ upgraded = false } = {}) {
  const group = new THREE.Group();
  group.userData.isProceduralWeapon = true;
  group.userData.weaponFamily = 'PISTOL';
  group.userData.visualPatch = 'vis8-r1-1-weapon-silhouette-hand-integration';
  group.userData.liveBrowserProfile = 'authored-low-draw';
  group.userData.thirdPersonMuzzle = Object.freeze({ x: 0.000, y: 0.034, z: -0.336 });
  group.userData.thirdPersonMuzzleSize = 0.125;

  const slideColor = upgraded ? 0xc58b42 : 0x9a8765;
  const frameColor = upgraded ? 0x34202d : 0x20272b;
  const gripColor = upgraded ? 0x512d22 : 0x332d25;
  const darkColor = 0x07090b;
  const accentColor = upgraded ? 0xff5b78 : 0xe9a43a;
  const skinColor = 0xd2b48c;

  const slideMat = makeStandardMaterial({
    color: slideColor,
    metalness: 0.42,
    roughness: 0.34,
    emissive: upgraded ? 0x281400 : 0x000000,
    emissiveIntensity: upgraded ? 0.18 : 0
  });

  const frameMat = makeStandardMaterial({
    color: frameColor,
    metalness: 0.20,
    roughness: 0.58
  });

  const gripMat = makeStandardMaterial({
    color: gripColor,
    metalness: 0.05,
    roughness: 0.78
  });

  const darkMat = makeStandardMaterial({
    color: darkColor,
    metalness: 0.24,
    roughness: 0.62
  });

  const accentMat = makeStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: upgraded ? 0.48 : 0.10,
    roughness: 0.32
  });

  const skinMat = makeStandardMaterial({
    color: skinColor,
    roughness: 0.82
  });

  // Semi-realistic compact pistol.
  const slide = makeBoxPart(
    group,
    'pistol_slide',
    new THREE.Vector3(0.102, 0.044, 0.300),
    new THREE.Vector3(0.000, 0.038, -0.108),
    slideMat
  );

  const slideTop = makeBoxPart(
    group,
    'pistol_slide_top',
    new THREE.Vector3(0.070, 0.011, 0.205),
    new THREE.Vector3(0.000, 0.065, -0.116),
    slideMat
  );

  const frame = makeBoxPart(
    group,
    'pistol_frame',
    new THREE.Vector3(0.092, 0.034, 0.172),
    new THREE.Vector3(0.000, -0.012, -0.060),
    frameMat
  );

  makeBoxPart(
    group,
    'pistol_dust_cover',
    new THREE.Vector3(0.076, 0.024, 0.108),
    new THREE.Vector3(0.000, -0.044, -0.145),
    frameMat
  );

  const barrel = makeCylinderPart(
    group,
    'pistol_barrel',
    0.014,
    0.250,
    new THREE.Vector3(0.000, 0.034, -0.148),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    upgraded ? accentMat : darkMat,
    24
  );

  const muzzle = makeCylinderPart(
    group,
    'pistol_muzzle',
    0.021,
    0.024,
    new THREE.Vector3(0.000, 0.034, -0.302),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    upgraded ? accentMat : darkMat,
    24
  );

  const ejectionPort = makeBoxPart(
    group,
    'pistol_ejection_port',
    new THREE.Vector3(0.045, 0.012, 0.040),
    new THREE.Vector3(0.020, 0.067, -0.060),
    darkMat
  );

  const grip = makeBoxPart(
    group,
    'pistol_grip',
    new THREE.Vector3(0.072, 0.164, 0.062),
    new THREE.Vector3(0.000, -0.116, 0.020),
    gripMat,
    new THREE.Vector3(-0.26, 0, 0)
  );

  makeBoxPart(
    group,
    'pistol_grip_frontstrap',
    new THREE.Vector3(0.052, 0.126, 0.012),
    new THREE.Vector3(0.000, -0.103, -0.018),
    darkMat,
    new THREE.Vector3(-0.26, 0, 0)
  );

  const magazine = makeBoxPart(
    group,
    'pistol_magazine',
    new THREE.Vector3(0.047, 0.108, 0.038),
    new THREE.Vector3(0.000, -0.164, 0.018),
    darkMat,
    new THREE.Vector3(-0.26, 0, 0)
  );

  const magBase = makeBoxPart(
    group,
    'pistol_mag_base',
    new THREE.Vector3(0.066, 0.020, 0.050),
    new THREE.Vector3(0.000, -0.226, 0.033),
    darkMat,
    new THREE.Vector3(-0.26, 0, 0)
  );

  const triggerGuard = makeBoxPart(
    group,
    'pistol_trigger_guard',
    new THREE.Vector3(0.064, 0.036, 0.028),
    new THREE.Vector3(0.000, -0.064, -0.028),
    darkMat
  );

  const trigger = makeBoxPart(
    group,
    'pistol_trigger',
    new THREE.Vector3(0.018, 0.038, 0.014),
    new THREE.Vector3(0.000, -0.078, -0.006),
    darkMat,
    new THREE.Vector3(-0.34, 0, 0)
  );

  makeBoxPart(
    group,
    'pistol_rear_sight',
    new THREE.Vector3(0.052, 0.012, 0.020),
    new THREE.Vector3(0.000, 0.083, 0.038),
    darkMat
  );

  makeBoxPart(
    group,
    'pistol_rear_sight_notch',
    new THREE.Vector3(0.018, 0.006, 0.006),
    new THREE.Vector3(0.000, 0.091, 0.028),
    frameMat
  );

  makeBoxPart(
    group,
    'pistol_front_sight',
    new THREE.Vector3(0.028, 0.012, 0.014),
    new THREE.Vector3(0.000, 0.083, -0.248),
    darkMat
  );

  makeBoxPart(
    group,
    'pistol_front_sight_dot',
    new THREE.Vector3(0.009, 0.005, 0.004),
    new THREE.Vector3(0.000, 0.093, -0.252),
    accentMat
  );

  makeBoxPart(
    group,
    'pistol_slide_face',
    new THREE.Vector3(0.074, 0.038, 0.014),
    new THREE.Vector3(0.000, 0.032, -0.263),
    darkMat
  );

  makeBoxPart(
    group,
    'pistol_chamber_block',
    new THREE.Vector3(0.052, 0.020, 0.045),
    new THREE.Vector3(0.000, 0.024, -0.034),
    darkMat
  );

  makeBoxPart(
    group,
    'pistol_takedown_pin',
    new THREE.Vector3(0.010, 0.010, 0.010),
    new THREE.Vector3(-0.047, -0.014, -0.070),
    darkMat
  );

  makeBoxPart(
    group,
    'pistol_grip_panel',
    new THREE.Vector3(0.052, 0.098, 0.008),
    new THREE.Vector3(0.000, -0.118, -0.014),
    darkMat,
    new THREE.Vector3(-0.26, 0, 0)
  );

  makeBoxPart(
    group,
    'pistol_accent_left',
    new THREE.Vector3(0.004, 0.006, 0.112),
    new THREE.Vector3(-0.052, 0.054, -0.120),
    accentMat
  );

  makeBoxPart(
    group,
    'pistol_accent_right',
    new THREE.Vector3(0.004, 0.006, 0.112),
    new THREE.Vector3(0.052, 0.054, -0.120),
    accentMat
  );

  for (let i = 0; i < 3; i++) {
    makeBoxPart(
      group,
      `pistol_rear_serration_${i + 1}`,
      new THREE.Vector3(0.006, 0.034, 0.007),
      new THREE.Vector3(-0.050, 0.034, 0.020 - i * 0.020),
      darkMat,
      new THREE.Vector3(0, 0, -0.18)
    );
  }

  addWeaponPresentationDetails(group, 'PISTOL', { upgraded, accentColor });

  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: upgraded ? 0xdd00ff : 0xffaa00,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.125, 0.125), muzzleFlashMat);
  muzzleFlash.name = 'muzzleFlashMesh';
  muzzleFlash.position.set(0.000, 0.034, -0.336);
  muzzleFlash.rotation.y = Math.PI;
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  const gripHand = addTacticalHandRig(group, {
    name: 'pistol_grip_hand',
    position: new THREE.Vector3(0.000, -0.128, 0.022),
    rotation: new THREE.Vector3(-0.34, 0, 0),
    defaultVisible: true,
    upgraded,
    support: false,
    accentColor
  });

  const hiddenSupportHand = addTacticalHandRig(group, {
    name: 'pistol_hidden_support_hand',
    position: new THREE.Vector3(0.000, -0.050, 0.050),
    rotation: new THREE.Vector3(0, 0, 0),
    defaultVisible: false,
    upgraded,
    support: true,
    accentColor
  });

  group.userData.parts = {
    slide,
    slideTop,
    barrel,
    muzzle,
    magazine,
    magBase,
    grip,
    frame,
    trigger,
    triggerGuard,
    ejectionPort
  };

  return group;
}

export function updateProceduralPistolReloadParts(weapon, progress) {
  const parts = weapon?.meshGroup?.userData?.parts || {};

  const magDrop = progress < 0.48
    ? THREE.MathUtils.smoothstep(progress / 0.48, 0, 1)
    : 1 - THREE.MathUtils.smoothstep((progress - 0.48) / 0.52, 0, 1);

  const slidePull = progress > 0.68 && progress < 0.92
    ? Math.sin(((progress - 0.68) / 0.24) * Math.PI)
    : 0;

  if (parts.magazine) {
    const basePos = getPartBasePosition(parts.magazine);
    parts.magazine.position.y = basePos.y - magDrop * 0.070;
    parts.magazine.position.z = basePos.z + magDrop * 0.014;
  }

  if (parts.slide) {
    const basePos = getPartBasePosition(parts.slide);
    parts.slide.position.z = basePos.z + slidePull * 0.042;
  }

  if (parts.barrel) {
    const basePos = getPartBasePosition(parts.barrel);
    parts.barrel.position.z = basePos.z + slidePull * 0.010;
  }
}

export function resetProceduralPistolParts(weapon, dt = 0.016) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const magLerp = Math.min(1, dt * 18);
  const slideLerp = Math.min(1, dt * 20);

  if (parts.magazine) {
    const basePos = getPartBasePosition(parts.magazine);
    parts.magazine.position.y += (basePos.y - parts.magazine.position.y) * magLerp;
    parts.magazine.position.z += (basePos.z - parts.magazine.position.z) * magLerp;
  }

  if (parts.slide) {
    const basePos = getPartBasePosition(parts.slide);
    parts.slide.position.z += (basePos.z - parts.slide.position.z) * slideLerp;
  }

  if (parts.barrel) {
    const basePos = getPartBasePosition(parts.barrel);
    parts.barrel.position.z += (basePos.z - parts.barrel.position.z) * slideLerp;
  }
}
