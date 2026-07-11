// js/weapons/shotgun.js
import * as THREE from 'three';
import {
  makeStandardMaterial,
  makeBoxPart,
  makeCylinderPart,
  getPartBasePosition
} from './procedural_helpers.js';

export function createProceduralShotgunMesh({ upgraded = false } = {}) {
  const group = new THREE.Group();
  group.userData.isProceduralWeapon = true;
  group.userData.weaponFamily = 'SHOTGUN';
  group.userData.thirdPersonMuzzle = Object.freeze({ x: 0.000, y: 0.028, z: -0.795 });
  group.userData.thirdPersonMuzzleSize = 0.225;
  group.userData.ejectedShellT = 0;
  group.userData.lastFirePulse = 0;

  const receiverColor = upgraded ? 0x322044 : 0x30363a;
  const woodColor = upgraded ? 0x4b234f : 0x5a351f;
  const darkColor = 0x07090b;
  const metalColor = upgraded ? 0x6d4e83 : 0x6b7173;
  const accentColor = upgraded ? 0xaa00ff : 0xffaa33;
  const skinColor = 0xd2b48c;

  const receiverMat = makeStandardMaterial({
    color: receiverColor,
    metalness: 0.30,
    roughness: 0.50,
    emissive: upgraded ? 0x150020 : 0x000000,
    emissiveIntensity: upgraded ? 0.18 : 0
  });

  const woodMat = makeStandardMaterial({ color: woodColor, metalness: 0.04, roughness: 0.82 });
  const darkMat = makeStandardMaterial({ color: darkColor, metalness: 0.24, roughness: 0.60 });
  const metalMat = makeStandardMaterial({ color: metalColor, metalness: 0.38, roughness: 0.40 });
  const accentMat = makeStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: upgraded ? 0.78 : 0.20,
    roughness: 0.34
  });
  const shellMat = makeStandardMaterial({ color: 0xc23b22, metalness: 0.10, roughness: 0.55 });
  const brassMat = makeStandardMaterial({ color: 0xd9a441, metalness: 0.32, roughness: 0.34 });
  const skinMat = makeStandardMaterial({ color: skinColor, roughness: 0.82 });

  // C9.5 hotfix: tighten the shotgun silhouette and remove the long yellow rails.
  const receiver = makeBoxPart(
    group,
    'shotgun_receiver',
    new THREE.Vector3(0.145, 0.095, 0.310),
    new THREE.Vector3(0.000, 0.024, -0.090),
    receiverMat
  );

  makeBoxPart(
    group,
    'shotgun_barrel_collar',
    new THREE.Vector3(0.132, 0.076, 0.060),
    new THREE.Vector3(0.000, 0.032, -0.255),
    darkMat
  );

  const stock = makeBoxPart(
    group,
    'shotgun_stock',
    new THREE.Vector3(0.125, 0.125, 0.270),
    new THREE.Vector3(0.000, -0.010, 0.250),
    woodMat,
    new THREE.Vector3(0.06, 0, 0)
  );

  const stockPad = makeBoxPart(
    group,
    'shotgun_stock_pad',
    new THREE.Vector3(0.135, 0.135, 0.026),
    new THREE.Vector3(0.000, -0.007, 0.402),
    darkMat,
    new THREE.Vector3(0.06, 0, 0)
  );

  const barrelTop = makeCylinderPart(
    group,
    'shotgun_barrel_top',
    0.024,
    0.530,
    new THREE.Vector3(0.000, 0.050, -0.430),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    metalMat,
    24
  );

  const barrelBottom = makeCylinderPart(
    group,
    'shotgun_barrel_bottom',
    0.024,
    0.530,
    new THREE.Vector3(0.000, 0.005, -0.430),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    metalMat,
    24
  );

  makeBoxPart(
    group,
    'shotgun_barrel_spacer_front',
    new THREE.Vector3(0.058, 0.065, 0.020),
    new THREE.Vector3(0.000, 0.028, -0.610),
    darkMat
  );

  makeBoxPart(
    group,
    'shotgun_barrel_spacer_rear',
    new THREE.Vector3(0.058, 0.065, 0.020),
    new THREE.Vector3(0.000, 0.028, -0.300),
    darkMat
  );

  const muzzle = makeCylinderPart(
    group,
    'shotgun_muzzle',
    0.036,
    0.050,
    new THREE.Vector3(0.000, 0.028, -0.725),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    upgraded ? accentMat : darkMat,
    24
  );

  const pump = makeBoxPart(
    group,
    'shotgun_pump',
    new THREE.Vector3(0.155, 0.075, 0.205),
    new THREE.Vector3(0.000, -0.050, -0.385),
    woodMat
  );

  const pumpRidge = makeBoxPart(
    group,
    'shotgun_pump_ridge',
    new THREE.Vector3(0.160, 0.020, 0.170),
    new THREE.Vector3(0.000, -0.006, -0.385),
    darkMat
  );

  makeBoxPart(
    group,
    'shotgun_pump_short_accent',
    new THREE.Vector3(0.006, 0.010, 0.095),
    new THREE.Vector3(0.083, -0.018, -0.385),
    accentMat
  );

  const grip = makeBoxPart(
    group,
    'shotgun_grip',
    new THREE.Vector3(0.075, 0.140, 0.065),
    new THREE.Vector3(0.000, -0.105, 0.055),
    woodMat,
    new THREE.Vector3(-0.22, 0, 0)
  );

  makeBoxPart(
    group,
    'shotgun_trigger_guard',
    new THREE.Vector3(0.085, 0.040, 0.032),
    new THREE.Vector3(0.000, -0.055, -0.005),
    darkMat
  );

  makeBoxPart(
    group,
    'shotgun_trigger',
    new THREE.Vector3(0.020, 0.042, 0.016),
    new THREE.Vector3(0.000, -0.073, 0.018),
    darkMat,
    new THREE.Vector3(-0.26, 0, 0)
  );

  makeBoxPart(
    group,
    'shotgun_front_sight',
    new THREE.Vector3(0.030, 0.012, 0.014),
    new THREE.Vector3(0.000, 0.086, -0.642),
    accentMat
  );

  makeBoxPart(
    group,
    'shotgun_rear_sight',
    new THREE.Vector3(0.058, 0.014, 0.024),
    new THREE.Vector3(0.000, 0.093, 0.020),
    darkMat
  );

  const shell = makeCylinderPart(
    group,
    'shotgun_reload_shell',
    0.018,
    0.085,
    new THREE.Vector3(-0.055, -0.058, -0.100),
    new THREE.Vector3(0, 0, Math.PI / 2),
    shellMat,
    16
  );
  shell.visible = false;

  const ejectedShell = makeCylinderPart(
    group,
    'shotgun_ejected_shell',
    0.016,
    0.075,
    new THREE.Vector3(0.070, 0.015, -0.050),
    new THREE.Vector3(0, 0, Math.PI / 2),
    shellMat,
    16
  );
  ejectedShell.visible = false;

  makeCylinderPart(
    group,
    'shotgun_ejected_shell_brass',
    0.0165,
    0.018,
    new THREE.Vector3(0.110, 0.015, -0.050),
    new THREE.Vector3(0, 0, Math.PI / 2),
    brassMat,
    16
  ).visible = false;

  makeBoxPart(
    group,
    'shotgun_receiver_short_accent_left',
    new THREE.Vector3(0.005, 0.008, 0.105),
    new THREE.Vector3(-0.078, 0.062, -0.105),
    accentMat
  );

  makeBoxPart(
    group,
    'shotgun_receiver_short_accent_right',
    new THREE.Vector3(0.005, 0.008, 0.105),
    new THREE.Vector3(0.078, 0.062, -0.105),
    accentMat
  );

  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: upgraded ? 0xaa00ff : 0xffaa00,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.225, 0.225), muzzleFlashMat);
  muzzleFlash.name = 'muzzleFlashMesh';
  muzzleFlash.position.set(0.000, 0.028, -0.795);
  muzzleFlash.rotation.y = Math.PI;
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  const gripHand = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.054, 0.100), skinMat);
  gripHand.name = 'shotgun_grip_hand';
  gripHand.userData.isProceduralHand = true;
  gripHand.userData.defaultVisible = true;
  gripHand.position.set(0.000, -0.124, 0.074);
  gripHand.rotation.x = -0.22;
  group.add(gripHand);

  const supportHand = new THREE.Mesh(new THREE.BoxGeometry(0.070, 0.054, 0.116), skinMat);
  supportHand.name = 'shotgun_support_hand';
  supportHand.userData.isProceduralHand = true;
  supportHand.userData.defaultVisible = true;
  supportHand.position.set(-0.010, -0.075, -0.385);
  supportHand.rotation.x = -0.05;
  group.add(supportHand);

  group.userData.parts = {
    receiver,
    stock,
    stockPad,
    barrelTop,
    barrelBottom,
    muzzle,
    pump,
    pumpRidge,
    grip,
    shell,
    ejectedShell
  };

  return group;
}

