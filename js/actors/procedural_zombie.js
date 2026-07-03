// js/actors/procedural_zombie.js
// Procedural zombie V2: mixed primitive, low-poly zombie visuals for Khadija's Arena.
import * as THREE from 'three';

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makeStandardMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true,
    ...extra
  });
}

function makeBasicMaterial(color, extra = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    ...extra
  });
}

function markProcedural(object, name) {
  object.name = name;
  object.castShadow = false;
  object.receiveShadow = false;
  object.frustumCulled = true;
  object.userData.keepMaterial = true;
  object.userData.isProceduralZombie = true;
  object.userData.basePosition = object.position.clone();
  object.userData.baseRotation = object.rotation.clone();
  object.userData.baseScale = object.scale.clone();
  return object;
}

function makePart(name, geometry, material, position, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.rotation.copy(rotation);
  mesh.scale.copy(scale);
  return markProcedural(mesh, name);
}

function makeBox(name, w, h, d, material, position, rotation = new THREE.Euler()) {
  return makePart(name, new THREE.BoxGeometry(w, h, d), material, position, rotation);
}

function makeCylinder(name, radiusTop, radiusBottom, height, material, position, rotation = new THREE.Euler(), segments = 6) {
  return makePart(name, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material, position, rotation);
}

function makePivot(name, position, rotation = new THREE.Euler()) {
  const pivot = new THREE.Group();
  pivot.position.copy(position);
  pivot.rotation.copy(rotation);
  return markProcedural(pivot, name);
}

function resetPart(part) {
  if (!part) return;
  const basePos = part.userData.basePosition;
  const baseRot = part.userData.baseRotation;
  if (basePos) part.position.copy(basePos);
  if (baseRot) part.rotation.copy(baseRot);
}

function setPartScale(part, x, y, z) {
  if (!part) return;
  part.scale.set(x, y, z);
  part.userData.baseScale = part.scale.clone();
}

function addHeadFlag(object) {
  object.userData.isHead = true;
  object.traverse?.((child) => {
    child.userData.isHead = true;
  });
}

