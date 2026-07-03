// js/actors/procedural_zombie.js
import * as THREE from 'three';

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function makePart(name, w, h, d, material, position, rotation = new THREE.Euler()) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

  mesh.name = name;
  mesh.position.copy(position);
  mesh.rotation.copy(rotation);

  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;

  mesh.userData.keepMaterial = true;
  mesh.userData.isProceduralZombie = true;
  mesh.userData.basePosition = position.clone();
  mesh.userData.baseRotation = rotation.clone();

  return mesh;
}

export function createProceduralZombieVisual(options = {}) {
  const group = new THREE.Group();
  group.name = "procedural_zombie_visual";

  const bodyColor = options.color ?? 0x7fa06b;

  const widthMul = rand(0.9, 1.15);
  const heightMul = rand(0.95, 1.08);
  const crooked = rand(-0.08, 0.08);

  const clothColors = [0x243124, 0x302822, 0x1f2b33, 0x33242a];
  const pantsColors = [0x151816, 0x1c2228, 0x241f1a, 0x15151a];
  const clothColor = clothColors[Math.floor(Math.random() * clothColors.length)];
  const pantsColor = pantsColors[Math.floor(Math.random() * pantsColors.length)];

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true
  });

  const headMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true
  });

  const clothMaterial = new THREE.MeshStandardMaterial({
    color: clothColor,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true
  });

  const pantsMaterial = new THREE.MeshStandardMaterial({
    color: pantsColor,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true
  });

  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2222
  });

  const mouthMaterial = new THREE.MeshBasicMaterial({
    color: 0x050505
  });

  const torso = makePart(
    "procedural_zombie_torso",
    0.70 * widthMul,
    0.88 * heightMul,
    0.42,
    clothMaterial,
    new THREE.Vector3(0, 1.23 * heightMul, 0),
    new THREE.Euler(rand(-0.04, 0.04), 0, rand(-0.08, 0.08))
  );

  const head = makePart(
    "procedural_zombie_head",
    0.70 * widthMul,
    0.62,
    0.55,
    headMaterial,
    new THREE.Vector3(crooked, 1.76 * heightMul, -0.04),
    new THREE.Euler(rand(-0.08, 0.08), rand(-0.12, 0.12), rand(-0.08, 0.08))
  );
  head.userData.isHead = true;

  const leftArm = makePart(
    "procedural_zombie_left_arm",
    0.18,
    0.82,
    0.18,
    bodyMaterial,
    new THREE.Vector3(-0.54 * widthMul, 1.18 * heightMul, -0.05),
    new THREE.Euler(rand(-0.28, -0.12), 0, rand(-0.42, -0.18))
  );

  const rightArm = makePart(
    "procedural_zombie_right_arm",
    0.18,
    0.82,
    0.18,
    bodyMaterial,
    new THREE.Vector3(0.54 * widthMul, 1.18 * heightMul, -0.05),
    new THREE.Euler(rand(-0.28, -0.12), 0, rand(0.18, 0.42))
  );

  const leftLeg = makePart(
    "procedural_zombie_left_leg",
    0.25,
    0.84,
    0.24,
    pantsMaterial,
    new THREE.Vector3(-0.22 * widthMul, 0.42 * heightMul, 0),
    new THREE.Euler(rand(-0.03, 0.03), 0, rand(-0.10, 0.10))
  );

  const rightLeg = makePart(
    "procedural_zombie_right_leg",
    0.25,
    0.84,
    0.24,
    pantsMaterial,
    new THREE.Vector3(0.22 * widthMul, 0.42 * heightMul, 0),
    new THREE.Euler(rand(-0.03, 0.03), 0, rand(-0.10, 0.10))
  );

  const shoulderBar = makePart(
    "procedural_zombie_shoulders",
    0.92 * widthMul,
    0.16,
    0.46,
    clothMaterial,
    new THREE.Vector3(0, 0.36 * heightMul, -0.02)
  );

  const leftShirtTear = makePart(
    "procedural_zombie_left_shirt_tear",
    0.16,
    0.36,
    0.035,
    bodyMaterial,
    new THREE.Vector3(-0.18 * widthMul, -0.10 * heightMul, -0.235)
  );

  const rightShirtTear = makePart(
    "procedural_zombie_right_shirt_tear",
    0.14,
    0.30,
    0.035,
    bodyMaterial,
    new THREE.Vector3(0.20 * widthMul, -0.14 * heightMul, -0.235)
  );

  torso.add(shoulderBar);
  torso.add(leftShirtTear);
  torso.add(rightShirtTear);

  const eyeGroup = new THREE.Group();
  eyeGroup.name = "procedural_zombie_eyes";
  eyeGroup.userData.keepMaterial = true;
  eyeGroup.userData.isProceduralZombie = true;
  eyeGroup.userData.basePosition = new THREE.Vector3(0, 0, 0);
  eyeGroup.userData.baseRotation = new THREE.Euler();

  const leftEye = makePart(
    "procedural_zombie_left_eye",
    0.09,
    0.09,
    0.04,
    eyeMaterial,
    new THREE.Vector3(-0.16 * widthMul, 0.06, -0.33)
  );

  const rightEye = makePart(
    "procedural_zombie_right_eye",
    0.09,
    0.09,
    0.04,
    eyeMaterial,
    new THREE.Vector3(0.16 * widthMul, 0.06, -0.33)
  );

  const mouth = makePart(
    "procedural_zombie_mouth",
    0.30 * widthMul,
    0.06,
    0.04,
    mouthMaterial,
    new THREE.Vector3(0, -0.14, -0.30)
  );
  mouth.userData.isHead = true;
  head.add(mouth);

  eyeGroup.position.copy(head.position);
  eyeGroup.rotation.copy(head.rotation);
  eyeGroup.add(leftEye);
  eyeGroup.add(rightEye);

  group.add(torso);
  group.add(head);
  group.add(eyeGroup);
  group.add(leftArm);
  group.add(rightArm);
  group.add(leftLeg);
  group.add(rightLeg);

  group.userData.bodyMaterial = bodyMaterial;
  group.userData.headMaterial = headMaterial;
  group.userData.clothMaterial = clothMaterial;
  group.userData.pantsMaterial = pantsMaterial;
  group.userData.eyeMaterial = eyeMaterial;
  group.userData.mouthMaterial = mouthMaterial;

  group.userData.parts = {
    torso,
    head,
    mouth,
    eyeGroup,
    shoulderBar,
    leftShirtTear,
    rightShirtTear,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg
  };

  group.userData.motionPhase = rand(0, Math.PI * 2);
  group.userData.motionSpeed = 1.0;
  group.userData.motionPower = 1.0;
  group.userData.typeName = "SHAMBLER";

  return group;
}