export function updateProceduralShotgunReloadParts(weapon, progress) {
  const parts = weapon?.meshGroup?.userData?.parts || {};
  const shellT = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
  const pumpT = progress > 0.72 && progress < 0.96
    ? Math.sin(((progress - 0.72) / 0.24) * Math.PI)
    : 0;

  if (parts.shell) {
    const basePos = getPartBasePosition(parts.shell);
    parts.shell.visible = progress > 0.12 && progress < 0.86;
    parts.shell.position.x = basePos.x + shellT * 0.040;
    parts.shell.position.y = basePos.y + shellT * 0.055;
    parts.shell.position.z = basePos.z - shellT * 0.035;
  }

  for (const key of ['pump', 'pumpRidge']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.z = basePos.z + pumpT * 0.115;
  }
}

function updateEjectedShellMotion(group, parts, dt = 0.016) {
  const shell = parts.ejectedShell;
  if (!shell) return;

  group.userData.ejectedShellT = Math.max(0, (group.userData.ejectedShellT || 0) - dt);
  const t = group.userData.ejectedShellT;

  if (t <= 0) {
    shell.visible = false;
    return;
  }

  const travel = 1 - (t / 0.42);
  const basePos = getPartBasePosition(shell);

  shell.visible = true;
  shell.position.x = basePos.x + travel * 0.185;
  shell.position.y = basePos.y + Math.sin(travel * Math.PI) * 0.075 - travel * 0.070;
  shell.position.z = basePos.z + travel * 0.070;
  shell.rotation.x += dt * 10;
  shell.rotation.z += dt * 16;

  const brass = group.getObjectByName('shotgun_ejected_shell_brass');
  if (brass) {
    brass.visible = true;
    brass.position.copy(shell.position);
    brass.position.x += 0.040;
    brass.rotation.copy(shell.rotation);
  }
}

