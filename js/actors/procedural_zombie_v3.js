// js/actors/procedural_zombie.js
// Procedural Zombie V3 — "PIXEL HORDE" Edition
//
// Key upgrades over V2:
//  • Box-geometry HEAD  — squared pixel-art skull matching reference
//  • Box-geometry TORSO — chunky barrel chest, no more oval cylinder
//  • Box UPPER ARMS + FOREARMS — thick block limbs
//  • Box THIGHS + SHINS — heavy boxy legs
//  • Bold WOUND PATCHES — 5 large red blotches across body/arms
//  • Dark EYE SOCKETS behind glowing pupils (new depth layer)
//  • Blood DRIP STRIPS — thin elongated boxes beneath wounds
//  • Box BOX EARS — flush with head, pixel look
//  • NEW type: CRAWLER — hunched fast scuttle on all-fours pose
//  • NEW export: triggerHitReaction(group, hitAngleY)
//  • NEW export: startDeathAnimation(group)
//  • NEW export: tickDeathAnimation(group, dt) → bool
//  • NEW export: getZombieTypeConfig(typeName)
//  • dt param added to updateProceduralZombieMotion (optional, default 0.016)

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────
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
  return new THREE.MeshBasicMaterial({ color, ...extra });
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
  object.userData.shapeScale = object.scale.clone();
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

function makeCylinder(name, rTop, rBot, height, material, position, rotation = new THREE.Euler(), segments = 6) {
  return makePart(name, new THREE.CylinderGeometry(rTop, rBot, height, segments), material, position, rotation);
}

function makeLowPolySphere(name, radius, material, position, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1), wSeg = 7, hSeg = 5) {
  return makePart(name, new THREE.SphereGeometry(radius, wSeg, hSeg), material, position, rotation, scale);
}

function makeOvalCylinder(name, rTop, rBot, height, dScale, material, position, rotation = new THREE.Euler(), segments = 7) {
  return makePart(
    name,
    new THREE.CylinderGeometry(rTop, rBot, height, segments),
    material,
    position,
    rotation,
    new THREE.Vector3(1, 1, dScale)
  );
}

function makePivot(name, position, rotation = new THREE.Euler()) {
  const pivot = new THREE.Group();
  pivot.position.copy(position);
  pivot.rotation.copy(rotation);
  return markProcedural(pivot, name);
}

function resetPart(part) {
  if (!part) return;
  const bp = part.userData.basePosition;
  const br = part.userData.baseRotation;
  if (bp) part.position.copy(bp);
  if (br) part.rotation.copy(br);
}

function setPartScale(part, x, y, z) {
  if (!part) return;
  const ss = part.userData.shapeScale ?? new THREE.Vector3(1, 1, 1);
  part.scale.set(ss.x * x, ss.y * y, ss.z * z);
  part.userData.baseScale = part.scale.clone();
}

function addHeadFlag(object) {
  object.userData.isHead = true;
  object.traverse?.((child) => { child.userData.isHead = true; });
}