export function updateProceduralZombieStyle(group, config = {}) {
  if (!group) return;

  const color = config.color ?? 0x7fa06b;
  const typeName = config.name ?? config.type ?? "SHAMBLER";

  group.userData.typeName = typeName;

  const bodyMaterial = group.userData.bodyMaterial;
  const headMaterial = group.userData.headMaterial;
  const eyeMaterial = group.userData.eyeMaterial;

  if (bodyMaterial) {
    bodyMaterial.color.setHex(color);
    bodyMaterial.emissive.setHex(color);
    bodyMaterial.emissiveIntensity = 0.05;
  }

  if (headMaterial) {
    headMaterial.color.setHex(color);
    headMaterial.emissive.setHex(color);
    headMaterial.emissiveIntensity = 0.07;
  }

  if (eyeMaterial) {
    if (typeName === "RUNNER") eyeMaterial.color.setHex(0xff2222);
    else if (typeName === "GOLIATH") eyeMaterial.color.setHex(0xffaa00);
    else if (typeName === "EXPLODER") eyeMaterial.color.setHex(0xff5500);
    else if (typeName === "RANGED") eyeMaterial.color.setHex(0x00ffff);
    else eyeMaterial.color.setHex(0xff3333);
  }

  const parts = group.userData.parts;
  if (!parts) return;

  // Reset local procedural scale. The main enemy group already receives config.scale.
  group.scale.set(1, 1, 1);

  parts.torso.scale.set(1, 1, 1);
  parts.head.scale.set(1, 1, 1);
  parts.leftArm.scale.set(1, 1, 1);
  parts.rightArm.scale.set(1, 1, 1);
  parts.leftLeg.scale.set(1, 1, 1);
  parts.rightLeg.scale.set(1, 1, 1);

  if (typeName === "RUNNER") {
    group.userData.motionSpeed = 1.45;
    group.userData.motionPower = 1.15;

    parts.torso.scale.set(0.85, 1.15, 0.85);
    parts.head.scale.set(0.90, 0.95, 0.90);
    parts.leftArm.scale.set(0.75, 1.15, 0.75);
    parts.rightArm.scale.set(0.75, 1.15, 0.75);
    parts.leftLeg.scale.set(0.75, 1.18, 0.75);
    parts.rightLeg.scale.set(0.75, 1.18, 0.75);
  }

  else if (typeName === "GOLIATH") {
    group.userData.motionSpeed = 0.65;
    group.userData.motionPower = 0.75;

    parts.torso.scale.set(1.25, 1.15, 1.25);
    parts.head.scale.set(1.15, 1.05, 1.15);
    parts.leftArm.scale.set(1.25, 1.2, 1.25);
    parts.rightArm.scale.set(1.25, 1.2, 1.25);
    parts.leftLeg.scale.set(1.18, 1.1, 1.18);
    parts.rightLeg.scale.set(1.18, 1.1, 1.18);
  }

  else if (typeName === "EXPLODER") {
    group.userData.motionSpeed = 1.05;
    group.userData.motionPower = 0.95;

    parts.torso.scale.set(1.20, 0.95, 1.20);
    parts.head.scale.set(1.05, 1.0, 1.05);
  }

  else if (typeName === "RANGED") {
    group.userData.motionSpeed = 0.85;
    group.userData.motionPower = 0.65;

    parts.torso.scale.set(0.85, 1.15, 0.85);
    parts.head.scale.set(0.95, 1.05, 0.95);
  }

  else {
    group.userData.motionSpeed = 1.0;
    group.userData.motionPower = 1.0;
  }
}