export function createProceduralZombieVisual(options = {}) {
  const group = new THREE.Group();
  group.name = "procedural_zombie_visual";

  // Align procedural art front with gameplay enemy forward direction.
  group.rotation.y = Math.PI;
  group.userData.baseYaw = Math.PI;

  const bodyColor = options.color ?? 0x7fa06b;
  const widthMul = rand(0.92, 1.12);
  const heightMul = rand(0.94, 1.08);
  const crooked = rand(-0.08, 0.08);
  const asym = pick([-1, 1]);

  const clothColor = pick([0x25251f, 0x2d2824, 0x1f2b2d, 0x31262c, 0x27311f]);
  const pantsColor = pick([0x15191c, 0x1e2428, 0x241f1a, 0x17171c]);
  const woundColor = pick([0x4a0505, 0x5b0b08, 0x3d0507]);
  const boneColor = pick([0xd5c8a0, 0xc6b58c, 0xe2d6b2]);

  const bodyMaterial = makeStandardMaterial(bodyColor);
  const headMaterial = makeStandardMaterial(bodyColor);
  const clothMaterial = makeStandardMaterial(clothColor);
  const pantsMaterial = makeStandardMaterial(pantsColor);
  const sleeveMaterial = makeStandardMaterial(clothColor - 0x080808 > 0 ? clothColor - 0x080808 : clothColor);
  const bootMaterial = makeStandardMaterial(0x070707);
  const hairMaterial = makeStandardMaterial(pick([0x101610, 0x17120f, 0x1a151c]));
  const armorMaterial = makeStandardMaterial(pick([0x46515e, 0x5a5267, 0x51473f]), { metalness: 0.05 });
  const woundMaterial = makeStandardMaterial(woundColor, { emissive: new THREE.Color(woundColor), emissiveIntensity: 0.08 });
  const boneMaterial = makeStandardMaterial(boneColor);
  const mouthMaterial = makeBasicMaterial(0x020202);
  const eyeMaterial = makeBasicMaterial(0xff2222);
  const eyeGlowMaterial = makeBasicMaterial(0xff2222, {
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const toxicMaterial = makeBasicMaterial(0x49ff5a, {
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const mutationMaterial = makeStandardMaterial(0xff6b1a, { emissive: new THREE.Color(0xff3a00), emissiveIntensity: 0.4 });
  const rangedMaterial = makeStandardMaterial(0x35f0ff, { emissive: new THREE.Color(0x00b8ff), emissiveIntensity: 0.35 });

  // ── Core body silhouette ──
  const torso = makeBox(
    "procedural_zombie_torso",
    0.62 * widthMul,
    0.82 * heightMul,
    0.36,
    clothMaterial,
    new THREE.Vector3(0, 1.20 * heightMul, 0),
    new THREE.Euler(rand(-0.10, -0.03), rand(-0.03, 0.03), rand(-0.08, 0.08))
  );

  const chestSkin = makeBox(
    "procedural_zombie_torn_chest_skin",
    0.23 * widthMul,
    0.44 * heightMul,
    0.035,
    bodyMaterial,
    new THREE.Vector3(0.14 * asym * widthMul, 0.04 * heightMul, -0.205)
  );
  torso.add(chestSkin);

  const chestWound = makeBox(
    "procedural_zombie_chest_wound",
    0.18 * widthMul,
    0.30 * heightMul,
    0.04,
    woundMaterial,
    new THREE.Vector3(-0.16 * asym * widthMul, -0.04 * heightMul, -0.215)
  );
  torso.add(chestWound);

  const shoulderBar = makeBox(
    "procedural_zombie_shoulders",
    0.88 * widthMul,
    0.16,
    0.44,
    clothMaterial,
    new THREE.Vector3(0, 0.42 * heightMul, -0.01),
    new THREE.Euler(0, 0, rand(-0.04, 0.04))
  );
  torso.add(shoulderBar);

  const collarLeft = makeBox(
    "procedural_zombie_collar_left",
    0.24 * widthMul,
    0.08,
    0.05,
    clothMaterial,
    new THREE.Vector3(-0.12 * widthMul, 0.33 * heightMul, -0.225),
    new THREE.Euler(0, 0, 0.26)
  );
  const collarRight = makeBox(
    "procedural_zombie_collar_right",
    0.24 * widthMul,
    0.08,
    0.05,
    clothMaterial,
    new THREE.Vector3(0.12 * widthMul, 0.33 * heightMul, -0.225),
    new THREE.Euler(0, 0, -0.26)
  );
  const shirtRipA = makeBox(
    "procedural_zombie_shirt_rip_a",
    0.34 * widthMul,
    0.045,
    0.045,
    mouthMaterial,
    new THREE.Vector3(-0.08 * asym * widthMul, 0.12 * heightMul, -0.245),
    new THREE.Euler(0, 0, 0.50 * asym)
  );
  const shirtRipB = makeBox(
    "procedural_zombie_shirt_rip_b",
    0.30 * widthMul,
    0.045,
    0.045,
    mouthMaterial,
    new THREE.Vector3(0.03 * asym * widthMul, -0.10 * heightMul, -0.245),
    new THREE.Euler(0, 0, -0.42 * asym)
  );
  const toxicChestNode = makeBox(
    "procedural_zombie_toxic_chest_node",
    0.085,
    0.085,
    0.05,
    toxicMaterial,
    new THREE.Vector3(0.22 * asym * widthMul, 0.18 * heightMul, -0.255)
  );
  const goliathChestPlate = makeBox(
    "procedural_zombie_goliath_chest_plate",
    0.58 * widthMul,
    0.36,
    0.06,
    armorMaterial,
    new THREE.Vector3(0, 0.03 * heightMul, -0.265),
    new THREE.Euler(0, 0, rand(-0.03, 0.03))
  );
  const goliathShoulderLeft = makeBox(
    "procedural_zombie_goliath_left_pauldron",
    0.30,
    0.20,
    0.36,
    armorMaterial,
    new THREE.Vector3(-0.48 * widthMul, 0.39 * heightMul, -0.02),
    new THREE.Euler(0, 0, 0.10)
  );
  const goliathShoulderRight = makeBox(
    "procedural_zombie_goliath_right_pauldron",
    0.30,
    0.20,
    0.36,
    armorMaterial,
    new THREE.Vector3(0.48 * widthMul, 0.39 * heightMul, -0.02),
    new THREE.Euler(0, 0, -0.10)
  );
  goliathChestPlate.visible = false;
  goliathShoulderLeft.visible = false;
  goliathShoulderRight.visible = false;
  torso.add(collarLeft, collarRight, shirtRipA, shirtRipB, toxicChestNode, goliathChestPlate, goliathShoulderLeft, goliathShoulderRight);

  const pelvis = makeBox(
    "procedural_zombie_pelvis",
    0.52 * widthMul,
    0.22,
    0.35,
    pantsMaterial,
    new THREE.Vector3(0, 0.72 * heightMul, 0),
    new THREE.Euler(0, 0, rand(-0.04, 0.04))
  );

  const neck = makeCylinder(
    "procedural_zombie_neck",
    0.13 * widthMul,
    0.15 * widthMul,
    0.20,
    bodyMaterial,
    new THREE.Vector3(0.02 * asym, 1.64 * heightMul, 0),
    new THREE.Euler(0.05, 0, rand(-0.05, 0.05)),
    6
  );

  const head = makeBox(
    "procedural_zombie_head",
    0.62 * widthMul,
    0.58,
    0.52,
    headMaterial,
    new THREE.Vector3(crooked, 1.88 * heightMul, -0.04),
    new THREE.Euler(rand(-0.05, 0.08), rand(-0.10, 0.10), rand(-0.08, 0.08))
  );
  addHeadFlag(head);

  const hairChunkA = makeBox(
    "procedural_zombie_hair_chunk_a",
    0.28 * widthMul,
    0.15,
    0.22,
    hairMaterial,
    new THREE.Vector3(-0.17 * widthMul, 0.35, -0.08),
    new THREE.Euler(0.08, 0, 0.35)
  );
  const hairChunkB = makeBox(
    "procedural_zombie_hair_chunk_b",
    0.22 * widthMul,
    0.18,
    0.20,
    hairMaterial,
    new THREE.Vector3(0.06 * widthMul, 0.39, -0.05),
    new THREE.Euler(0.05, 0, -0.28)
  );
  const hairChunkC = makeBox(
    "procedural_zombie_hair_chunk_c",
    0.18 * widthMul,
    0.12,
    0.18,
    hairMaterial,
    new THREE.Vector3(0.24 * widthMul, 0.32, -0.03),
    new THREE.Euler(0.02, 0.10, -0.45)
  );
  const missingSkullPlate = makeBox(
    "procedural_zombie_missing_skull_plate",
    0.25,
    0.075,
    0.045,
    woundMaterial,
    new THREE.Vector3(-0.13 * asym * widthMul, 0.30, -0.305),
    new THREE.Euler(0, 0, rand(-0.18, 0.18))
  );
  addHeadFlag(hairChunkA);
  addHeadFlag(hairChunkB);
  addHeadFlag(hairChunkC);
  addHeadFlag(missingSkullPlate);
  head.add(hairChunkA, hairChunkB, hairChunkC, missingSkullPlate);

  // ── Face details ──
  const brow = makeBox(
    "procedural_zombie_brow",
    0.46 * widthMul,
    0.08,
    0.055,
    headMaterial,
    new THREE.Vector3(0, 0.12, -0.30),
    new THREE.Euler(0, 0, rand(-0.04, 0.04))
  );
  const browShadow = makeBox(
    "procedural_zombie_brow_shadow",
    0.50 * widthMul,
    0.045,
    0.025,
    mouthMaterial,
    new THREE.Vector3(0, 0.075, -0.333)
  );
  const leftEyeGlow = makeBox(
    "procedural_zombie_left_eye_glow",
    0.18,
    0.13,
    0.025,
    eyeGlowMaterial,
    new THREE.Vector3(-0.15 * widthMul, 0.04, -0.365)
  );
  const rightEyeGlow = makeBox(
    "procedural_zombie_right_eye_glow",
    0.18,
    0.13,
    0.025,
    eyeGlowMaterial,
    new THREE.Vector3(0.15 * widthMul, 0.04, -0.365)
  );
  const leftEye = makeBox(
    "procedural_zombie_left_eye",
    0.12,
    0.07,
    0.04,
    eyeMaterial,
    new THREE.Vector3(-0.15 * widthMul, 0.04, -0.39)
  );
  const rightEye = makeBox(
    "procedural_zombie_right_eye",
    0.12,
    0.07,
    0.04,
    eyeMaterial,
    new THREE.Vector3(0.15 * widthMul, 0.04, -0.39)
  );
  const nose = makeBox(
    "procedural_zombie_nose",
    0.09,
    0.13,
    0.08,
    headMaterial,
    new THREE.Vector3(0.01 * asym, -0.045, -0.335)
  );
  const mouth = makeBox(
    "procedural_zombie_mouth",
    0.30 * widthMul,
    0.065,
    0.045,
    mouthMaterial,
    new THREE.Vector3(0.02 * asym, -0.19, -0.325),
    new THREE.Euler(0, 0, rand(-0.03, 0.03))
  );
  const toothA = makeBox("procedural_zombie_tooth_a", 0.035, 0.07, 0.025, boneMaterial, new THREE.Vector3(-0.07 * widthMul, -0.205, -0.355));
  const toothB = makeBox("procedural_zombie_tooth_b", 0.035, 0.055, 0.025, boneMaterial, new THREE.Vector3(0.03 * widthMul, -0.205, -0.355));
  const toothC = makeBox("procedural_zombie_tooth_c", 0.032, 0.05, 0.025, boneMaterial, new THREE.Vector3(0.11 * widthMul, -0.203, -0.355));
  const cheekCut = makeBox(
    "procedural_zombie_cheek_cut",
    0.18,
    0.045,
    0.03,
    woundMaterial,
    new THREE.Vector3(-0.21 * asym * widthMul, -0.07, -0.35),
    new THREE.Euler(0, 0, 0.25 * asym)
  );
  const skullPatch = makeBox(
    "procedural_zombie_skull_patch",
    0.24,
    0.12,
    0.03,
    woundMaterial,
    new THREE.Vector3(-0.13 * asym * widthMul, 0.25, -0.32),
    new THREE.Euler(0, 0, rand(-0.12, 0.12))
  );

  addHeadFlag(brow);
  addHeadFlag(browShadow);
  addHeadFlag(leftEyeGlow);
  addHeadFlag(rightEyeGlow);
  addHeadFlag(leftEye);
  addHeadFlag(rightEye);
  addHeadFlag(nose);
  addHeadFlag(mouth);
  addHeadFlag(toothA);
  addHeadFlag(toothB);
  addHeadFlag(toothC);
  addHeadFlag(cheekCut);
  addHeadFlag(skullPatch);
  head.add(brow, browShadow, leftEyeGlow, rightEyeGlow, leftEye, rightEye, nose, mouth, toothA, toothB, toothC, cheekCut, skullPatch);

  // ── Rib and mutation details ──
  const ribA = makeBox("procedural_zombie_rib_a", 0.22, 0.035, 0.035, boneMaterial, new THREE.Vector3(0.03 * asym, 0.17, -0.235), new THREE.Euler(0, 0, 0.12 * asym));
  const ribB = makeBox("procedural_zombie_rib_b", 0.20, 0.035, 0.035, boneMaterial, new THREE.Vector3(0.04 * asym, 0.07, -0.238), new THREE.Euler(0, 0, 0.08 * asym));
  const ribC = makeBox("procedural_zombie_rib_c", 0.18, 0.035, 0.035, boneMaterial, new THREE.Vector3(0.04 * asym, -0.03, -0.238), new THREE.Euler(0, 0, 0.05 * asym));
  torso.add(ribA, ribB, ribC);

  const exploderCore = makeBox(
    "procedural_zombie_exploder_core",
    0.22,
    0.34,
    0.055,
    mutationMaterial,
    new THREE.Vector3(0, -0.02, -0.245)
  );
  exploderCore.visible = false;
  torso.add(exploderCore);

  const exploderCoreGlow = makeBox(
    "procedural_zombie_exploder_core_glow",
    0.30,
    0.43,
    0.035,
    toxicMaterial,
    new THREE.Vector3(0, -0.02, -0.285)
  );
  const exploderFuseA = makeCylinder(
    "procedural_zombie_exploder_fuse_a",
    0.018,
    0.018,
    0.32,
    mutationMaterial,
    new THREE.Vector3(-0.17 * widthMul, 0.25 * heightMul, -0.285),
    new THREE.Euler(0.30, 0.12, 0.58),
    5
  );
  const exploderFuseB = makeCylinder(
    "procedural_zombie_exploder_fuse_b",
    0.016,
    0.016,
    0.28,
    mutationMaterial,
    new THREE.Vector3(0.18 * widthMul, -0.24 * heightMul, -0.285),
    new THREE.Euler(-0.28, -0.08, -0.52),
    5
  );
  exploderCoreGlow.visible = false;
  exploderFuseA.visible = false;
  exploderFuseB.visible = false;
  torso.add(exploderCoreGlow, exploderFuseA, exploderFuseB);

  const rangedBand = makeBox(
    "procedural_zombie_ranged_face_band",
    0.58 * widthMul,
    0.10,
    0.045,
    rangedMaterial,
    new THREE.Vector3(0, 0.04, -0.365)
  );
  rangedBand.visible = false;
  addHeadFlag(rangedBand);
  head.add(rangedBand);

  const rangedLens = makeBox(
    "procedural_zombie_ranged_lens",
    0.18,
    0.18,
    0.05,
    rangedMaterial,
    new THREE.Vector3(0.15 * widthMul, 0.045, -0.405)
  );
  const rangedAntenna = makeCylinder(
    "procedural_zombie_ranged_antenna",
    0.015,
    0.015,
    0.38,
    rangedMaterial,
    new THREE.Vector3(-0.23 * widthMul, 0.43, -0.03),
    new THREE.Euler(0.18, 0, -0.35),
    5
  );
  const runnerSpikeA = makeBox(
    "procedural_zombie_runner_spike_a",
    0.08,
    0.22,
    0.10,
    toxicMaterial,
    new THREE.Vector3(-0.22 * widthMul, 0.44, -0.09),
    new THREE.Euler(0.12, 0, 0.22)
  );
  const runnerSpikeB = makeBox(
    "procedural_zombie_runner_spike_b",
    0.08,
    0.20,
    0.10,
    toxicMaterial,
    new THREE.Vector3(0.22 * widthMul, 0.42, -0.09),
    new THREE.Euler(0.12, 0, -0.22)
  );
  rangedLens.visible = false;
  rangedAntenna.visible = false;
  runnerSpikeA.visible = false;
  runnerSpikeB.visible = false;
  addHeadFlag(rangedLens);
  addHeadFlag(rangedAntenna);
  addHeadFlag(runnerSpikeA);
  addHeadFlag(runnerSpikeB);
  head.add(rangedLens, rangedAntenna, runnerSpikeA, runnerSpikeB);

  // ── Arms: long, hanging, asymmetrical zombie limbs ──
  const leftArm = makePivot(
    "procedural_zombie_left_arm",
    new THREE.Vector3(-0.48 * widthMul, 1.48 * heightMul, -0.02),
    new THREE.Euler(rand(-0.24, -0.12), 0, rand(0.10, 0.22))
  );
  const rightArm = makePivot(
    "procedural_zombie_right_arm",
    new THREE.Vector3(0.48 * widthMul, 1.48 * heightMul, -0.02),
    new THREE.Euler(rand(-0.24, -0.12), 0, rand(-0.22, -0.10))
  );

  const leftSleeve = makeBox("procedural_zombie_left_sleeve", 0.22, 0.28, 0.22, sleeveMaterial, new THREE.Vector3(-0.03, -0.16, 0));
  const rightSleeve = makeBox("procedural_zombie_right_sleeve", 0.22, 0.28, 0.22, sleeveMaterial, new THREE.Vector3(0.03, -0.16, 0));
  const leftUpperArm = makeCylinder("procedural_zombie_left_upper_arm", 0.085, 0.075, 0.40, bodyMaterial, new THREE.Vector3(-0.06, -0.40, 0.01), new THREE.Euler(0.08, 0, 0.05), 6);
  const rightUpperArm = makeCylinder("procedural_zombie_right_upper_arm", 0.085, 0.075, 0.40, bodyMaterial, new THREE.Vector3(0.06, -0.40, 0.01), new THREE.Euler(-0.08, 0, -0.05), 6);
  const leftForearm = makeCylinder("procedural_zombie_left_forearm", 0.075, 0.065, 0.46, bodyMaterial, new THREE.Vector3(-0.10, -0.78, 0.05), new THREE.Euler(0.18, 0, -0.04), 6);
  const rightForearm = makeCylinder("procedural_zombie_right_forearm", 0.075, 0.065, 0.46, bodyMaterial, new THREE.Vector3(0.10, -0.78, 0.05), new THREE.Euler(0.18, 0, 0.04), 6);
  const leftHand = makeBox("procedural_zombie_left_hand", 0.20, 0.15, 0.20, bodyMaterial, new THREE.Vector3(-0.13, -1.06, 0.09), new THREE.Euler(0, 0, -0.08));
  const rightHand = makeBox("procedural_zombie_right_hand", 0.20, 0.15, 0.20, bodyMaterial, new THREE.Vector3(0.13, -1.06, 0.09), new THREE.Euler(0, 0, 0.08));
  const leftFingerA = makeBox("procedural_zombie_left_finger_a", 0.035, 0.12, 0.035, bodyMaterial, new THREE.Vector3(-0.075, -0.12, -0.03), new THREE.Euler(0.10, 0, -0.18));
  const leftFingerB = makeBox("procedural_zombie_left_finger_b", 0.035, 0.13, 0.035, bodyMaterial, new THREE.Vector3(-0.020, -0.13, -0.04), new THREE.Euler(0.06, 0, -0.03));
  const leftFingerC = makeBox("procedural_zombie_left_finger_c", 0.035, 0.11, 0.035, bodyMaterial, new THREE.Vector3(0.038, -0.12, -0.03), new THREE.Euler(0.10, 0, 0.14));
  const rightFingerA = makeBox("procedural_zombie_right_finger_a", 0.035, 0.12, 0.035, bodyMaterial, new THREE.Vector3(-0.038, -0.12, -0.03), new THREE.Euler(0.10, 0, -0.14));
  const rightFingerB = makeBox("procedural_zombie_right_finger_b", 0.035, 0.13, 0.035, bodyMaterial, new THREE.Vector3(0.020, -0.13, -0.04), new THREE.Euler(0.06, 0, 0.03));
  const rightFingerC = makeBox("procedural_zombie_right_finger_c", 0.035, 0.11, 0.035, bodyMaterial, new THREE.Vector3(0.075, -0.12, -0.03), new THREE.Euler(0.10, 0, 0.18));
  leftHand.add(leftFingerA, leftFingerB, leftFingerC);
  rightHand.add(rightFingerA, rightFingerB, rightFingerC);
  const leftArmWound = makeBox("procedural_zombie_left_arm_wound", 0.10, 0.18, 0.035, woundMaterial, new THREE.Vector3(-0.18, -0.72, -0.045));
  const rightArmBone = makeCylinder("procedural_zombie_right_arm_bone", 0.035, 0.035, 0.32, boneMaterial, new THREE.Vector3(0.16, -0.72, -0.055), new THREE.Euler(0.22, 0, 0.05), 6);

  leftArm.add(leftSleeve, leftUpperArm, leftForearm, leftHand, leftArmWound);
  rightArm.add(rightSleeve, rightUpperArm, rightForearm, rightHand, rightArmBone);

  // ── Legs: pants, exposed shin, boots ──
  const leftLeg = makePivot(
    "procedural_zombie_left_leg",
    new THREE.Vector3(-0.18 * widthMul, 0.80 * heightMul, 0),
    new THREE.Euler(rand(-0.03, 0.03), 0, rand(-0.08, 0.08))
  );
  const rightLeg = makePivot(
    "procedural_zombie_right_leg",
    new THREE.Vector3(0.18 * widthMul, 0.80 * heightMul, 0),
    new THREE.Euler(rand(-0.03, 0.03), 0, rand(-0.08, 0.08))
  );

  const leftThigh = makeBox("procedural_zombie_left_thigh", 0.22, 0.40, 0.24, pantsMaterial, new THREE.Vector3(0, -0.22, 0));
  const rightThigh = makeBox("procedural_zombie_right_thigh", 0.22, 0.40, 0.24, pantsMaterial, new THREE.Vector3(0, -0.22, 0));
  const leftShin = makeBox("procedural_zombie_left_shin", 0.18, 0.44, 0.20, pantsMaterial, new THREE.Vector3(-0.02, -0.64, 0.01), new THREE.Euler(0.04, 0, -0.04));
  const rightShin = makeBox("procedural_zombie_right_shin", 0.18, 0.44, 0.20, pantsMaterial, new THREE.Vector3(0.02, -0.64, 0.01), new THREE.Euler(-0.04, 0, 0.04));
  const leftKneeSkin = makeBox("procedural_zombie_left_knee_skin", 0.16, 0.12, 0.035, bodyMaterial, new THREE.Vector3(0.02, -0.43, -0.13));
  const rightKneeWound = makeBox("procedural_zombie_right_knee_wound", 0.13, 0.13, 0.035, woundMaterial, new THREE.Vector3(-0.02, -0.43, -0.13));
  const leftBoot = makeBox("procedural_zombie_left_boot", 0.27, 0.16, 0.38, bootMaterial, new THREE.Vector3(-0.02, -0.93, 0.08), new THREE.Euler(0.02, 0, -0.03));
  const rightBoot = makeBox("procedural_zombie_right_boot", 0.27, 0.16, 0.38, bootMaterial, new THREE.Vector3(0.02, -0.93, 0.08), new THREE.Euler(-0.02, 0, 0.03));
  const leftBootSole = makeBox("procedural_zombie_left_boot_sole", 0.33, 0.06, 0.46, bootMaterial, new THREE.Vector3(0.02, -0.08, 0.02));
  const rightBootSole = makeBox("procedural_zombie_right_boot_sole", 0.33, 0.06, 0.46, bootMaterial, new THREE.Vector3(-0.02, -0.08, 0.02));
  const leftPantsCuff = makeBox("procedural_zombie_left_pants_cuff", 0.22, 0.07, 0.22, pantsMaterial, new THREE.Vector3(-0.03, -0.79, -0.01), new THREE.Euler(0, 0, -0.08));
  const rightPantsCuff = makeBox("procedural_zombie_right_pants_cuff", 0.22, 0.07, 0.22, pantsMaterial, new THREE.Vector3(0.03, -0.79, -0.01), new THREE.Euler(0, 0, 0.08));
  leftBoot.add(leftBootSole);
  rightBoot.add(rightBootSole);

  leftLeg.add(leftThigh, leftShin, leftKneeSkin, leftPantsCuff, leftBoot);
  rightLeg.add(rightThigh, rightShin, rightKneeWound, rightPantsCuff, rightBoot);

  group.add(torso, pelvis, neck, head, leftArm, rightArm, leftLeg, rightLeg);

  group.userData.bodyMaterial = bodyMaterial;
  group.userData.headMaterial = headMaterial;
  group.userData.clothMaterial = clothMaterial;
  group.userData.pantsMaterial = pantsMaterial;
  group.userData.eyeMaterial = eyeMaterial;
  group.userData.mouthMaterial = mouthMaterial;
  group.userData.woundMaterial = woundMaterial;
  group.userData.boneMaterial = boneMaterial;
  group.userData.bootMaterial = bootMaterial;
  group.userData.hairMaterial = hairMaterial;
  group.userData.armorMaterial = armorMaterial;
  group.userData.eyeGlowMaterial = eyeGlowMaterial;
  group.userData.toxicMaterial = toxicMaterial;
  group.userData.mutationMaterial = mutationMaterial;
  group.userData.rangedMaterial = rangedMaterial;

  group.userData.parts = {
    torso,
    chestSkin,
    chestWound,
    shoulderBar,
    collarLeft,
    collarRight,
    shirtRipA,
    shirtRipB,
    toxicChestNode,
    goliathChestPlate,
    goliathShoulderLeft,
    goliathShoulderRight,
    pelvis,
    neck,
    head,
    hairChunkA,
    hairChunkB,
    hairChunkC,
    missingSkullPlate,
    brow,
    browShadow,
    leftEyeGlow,
    rightEyeGlow,
    leftEye,
    rightEye,
    nose,
    mouth,
    toothA,
    toothB,
    toothC,
    cheekCut,
    skullPatch,
    ribA,
    ribB,
    ribC,
    exploderCore,
    exploderCoreGlow,
    exploderFuseA,
    exploderFuseB,
    rangedBand,
    rangedLens,
    rangedAntenna,
    runnerSpikeA,
    runnerSpikeB,
    leftArm,
    rightArm,
    leftSleeve,
    rightSleeve,
    leftUpperArm,
    rightUpperArm,
    leftForearm,
    rightForearm,
    leftHand,
    rightHand,
    leftFingerA,
    leftFingerB,
    leftFingerC,
    rightFingerA,
    rightFingerB,
    rightFingerC,
    leftArmWound,
    rightArmBone,
    leftLeg,
    rightLeg,
    leftThigh,
    rightThigh,
    leftShin,
    rightShin,
    leftKneeSkin,
    rightKneeWound,
    leftBoot,
    rightBoot,
    leftBootSole,
    rightBootSole,
    leftPantsCuff,
    rightPantsCuff
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
  const parts = group.userData.parts;
  if (!parts) return;

  group.userData.typeName = typeName;

  const bodyMaterial = group.userData.bodyMaterial;
  const headMaterial = group.userData.headMaterial;
  const eyeMaterial = group.userData.eyeMaterial;
  const eyeGlowMaterial = group.userData.eyeGlowMaterial;
  const toxicMaterial = group.userData.toxicMaterial;
  const mutationMaterial = group.userData.mutationMaterial;
  const rangedMaterial = group.userData.rangedMaterial;

  if (bodyMaterial) {
    bodyMaterial.color.setHex(color);
    bodyMaterial.emissive.setHex(color);
    bodyMaterial.emissiveIntensity = 0.035;
  }

  if (headMaterial) {
    headMaterial.color.setHex(color);
    headMaterial.emissive.setHex(color);
    headMaterial.emissiveIntensity = 0.05;
  }

  if (mutationMaterial) {
    mutationMaterial.emissiveIntensity = typeName === "EXPLODER" ? 0.8 : 0.35;
  }

  if (rangedMaterial) {
    rangedMaterial.emissiveIntensity = typeName === "RANGED" ? 0.75 : 0.25;
  }

  let eyeColor = 0xff3333;
  let accentColor = 0x49ff5a;

  if (typeName === "RUNNER") {
    eyeColor = 0xff2222;
    accentColor = 0x6cff5e;
  }
  else if (typeName === "GOLIATH") {
    eyeColor = 0xffaa00;
    accentColor = 0xffaa00;
  }
  else if (typeName === "EXPLODER") {
    eyeColor = 0xff5500;
    accentColor = 0xff6b1a;
  }
  else if (typeName === "RANGED") {
    eyeColor = 0x00ffff;
    accentColor = 0x00ffff;
  }

  if (eyeMaterial) {
    eyeMaterial.color.setHex(eyeColor);
  }

  if (eyeGlowMaterial) {
    eyeGlowMaterial.color.setHex(eyeColor);
    eyeGlowMaterial.opacity = typeName === "GOLIATH" ? 0.18 : 0.32;
  }

  if (toxicMaterial) {
    toxicMaterial.color.setHex(accentColor);
  }

  // Reset local scale. The main enemy group handles actual enemy config.scale.
  group.scale.set(1, 1, 1);
  setPartScale(parts.torso, 1, 1, 1);
  setPartScale(parts.pelvis, 1, 1, 1);
  setPartScale(parts.neck, 1, 1, 1);
  setPartScale(parts.head, 1, 1, 1);
  setPartScale(parts.leftArm, 1, 1, 1);
  setPartScale(parts.rightArm, 1, 1, 1);
  setPartScale(parts.leftLeg, 1, 1, 1);
  setPartScale(parts.rightLeg, 1, 1, 1);

  parts.exploderCore.visible = typeName === "EXPLODER";
  parts.exploderCoreGlow.visible = typeName === "EXPLODER";
  parts.exploderFuseA.visible = typeName === "EXPLODER";
  parts.exploderFuseB.visible = typeName === "EXPLODER";
  parts.rangedBand.visible = typeName === "RANGED";
  parts.rangedLens.visible = typeName === "RANGED";
  parts.rangedAntenna.visible = typeName === "RANGED";
  parts.runnerSpikeA.visible = typeName === "RUNNER";
  parts.runnerSpikeB.visible = typeName === "RUNNER";
  parts.goliathChestPlate.visible = typeName === "GOLIATH";
  parts.goliathShoulderLeft.visible = typeName === "GOLIATH";
  parts.goliathShoulderRight.visible = typeName === "GOLIATH";
  parts.toxicChestNode.visible = typeName !== "GOLIATH";
  parts.ribA.visible = typeName !== "GOLIATH";
  parts.ribB.visible = typeName !== "GOLIATH";
  parts.ribC.visible = typeName !== "GOLIATH";
  parts.rightArmBone.visible = typeName !== "GOLIATH";

  if (typeName === "RUNNER") {
    group.userData.motionSpeed = 1.45;
    group.userData.motionPower = 1.18;
    setPartScale(parts.torso, 0.82, 1.18, 0.82);
    setPartScale(parts.pelvis, 0.82, 0.90, 0.82);
    setPartScale(parts.head, 0.90, 0.92, 0.90);
    setPartScale(parts.leftArm, 0.78, 1.14, 0.78);
    setPartScale(parts.rightArm, 0.78, 1.14, 0.78);
    setPartScale(parts.leftLeg, 0.76, 1.22, 0.76);
    setPartScale(parts.rightLeg, 0.76, 1.22, 0.76);
  }

  else if (typeName === "GOLIATH") {
    group.userData.motionSpeed = 0.62;
    group.userData.motionPower = 0.70;
    setPartScale(parts.torso, 1.35, 1.16, 1.25);
    setPartScale(parts.pelvis, 1.28, 1.05, 1.18);
    setPartScale(parts.neck, 1.2, 1.05, 1.2);
    setPartScale(parts.head, 1.18, 1.05, 1.15);
    setPartScale(parts.leftArm, 1.35, 1.22, 1.35);
    setPartScale(parts.rightArm, 1.35, 1.22, 1.35);
    setPartScale(parts.leftLeg, 1.20, 1.08, 1.20);
    setPartScale(parts.rightLeg, 1.20, 1.08, 1.20);
  }

  else if (typeName === "EXPLODER") {
    group.userData.motionSpeed = 1.0;
    group.userData.motionPower = 0.90;
    setPartScale(parts.torso, 1.20, 0.96, 1.28);
    setPartScale(parts.pelvis, 1.10, 0.95, 1.10);
    setPartScale(parts.head, 1.03, 0.98, 1.03);
    setPartScale(parts.leftArm, 0.95, 1.02, 0.95);
    setPartScale(parts.rightArm, 0.95, 1.02, 0.95);
  }

  else if (typeName === "RANGED") {
    group.userData.motionSpeed = 0.82;
    group.userData.motionPower = 0.68;
    setPartScale(parts.torso, 0.88, 1.12, 0.86);
    setPartScale(parts.pelvis, 0.86, 0.94, 0.84);
    setPartScale(parts.head, 0.94, 1.03, 0.94);
    setPartScale(parts.leftArm, 0.85, 1.08, 0.85);
    setPartScale(parts.rightArm, 1.04, 1.18, 1.04);
    setPartScale(parts.leftLeg, 0.86, 1.10, 0.86);
    setPartScale(parts.rightLeg, 0.86, 1.10, 0.86);
  }

  else {
    group.userData.motionSpeed = 1.0;
    group.userData.motionPower = 1.0;
  }
}

export function updateProceduralZombieMotion(group, timeSeconds, speed = 1.0) {
  if (!group) return;
  const parts = group.userData.parts;
  if (!parts) return;

  const phase = group.userData.motionPhase ?? 0;
  const typeSpeed = group.userData.motionSpeed ?? 1.0;
  const power = group.userData.motionPower ?? 1.0;
  const typeName = group.userData.typeName ?? "SHAMBLER";

  const t = timeSeconds * 7.0 * speed * typeSpeed + phase;
  const slowT = timeSeconds * 2.0 + phase;
  const walk = Math.sin(t);
  const walkOpp = Math.sin(t + Math.PI);
  const bob = Math.abs(Math.sin(t));

  resetPart(parts.torso);
  resetPart(parts.pelvis);
  resetPart(parts.neck);
  resetPart(parts.head);
  resetPart(parts.leftArm);
  resetPart(parts.rightArm);
  resetPart(parts.leftLeg);
  resetPart(parts.rightLeg);
  resetPart(parts.rangedAntenna);
  resetPart(parts.runnerSpikeA);
  resetPart(parts.runnerSpikeB);
  resetPart(parts.exploderFuseA);
  resetPart(parts.exploderFuseB);

  group.position.y = bob * 0.032 * power;
  group.rotation.y = group.userData.baseYaw ?? Math.PI;
  group.rotation.z = walk * 0.025 * power;

  const eyePulse = 1 + Math.sin(timeSeconds * 8.0 + phase) * 0.055;
  parts.leftEyeGlow.scale.set(eyePulse, eyePulse, eyePulse);
  parts.rightEyeGlow.scale.set(eyePulse, eyePulse, eyePulse);
  parts.toxicChestNode.scale.set(eyePulse, eyePulse, eyePulse);

  parts.torso.rotation.x += walk * 0.035 * power;
  parts.torso.rotation.z += walk * 0.035 * power;
  parts.pelvis.rotation.z += walkOpp * 0.025 * power;
  parts.head.rotation.y += walk * 0.075 * power;
  parts.head.rotation.z += walkOpp * 0.035 * power;

  parts.leftArm.rotation.x += walkOpp * 0.58 * power;
  parts.rightArm.rotation.x += walk * 0.58 * power;
  parts.leftArm.rotation.z += walk * 0.055 * power;
  parts.rightArm.rotation.z += walkOpp * 0.055 * power;

  parts.leftLeg.rotation.x += walk * 0.38 * power;
  parts.rightLeg.rotation.x += walkOpp * 0.38 * power;
  parts.leftLeg.position.z += walk * 0.045 * power;
  parts.rightLeg.position.z += walkOpp * 0.045 * power;

  if (typeName === "GOLIATH") {
    parts.leftArm.rotation.x -= 0.22;
    parts.rightArm.rotation.x -= 0.22;
    group.rotation.z *= 0.45;
  }

  if (typeName === "RUNNER") {
    parts.torso.rotation.x += 0.20;
    parts.head.rotation.x += 0.10;
    parts.leftArm.rotation.x += 0.16;
    parts.rightArm.rotation.x += 0.16;
    const spikePulse = 1 + Math.sin(timeSeconds * 12 + phase) * 0.08;
    parts.runnerSpikeA.scale.set(spikePulse, 1.0 + (spikePulse - 1) * 1.8, spikePulse);
    parts.runnerSpikeB.scale.set(spikePulse, 1.0 + (spikePulse - 1) * 1.8, spikePulse);
  }

  if (typeName === "EXPLODER") {
    const pulse = 1 + Math.sin(timeSeconds * 9 + phase) * 0.045;
    const corePulse = 1 + Math.sin(timeSeconds * 11 + phase) * 0.12;
    parts.torso.scale.x = (parts.torso.userData.baseScale?.x ?? 1) * pulse;
    parts.torso.scale.z = (parts.torso.userData.baseScale?.z ?? 1) * pulse;
    parts.exploderCore.scale.set(corePulse, corePulse, corePulse);
    parts.exploderCoreGlow.scale.set(corePulse * 1.08, corePulse * 1.08, corePulse * 1.08);
    parts.exploderFuseA.rotation.z += Math.sin(timeSeconds * 13 + phase) * 0.05;
    parts.exploderFuseB.rotation.z += Math.sin(timeSeconds * 12 + phase) * 0.05;
  }

  if (typeName === "RANGED") {
    parts.head.rotation.y += Math.sin(slowT * 1.7) * 0.05;
    parts.rightArm.rotation.x -= 0.20;
    parts.rangedAntenna.rotation.z += Math.sin(timeSeconds * 5 + phase) * 0.10;
    parts.rangedLens.scale.set(eyePulse, eyePulse, eyePulse);
  }
}