export function updateProceduralShotgunFireParts(weapon, firePulse = 0) {
  const group = weapon?.meshGroup;
  const parts = group?.userData?.parts || {};
  const pulse = THREE.MathUtils.clamp(firePulse, 0, 1);
  const pumpKick = pulse * 0.095;

  for (const key of ['pump', 'pumpRidge']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.z = basePos.z + pumpKick;
  }

  const lastPulse = group?.userData?.lastFirePulse || 0;
  if (group && pulse > 0.62 && lastPulse <= 0.62) {
    group.userData.ejectedShellT = 0.42;
  }
  if (group) group.userData.lastFirePulse = pulse;
}

export function resetProceduralShotgunParts(weapon, dt = 0.016) {
  const group = weapon?.meshGroup;
  const parts = group?.userData?.parts || {};
  const pumpLerp = Math.min(1, dt * 18);

  for (const key of ['pump', 'pumpRidge']) {
    const part = parts[key];
    if (!part) continue;
    const basePos = getPartBasePosition(part);
    part.position.z += (basePos.z - part.position.z) * pumpLerp;
  }

  if (parts.shell) {
    parts.shell.visible = false;
    const basePos = getPartBasePosition(parts.shell);
    parts.shell.position.lerp(basePos, Math.min(1, dt * 20));
  }

  if (group) {
    updateEjectedShellMotion(group, parts, dt);
    if ((group.userData.ejectedShellT || 0) <= 0) {
      const brass = group.getObjectByName('shotgun_ejected_shell_brass');
      if (brass) brass.visible = false;
      group.userData.lastFirePulse = 0;
    }
  }
}