function resetPart(part) {
  if (!part) return;

  const basePos = part.userData.basePosition;
  const baseRot = part.userData.baseRotation;

  if (basePos) part.position.copy(basePos);
  if (baseRot) part.rotation.copy(baseRot);
}

export function updateProceduralZombieMotion(group, timeSeconds, speed = 1.0) {
  if (!group) return;

  const parts = group.userData.parts;
  if (!parts) return;

  const phase = group.userData.motionPhase ?? 0;
  const typeSpeed = group.userData.motionSpeed ?? 1.0;
  const power = group.userData.motionPower ?? 1.0;

  const t = timeSeconds * 7.0 * speed * typeSpeed + phase;
  const walk = Math.sin(t);
  const walkOpp = Math.sin(t + Math.PI);
  const bob = Math.abs(Math.sin(t));

  resetPart(parts.torso);
  resetPart(parts.head);
  resetPart(parts.eyeGroup);
  resetPart(parts.leftArm);
  resetPart(parts.rightArm);
  resetPart(parts.leftLeg);
  resetPart(parts.rightLeg);

  group.position.y = bob * 0.035 * power;
  group.rotation.z = walk * 0.025 * power;

  parts.torso.rotation.x += walk * 0.035 * power;
  parts.torso.rotation.z += walk * 0.035 * power;

  parts.head.rotation.y += walk * 0.08 * power;
  parts.head.rotation.z += walkOpp * 0.035 * power;

  parts.eyeGroup.position.copy(parts.head.position);
  parts.eyeGroup.rotation.copy(parts.head.rotation);

  parts.leftArm.rotation.x += walkOpp * 0.55 * power;
  parts.rightArm.rotation.x += walk * 0.55 * power;

  parts.leftLeg.rotation.x += walk * 0.38 * power;
  parts.rightLeg.rotation.x += walkOpp * 0.38 * power;

  // Slight zombie drag/shuffle
  parts.leftLeg.position.z += walk * 0.05 * power;
  parts.rightLeg.position.z += walkOpp * 0.05 * power;

  if (group.userData.typeName === "GOLIATH") {
    parts.leftArm.rotation.x -= 0.25;
    parts.rightArm.rotation.x -= 0.25;
    group.rotation.z *= 0.5;
  }

  if (group.userData.typeName === "RUNNER") {
    parts.torso.rotation.x += 0.18;
    parts.head.rotation.x += 0.08;
  }

  if (group.userData.typeName === "EXPLODER") {
    const pulse = 1 + Math.sin(timeSeconds * 9 + phase) * 0.035;
    parts.torso.scale.x *= pulse;
    parts.torso.scale.z *= pulse;
  }
}