// ─────────────────────────────────────────────────────────
//  MAIN FACTORY
// ─────────────────────────────────────────────────────────
export function createProceduralZombieVisual(options = {}) {
  const group = new THREE.Group();
  group.name = "procedural_zombie_visual";
  group.rotation.y = Math.PI;
  group.userData.baseYaw = Math.PI;

  const bodyColor = options.color ?? 0x7fa06b;
  const widthMul  = rand(0.92, 1.12);
  const heightMul = rand(0.94, 1.08);
  const crooked   = rand(-0.08, 0.08);
  const asym      = pick([-1, 1]);

  // ── Colour palette ──
  const pantsColor = pick([0x1a1e21, 0x212529, 0x1e1b17, 0x17181d]);
  const woundColor = pick([0x4a0505, 0x5b0b08, 0x3d0507]);
  const boneColor  = pick([0xd5c8a0, 0xc6b58c, 0xe2d6b2]);
  const hairColor  = pick([0x101610, 0x17120f, 0x1a151c]);
  const clothColor = pick([0x25251f, 0x2d2824, 0x1f2b2d, 0x31262c]);

  // ── Material palette ──
  const bodyMaterial     = makeStandardMaterial(bodyColor);
  const headMaterial     = makeStandardMaterial(bodyColor);
  const pantsMaterial    = makeStandardMaterial(pantsColor);
  const clothMaterial    = makeStandardMaterial(clothColor);
  const sleeveMaterial   = makeStandardMaterial(clothColor);
  const bootMaterial     = makeStandardMaterial(0x070707);
  const hairMaterial     = makeStandardMaterial(hairColor);
  const armorMaterial    = makeStandardMaterial(pick([0x46515e, 0x5a5267, 0x51473f]), { metalness: 0.05 });
  const woundMaterial    = makeStandardMaterial(woundColor, {
    emissive: new THREE.Color(woundColor), emissiveIntensity: 0.18
  });
  const boneMaterial     = makeStandardMaterial(boneColor);
  const mouthMaterial    = makeBasicMaterial(0x020202);
  // V3: Dark recessed eye socket behind the glowing pupils
  const eyeSocketMaterial = makeStandardMaterial(0x080606);
  const eyeMaterial      = makeBasicMaterial(0xff2222);
  const eyeGlowMaterial  = makeBasicMaterial(0xff2222, {
    transparent: true, opacity: 0.30,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const toxicMaterial    = makeBasicMaterial(0x49ff5a, {
    transparent: true, opacity: 0.88,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const mutationMaterial = makeStandardMaterial(0xff6b1a, {
    emissive: new THREE.Color(0xff3a00), emissiveIntensity: 0.4
  });
  const rangedMaterial   = makeStandardMaterial(0x35f0ff, {
    emissive: new THREE.Color(0x00b8ff), emissiveIntensity: 0.35
  });

  // ════════════════════════════════════════════════════════
  //  TORSO  — V3: BoxGeometry for chunky pixel-art silhouette
  // ════════════════════════════════════════════════════════
  const torso = makeBox(
    "procedural_zombie_torso",
    0.72 * widthMul,   // wide barrel chest
    0.92 * heightMul,  // tall enough for full upper body
    0.44,              // depth
    bodyMaterial,
    new THREE.Vector3(0, 1.22 * heightMul, 0),
    new THREE.Euler(rand(-0.10, -0.03), rand(-0.03, 0.03), rand(-0.08, 0.08))
  );

  // ── Bold wound patches (5 large blotches matching reference image) ──
  // Each is a clearly visible rectangle, not a thin sliver
  const woundA = makeBox("zombie_wound_a", 0.22, 0.18, 0.040, woundMaterial,
    new THREE.Vector3(-0.20 * widthMul, 0.28 * heightMul, -0.235));
  const woundB = makeBox("zombie_wound_b", 0.19, 0.22, 0.040, woundMaterial,
    new THREE.Vector3(0.16 * widthMul,  0.04 * heightMul, -0.237));
  const woundC = makeBox("zombie_wound_c", 0.21, 0.15, 0.040, woundMaterial,
    new THREE.Vector3(-0.04,           -0.24 * heightMul, -0.236));

  // Blood drip strips — thin elongated boxes dripping from wounds (V3 new)
  const bloodDripA = makeBox("zombie_blood_drip_a", 0.034, 0.16, 0.030, woundMaterial,
    new THREE.Vector3(-0.19 * widthMul, 0.14 * heightMul, -0.236));
  const bloodDripB = makeBox("zombie_blood_drip_b", 0.030, 0.13, 0.030, woundMaterial,
    new THREE.Vector3(0.17 * widthMul, -0.07 * heightMul, -0.237));

  // ── Exposed rib sections ──
  const ribA = makeBox("procedural_zombie_rib_a", 0.26, 0.038, 0.038, boneMaterial,
    new THREE.Vector3(0.03 * asym, 0.22 * heightMul, -0.232), new THREE.Euler(0, 0, 0.12 * asym));
  const ribB = makeBox("procedural_zombie_rib_b", 0.22, 0.032, 0.038, boneMaterial,
    new THREE.Vector3(0.04 * asym, 0.10 * heightMul, -0.233), new THREE.Euler(0, 0, 0.08 * asym));
  const ribC = makeBox("procedural_zombie_rib_c", 0.20, 0.030, 0.038, boneMaterial,
    new THREE.Vector3(0.04 * asym, -0.02 * heightMul, -0.233), new THREE.Euler(0, 0, 0.05 * asym));

  // ── Torn shirt remnants (minimal — exposing more skin per reference) ──
  const tornShirtLeft = makeBox("procedural_zombie_torn_shirt_left_panel",
    0.15 * widthMul, 0.34 * heightMul, 0.042, clothMaterial,
    new THREE.Vector3(-0.25 * widthMul, 0.10 * heightMul, -0.232), new THREE.Euler(0, 0, -0.16));
  const tornShirtRight = makeBox("procedural_zombie_torn_shirt_right_panel",
    0.13 * widthMul, 0.28 * heightMul, 0.042, clothMaterial,
    new THREE.Vector3(0.23 * widthMul, -0.06 * heightMul, -0.234), new THREE.Euler(0, 0, 0.13));

  // Legacy compat parts (kept for parts registry, still add subtle detail)
  const chestSkin  = makeBox("procedural_zombie_torn_chest_skin",
    0.14 * widthMul, 0.28 * heightMul, 0.036, bodyMaterial,
    new THREE.Vector3(0.09 * asym * widthMul, 0.05 * heightMul, -0.231));
  const chestWound = makeBox("procedural_zombie_chest_wound",
    0.13 * widthMul, 0.20 * heightMul, 0.038, woundMaterial,
    new THREE.Vector3(-0.11 * asym * widthMul, -0.05 * heightMul, -0.233));
  const bellyShadow = makeBox("procedural_zombie_belly_shadow",
    0.28 * widthMul, 0.038, 0.038, mouthMaterial,
    new THREE.Vector3(0.02 * asym * widthMul, -0.29 * heightMul, -0.233), new THREE.Euler(0, 0, -0.10 * asym));
  const chestScarA = makeBox("procedural_zombie_chest_scar_a",
    0.26 * widthMul, 0.038, 0.036, woundMaterial,
    new THREE.Vector3(-0.02 * asym * widthMul, 0.20 * heightMul, -0.237), new THREE.Euler(0, 0, 0.36 * asym));
  const chestScarB = makeBox("procedural_zombie_chest_scar_b",
    0.20 * widthMul, 0.032, 0.036, woundMaterial,
    new THREE.Vector3(0.18 * asym * widthMul, -0.19 * heightMul, -0.237), new THREE.Euler(0, 0, -0.44 * asym));

  // ── Wide box shoulder block ──
  const shoulderBar = makeBox("procedural_zombie_shoulders",
    0.82 * widthMul, 0.28, 0.38, bodyMaterial,
    new THREE.Vector3(0, 0.45 * heightMul, 0), new THREE.Euler(0, 0, rand(-0.04, 0.04)));

  const collarLeft  = makeBox("procedural_zombie_collar_left",
    0.19 * widthMul, 0.08, 0.052, clothMaterial,
    new THREE.Vector3(-0.14 * widthMul, 0.36 * heightMul, -0.232), new THREE.Euler(0, 0, 0.26));
  const collarRight = makeBox("procedural_zombie_collar_right",
    0.19 * widthMul, 0.08, 0.052, clothMaterial,
    new THREE.Vector3(0.14 * widthMul,  0.36 * heightMul, -0.232), new THREE.Euler(0, 0, -0.26));
  const shirtRipA   = makeBox("procedural_zombie_shirt_rip_a",
    0.32 * widthMul, 0.046, 0.046, mouthMaterial,
    new THREE.Vector3(-0.08 * asym * widthMul, 0.14 * heightMul, -0.242), new THREE.Euler(0, 0, 0.50 * asym));
  const shirtRipB   = makeBox("procedural_zombie_shirt_rip_b",
    0.28 * widthMul, 0.046, 0.046, mouthMaterial,
    new THREE.Vector3(0.03 * asym * widthMul, -0.09 * heightMul, -0.242), new THREE.Euler(0, 0, -0.42 * asym));

  // ── Type-specific torso attachments ──
  const toxicChestNode = makeBox("procedural_zombie_toxic_chest_node",
    0.096, 0.096, 0.052, toxicMaterial,
    new THREE.Vector3(0.24 * asym * widthMul, 0.20 * heightMul, -0.248));

  const goliathChestPlate    = makeBox("procedural_zombie_goliath_chest_plate",
    0.66 * widthMul, 0.46, 0.072, armorMaterial,
    new THREE.Vector3(0, 0.05 * heightMul, -0.278), new THREE.Euler(0, 0, rand(-0.03, 0.03)));
  const goliathShoulderLeft  = makeBox("procedural_zombie_goliath_left_pauldron",
    0.33, 0.23, 0.42, armorMaterial,
    new THREE.Vector3(-0.52 * widthMul, 0.41 * heightMul, -0.01), new THREE.Euler(0, 0, 0.10));
  const goliathShoulderRight = makeBox("procedural_zombie_goliath_right_pauldron",
    0.33, 0.23, 0.42, armorMaterial,
    new THREE.Vector3(0.52 * widthMul, 0.41 * heightMul, -0.01), new THREE.Euler(0, 0, -0.10));
  goliathChestPlate.visible    = false;
  goliathShoulderLeft.visible  = false;
  goliathShoulderRight.visible = false;

  const exploderCore = makeBox("procedural_zombie_exploder_core",
    0.25, 0.40, 0.062, mutationMaterial,
    new THREE.Vector3(0, -0.02, -0.262));
  exploderCore.visible = false;
  const exploderCoreGlow = makeBox("procedural_zombie_exploder_core_glow",
    0.34, 0.50, 0.038, toxicMaterial,
    new THREE.Vector3(0, -0.02, -0.298));
  const exploderFuseA = makeCylinder("procedural_zombie_exploder_fuse_a",
    0.018, 0.018, 0.34, mutationMaterial,
    new THREE.Vector3(-0.18 * widthMul, 0.27 * heightMul, -0.292),
    new THREE.Euler(0.30, 0.12, 0.58), 5);
  const exploderFuseB = makeCylinder("procedural_zombie_exploder_fuse_b",
    0.016, 0.016, 0.30, mutationMaterial,
    new THREE.Vector3(0.19 * widthMul, -0.25 * heightMul, -0.292),
    new THREE.Euler(-0.28, -0.08, -0.52), 5);
  exploderCoreGlow.visible = false;
  exploderFuseA.visible    = false;
  exploderFuseB.visible    = false;

  torso.add(
    woundA, woundB, woundC, bloodDripA, bloodDripB,
    chestSkin, chestWound, tornShirtLeft, tornShirtRight,
    bellyShadow, chestScarA, chestScarB, shoulderBar,
    collarLeft, collarRight, shirtRipA, shirtRipB,
    ribA, ribB, ribC, toxicChestNode,
    goliathChestPlate, goliathShoulderLeft, goliathShoulderRight,
    exploderCore, exploderCoreGlow, exploderFuseA, exploderFuseB
  );

  // ════════════════════════════════════════════════════════
  //  PELVIS
  // ════════════════════════════════════════════════════════
  const pelvis = makeLowPolySphere("procedural_zombie_pelvis", 0.28, pantsMaterial,
    new THREE.Vector3(0, 0.74 * heightMul, 0),
    new THREE.Euler(0, 0, rand(-0.04, 0.04)),
    new THREE.Vector3(1.10 * widthMul, 0.46, 0.74), 7, 4);

  const waistBand = makeBox("procedural_zombie_waist_band",
    0.54 * widthMul, 0.058, 0.048, mouthMaterial,
    new THREE.Vector3(0, 0.038, -0.202), new THREE.Euler(0, 0, rand(-0.03, 0.03)));
  const beltBuckle = makeBox("procedural_zombie_belt_buckle",
    0.078, 0.058, 0.055, boneMaterial,
    new THREE.Vector3(0.08 * asym * widthMul, 0.038, -0.230), new THREE.Euler(0, 0, 0.05 * asym));
  pelvis.add(waistBand, beltBuckle);

  // ════════════════════════════════════════════════════════
  //  NECK  — V3: Box for pixel-art blocky neck
  // ════════════════════════════════════════════════════════
  const neck = makeBox("procedural_zombie_neck",
    0.23 * widthMul, 0.25, 0.21, bodyMaterial,
    new THREE.Vector3(0.02 * asym, 1.67 * heightMul, 0),
    new THREE.Euler(0.05, 0, rand(-0.05, 0.05)));
  // Sinew cord on neck side (adds gritty detail)
  const neckCord = makeBox("zombie_neck_cord",
    0.046, 0.20, 0.030, woundMaterial,
    new THREE.Vector3(0.06 * asym, 1.67 * heightMul, -0.122));

  // ════════════════════════════════════════════════════════
  //  HEAD  — V3: BoxGeometry — pixel-art squared skull
  // ════════════════════════════════════════════════════════
  const head = makeBox(
    "procedural_zombie_head",
    0.56 * widthMul,  // wide square head — chunky pixel silhouette
    0.60,             // tall
    0.54,             // depth
    headMaterial,
    new THREE.Vector3(crooked, 1.92 * heightMul, -0.01),
    new THREE.Euler(rand(-0.05, 0.08), rand(-0.10, 0.10), rand(-0.08, 0.08))
  );
  addHeadFlag(head);

  // Hair chunks — box-based, sit naturally flush on top of box head
  const hairChunkA = makeBox("procedural_zombie_hair_chunk_a",
    0.32 * widthMul, 0.17, 0.26, hairMaterial,
    new THREE.Vector3(-0.14 * widthMul, 0.32, -0.10), new THREE.Euler(0.08, 0, 0.35));
  const hairChunkB = makeBox("procedural_zombie_hair_chunk_b",
    0.26 * widthMul, 0.19, 0.23, hairMaterial,
    new THREE.Vector3(0.08 * widthMul,  0.35, -0.08), new THREE.Euler(0.05, 0, -0.28));
  const hairChunkC = makeBox("procedural_zombie_hair_chunk_c",
    0.19 * widthMul, 0.13, 0.19, hairMaterial,
    new THREE.Vector3(0.25 * widthMul,  0.29, -0.04), new THREE.Euler(0.02, 0.10, -0.45));
  const missingSkullPlate = makeBox("procedural_zombie_missing_skull_plate",
    0.27, 0.082, 0.048, woundMaterial,
    new THREE.Vector3(-0.13 * asym * widthMul, 0.33, -0.282), new THREE.Euler(0, 0, rand(-0.18, 0.18)));

  // V3: Box ears flush with square head sides
  const leftEar  = makeBox("procedural_zombie_left_ear",
    0.058, 0.105, 0.078, headMaterial,
    new THREE.Vector3(-0.31 * widthMul, 0.02, -0.01));
  const rightEar = makeBox("procedural_zombie_right_ear",
    0.058, 0.105, 0.078, headMaterial,
    new THREE.Vector3( 0.31 * widthMul, 0.02, -0.01));

  addHeadFlag(hairChunkA); addHeadFlag(hairChunkB); addHeadFlag(hairChunkC);
  addHeadFlag(missingSkullPlate); addHeadFlag(leftEar); addHeadFlag(rightEar);
  head.add(hairChunkA, hairChunkB, hairChunkC, missingSkullPlate, leftEar, rightEar);

  // ── Face: all BoxGeometry for crisp pixel-art look ──
  const brow = makeBox("procedural_zombie_brow",
    0.52 * widthMul, 0.082, 0.062, headMaterial,
    new THREE.Vector3(0, 0.122, -0.286), new THREE.Euler(0, 0, rand(-0.04, 0.04)));
  const browShadow = makeBox("procedural_zombie_brow_shadow",
    0.54 * widthMul, 0.048, 0.028, mouthMaterial,
    new THREE.Vector3(0, 0.078, -0.316));

  // V3: Dark eye sockets — recessed dark boxes behind the pupils
  const leftEyeSocket  = makeBox("zombie_left_eye_socket",
    0.20, 0.148, 0.044, eyeSocketMaterial,
    new THREE.Vector3(-0.17 * widthMul, 0.042, -0.284));
  const rightEyeSocket = makeBox("zombie_right_eye_socket",
    0.20, 0.148, 0.044, eyeSocketMaterial,
    new THREE.Vector3( 0.17 * widthMul, 0.042, -0.284));

  // Glow halos sit in front of sockets
  const leftEyeGlow  = makeBox("procedural_zombie_left_eye_glow",
    0.17, 0.114, 0.028, eyeGlowMaterial,
    new THREE.Vector3(-0.17 * widthMul, 0.042, -0.304));
  const rightEyeGlow = makeBox("procedural_zombie_right_eye_glow",
    0.17, 0.114, 0.028, eyeGlowMaterial,
    new THREE.Vector3( 0.17 * widthMul, 0.042, -0.304));
  // Pupils — bright, smallest, most proud
  const leftEye  = makeBox("procedural_zombie_left_eye",
    0.10, 0.072, 0.042, eyeMaterial,
    new THREE.Vector3(-0.17 * widthMul, 0.042, -0.318));
  const rightEye = makeBox("procedural_zombie_right_eye",
    0.10, 0.072, 0.042, eyeMaterial,
    new THREE.Vector3( 0.17 * widthMul, 0.042, -0.318));

  const nose = makeBox("procedural_zombie_nose",
    0.105, 0.145, 0.094, headMaterial,
    new THREE.Vector3(0.01 * asym, -0.048, -0.306));
  const mouth = makeBox("procedural_zombie_mouth",
    0.34 * widthMul, 0.070, 0.050, mouthMaterial,
    new THREE.Vector3(0.02 * asym, -0.198, -0.308), new THREE.Euler(0, 0, rand(-0.03, 0.03)));
  const toothA = makeBox("procedural_zombie_tooth_a", 0.040, 0.076, 0.028, boneMaterial,
    new THREE.Vector3(-0.082 * widthMul, -0.214, -0.324));
  const toothB = makeBox("procedural_zombie_tooth_b", 0.038, 0.060, 0.028, boneMaterial,
    new THREE.Vector3(0.030 * widthMul,  -0.214, -0.324));
  const toothC = makeBox("procedural_zombie_tooth_c", 0.034, 0.054, 0.028, boneMaterial,
    new THREE.Vector3(0.114 * widthMul, -0.212, -0.324));

  const cheekCut    = makeBox("procedural_zombie_cheek_cut", 0.21, 0.052, 0.034, woundMaterial,
    new THREE.Vector3(-0.23 * asym * widthMul, -0.072, -0.316), new THREE.Euler(0, 0, 0.25 * asym));
  const skullPatch  = makeBox("procedural_zombie_skull_patch", 0.27, 0.135, 0.034, woundMaterial,
    new THREE.Vector3(-0.12 * asym * widthMul, 0.26, -0.306), new THREE.Euler(0, 0, rand(-0.12, 0.12)));
  const brokenJaw   = makeBox("procedural_zombie_broken_lower_jaw",
    0.23 * widthMul, 0.082, 0.050, boneMaterial,
    new THREE.Vector3(0.07 * asym * widthMul, -0.264, -0.320), new THREE.Euler(0, 0, -0.10 * asym));
  const jawWound    = makeBox("procedural_zombie_jaw_wound",
    0.19 * widthMul, 0.060, 0.044, woundMaterial,
    new THREE.Vector3(-0.09 * asym * widthMul, -0.264, -0.324), new THREE.Euler(0, 0, 0.18 * asym));
  const templeCrack = makeBox("procedural_zombie_temple_crack", 0.17, 0.036, 0.032, mouthMaterial,
    new THREE.Vector3(0.23 * asym * widthMul, 0.194, -0.302), new THREE.Euler(0, 0, 0.72 * asym));

  // ── Ranged / Runner head attachments ──
  const rangedBand    = makeBox("procedural_zombie_ranged_face_band",
    0.62 * widthMul, 0.105, 0.050, rangedMaterial,
    new THREE.Vector3(0, 0.042, -0.320));
  rangedBand.visible  = false;
  const rangedLens    = makeBox("procedural_zombie_ranged_lens",
    0.19, 0.19, 0.058, rangedMaterial,
    new THREE.Vector3(0.17 * widthMul, 0.050, -0.352));
  const rangedAntenna = makeCylinder("procedural_zombie_ranged_antenna",
    0.016, 0.016, 0.42, rangedMaterial,
    new THREE.Vector3(-0.25 * widthMul, 0.46, -0.02),
    new THREE.Euler(0.18, 0, -0.35), 5);
  const runnerSpikeA  = makeBox("procedural_zombie_runner_spike_a",
    0.092, 0.25, 0.115, toxicMaterial,
    new THREE.Vector3(-0.25 * widthMul, 0.42, -0.09), new THREE.Euler(0.12, 0, 0.22));
  const runnerSpikeB  = makeBox("procedural_zombie_runner_spike_b",
    0.092, 0.23, 0.115, toxicMaterial,
    new THREE.Vector3(0.25 * widthMul,  0.40, -0.09), new THREE.Euler(0.12, 0, -0.22));
  rangedLens.visible   = false;
  rangedAntenna.visible = false;
  runnerSpikeA.visible = false;
  runnerSpikeB.visible = false;

  [brow, browShadow,
   leftEyeSocket, rightEyeSocket,
   leftEyeGlow, rightEyeGlow, leftEye, rightEye,
   nose, mouth, toothA, toothB, toothC,
   cheekCut, skullPatch, brokenJaw, jawWound, templeCrack,
   rangedBand, rangedLens, rangedAntenna,
   runnerSpikeA, runnerSpikeB].forEach(addHeadFlag);

  head.add(
    brow, browShadow,
    leftEyeSocket, rightEyeSocket,
    leftEyeGlow, rightEyeGlow, leftEye, rightEye,
    nose, mouth, toothA, toothB, toothC,
    cheekCut, skullPatch, brokenJaw, jawWound, templeCrack,
    rangedBand, rangedLens, rangedAntenna,
    runnerSpikeA, runnerSpikeB
  );

  // ════════════════════════════════════════════════════════
  //  ARMS  — V3: Box upper arms + box forearms (chunky limbs)
  // ════════════════════════════════════════════════════════
  const leftArm = makePivot("procedural_zombie_left_arm",
    new THREE.Vector3(-0.44 * widthMul, 1.50 * heightMul, -0.01),
    new THREE.Euler(rand(-0.24, -0.12), 0, rand(0.10, 0.22)));
  const rightArm = makePivot("procedural_zombie_right_arm",
    new THREE.Vector3(0.44 * widthMul, 1.50 * heightMul, -0.01),
    new THREE.Euler(rand(-0.24, -0.12), 0, rand(-0.22, -0.10)));

  // Torn sleeve cuffs at shoulder (minimal cloth — mostly bare skin)
  const leftSleeve  = makeBox("procedural_zombie_left_sleeve",
    0.28, 0.22, 0.26, sleeveMaterial,
    new THREE.Vector3(-0.01, -0.13, 0), new THREE.Euler(0.02, 0, 0.02));
  const rightSleeve = makeBox("procedural_zombie_right_sleeve",
    0.28, 0.22, 0.26, sleeveMaterial,
    new THREE.Vector3(0.01, -0.13, 0), new THREE.Euler(-0.02, 0, -0.02));

  // V3: Box upper arms — thick pixel blocks
  const leftUpperArm  = makeBox("procedural_zombie_left_upper_arm",
    0.24, 0.44, 0.22, bodyMaterial,
    new THREE.Vector3(-0.04, -0.38, 0.01), new THREE.Euler(0.06, 0, 0.04));
  const rightUpperArm = makeBox("procedural_zombie_right_upper_arm",
    0.24, 0.44, 0.22, bodyMaterial,
    new THREE.Vector3(0.04, -0.38, 0.01), new THREE.Euler(-0.06, 0, -0.04));

  // V3: Box forearms — slightly narrower, angled forward for outstretched pose
  const leftForearm  = makeBox("procedural_zombie_left_forearm",
    0.20, 0.48, 0.19, bodyMaterial,
    new THREE.Vector3(-0.08, -0.78, 0.04), new THREE.Euler(0.16, 0, -0.04));
  const rightForearm = makeBox("procedural_zombie_right_forearm",
    0.20, 0.48, 0.19, bodyMaterial,
    new THREE.Vector3(0.08, -0.78, 0.04), new THREE.Euler(0.16, 0, 0.04));

  // Hands — keep organic sphere for contrast with boxy limbs
  const leftHand  = makeLowPolySphere("procedural_zombie_left_hand",
    0.13, bodyMaterial,
    new THREE.Vector3(-0.11, -1.07, 0.08), new THREE.Euler(0, 0, -0.08),
    new THREE.Vector3(0.92, 0.64, 0.80), 6, 4);
  const rightHand = makeLowPolySphere("procedural_zombie_right_hand",
    0.13, bodyMaterial,
    new THREE.Vector3(0.11, -1.07, 0.08), new THREE.Euler(0, 0, 0.08),
    new THREE.Vector3(0.92, 0.64, 0.80), 6, 4);

  // Fingers
  const leftFingerA  = makeBox("procedural_zombie_left_finger_a",  0.036, 0.122, 0.036, bodyMaterial, new THREE.Vector3(-0.076, -0.122, -0.032), new THREE.Euler(0.10, 0, -0.18));
  const leftFingerB  = makeBox("procedural_zombie_left_finger_b",  0.036, 0.132, 0.036, bodyMaterial, new THREE.Vector3(-0.021, -0.132, -0.040), new THREE.Euler(0.06, 0, -0.03));
  const leftFingerC  = makeBox("procedural_zombie_left_finger_c",  0.036, 0.112, 0.036, bodyMaterial, new THREE.Vector3(0.039, -0.122, -0.032), new THREE.Euler(0.10, 0, 0.14));
  const rightFingerA = makeBox("procedural_zombie_right_finger_a", 0.036, 0.122, 0.036, bodyMaterial, new THREE.Vector3(-0.039, -0.122, -0.032), new THREE.Euler(0.10, 0, -0.14));
  const rightFingerB = makeBox("procedural_zombie_right_finger_b", 0.036, 0.132, 0.036, bodyMaterial, new THREE.Vector3(0.021, -0.132, -0.040), new THREE.Euler(0.06, 0, 0.03));
  const rightFingerC = makeBox("procedural_zombie_right_finger_c", 0.036, 0.112, 0.036, bodyMaterial, new THREE.Vector3(0.076, -0.122, -0.032), new THREE.Euler(0.10, 0, 0.18));
  const leftThumb    = makeBox("procedural_zombie_left_thumb",  0.036, 0.097, 0.036, bodyMaterial, new THREE.Vector3(-0.112, -0.056, 0.046), new THREE.Euler(0.05, 0, 0.62));
  const rightThumb   = makeBox("procedural_zombie_right_thumb", 0.036, 0.097, 0.036, bodyMaterial, new THREE.Vector3(0.112,  -0.056, 0.046), new THREE.Euler(0.05, 0, -0.62));
  leftHand.add(leftFingerA, leftFingerB, leftFingerC, leftThumb);
  rightHand.add(rightFingerA, rightFingerB, rightFingerC, rightThumb);

  // Arm wounds — V3: bigger and bolder blood patches on arms
  const leftArmWound      = makeBox("procedural_zombie_left_arm_wound",
    0.16, 0.22, 0.040, woundMaterial,
    new THREE.Vector3(-0.16, -0.70, -0.050));
  const rightArmBone      = makeCylinder("procedural_zombie_right_arm_bone",
    0.037, 0.037, 0.34, boneMaterial,
    new THREE.Vector3(0.17, -0.72, -0.058), new THREE.Euler(0.22, 0, 0.05), 6);
  const leftForearmScar   = makeBox("procedural_zombie_left_forearm_scar",
    0.14, 0.034, 0.033, woundMaterial,
    new THREE.Vector3(-0.12, -0.86, -0.058), new THREE.Euler(0, 0, -0.35));
  const rightSleeveTear   = makeBox("procedural_zombie_right_sleeve_tear",
    0.14, 0.036, 0.037, mouthMaterial,
    new THREE.Vector3(0.09, -0.21, -0.090), new THREE.Euler(0, 0, 0.35));
  // NEW V3: big arm blood patches matching reference image red blotches on arms
  const leftArmBloodPatch  = makeBox("zombie_left_arm_blood_patch",
    0.18, 0.14, 0.040, woundMaterial,
    new THREE.Vector3(-0.01, -0.46, -0.118));
  const rightArmBloodPatch = makeBox("zombie_right_arm_blood_patch",
    0.18, 0.15, 0.040, woundMaterial,
    new THREE.Vector3(0.01, -0.38, -0.118));

  leftArm.add(
    leftSleeve, leftUpperArm, leftForearm, leftHand,
    leftArmWound, leftForearmScar, leftArmBloodPatch
  );
  rightArm.add(
    rightSleeve, rightUpperArm, rightForearm, rightHand,
    rightArmBone, rightSleeveTear, rightArmBloodPatch
  );

  // ════════════════════════════════════════════════════════
  //  LEGS  — V3: Box thighs + box shins (thick block legs)
  // ════════════════════════════════════════════════════════
  const leftLeg = makePivot("procedural_zombie_left_leg",
    new THREE.Vector3(-0.19 * widthMul, 0.82 * heightMul, 0),
    new THREE.Euler(rand(-0.03, 0.03), 0, rand(-0.08, 0.08)));
  const rightLeg = makePivot("procedural_zombie_right_leg",
    new THREE.Vector3(0.19 * widthMul, 0.82 * heightMul, 0),
    new THREE.Euler(rand(-0.03, 0.03), 0, rand(-0.08, 0.08)));

  // V3: Box thighs — broad pixel blocks
  const leftThigh  = makeBox("procedural_zombie_left_thigh",
    0.28, 0.46, 0.26, pantsMaterial,
    new THREE.Vector3(0, -0.24, 0), new THREE.Euler(0.02, 0, -0.02));
  const rightThigh = makeBox("procedural_zombie_right_thigh",
    0.28, 0.46, 0.26, pantsMaterial,
    new THREE.Vector3(0, -0.24, 0), new THREE.Euler(-0.02, 0, 0.02));

  // V3: Box shins — slightly narrower than thighs
  const leftShin  = makeBox("procedural_zombie_left_shin",
    0.23, 0.48, 0.23, pantsMaterial,
    new THREE.Vector3(-0.01, -0.68, 0.01), new THREE.Euler(0.04, 0, -0.03));
  const rightShin = makeBox("procedural_zombie_right_shin",
    0.23, 0.48, 0.23, pantsMaterial,
    new THREE.Vector3(0.01, -0.68, 0.01), new THREE.Euler(-0.04, 0, 0.03));

  // Knee detail strips
  const leftKneeSkin   = makeBox("procedural_zombie_left_knee_skin",
    0.20, 0.13, 0.040, bodyMaterial,
    new THREE.Vector3(0.01, -0.46, -0.130));
  const rightKneeWound = makeBox("procedural_zombie_right_knee_wound",
    0.18, 0.14, 0.040, woundMaterial,
    new THREE.Vector3(-0.01, -0.46, -0.130));

  // Bare feet (organic sphere for contrast with boxy legs)
  const leftBoot  = makeLowPolySphere("procedural_zombie_left_bare_foot",
    0.15, bodyMaterial,
    new THREE.Vector3(-0.01, -0.98, -0.042), new THREE.Euler(0.02, 0, -0.03),
    new THREE.Vector3(1.14, 0.44, 1.82), 6, 4);
  const rightBoot = makeLowPolySphere("procedural_zombie_right_bare_foot",
    0.15, bodyMaterial,
    new THREE.Vector3(0.01, -0.98, -0.042), new THREE.Euler(-0.02, 0, 0.03),
    new THREE.Vector3(1.14, 0.44, 1.82), 6, 4);

  const leftBootSole  = makeBox("procedural_zombie_left_toes",
    0.27, 0.037, 0.112, bodyMaterial,
    new THREE.Vector3(0.01, -0.048, -0.228), new THREE.Euler(0, 0, -0.04));
  const rightBootSole = makeBox("procedural_zombie_right_toes",
    0.27, 0.037, 0.112, bodyMaterial,
    new THREE.Vector3(-0.01, -0.048, -0.228), new THREE.Euler(0, 0, 0.04));

  const leftToeA  = makeBox("procedural_zombie_left_big_toe",   0.048, 0.037, 0.074, bodyMaterial, new THREE.Vector3(-0.072, -0.048, -0.296), new THREE.Euler(0, 0, -0.05));
  const leftToeB  = makeBox("procedural_zombie_left_mid_toe",   0.038, 0.032, 0.064, bodyMaterial, new THREE.Vector3(-0.010, -0.052, -0.306));
  const leftToeC  = makeBox("procedural_zombie_left_small_toe", 0.034, 0.029, 0.056, bodyMaterial, new THREE.Vector3(0.047, -0.052, -0.293), new THREE.Euler(0, 0, 0.06));
  const rightToeA = makeBox("procedural_zombie_right_big_toe",  0.048, 0.037, 0.074, bodyMaterial, new THREE.Vector3(0.072, -0.048, -0.296), new THREE.Euler(0, 0, 0.05));
  const rightToeB = makeBox("procedural_zombie_right_mid_toe",  0.038, 0.032, 0.064, bodyMaterial, new THREE.Vector3(0.010, -0.052, -0.306));
  const rightToeC = makeBox("procedural_zombie_right_small_toe",0.034, 0.029, 0.056, bodyMaterial, new THREE.Vector3(-0.047, -0.052, -0.293), new THREE.Euler(0, 0, -0.06));
  leftBoot.add(leftBootSole, leftToeA, leftToeB, leftToeC);
  rightBoot.add(rightBootSole, rightToeA, rightToeB, rightToeC);

  const leftPantsCuff  = makeBox("procedural_zombie_left_pants_cuff",
    0.25, 0.082, 0.20, pantsMaterial,
    new THREE.Vector3(-0.02, -0.82, -0.01), new THREE.Euler(0, 0, -0.08));
  const rightPantsCuff = makeBox("procedural_zombie_right_pants_cuff",
    0.25, 0.082, 0.20, pantsMaterial,
    new THREE.Vector3(0.02, -0.82, -0.01), new THREE.Euler(0, 0, 0.08));

  // Wound patches on legs (reference has red blotch on thigh)
  const leftThighPatch  = makeBox("procedural_zombie_left_thigh_patch",
    0.17, 0.19, 0.040, woundMaterial,
    new THREE.Vector3(-0.04, -0.26, -0.138), new THREE.Euler(0, 0, -0.10));
  const rightShinPatch  = makeBox("procedural_zombie_right_shin_patch",
    0.15, 0.17, 0.040, woundMaterial,
    new THREE.Vector3(0.04, -0.62, -0.126), new THREE.Euler(0, 0, 0.12));

  const leftPantTatter  = makeBox("procedural_zombie_left_pant_tatter",
    0.082, 0.21, 0.044, pantsMaterial,
    new THREE.Vector3(0.104, -0.90, -0.024), new THREE.Euler(0, 0, 0.12));
  const rightPantTatter = makeBox("procedural_zombie_right_pant_tatter",
    0.076, 0.19, 0.044, pantsMaterial,
    new THREE.Vector3(-0.098, -0.90, -0.024), new THREE.Euler(0, 0, -0.12));

  leftLeg.add(
    leftThigh, leftShin, leftKneeSkin, leftThighPatch,
    leftPantsCuff, leftPantTatter, leftBoot
  );
  rightLeg.add(
    rightThigh, rightShin, rightKneeWound, rightShinPatch,
    rightPantsCuff, rightPantTatter, rightBoot
  );

  // ── Assemble group ──
  group.add(torso, pelvis, neck, neckCord, head, leftArm, rightArm, leftLeg, rightLeg);

  // ── Material references on userData ──
  group.userData.bodyMaterial      = bodyMaterial;
  group.userData.headMaterial      = headMaterial;
  group.userData.clothMaterial     = clothMaterial;
  group.userData.pantsMaterial     = pantsMaterial;
  group.userData.sleeveMaterial    = sleeveMaterial;
  group.userData.eyeMaterial       = eyeMaterial;
  group.userData.eyeSocketMaterial = eyeSocketMaterial;
  group.userData.mouthMaterial     = mouthMaterial;
  group.userData.woundMaterial     = woundMaterial;
  group.userData.boneMaterial      = boneMaterial;
  group.userData.bootMaterial      = bootMaterial;
  group.userData.hairMaterial      = hairMaterial;
  group.userData.armorMaterial     = armorMaterial;
  group.userData.eyeGlowMaterial   = eyeGlowMaterial;
  group.userData.toxicMaterial     = toxicMaterial;
  group.userData.mutationMaterial  = mutationMaterial;
  group.userData.rangedMaterial    = rangedMaterial;
  group.userData.bodyColorHex      = bodyColor;

  // ── Parts registry (backward-compatible + V3 additions) ──
  group.userData.parts = {
    // Torso region
    torso, chestSkin, chestWound, tornShirtLeft, tornShirtRight,
    bellyShadow, chestScarA, chestScarB, shoulderBar,
    collarLeft, collarRight, shirtRipA, shirtRipB,
    toxicChestNode, goliathChestPlate, goliathShoulderLeft, goliathShoulderRight,
    ribA, ribB, ribC,
    exploderCore, exploderCoreGlow, exploderFuseA, exploderFuseB,
    // V3 torso wound parts
    woundA, woundB, woundC, bloodDripA, bloodDripB,
    // Pelvis
    pelvis, waistBand, beltBuckle,
    // Neck
    neck, neckCord,
    // Head
    head, hairChunkA, hairChunkB, hairChunkC, missingSkullPlate,
    leftEar, rightEar,
    brow, browShadow,
    leftEyeSocket, rightEyeSocket,
    leftEyeGlow, rightEyeGlow, leftEye, rightEye,
    nose, mouth, toothA, toothB, toothC,
    cheekCut, skullPatch, brokenJaw, jawWound, templeCrack,
    rangedBand, rangedLens, rangedAntenna,
    runnerSpikeA, runnerSpikeB,
    // Arms
    leftArm, rightArm,
    leftSleeve, rightSleeve,
    leftUpperArm, rightUpperArm,
    leftForearm, rightForearm,
    leftHand, rightHand,
    leftFingerA, leftFingerB, leftFingerC, leftThumb,
    rightFingerA, rightFingerB, rightFingerC, rightThumb,
    leftArmWound, rightArmBone, leftForearmScar, rightSleeveTear,
    leftArmBloodPatch, rightArmBloodPatch,
    // Legs
    leftLeg, rightLeg,
    leftThigh, rightThigh, leftShin, rightShin,
    leftKneeSkin, rightKneeWound,
    leftThighPatch, rightShinPatch,
    leftBoot, rightBoot,
    leftBootSole, rightBootSole,
    leftToeA, leftToeB, leftToeC,
    rightToeA, rightToeB, rightToeC,
    leftPantsCuff, rightPantsCuff,
    leftPantTatter, rightPantTatter
  };

  // ── Animation state ──
  group.userData.motionPhase    = rand(0, Math.PI * 2);
  group.userData.motionSpeed    = 1.0;
  group.userData.motionPower    = 1.0;
  group.userData.typeName       = "SHAMBLER";
  group.userData.hitFlashT      = 0;
  group.userData._hitFlashActive = false;
  group.userData.deathT         = -1;
  group.userData.dying          = false;

  return group;
}

// ─────────────────────────────────────────────────────────
//  STYLE UPDATER  (sets zombie type + scales parts)
// ─────────────────────────────────────────────────────────
export function updateProceduralZombieStyle(group, config = {}) {
  if (!group) return;

  const color    = config.color ?? 0x7fa06b;
  const typeName = config.name ?? config.type ?? "SHAMBLER";
  const parts    = group.userData.parts;
  if (!parts) return;

  group.userData.typeName    = typeName;
  group.userData.bodyColorHex = color;

  const bodyMaterial     = group.userData.bodyMaterial;
  const headMaterial     = group.userData.headMaterial;
  const eyeMaterial      = group.userData.eyeMaterial;
  const eyeGlowMaterial  = group.userData.eyeGlowMaterial;
  const toxicMaterial    = group.userData.toxicMaterial;
  const mutationMaterial = group.userData.mutationMaterial;
  const rangedMaterial   = group.userData.rangedMaterial;

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
    mutationMaterial.emissiveIntensity = typeName === "EXPLODER" ? 0.80 : 0.35;
  }
  if (rangedMaterial) {
    rangedMaterial.emissiveIntensity = typeName === "RANGED" ? 0.75 : 0.25;
  }

  let eyeColor   = 0xdce89a;
  let accentColor = 0x49ff5a;

  switch (typeName) {
    case "RUNNER":   eyeColor = 0xff2222; accentColor = 0x6cff5e; break;
    case "GOLIATH":  eyeColor = 0xffaa00; accentColor = 0xffaa00; break;
    case "EXPLODER": eyeColor = 0xff5500; accentColor = 0xff6b1a; break;
    case "RANGED":   eyeColor = 0x00ffff; accentColor = 0x00ffff; break;
    case "CRAWLER":  eyeColor = 0xff2222; accentColor = 0x6cff5e; break;
  }

  if (eyeMaterial)     eyeMaterial.color.setHex(eyeColor);
  if (eyeGlowMaterial) {
    eyeGlowMaterial.color.setHex(eyeColor);
    eyeGlowMaterial.opacity = typeName === "GOLIATH" ? 0.18 : 0.34;
  }
  if (toxicMaterial) toxicMaterial.color.setHex(accentColor);

  // Reset all part scales
  group.scale.set(1, 1, 1);
  ['torso','pelvis','neck','head',
   'leftArm','rightArm','leftLeg','rightLeg'].forEach(k => setPartScale(parts[k], 1, 1, 1));

  // Type-specific visibility
  parts.exploderCore.visible        = typeName === "EXPLODER";
  parts.exploderCoreGlow.visible    = typeName === "EXPLODER";
  parts.exploderFuseA.visible       = typeName === "EXPLODER";
  parts.exploderFuseB.visible       = typeName === "EXPLODER";
  parts.rangedBand.visible          = typeName === "RANGED";
  parts.rangedLens.visible          = typeName === "RANGED";
  parts.rangedAntenna.visible       = typeName === "RANGED";
  parts.runnerSpikeA.visible        = typeName === "RUNNER";
  parts.runnerSpikeB.visible        = typeName === "RUNNER";
  parts.goliathChestPlate.visible   = typeName === "GOLIATH";
  parts.goliathShoulderLeft.visible = typeName === "GOLIATH";
  parts.goliathShoulderRight.visible= typeName === "GOLIATH";
  parts.toxicChestNode.visible      = typeName !== "GOLIATH";
  parts.ribA.visible                = typeName !== "GOLIATH";
  parts.ribB.visible                = typeName !== "GOLIATH";
  parts.ribC.visible                = typeName !== "GOLIATH";
  parts.rightArmBone.visible        = typeName !== "GOLIATH";

  // ── Per-type proportions ──
  switch (typeName) {
    case "RUNNER":
      group.userData.motionSpeed = 1.45;
      group.userData.motionPower = 1.18;
      setPartScale(parts.torso,    0.82, 1.18, 0.82);
      setPartScale(parts.pelvis,   0.82, 0.90, 0.82);
      setPartScale(parts.head,     0.90, 0.92, 0.90);
      setPartScale(parts.leftArm,  0.78, 1.14, 0.78);
      setPartScale(parts.rightArm, 0.78, 1.14, 0.78);
      setPartScale(parts.leftLeg,  0.76, 1.22, 0.76);
      setPartScale(parts.rightLeg, 0.76, 1.22, 0.76);
      break;

    case "GOLIATH":
      group.userData.motionSpeed = 0.62;
      group.userData.motionPower = 0.70;
      setPartScale(parts.torso,    1.38, 1.20, 1.30);
      setPartScale(parts.pelvis,   1.30, 1.06, 1.22);
      setPartScale(parts.neck,     1.22, 1.06, 1.22);
      setPartScale(parts.head,     1.20, 1.08, 1.18);
      setPartScale(parts.leftArm,  1.38, 1.24, 1.38);
      setPartScale(parts.rightArm, 1.38, 1.24, 1.38);
      setPartScale(parts.leftLeg,  1.22, 1.10, 1.22);
      setPartScale(parts.rightLeg, 1.22, 1.10, 1.22);
      break;

    case "EXPLODER":
      group.userData.motionSpeed = 1.0;
      group.userData.motionPower = 0.90;
      setPartScale(parts.torso,    1.24, 0.98, 1.32);
      setPartScale(parts.pelvis,   1.12, 0.96, 1.12);
      setPartScale(parts.head,     1.05, 1.00, 1.05);
      setPartScale(parts.leftArm,  0.96, 1.04, 0.96);
      setPartScale(parts.rightArm, 0.96, 1.04, 0.96);
      break;

    case "RANGED":
      group.userData.motionSpeed = 0.82;
      group.userData.motionPower = 0.68;
      setPartScale(parts.torso,    0.88, 1.14, 0.86);
      setPartScale(parts.pelvis,   0.86, 0.94, 0.84);
      setPartScale(parts.head,     0.94, 1.05, 0.94);
      setPartScale(parts.leftArm,  0.85, 1.10, 0.85);
      setPartScale(parts.rightArm, 1.06, 1.20, 1.06);
      setPartScale(parts.leftLeg,  0.86, 1.10, 0.86);
      setPartScale(parts.rightLeg, 0.86, 1.10, 0.86);
      break;

    case "CRAWLER":
      // V3 new type: low, fast, hunched on all fours
      group.userData.motionSpeed = 1.80;
      group.userData.motionPower = 1.30;
      setPartScale(parts.torso,    0.88, 0.94, 0.88);
      setPartScale(parts.pelvis,   0.88, 0.88, 0.88);
      setPartScale(parts.head,     0.92, 0.90, 0.92);
      setPartScale(parts.leftArm,  0.82, 1.10, 0.82);
      setPartScale(parts.rightArm, 0.82, 1.10, 0.82);
      setPartScale(parts.leftLeg,  0.82, 0.86, 0.82);
      setPartScale(parts.rightLeg, 0.82, 0.86, 0.82);
      break;

    default: // SHAMBLER
      group.userData.motionSpeed = 1.0;
      group.userData.motionPower = 1.0;
      break;
  }
}

// ─────────────────────────────────────────────────────────
//  MOTION UPDATER  (called every frame)
//  dt param added (optional, defaults to 16ms / 60fps)
// ─────────────────────────────────────────────────────────
export function updateProceduralZombieMotion(group, timeSeconds, speed = 1.0, dt = 0.016) {
  if (!group) return;
  const parts    = group.userData.parts;
  if (!parts) return;

  const phase     = group.userData.motionPhase ?? 0;
  const typeSpeed = group.userData.motionSpeed  ?? 1.0;
  const power     = group.userData.motionPower  ?? 1.0;
  const typeName  = group.userData.typeName     ?? "SHAMBLER";

  const t       = timeSeconds * 7.0 * speed * typeSpeed + phase;
  const slowT   = timeSeconds * 2.0 + phase;
  const walk    = Math.sin(t);
  const walkOpp = Math.sin(t + Math.PI);
  const bob     = Math.abs(Math.sin(t));

  // ── Reset to base poses ──
  ['torso','pelvis','neck','head',
   'leftArm','rightArm','leftLeg','rightLeg',
   'rangedAntenna','runnerSpikeA','runnerSpikeB',
   'exploderFuseA','exploderFuseB'].forEach(k => resetPart(parts[k]));

  // ── Hit flash decay (V3) ──
  if (group.userData._hitFlashActive) {
    group.userData.hitFlashT = Math.max(0, (group.userData.hitFlashT ?? 0) - dt * 5.0);
    const fl = group.userData.hitFlashT;
    const bm = group.userData.bodyMaterial;
    const hm = group.userData.headMaterial;
    if (bm) bm.emissiveIntensity = fl * 0.65;
    if (hm) hm.emissiveIntensity = fl * 0.75;
    if (fl <= 0) {
      group.userData._hitFlashActive = false;
      const c = group.userData.bodyColorHex ?? 0x7fa06b;
      if (bm) { bm.emissive.setHex(c); bm.emissiveIntensity = 0.035; }
      if (hm) { hm.emissive.setHex(c); hm.emissiveIntensity = 0.05;  }
    }
  }

  // ── Death collapse (V3) — when dying, override all motion ──
  if (group.userData.dying) {
    group.userData.deathT = (group.userData.deathT ?? 0) + dt;
    const td    = Math.min(group.userData.deathT, 1.5);
    const dir   = group.userData.deathDir ?? 1;
    const ease  = td < 0.45 ? td * 2.22 : 1.0;
    group.rotation.x = ease * 1.42;
    group.rotation.z = ease * dir * 0.50;
    group.position.y = -td * 0.55;
    // Limbs flop during fall
    parts.leftArm.rotation.x  += (group.userData.deathDir > 0 ? 0.5 : -0.3) * ease;
    parts.rightArm.rotation.x += (group.userData.deathDir > 0 ? 0.3 : -0.5) * ease;
    return; // Skip normal motion while dying
  }

  // ── Base body motion ──
  group.position.y = bob * 0.032 * power;
  group.rotation.y = group.userData.baseYaw ?? Math.PI;
  group.rotation.z = walk * 0.025 * power;
  group.rotation.x = 0;

  // Eye pulse
  const eyePulse = 1 + Math.sin(timeSeconds * 8.0 + phase) * 0.055;
  if (parts.leftEyeGlow)    parts.leftEyeGlow.scale.set(eyePulse, eyePulse, eyePulse);
  if (parts.rightEyeGlow)   parts.rightEyeGlow.scale.set(eyePulse, eyePulse, eyePulse);
  if (parts.toxicChestNode) parts.toxicChestNode.scale.set(eyePulse, eyePulse, eyePulse);

  // Core sway
  parts.torso.rotation.x  += walk * 0.035 * power;
  parts.torso.rotation.z  += walk * 0.035 * power;
  parts.pelvis.rotation.z += walkOpp * 0.025 * power;
  parts.head.rotation.y   += walk * 0.075 * power;
  parts.head.rotation.z   += walkOpp * 0.035 * power;

  // Arms swing
  parts.leftArm.rotation.x  += walkOpp * 0.58 * power;
  parts.rightArm.rotation.x += walk    * 0.58 * power;
  parts.leftArm.rotation.z  += walk    * 0.055 * power;
  parts.rightArm.rotation.z += walkOpp * 0.055 * power;

  // Leg stride
  parts.leftLeg.rotation.x   += walk    * 0.38 * power;
  parts.rightLeg.rotation.x  += walkOpp * 0.38 * power;
  parts.leftLeg.position.z   += walk    * 0.045 * power;
  parts.rightLeg.position.z  += walkOpp * 0.045 * power;

  // ── Per-type animation overrides ──
  switch (typeName) {

    case "GOLIATH":
      parts.leftArm.rotation.x  -= 0.22;
      parts.rightArm.rotation.x -= 0.22;
      group.rotation.z *= 0.45;
      break;

    case "RUNNER":
      parts.torso.rotation.x += 0.20;
      parts.head.rotation.x  += 0.10;
      parts.leftArm.rotation.x  += 0.16;
      parts.rightArm.rotation.x += 0.16;
      {
        const spikePulse = 1 + Math.sin(timeSeconds * 12 + phase) * 0.08;
        parts.runnerSpikeA.scale.set(spikePulse, 1.0 + (spikePulse - 1) * 1.8, spikePulse);
        parts.runnerSpikeB.scale.set(spikePulse, 1.0 + (spikePulse - 1) * 1.8, spikePulse);
      }
      break;

    case "EXPLODER": {
      const pulse    = 1 + Math.sin(timeSeconds *  9 + phase) * 0.046;
      const corePulse= 1 + Math.sin(timeSeconds * 11 + phase) * 0.13;
      parts.torso.scale.x = (parts.torso.userData.baseScale?.x ?? 1) * pulse;
      parts.torso.scale.z = (parts.torso.userData.baseScale?.z ?? 1) * pulse;
      parts.exploderCore.scale.set(corePulse, corePulse, corePulse);
      parts.exploderCoreGlow.scale.set(corePulse * 1.09, corePulse * 1.09, corePulse * 1.09);
      parts.exploderFuseA.rotation.z += Math.sin(timeSeconds * 13 + phase) * 0.05;
      parts.exploderFuseB.rotation.z += Math.sin(timeSeconds * 12 + phase) * 0.05;
      break;
    }

    case "RANGED":
      parts.head.rotation.y      += Math.sin(slowT * 1.7) * 0.05;
      parts.rightArm.rotation.x  -= 0.20;
      parts.rangedAntenna.rotation.z += Math.sin(timeSeconds * 5 + phase) * 0.10;
      parts.rangedLens.scale.set(eyePulse, eyePulse, eyePulse);
      break;

    case "CRAWLER":
      // V3 new: hunched body, arms reaching forward like front legs,
      // legs pumping hard — creepy fast crawl silhouette
      group.position.y = bob * 0.016 * power - 0.52;  // much lower to ground

      // Torso pitches way forward
      parts.torso.rotation.x += 1.25;

      // Neck compensates so head faces forward
      parts.neck.rotation.x -= 0.30;
      parts.head.rotation.x -= 0.60;

      // Arms reach far forward (acting as front legs)
      parts.leftArm.rotation.x  += walk    * 0.80 * power + 1.05;
      parts.rightArm.rotation.x += walkOpp * 0.80 * power + 1.05;
      parts.leftArm.rotation.z  += 0.12;
      parts.rightArm.rotation.z -= 0.12;

      // Legs kick back hard (back legs)
      parts.leftLeg.rotation.x  += walkOpp * 0.65 * power;
      parts.rightLeg.rotation.x += walk    * 0.65 * power;

      // Frantic side sway
      group.rotation.z = walk * 0.055 * power;
      break;
  }
}

// ─────────────────────────────────────────────────────────
//  HIT REACTION  (V3 new export)
//  Call once when zombie takes a bullet.
//  hitAngleY: world-space angle of hit direction (radians)
// ─────────────────────────────────────────────────────────
export function triggerHitReaction(group, hitAngleY = 0) {
  if (!group) return;
  const parts = group.userData.parts;

  // Flash red emissive on skin materials
  const bm = group.userData.bodyMaterial;
  const hm = group.userData.headMaterial;
  if (bm) { bm.emissive.setHex(0xff1100); }
  if (hm) { hm.emissive.setHex(0xff1100); }
  group.userData.hitFlashT       = 1.0;
  group.userData._hitFlashActive = true;

  // Head flinch — snap back and sideways toward hit direction
  if (parts?.head) {
    const baseYaw = group.userData.baseYaw ?? Math.PI;
    const localAngle = hitAngleY - baseYaw;
    const side = Math.cos(localAngle);
    parts.head.rotation.x -= 0.30;
    parts.head.rotation.z += side * 0.22;
    // The motion updater's resetPart call will restore these each subsequent frame,
    // so the snap is visible for exactly one frame — enough for feel.
    // For a multi-frame flinch, store a flinch timer:
    group.userData.flinchT = 0.12;  // seconds
  }
}

// ─────────────────────────────────────────────────────────
//  DEATH ANIMATION  (V3 new exports)
// ─────────────────────────────────────────────────────────

/**
 * Call once when the zombie dies. Sets up the collapse state.
 * @param {THREE.Group} group
 * @param {'forward'|'back'|'left'|'right'} direction - which way to fall
 */
export function startDeathAnimation(group, direction = null) {
  if (!group) return;
  group.userData.dying    = true;
  group.userData.deathT   = 0;
  // Random fall direction if none specified
  group.userData.deathDir = (direction === 'left' || Math.random() < 0.5) ? 1 : -1;
}

/**
 * Call every frame while dying. Drives collapse. Returns true when done.
 * The caller should remove the group from scene when this returns true.
 * @param {THREE.Group} group
 * @param {number} dt — delta time in seconds
 * @returns {boolean} true if animation is fully complete
 */
export function tickDeathAnimation(group, dt) {
  if (!group) return true;
  if (!group.userData.dying) return true;
  // Actual animation driven inside updateProceduralZombieMotion.
  // This function is the poll to check completion and clean up.
  return (group.userData.deathT ?? 0) >= 1.5;
}

// ─────────────────────────────────────────────────────────
//  TYPE CONFIG HELPER  (V3 new export)
//  Returns default spawn config for a given type name.
//  Useful for zombie spawners to get scale + color + speed.
// ─────────────────────────────────────────────────────────
export function getZombieTypeConfig(typeName) {
  const configs = {
    SHAMBLER: { color: 0x7fa06b, scale: 1.00, health: 100, speed: 2.4, score: 10 },
    RUNNER:   { color: 0x8faa55, scale: 0.92, health: 60,  speed: 5.2, score: 15 },
    GOLIATH:  { color: 0x6a8860, scale: 1.55, health: 480, speed: 1.6, score: 50 },
    EXPLODER: { color: 0xaa7755, scale: 1.10, health: 80,  speed: 3.0, score: 25 },
    RANGED:   { color: 0x6688aa, scale: 0.96, health: 90,  speed: 2.0, score: 20 },
    CRAWLER:  { color: 0x7a9060, scale: 0.84, health: 55,  speed: 4.8, score: 15 },
  };
  return configs[typeName] ?? configs.SHAMBLER;
}