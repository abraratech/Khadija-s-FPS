// js/actors/hero_shambler.js
// VIS.6 R2B.1 — Shambler render-budget performance hotfix.
import * as THREE from 'three';

const GEOMETRY_CACHE = new Map();

function cachedGeometry(key, factory) {
  if (!GEOMETRY_CACHE.has(key)) GEOMETRY_CACHE.set(key, factory());
  return GEOMETRY_CACHE.get(key);
}

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.82,
    metalness: options.metalness ?? 0.02,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    flatShading: true,
    envMapIntensity: options.envMapIntensity ?? 0.32,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    side: options.side ?? THREE.FrontSide,
  });
}

function markObject(object, name, { head = false } = {}) {
  object.name = name;
  object.castShadow = false;
  object.receiveShadow = false;
  object.frustumCulled = true;
  object.userData.keepMaterial = true;
  object.userData.isHeroShambler = true;
  object.userData.basePosition = object.position.clone();
  object.userData.baseRotation = object.rotation.clone();
  object.userData.baseScale = object.scale.clone();
  if (head) object.userData.isHead = true;
  return object;
}

function markHeadHierarchy(object) {
  object.userData.isHead = true;
  object.traverse?.((child) => {
    child.userData.isHead = true;
  });
  return object;
}

function makeMesh(name, geometry, material, position, rotation = null, scale = null, options = {}) {
  const mesh = markObject(new THREE.Mesh(geometry, material), name, options);
  mesh.position.copy(position);
  if (rotation) mesh.rotation.copy(rotation);
  if (scale) mesh.scale.copy(scale);
  mesh.userData.basePosition.copy(mesh.position);
  mesh.userData.baseRotation.copy(mesh.rotation);
  mesh.userData.baseScale.copy(mesh.scale);
  return mesh;
}

function makePivot(name, position, rotation = null, options = {}) {
  const pivot = markObject(new THREE.Group(), name, options);
  pivot.position.copy(position);
  if (rotation) pivot.rotation.copy(rotation);
  pivot.userData.basePosition.copy(pivot.position);
  pivot.userData.baseRotation.copy(pivot.rotation);
  return pivot;
}

function resetTransform(object) {
  if (!object) return;
  object.position.copy(object.userData.basePosition || object.position);
  object.rotation.copy(object.userData.baseRotation || object.rotation);
  object.scale.copy(object.userData.baseScale || object.scale);
}

function ringGeometry(key, rings, segments = 8) {
  return cachedGeometry(`hero-ring:${key}`, () => {
    const positions = [];
    const indices = [];
    const normals = [];
    const uvs = [];

    rings.forEach((ring, ringIndex) => {
      const width = ring.width;
      const frontDepth = ring.frontDepth;
      const backDepth = ring.backDepth;
      const xOffset = ring.xOffset || 0;
      const zOffset = ring.zOffset || 0;
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        const x = xOffset + Math.cos(angle) * width;
        const depth = Math.sin(angle) < 0 ? frontDepth : backDepth;
        const z = zOffset + Math.sin(angle) * depth;
        positions.push(x, ring.y, z);
        uvs.push(segment / segments, ringIndex / Math.max(1, rings.length - 1));
      }
    });

    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      const aStart = ringIndex * segments;
      const bStart = (ringIndex + 1) * segments;
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        const a = aStart + segment;
        const b = aStart + next;
        const c = bStart + next;
        const d = bStart + segment;
        indices.push(a, d, b, b, d, c);
      }
    }

    const bottomCenter = positions.length / 3;
    positions.push(0, rings[0].y, 0);
    uvs.push(0.5, 0.5);
    const topCenter = positions.length / 3;
    positions.push(0, rings[rings.length - 1].y, 0);
    uvs.push(0.5, 0.5);

    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(bottomCenter, next, segment);
      const topStart = (rings.length - 1) * segments;
      indices.push(topCenter, topStart + segment, topStart + next);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function plateGeometry(key, points, depth = 0.04) {
  return cachedGeometry(`hero-plate:${key}`, () => {
    const shape = new THREE.Shape();
    points.forEach(([x, y], index) => {
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: Math.min(depth * 0.22, 0.012),
      bevelThickness: Math.min(depth * 0.22, 0.012),
      curveSegments: 1,
      steps: 1,
    });
    geometry.translate(0, 0, -depth * 0.5);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function makeTaperedLimbGeometry(key, length, upperRadius, lowerRadius, depthScale = 0.82) {
  return ringGeometry(key, [
    { y: -length * 0.50, width: lowerRadius, frontDepth: lowerRadius * depthScale, backDepth: lowerRadius * depthScale },
    { y: -length * 0.18, width: lowerRadius * 1.02, frontDepth: lowerRadius * depthScale, backDepth: lowerRadius * depthScale },
    { y: length * 0.34, width: upperRadius, frontDepth: upperRadius * depthScale, backDepth: upperRadius * depthScale },
    { y: length * 0.50, width: upperRadius * 0.92, frontDepth: upperRadius * depthScale, backDepth: upperRadius * depthScale },
  ], 7);
}

function addTo(parent, object) {
  parent.add(object);
  return object;
}

const SHAMBLER_VARIANTS = Object.freeze(['CIVILIAN', 'WORKER', 'RAVAGED']);

function normalizeShamblerVariant(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return SHAMBLER_VARIANTS.includes(normalized) ? normalized : 'CIVILIAN';
}


const SHAMBLER_MOTION_BASES = Object.freeze({
  CIVILIAN: Object.freeze({
    cadence: 0.90,
    bob: 0.022,
    sway: 0.021,
    forwardLean: 0.105,
    armSwingLeft: 0.40,
    armSwingRight: 0.35,
    legSwingLeft: 0.30,
    legSwingRight: 0.28,
    headYaw: 0.065,
    headRoll: 0.040,
    shoulderDrop: 0.035,
    limp: 0.045,
    dragSide: 1,
  }),
  WORKER: Object.freeze({
    cadence: 0.76,
    bob: 0.036,
    sway: 0.016,
    forwardLean: 0.135,
    armSwingLeft: 0.31,
    armSwingRight: 0.31,
    legSwingLeft: 0.25,
    legSwingRight: 0.25,
    headYaw: 0.036,
    headRoll: 0.024,
    shoulderDrop: 0.018,
    limp: 0.025,
    dragSide: -1,
  }),
  RAVAGED: Object.freeze({
    cadence: 1.03,
    bob: 0.018,
    sway: 0.032,
    forwardLean: 0.185,
    armSwingLeft: 0.19,
    armSwingRight: 0.53,
    legSwingLeft: 0.17,
    legSwingRight: 0.37,
    headYaw: 0.082,
    headRoll: 0.072,
    shoulderDrop: 0.135,
    limp: 0.175,
    dragSide: -1,
  }),
});

function seededUnit(seed, salt = 0) {
  const value = Math.sin((Number(seed) || 0) * 91.733 + salt * 17.171) * 43758.5453123;
  return value - Math.floor(value);
}

function buildShamblerMotionProfile(variantValue, seedValue) {
  const variant = normalizeShamblerVariant(variantValue);
  const base = SHAMBLER_MOTION_BASES[variant];
  const seed = Number.isFinite(Number(seedValue)) ? Number(seedValue) : 0.5;
  const variance = (seededUnit(seed, 1) - 0.5) * 0.12;
  const dragSide = seededUnit(seed, 2) > 0.5 ? 1 : -1;

  return Object.freeze({
    ...base,
    cadence: base.cadence * (1 + variance),
    phaseOffset: seededUnit(seed, 3) * Math.PI * 2,
    breathPhase: seededUnit(seed, 4) * Math.PI * 2,
    jawPhase: seededUnit(seed, 5) * Math.PI * 2,
    headBias: (seededUnit(seed, 6) - 0.5) * 0.09,
    strideBias: (seededUnit(seed, 7) - 0.5) * 0.08,
    dragSide: variant === 'RAVAGED' ? dragSide : base.dragSide,
  });
}

function rememberVariantFoundation(object) {
  if (!object || object.userData.variantFoundation) return;
  object.userData.variantFoundation = {
    position: object.userData.basePosition.clone(),
    rotation: object.userData.baseRotation.clone(),
    scale: object.userData.baseScale.clone(),
  };
}

function restoreVariantFoundation(object) {
  if (!object) return;
  rememberVariantFoundation(object);
  const foundation = object.userData.variantFoundation;
  object.position.copy(foundation.position);
  object.rotation.copy(foundation.rotation);
  object.scale.copy(foundation.scale);
}

function commitVariantBase(object) {
  if (!object) return;
  object.userData.basePosition.copy(object.position);
  object.userData.baseRotation.copy(object.rotation);
  object.userData.baseScale.copy(object.scale);
}

function setObjectsVisible(objects, visible) {
  for (const object of objects || []) {
    if (object) object.visible = visible;
  }
}

const HERO_RENDER_TIERS = Object.freeze(['FULL', 'STANDARD']);

function normalizeHeroRenderTier(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return HERO_RENDER_TIERS.includes(normalized) ? normalized : 'FULL';
}

export function setHeroShamblerRenderTier(root, tierValue = 'FULL') {
  const parts = root?.userData?.parts;
  if (!parts) return false;

  const tier = normalizeHeroRenderTier(tierValue);
  root.userData.renderTier = tier;
  applyShamblerVariant(root, root.userData.variant);
  setObjectsVisible(parts.performanceMicroParts, tier === 'FULL');
  return true;
}

function applyShamblerVariant(root, variantValue) {
  const parts = root?.userData?.parts;
  const materials = root?.userData?.materials;
  if (!parts || !materials) return false;

  const variant = normalizeShamblerVariant(variantValue);
  root.userData.variant = variant;

  const poseObjects = [
    root,
    parts.pelvis,
    parts.torso,
    parts.head,
    parts.skull,
    parts.cheekLeft,
    parts.cheekRight,
    parts.browLeft,
    parts.browRight,
    parts.upperJaw,
    parts.lowerJaw,
    parts.neck,
    parts.leftArm,
    parts.rightArm,
    parts.leftUpperArm,
    parts.rightUpperArm,
    parts.leftForearm,
    parts.rightForearm,
    parts.leftHand,
    parts.rightHand,
    parts.leftLeg,
    parts.rightLeg,
    parts.leftThigh,
    parts.rightThigh,
    parts.leftShin,
    parts.rightShin,
    parts.leftFoot,
    parts.rightFoot,
    parts.leftShoulderShroud,
    parts.rightShoulderCap,
    parts.hair,
  ];

  poseObjects.forEach(restoreVariantFoundation);

  setObjectsVisible(parts.civilianVariantParts, variant === 'CIVILIAN');
  setObjectsVisible(parts.workerVariantParts, variant === 'WORKER');
  setObjectsVisible(parts.ravagedVariantParts, variant === 'RAVAGED');

  parts.hairTuftLeft.visible = variant !== 'RAVAGED';
  parts.hairTuftRight.visible = variant === 'CIVILIAN';

  if (variant === 'CIVILIAN') {
    root.scale.set(0.965, 1.015, 0.965);
    parts.torso.scale.set(0.925, 1.015, 0.925);
    parts.pelvis.scale.set(0.940, 1.0, 0.940);
    parts.head.position.y += 0.010;
    parts.head.rotation.z -= 0.045;
    parts.head.scale.multiply(new THREE.Vector3(0.98, 1.04, 0.98));
    parts.skull.scale.multiply(new THREE.Vector3(0.98, 1.04, 0.98));
    parts.cheekLeft.scale.multiply(new THREE.Vector3(1.03, 0.96, 1.02));
    parts.cheekRight.scale.multiply(new THREE.Vector3(0.98, 1.02, 1.00));
    parts.lowerJaw.scale.multiply(new THREE.Vector3(0.96, 0.94, 1.00));
    parts.leftArm.position.x += 0.020;
    parts.rightArm.position.x -= 0.025;
    parts.rightArm.position.y -= 0.035;
    parts.rightArm.rotation.z += 0.085;
    parts.leftLeg.rotation.z -= 0.020;
    parts.rightLeg.rotation.z += 0.040;
    parts.leftShoulderShroud.scale.multiply(new THREE.Vector3(0.88, 0.88, 0.92));
    parts.rightShoulderCap.scale.multiply(new THREE.Vector3(0.86, 0.86, 0.90));
    parts.leftFoot.scale.multiply(new THREE.Vector3(0.92, 0.95, 0.94));
    parts.rightFoot.scale.multiply(new THREE.Vector3(0.92, 0.95, 0.94));
  } else if (variant === 'WORKER') {
    root.scale.set(1.035, 1.015, 1.025);
    parts.torso.scale.set(1.085, 1.0, 1.055);
    parts.pelvis.scale.set(1.055, 1.0, 1.035);
    parts.head.scale.multiply(new THREE.Vector3(1.015, 0.925, 1.025));
    parts.skull.scale.multiply(new THREE.Vector3(1.04, 0.93, 1.03));
    parts.browLeft.scale.multiply(new THREE.Vector3(1.08, 1.05, 1.00));
    parts.browRight.scale.multiply(new THREE.Vector3(1.08, 1.05, 1.00));
    parts.upperJaw.scale.multiply(new THREE.Vector3(1.08, 0.94, 1.04));
    parts.lowerJaw.scale.multiply(new THREE.Vector3(1.10, 0.92, 1.06));
    parts.leftArm.position.x -= 0.030;
    parts.rightArm.position.x += 0.030;
    parts.leftUpperArm.scale.multiply(new THREE.Vector3(1.12, 1.03, 1.10));
    parts.rightUpperArm.scale.multiply(new THREE.Vector3(1.12, 1.03, 1.10));
    parts.leftForearm.scale.multiply(new THREE.Vector3(1.10, 1.02, 1.08));
    parts.rightForearm.scale.multiply(new THREE.Vector3(1.10, 1.02, 1.08));
    parts.leftHand.scale.multiply(new THREE.Vector3(1.10, 1.06, 1.08));
    parts.rightHand.scale.multiply(new THREE.Vector3(1.10, 1.06, 1.08));
    parts.leftThigh.scale.multiply(new THREE.Vector3(1.08, 1.0, 1.06));
    parts.rightThigh.scale.multiply(new THREE.Vector3(1.08, 1.0, 1.06));
    parts.leftFoot.scale.multiply(new THREE.Vector3(1.12, 1.04, 1.13));
    parts.rightFoot.scale.multiply(new THREE.Vector3(1.12, 1.04, 1.13));
    parts.leftShoulderShroud.scale.multiply(new THREE.Vector3(1.05, 1.03, 1.03));
    parts.rightShoulderCap.scale.multiply(new THREE.Vector3(1.22, 1.16, 1.10));
  } else {
    root.scale.set(0.945, 1.035, 0.950);
    parts.torso.scale.set(0.915, 1.035, 0.900);
    parts.pelvis.scale.set(0.930, 1.0, 0.920);
    parts.torso.rotation.x -= 0.055;
    parts.torso.rotation.z -= 0.060;
    parts.head.position.x -= 0.025;
    parts.head.position.y -= 0.020;
    parts.head.rotation.z -= 0.125;
    parts.head.scale.multiply(new THREE.Vector3(0.94, 1.08, 0.95));
    parts.skull.scale.multiply(new THREE.Vector3(0.93, 1.08, 0.95));
    parts.cheekLeft.scale.multiply(new THREE.Vector3(0.90, 1.05, 0.95));
    parts.cheekRight.scale.multiply(new THREE.Vector3(1.06, 0.92, 1.02));
    parts.upperJaw.rotation.z += 0.055;
    parts.lowerJaw.rotation.z -= 0.105;
    parts.lowerJaw.scale.multiply(new THREE.Vector3(0.93, 1.08, 0.98));
    parts.neck.rotation.z -= 0.075;
    parts.leftArm.position.y -= 0.105;
    parts.leftArm.position.x += 0.020;
    parts.leftArm.rotation.z += 0.110;
    parts.leftUpperArm.scale.multiply(new THREE.Vector3(0.94, 1.10, 0.92));
    parts.leftForearm.scale.multiply(new THREE.Vector3(0.91, 1.13, 0.90));
    parts.leftHand.scale.multiply(new THREE.Vector3(0.94, 1.08, 0.92));
    parts.rightArm.position.x += 0.020;
    parts.rightUpperArm.scale.multiply(new THREE.Vector3(1.02, 0.96, 1.0));
    parts.leftLeg.rotation.z -= 0.075;
    parts.leftShin.scale.multiply(new THREE.Vector3(0.95, 1.08, 0.94));
    parts.leftFoot.position.z += 0.035;
    parts.rightLeg.position.x += 0.025;
    parts.leftShoulderShroud.scale.multiply(new THREE.Vector3(1.20, 1.14, 1.06));
    parts.rightShoulderCap.scale.multiply(new THREE.Vector3(0.78, 0.82, 0.82));
    parts.hair.scale.multiply(new THREE.Vector3(0.82, 0.84, 0.84));
  }

  poseObjects.forEach(commitVariantBase);
  root.userData.motionProfile = buildShamblerMotionProfile(
    variant,
    root.userData.motionSeed,
  );
  return true;
}

export function createHeroShamblerVisual(options = {}) {
  const root = new THREE.Group();
  root.name = 'hero_shambler_visual';
  root.rotation.y = Math.PI;
  root.userData.baseYaw = Math.PI;
  root.userData.basePosition = root.position.clone();
  root.userData.baseRotation = root.rotation.clone();
  root.userData.baseScale = root.scale.clone();
  root.userData.visualPatch = 'vis6-r2f-enemy-family-cohesion';
  root.userData.motionPhase = Number(options.motionPhase) || Math.random() * Math.PI * 2;
  root.userData.motionSeed = Number.isFinite(Number(options.motionSeed))
    ? Number(options.motionSeed)
    : Math.random();
  root.userData.variant = normalizeShamblerVariant(options.variant);
  root.userData.renderTier = normalizeHeroRenderTier(options.renderTier);

  const materials = {
    skin: makeMaterial(0x778173, { roughness: 0.94, envMapIntensity: 0.18 }),
    skinShadow: makeMaterial(0x465049, { roughness: 0.97, envMapIntensity: 0.10 }),
    deadSkin: makeMaterial(0x8d8877, { roughness: 0.98, envMapIntensity: 0.10 }),
    wound: makeMaterial(0x3d090b, { roughness: 0.88, emissive: 0x120102, emissiveIntensity: 0.045 }),
    freshWound: makeMaterial(0x5b1113, { roughness: 0.76, emissive: 0x1a0203, emissiveIntensity: 0.07 }),
    bone: makeMaterial(0xd0c59e, { roughness: 0.76 }),
    cloth: makeMaterial(0x252d2d, { roughness: 0.99, envMapIntensity: 0.10 }),
    clothDark: makeMaterial(0x111718, { roughness: 1.0, envMapIntensity: 0.08 }),
    clothAccent: makeMaterial(0x344044, { roughness: 0.96, envMapIntensity: 0.14 }),
    hazard: makeMaterial(0xb47728, { roughness: 0.74, metalness: 0.08, envMapIntensity: 0.24 }),
    rubber: makeMaterial(0x0b0e0f, { roughness: 0.92, envMapIntensity: 0.08 }),
    pants: makeMaterial(0x1a2022, { roughness: 0.99, envMapIntensity: 0.08 }),
    leather: makeMaterial(0x1d1816, { roughness: 0.88, envMapIntensity: 0.16 }),
    metal: makeMaterial(0x394347, { roughness: 0.50, metalness: 0.45, envMapIntensity: 0.50 }),
    socket: makeMaterial(0x030607, { roughness: 1.0, envMapIntensity: 0.0 }),
    mouth: makeMaterial(0x120506, { roughness: 0.90, envMapIntensity: 0.0 }),
    eye: makeMaterial(0xd7ef86, {
      roughness: 0.34,
      metalness: 0.0,
      emissive: 0x97bd45,
      emissiveIntensity: 0.56,
      envMapIntensity: 0.0,
    }),
    hair: makeMaterial(0x141617, { roughness: 0.96, envMapIntensity: 0.06 }),
  };

  const pelvis = addTo(root, makeMesh(
    'hero_shambler_pelvis',
    ringGeometry('pelvis-v1', [
      { y: -0.13, width: 0.25, frontDepth: 0.18, backDepth: 0.17 },
      { y: 0.02, width: 0.29, frontDepth: 0.20, backDepth: 0.18, xOffset: -0.015 },
      { y: 0.16, width: 0.27, frontDepth: 0.19, backDepth: 0.17 },
    ], 8),
    materials.pants,
    new THREE.Vector3(0, 0.80, 0),
    new THREE.Euler(0.02, 0, -0.035),
  ));

  const torso = addTo(root, makePivot('hero_shambler_torso_rig', new THREE.Vector3(0, 1.21, 0), new THREE.Euler(-0.06, 0, 0.035)));
  const torsoBody = addTo(torso, makeMesh(
    'hero_shambler_torso_body',
    ringGeometry('torso-v3-finish', [
      { y: -0.43, width: 0.225, frontDepth: 0.165, backDepth: 0.155 },
      { y: -0.18, width: 0.270, frontDepth: 0.190, backDepth: 0.165, xOffset: 0.01 },
      { y: 0.13, width: 0.345, frontDepth: 0.210, backDepth: 0.180, xOffset: -0.012 },
      { y: 0.34, width: 0.395, frontDepth: 0.215, backDepth: 0.185 },
      { y: 0.45, width: 0.285, frontDepth: 0.170, backDepth: 0.155 },
    ], 10),
    materials.cloth,
    new THREE.Vector3(0, 0, 0),
  ));

  const exposedChest = addTo(torso, makeMesh(
    'hero_shambler_exposed_chest',
    plateGeometry('exposed-chest-v1', [
      [-0.17, 0.20],
      [0.06, 0.25],
      [0.18, 0.08],
      [0.13, -0.21],
      [-0.10, -0.28],
      [-0.21, -0.04],
    ], 0.055),
    materials.skin,
    new THREE.Vector3(0.08, 0.04, -0.236),
    new THREE.Euler(0.02, 0.02, -0.10),
  ));
  const chestWoundCavity = addTo(torso, makeMesh(
    'hero_shambler_chest_wound_cavity',
    plateGeometry('chest-wound-cavity-v1', [
      [-0.14, 0.13],
      [0.09, 0.18],
      [0.16, 0.02],
      [0.07, -0.17],
      [-0.13, -0.13],
      [-0.18, 0.01],
    ], 0.018),
    materials.mouth,
    new THREE.Vector3(0.09, 0.01, -0.266),
    new THREE.Euler(0, 0, 0.06),
  ));
  const chestWound = addTo(torso, makeMesh(
    'hero_shambler_chest_wound',
    plateGeometry('chest-wound-v2-finish', [
      [-0.105, 0.095],
      [0.065, 0.125],
      [0.115, 0.015],
      [0.045, -0.115],
      [-0.090, -0.090],
      [-0.125, 0.005],
    ], 0.014),
    materials.freshWound,
    new THREE.Vector3(0.09, 0.01, -0.282),
    new THREE.Euler(0, 0, 0.06),
  ));
  const tornClothLeft = addTo(torso, makeMesh(
    'hero_shambler_torn_cloth_left',
    plateGeometry('torn-left-v2-finish', [
      [-0.18, 0.30],
      [0.00, 0.25],
      [-0.01, -0.31],
      [-0.15, -0.25],
      [-0.22, 0.03],
    ], 0.032),
    materials.clothDark,
    new THREE.Vector3(-0.08, 0, -0.244),
    new THREE.Euler(0, 0, -0.08),
  ));
  const tornClothRight = addTo(torso, makeMesh(
    'hero_shambler_torn_cloth_right',
    plateGeometry('torn-right-v2-finish', [
      [-0.01, 0.29],
      [0.19, 0.24],
      [0.20, -0.21],
      [0.07, -0.30],
      [0.00, -0.04],
    ], 0.032),
    materials.cloth,
    new THREE.Vector3(0.08, 0, -0.247),
    new THREE.Euler(0, 0, 0.06),
  ));

  const belt = addTo(root, makeMesh(
    'hero_shambler_belt',
    ringGeometry('belt-v1', [
      { y: -0.04, width: 0.29, frontDepth: 0.205, backDepth: 0.18 },
      { y: 0.04, width: 0.29, frontDepth: 0.205, backDepth: 0.18 },
    ], 8),
    materials.leather,
    new THREE.Vector3(0, 0.94, 0),
    new THREE.Euler(0, 0, -0.04),
  ));
  addTo(belt, makeMesh(
    'hero_shambler_buckle',
    plateGeometry('buckle-v1', [[-0.045, 0.035], [0.045, 0.035], [0.055, -0.035], [-0.055, -0.035]], 0.03),
    materials.metal,
    new THREE.Vector3(-0.055, 0, -0.214),
  ));

  const neck = addTo(root, makeMesh(
    'hero_shambler_neck',
    ringGeometry('neck-v2-finish', [
      { y: -0.13, width: 0.155, frontDepth: 0.115, backDepth: 0.125 },
      { y: -0.01, width: 0.138, frontDepth: 0.105, backDepth: 0.115, xOffset: 0.008 },
      { y: 0.10, width: 0.128, frontDepth: 0.100, backDepth: 0.110, xOffset: 0.014 },
    ], 8),
    materials.skinShadow,
    new THREE.Vector3(0.012, 1.585, 0.005),
    new THREE.Euler(0.08, 0, -0.04),
  ));
  const trapeziusLeft = addTo(torso, makeMesh(
    'hero_shambler_left_trapezius',
    ringGeometry('trapezius-left-v1', [
      { y: -0.07, width: 0.145, frontDepth: 0.105, backDepth: 0.100 },
      { y: 0.07, width: 0.095, frontDepth: 0.085, backDepth: 0.085, xOffset: 0.020 },
    ], 7),
    materials.clothDark,
    new THREE.Vector3(-0.205, 0.355, 0.005),
    new THREE.Euler(0.02, 0.02, 0.46),
  ));
  const trapeziusRight = addTo(torso, makeMesh(
    'hero_shambler_right_trapezius',
    ringGeometry('trapezius-right-v1', [
      { y: -0.07, width: 0.145, frontDepth: 0.105, backDepth: 0.100 },
      { y: 0.07, width: 0.095, frontDepth: 0.085, backDepth: 0.085, xOffset: -0.020 },
    ], 7),
    materials.cloth,
    new THREE.Vector3(0.205, 0.355, 0.005),
    new THREE.Euler(0.02, -0.02, -0.46),
  ));

  const head = addTo(root, makePivot('hero_shambler_head_rig', new THREE.Vector3(-0.018, 1.79, -0.025), new THREE.Euler(0.04, -0.04, 0.035), { head: true }));
  head.scale.set(0.885, 0.900, 0.885);
  head.userData.baseScale.copy(head.scale);
  const skull = addTo(head, makeMesh(
    'hero_shambler_skull',
    ringGeometry('skull-v3', [
      { y: -0.29, width: 0.17, frontDepth: 0.18, backDepth: 0.17, xOffset: 0.015 },
      { y: -0.19, width: 0.235, frontDepth: 0.24, backDepth: 0.205, xOffset: 0.010 },
      { y: 0.02, width: 0.27, frontDepth: 0.255, backDepth: 0.225 },
      { y: 0.20, width: 0.245, frontDepth: 0.22, backDepth: 0.215, xOffset: -0.008 },
      { y: 0.31, width: 0.17, frontDepth: 0.16, backDepth: 0.185, xOffset: -0.018 },
    ], 10),
    materials.skin,
    new THREE.Vector3(0, 0, 0),
    null,
    null,
    { head: true },
  ));
  markHeadHierarchy(skull);

  const cheekLeft = addTo(head, makeMesh(
    'hero_shambler_left_cheek',
    plateGeometry('cheek-left-v2', [[-0.13, 0.12], [0.03, 0.16], [0.11, -0.04], [0.02, -0.18], [-0.15, -0.11]], 0.055),
    materials.deadSkin,
    new THREE.Vector3(-0.10, -0.035, -0.245),
    new THREE.Euler(-0.02, 0.10, -0.07),
    null,
    { head: true },
  ));
  const cheekRight = addTo(head, makeMesh(
    'hero_shambler_right_cheek',
    plateGeometry('cheek-right-v2', [[-0.03, 0.14], [0.15, 0.09], [0.15, -0.10], [0.01, -0.18], [-0.10, -0.02]], 0.050),
    materials.skinShadow,
    new THREE.Vector3(0.10, -0.045, -0.248),
    new THREE.Euler(0.02, -0.08, 0.06),
    null,
    { head: true },
  ));
  markHeadHierarchy(cheekLeft);
  markHeadHierarchy(cheekRight);

  const browLeft = addTo(head, makeMesh(
    'hero_shambler_left_brow',
    plateGeometry('brow-left-v2', [[-0.13, 0.04], [0.05, 0.06], [0.11, -0.02], [-0.11, -0.055]], 0.045),
    materials.skinShadow,
    new THREE.Vector3(-0.105, 0.095, -0.275),
    new THREE.Euler(-0.02, 0.04, -0.13),
    null,
    { head: true },
  ));
  const browRight = addTo(head, makeMesh(
    'hero_shambler_right_brow',
    plateGeometry('brow-right-v2', [[-0.05, 0.05], [0.14, 0.035], [0.12, -0.055], [-0.11, -0.025]], 0.045),
    materials.skinShadow,
    new THREE.Vector3(0.105, 0.09, -0.275),
    new THREE.Euler(-0.01, -0.04, 0.10),
    null,
    { head: true },
  ));
  markHeadHierarchy(browLeft);
  markHeadHierarchy(browRight);

  const makeEye = (side) => {
    const socket = addTo(head, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_eye_socket`,
      cachedGeometry('hero-eye-socket-v2-finish', () => new THREE.DodecahedronGeometry(0.064, 0)),
      materials.socket,
      new THREE.Vector3(side * 0.102, 0.034, -0.279),
      new THREE.Euler(0, side * 0.04, side * 0.05),
      new THREE.Vector3(1.12, 0.70, 0.42),
      { head: true },
    ));
    const eye = addTo(head, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_eye`,
      cachedGeometry('hero-eye-v2-finish', () => new THREE.SphereGeometry(0.022, 8, 6)),
      materials.eye,
      new THREE.Vector3(side * 0.102, 0.031, -0.316),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(1.0, 0.62, 0.45),
      { head: true },
    ));
    markHeadHierarchy(socket);
    markHeadHierarchy(eye);
    return { socket, eye };
  };
  const leftEye = makeEye(-1);
  const rightEye = makeEye(1);

  const noseBridge = addTo(head, makeMesh(
    'hero_shambler_nose_bridge',
    plateGeometry('nose-bridge-v1', [[-0.045, 0.10], [0.045, 0.09], [0.065, -0.08], [0.00, -0.15], [-0.055, -0.06]], 0.065),
    materials.skinShadow,
    new THREE.Vector3(0.005, -0.018, -0.281),
    new THREE.Euler(0.02, 0, 0.025),
    null,
    { head: true },
  ));
  const noseCavity = addTo(head, makeMesh(
    'hero_shambler_nose_cavity',
    plateGeometry('nose-cavity-v1', [[-0.04, 0.035], [0.04, 0.035], [0.06, -0.035], [0, -0.07], [-0.055, -0.03]], 0.02),
    materials.socket,
    new THREE.Vector3(0.008, -0.12, -0.325),
    new THREE.Euler(0, 0, 0.03),
    null,
    { head: true },
  ));
  markHeadHierarchy(noseBridge);
  markHeadHierarchy(noseCavity);

  const mouthCavity = addTo(head, makeMesh(
    'hero_shambler_mouth_cavity',
    plateGeometry('mouth-cavity-v3-finish', [[-0.125, 0.045], [0.105, 0.038], [0.120, -0.058], [0.035, -0.108], [-0.105, -0.085]], 0.030),
    materials.mouth,
    new THREE.Vector3(0.012, -0.185, -0.295),
    new THREE.Euler(0, 0, -0.035),
    null,
    { head: true },
  ));
  const upperJaw = addTo(head, makeMesh(
    'hero_shambler_upper_jaw',
    plateGeometry('upper-jaw-v3-finish', [[-0.128, 0.048], [0.125, 0.040], [0.092, -0.030], [-0.095, -0.038]], 0.045),
    materials.deadSkin,
    new THREE.Vector3(0.01, -0.145, -0.278),
    new THREE.Euler(0, 0, -0.03),
    null,
    { head: true },
  ));
  const lowerJaw = addTo(head, makePivot('hero_shambler_lower_jaw_rig', new THREE.Vector3(0.012, -0.225, -0.020), new THREE.Euler(0.02, 0, -0.035), { head: true }));
  const lowerJawMesh = addTo(lowerJaw, makeMesh(
    'hero_shambler_lower_jaw',
    ringGeometry('lower-jaw-v3-finish', [
      { y: -0.075, width: 0.085, frontDepth: 0.082, backDepth: 0.064 },
      { y: 0.015, width: 0.135, frontDepth: 0.103, backDepth: 0.072 },
      { y: 0.082, width: 0.122, frontDepth: 0.095, backDepth: 0.068 },
    ], 7),
    materials.skinShadow,
    new THREE.Vector3(0.015, 0, -0.235),
    null,
    null,
    { head: true },
  ));
  markHeadHierarchy(mouthCavity);
  markHeadHierarchy(upperJaw);
  markHeadHierarchy(lowerJaw);
  markHeadHierarchy(lowerJawMesh);

  const toothOffsets = [
    [-0.072, -0.158, -0.327, 0.028, 0.060, -0.07],
    [-0.005, -0.164, -0.333, 0.033, 0.069, 0.015],
    [0.072, -0.167, -0.328, 0.024, 0.051, 0.055],
  ];
  const teeth = toothOffsets.map(([x, y, z, radius, height, rot], index) => {
    const tooth = addTo(head, makeMesh(
      `hero_shambler_tooth_${index}`,
      cachedGeometry(`hero-tooth-${index}`, () => new THREE.ConeGeometry(radius, height, 5)),
      materials.bone,
      new THREE.Vector3(x, y, z),
      new THREE.Euler(Math.PI, 0, rot),
      null,
      { head: true },
    ));
    markHeadHierarchy(tooth);
    return tooth;
  });

  const faceWoundCavity = addTo(head, makeMesh(
    'hero_shambler_face_wound_cavity',
    plateGeometry('face-wound-cavity-v1', [[-0.10, 0.12], [0.10, 0.08], [0.13, -0.08], [-0.02, -0.17], [-0.14, -0.04]], 0.016),
    materials.socket,
    new THREE.Vector3(0.16, -0.015, -0.278),
    new THREE.Euler(0.02, -0.08, 0.18),
    null,
    { head: true },
  ));
  const faceWound = addTo(head, makeMesh(
    'hero_shambler_face_wound',
    plateGeometry('face-wound-v3-finish', [[-0.072, 0.085], [0.070, 0.055], [0.088, -0.055], [-0.012, -0.118], [-0.095, -0.028]], 0.012),
    materials.wound,
    new THREE.Vector3(0.16, -0.015, -0.286),
    new THREE.Euler(0.02, -0.08, 0.18),
    null,
    { head: true },
  ));
  const exposedBone = addTo(head, makeMesh(
    'hero_shambler_exposed_temporal_bone',
    plateGeometry('temporal-bone-v1', [[-0.08, 0.08], [0.08, 0.06], [0.11, -0.07], [-0.02, -0.11], [-0.10, -0.02]], 0.022),
    materials.bone,
    new THREE.Vector3(0.17, 0.16, -0.245),
    new THREE.Euler(0.04, -0.18, 0.22),
    null,
    { head: true },
  ));
  markHeadHierarchy(faceWound);
  markHeadHierarchy(exposedBone);

  const hair = addTo(head, makePivot(
    'hero_shambler_hair_rig',
    new THREE.Vector3(-0.012, 0.225, 0.015),
    new THREE.Euler(-0.03, 0.04, -0.08),
    { head: true },
  ));
  const hairBack = addTo(hair, makeMesh(
    'hero_shambler_hair_back',
    ringGeometry('hair-back-v3-finish', [
      { y: -0.015, width: 0.185, frontDepth: 0.150, backDepth: 0.190 },
      { y: 0.075, width: 0.205, frontDepth: 0.145, backDepth: 0.195, xOffset: -0.012 },
      { y: 0.145, width: 0.118, frontDepth: 0.090, backDepth: 0.132, xOffset: -0.032 },
    ], 8),
    materials.hair,
    new THREE.Vector3(0, 0, 0),
    null,
    null,
    { head: true },
  ));
  const hairTuftLeft = addTo(hair, makeMesh(
    'hero_shambler_hair_tuft_left',
    plateGeometry('hair-tuft-left-v1', [[-0.10, 0.08], [0.08, 0.06], [0.04, -0.10], [-0.12, -0.05]], 0.045),
    materials.hair,
    new THREE.Vector3(-0.095, 0.035, -0.150),
    new THREE.Euler(0.08, 0.10, -0.24),
    null,
    { head: true },
  ));
  const hairTuftRight = addTo(hair, makeMesh(
    'hero_shambler_hair_tuft_right',
    plateGeometry('hair-tuft-right-v1', [[-0.07, 0.06], [0.09, 0.08], [0.11, -0.06], [-0.04, -0.09]], 0.040),
    materials.hair,
    new THREE.Vector3(0.085, 0.020, -0.145),
    new THREE.Euler(0.06, -0.08, 0.19),
    null,
    { head: true },
  ));
  markHeadHierarchy(hair);


  const makeArm = (side) => {
    const arm = addTo(root, makePivot(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_arm_rig`,
      new THREE.Vector3(side * 0.405, 1.46, -0.015),
      new THREE.Euler(-0.18, 0, side * 0.13),
    ));
    const upper = addTo(arm, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_upper_arm`,
      makeTaperedLimbGeometry('upper-arm-v2', 0.45, 0.105, 0.080, 0.82),
      side < 0 ? materials.skin : materials.cloth,
      new THREE.Vector3(side * 0.018, -0.24, 0),
      new THREE.Euler(0.02, 0, side * 0.025),
    ));
    const elbow = addTo(arm, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_elbow`,
      cachedGeometry('hero-elbow-v1', () => new THREE.DodecahedronGeometry(0.085, 0)),
      materials.skinShadow,
      new THREE.Vector3(side * 0.035, -0.48, 0.015),
      null,
      new THREE.Vector3(1.0, 0.75, 0.82),
    ));
    const forearm = addTo(arm, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_forearm`,
      makeTaperedLimbGeometry('forearm-v2', 0.50, 0.085, 0.065, 0.80),
      materials.skin,
      new THREE.Vector3(side * 0.075, -0.73, 0.04),
      new THREE.Euler(0.08, 0, side * 0.04),
    ));
    const hand = addTo(arm, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_hand`,
      cachedGeometry('hero-hand-v2', () => new THREE.DodecahedronGeometry(0.095, 0)),
      materials.deadSkin,
      new THREE.Vector3(side * 0.11, -1.02, 0.075),
      new THREE.Euler(0.06, 0, side * 0.08),
      new THREE.Vector3(0.82, 1.18, 0.76),
    ));
    const woundCavity = addTo(forearm, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_arm_wound_cavity`,
      plateGeometry(`arm-wound-cavity-${side}`, [[-0.055, 0.105], [0.065, 0.085], [0.075, -0.095], [-0.055, -0.115]], 0.012),
      materials.socket,
      new THREE.Vector3(side * 0.018, 0.03, -0.076),
      new THREE.Euler(0, 0, side * 0.12),
    ));
    const wound = addTo(forearm, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_arm_wound`,
      plateGeometry(`arm-wound-finish-${side}`, [[-0.040, 0.075], [0.045, 0.060], [0.050, -0.065], [-0.038, -0.078]], 0.009),
      materials.wound,
      new THREE.Vector3(side * 0.018, 0.03, -0.084),
      new THREE.Euler(0, 0, side * 0.12),
    ));
    const fingers = [-0.052, 0, 0.052].map((offset, index) => {
      const finger = addTo(hand, makeMesh(
        `hero_shambler_${side < 0 ? 'left' : 'right'}_finger_${index}`,
        makeTaperedLimbGeometry(`finger-r2a2-${index}`, 0.122 + index * 0.008, 0.020, 0.011, 0.72),
        materials.deadSkin,
        new THREE.Vector3(offset, -0.095, -0.035 - Math.abs(offset) * 0.16),
        new THREE.Euler(0.58 + index * 0.05, 0, offset * 2.1),
      ));
      const claw = addTo(finger, makeMesh(
        `hero_shambler_${side < 0 ? 'left' : 'right'}_claw_${index}`,
        cachedGeometry(`hero-claw-r2a2-${index}`, () => new THREE.ConeGeometry(0.012, 0.055, 5)),
        materials.bone,
        new THREE.Vector3(0, -0.082, -0.012),
        new THREE.Euler(0.62, 0, 0),
      ));
      return { finger, claw };
    });
    const thumb = addTo(hand, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_thumb`,
      makeTaperedLimbGeometry('thumb-r2a2-v1', 0.100, 0.021, 0.012, 0.72),
      materials.deadSkin,
      new THREE.Vector3(side * 0.078, -0.020, -0.018),
      new THREE.Euler(0.52, 0, side * 0.78),
    ));
    const handWrap = addTo(hand, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_hand_wrap`,
      ringGeometry(`hand-wrap-r2a2-${side}`, [
        { y: -0.030, width: 0.082, frontDepth: 0.060, backDepth: 0.055 },
        { y: 0.030, width: 0.088, frontDepth: 0.064, backDepth: 0.058 },
      ], 7),
      side < 0 ? materials.clothAccent : materials.rubber,
      new THREE.Vector3(0, 0.018, 0),
      new THREE.Euler(0.02, 0, side * 0.04),
    ));
    return { arm, upper, elbow, forearm, hand, woundCavity, wound, fingers, thumb, handWrap };
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  const makeLeg = (side) => {
    const leg = addTo(root, makePivot(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_leg_rig`,
      new THREE.Vector3(side * 0.16, 0.72, 0),
      new THREE.Euler(0, 0, side * 0.025),
    ));
    const thigh = addTo(leg, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_thigh`,
      makeTaperedLimbGeometry('thigh-v2', 0.46, 0.135, 0.105, 0.90),
      materials.pants,
      new THREE.Vector3(0, -0.23, 0),
      new THREE.Euler(0.02, 0, side * 0.015),
    ));
    const knee = addTo(leg, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_knee`,
      cachedGeometry('hero-knee-v1', () => new THREE.DodecahedronGeometry(0.105, 0)),
      side < 0 ? materials.skinShadow : materials.wound,
      new THREE.Vector3(0, -0.49, -0.03),
      null,
      new THREE.Vector3(0.92, 0.70, 0.82),
    ));
    const shin = addTo(leg, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_shin`,
      makeTaperedLimbGeometry('shin-v2', 0.45, 0.105, 0.078, 0.86),
      materials.pants,
      new THREE.Vector3(side * 0.018, -0.72, 0.01),
      new THREE.Euler(0.02, 0, side * 0.02),
    ));
    const foot = addTo(leg, makeMesh(
      `hero_shambler_${side < 0 ? 'left' : 'right'}_foot`,
      ringGeometry('foot-v2', [
        { y: -0.07, width: 0.12, frontDepth: 0.22, backDepth: 0.10 },
        { y: 0.07, width: 0.11, frontDepth: 0.18, backDepth: 0.10 },
      ], 8),
      side < 0 ? materials.deadSkin : materials.leather,
      new THREE.Vector3(side * 0.015, -0.98, -0.055),
      new THREE.Euler(0.02, 0, side * 0.02),
    ));
    return { leg, thigh, knee, shin, foot };
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  const shoulderStrapLeft = addTo(torso, makeMesh(
    'hero_shambler_left_strap',
    plateGeometry('strap-left-v1', [[-0.035, 0.34], [0.025, 0.35], [0.13, -0.30], [0.06, -0.31]], 0.028),
    materials.leather,
    new THREE.Vector3(-0.11, 0.02, -0.255),
    new THREE.Euler(0, 0, -0.14),
  ));
  const shoulderStrapRight = addTo(torso, makeMesh(
    'hero_shambler_right_strap',
    plateGeometry('strap-right-v1', [[-0.025, 0.35], [0.035, 0.34], [-0.055, -0.31], [-0.13, -0.30]], 0.028),
    materials.leather,
    new THREE.Vector3(0.12, 0.02, -0.255),
    new THREE.Euler(0, 0, 0.13),
  ));

  const leftShoulderShroud = addTo(torso, makeMesh(
    'hero_shambler_left_shoulder_shroud',
    plateGeometry('left-shoulder-shroud-r2a2', [
      [-0.20, 0.12],
      [0.08, 0.15],
      [0.16, 0.02],
      [0.05, -0.18],
      [-0.22, -0.10],
    ], 0.052),
    materials.clothDark,
    new THREE.Vector3(-0.305, 0.285, -0.055),
    new THREE.Euler(-0.10, 0.14, -0.22),
  ));
  const rightShoulderCap = addTo(torso, makeMesh(
    'hero_shambler_right_shoulder_cap',
    ringGeometry('right-shoulder-cap-r2a2', [
      { y: -0.075, width: 0.145, frontDepth: 0.110, backDepth: 0.095 },
      { y: 0.055, width: 0.125, frontDepth: 0.100, backDepth: 0.090, xOffset: -0.018 },
    ], 7),
    materials.deadSkin,
    new THREE.Vector3(0.315, 0.285, -0.005),
    new THREE.Euler(0.04, -0.10, -0.18),
  ));
  const sternumRidge = addTo(torso, makeMesh(
    'hero_shambler_sternum_ridge',
    ringGeometry('sternum-ridge-r2a2', [
      { y: -0.19, width: 0.035, frontDepth: 0.025, backDepth: 0.020 },
      { y: 0.20, width: 0.045, frontDepth: 0.030, backDepth: 0.022 },
    ], 6),
    materials.bone,
    new THREE.Vector3(0.055, 0.015, -0.292),
    new THREE.Euler(0.02, 0, -0.08),
  ));
  const exposedRibs = [-0.10, -0.025, 0.055].map((y, index) => addTo(torso, makeMesh(
    `hero_shambler_exposed_rib_${index}`,
    plateGeometry(`exposed-rib-r2a2-${index}`, [
      [-0.105, 0.018],
      [0.105, 0.012],
      [0.090, -0.018],
      [-0.095, -0.020],
    ], 0.016),
    materials.bone,
    new THREE.Vector3(0.095, y, -0.302 - index * 0.002),
    new THREE.Euler(0.01, 0, -0.06 + index * 0.03),
  )));
  const abdomenWrap = addTo(torso, makeMesh(
    'hero_shambler_abdomen_wrap',
    ringGeometry('abdomen-wrap-r2a2', [
      { y: -0.10, width: 0.245, frontDepth: 0.185, backDepth: 0.160 },
      { y: 0.10, width: 0.265, frontDepth: 0.195, backDepth: 0.165, xOffset: 0.012 },
    ], 8),
    materials.clothAccent,
    new THREE.Vector3(0, -0.305, 0),
    new THREE.Euler(0.01, 0, -0.05),
  ));
  const hangingStrap = addTo(torso, makeMesh(
    'hero_shambler_hanging_strap',
    plateGeometry('hanging-strap-r2a2', [
      [-0.030, 0.20],
      [0.035, 0.20],
      [0.065, -0.23],
      [-0.010, -0.25],
    ], 0.020),
    materials.leather,
    new THREE.Vector3(-0.205, -0.285, -0.205),
    new THREE.Euler(0.04, 0.10, 0.10),
  ));

  const civilianCollar = addTo(torso, makeMesh(
    'hero_shambler_civilian_torn_collar',
    plateGeometry('civilian-collar-r2a2', [
      [-0.18, 0.08],
      [0.18, 0.08],
      [0.10, -0.08],
      [-0.11, -0.10],
    ], 0.034),
    materials.clothAccent,
    new THREE.Vector3(0, 0.365, -0.185),
    new THREE.Euler(-0.08, 0, 0.02),
  ));
  const civilianSideTatter = addTo(torso, makeMesh(
    'hero_shambler_civilian_side_tatter',
    plateGeometry('civilian-side-tatter-r2a2', [
      [-0.08, 0.20],
      [0.08, 0.18],
      [0.05, -0.24],
      [-0.12, -0.20],
    ], 0.026),
    materials.cloth,
    new THREE.Vector3(-0.315, -0.12, -0.035),
    new THREE.Euler(0.08, 0.28, -0.08),
  ));

  const workerShoulderGuard = addTo(torso, makeMesh(
    'hero_shambler_worker_shoulder_guard',
    ringGeometry('worker-shoulder-guard-r2a2', [
      { y: -0.06, width: 0.165, frontDepth: 0.120, backDepth: 0.100 },
      { y: 0.06, width: 0.145, frontDepth: 0.105, backDepth: 0.095, xOffset: -0.020 },
    ], 7),
    materials.hazard,
    new THREE.Vector3(0.335, 0.315, -0.020),
    new THREE.Euler(0.02, -0.12, -0.22),
  ));
  const workerChestPatch = addTo(torso, makeMesh(
    'hero_shambler_worker_chest_patch',
    plateGeometry('worker-chest-patch-r2a2', [
      [-0.11, 0.055],
      [0.11, 0.055],
      [0.095, -0.055],
      [-0.10, -0.055],
    ], 0.022),
    materials.hazard,
    new THREE.Vector3(-0.135, 0.145, -0.282),
    new THREE.Euler(0, 0, -0.04),
  ));
  const workerBeltPouch = addTo(belt, makeMesh(
    'hero_shambler_worker_belt_pouch',
    ringGeometry('worker-belt-pouch-r2a2', [
      { y: -0.065, width: 0.080, frontDepth: 0.060, backDepth: 0.045 },
      { y: 0.065, width: 0.085, frontDepth: 0.065, backDepth: 0.050 },
    ], 7),
    materials.leather,
    new THREE.Vector3(0.205, -0.055, -0.145),
    new THREE.Euler(0.06, -0.10, -0.05),
  ));

  const ravagedRibCage = addTo(torso, makeMesh(
    'hero_shambler_ravaged_rib_cage',
    plateGeometry('ravaged-rib-cage-r2a2', [
      [-0.17, 0.20],
      [0.12, 0.16],
      [0.15, -0.20],
      [-0.13, -0.25],
    ], 0.026),
    materials.socket,
    new THREE.Vector3(0.085, 0.015, -0.296),
    new THREE.Euler(0.01, 0.02, -0.08),
  ));
  const ravagedShoulderTear = addTo(torso, makeMesh(
    'hero_shambler_ravaged_shoulder_tear',
    plateGeometry('ravaged-shoulder-tear-r2a2', [
      [-0.12, 0.12],
      [0.12, 0.10],
      [0.10, -0.12],
      [-0.10, -0.14],
    ], 0.024),
    materials.freshWound,
    new THREE.Vector3(-0.315, 0.265, -0.105),
    new THREE.Euler(-0.04, 0.18, -0.20),
  ));
  const ravagedBackSpine = addTo(torso, makeMesh(
    'hero_shambler_ravaged_back_spine',
    ringGeometry('ravaged-back-spine-r2a2', [
      { y: -0.24, width: 0.035, frontDepth: 0.025, backDepth: 0.035 },
      { y: 0.26, width: 0.045, frontDepth: 0.030, backDepth: 0.040 },
    ], 6),
    materials.bone,
    new THREE.Vector3(-0.035, 0.015, 0.205),
    new THREE.Euler(-0.04, 0, 0.04),
  ));

  const civilianJacketLeft = addTo(torso, makeMesh(
    'hero_shambler_civilian_jacket_left',
    plateGeometry('civilian-jacket-left-r2b', [
      [-0.19, 0.30],
      [0.005, 0.26],
      [-0.015, -0.36],
      [-0.16, -0.31],
      [-0.23, -0.02],
    ], 0.038),
    materials.clothAccent,
    new THREE.Vector3(-0.105, -0.035, -0.260),
    new THREE.Euler(0.01, 0.02, -0.055),
  ));
  const civilianJacketRight = addTo(torso, makeMesh(
    'hero_shambler_civilian_jacket_right',
    plateGeometry('civilian-jacket-right-r2b', [
      [-0.005, 0.27],
      [0.18, 0.29],
      [0.22, -0.17],
      [0.07, -0.36],
      [0.015, -0.05],
    ], 0.038),
    materials.cloth,
    new THREE.Vector3(0.095, -0.035, -0.262),
    new THREE.Euler(0.01, -0.02, 0.045),
  ));

  const workerVestShell = addTo(torso, makeMesh(
    'hero_shambler_worker_vest_shell',
    plateGeometry('worker-vest-shell-r2b', [
      [-0.28, 0.31],
      [0.28, 0.31],
      [0.25, -0.27],
      [0.10, -0.39],
      [-0.12, -0.37],
      [-0.27, -0.24],
    ], 0.052),
    materials.clothAccent,
    new THREE.Vector3(0, -0.015, -0.265),
    new THREE.Euler(0.01, 0, 0),
  ));
  const workerBootGuardLeft = addTo(leftLeg.shin, makeMesh(
    'hero_shambler_worker_boot_guard_left',
    ringGeometry('worker-boot-guard-left-r2b', [
      { y: -0.10, width: 0.112, frontDepth: 0.095, backDepth: 0.080 },
      { y: 0.10, width: 0.118, frontDepth: 0.102, backDepth: 0.084 },
    ], 7),
    materials.rubber,
    new THREE.Vector3(0, -0.14, 0),
    new THREE.Euler(0.02, 0, -0.02),
  ));
  const workerBootGuardRight = addTo(rightLeg.shin, makeMesh(
    'hero_shambler_worker_boot_guard_right',
    ringGeometry('worker-boot-guard-right-r2b', [
      { y: -0.10, width: 0.112, frontDepth: 0.095, backDepth: 0.080 },
      { y: 0.10, width: 0.118, frontDepth: 0.102, backDepth: 0.084 },
    ], 7),
    materials.rubber,
    new THREE.Vector3(0, -0.14, 0),
    new THREE.Euler(0.02, 0, 0.02),
  ));

  const ravagedHipTatter = addTo(pelvis, makeMesh(
    'hero_shambler_ravaged_hip_tatter',
    plateGeometry('ravaged-hip-tatter-r2b', [
      [-0.11, 0.16],
      [0.10, 0.12],
      [0.06, -0.27],
      [-0.15, -0.23],
    ], 0.028),
    materials.clothDark,
    new THREE.Vector3(-0.205, -0.10, -0.115),
    new THREE.Euler(0.08, 0.22, -0.10),
  ));
  const ravagedUpperArmBone = addTo(leftArm.upper, makeMesh(
    'hero_shambler_ravaged_upper_arm_bone',
    ringGeometry('ravaged-upper-arm-bone-r2b', [
      { y: -0.12, width: 0.030, frontDepth: 0.026, backDepth: 0.024 },
      { y: 0.12, width: 0.038, frontDepth: 0.031, backDepth: 0.028 },
    ], 6),
    materials.bone,
    new THREE.Vector3(0.015, -0.02, -0.086),
    new THREE.Euler(0.06, 0, -0.08),
  ));

  root.userData.materials = materials;
  root.userData.parts = {
    pelvis,
    torso,
    torsoBody,
    exposedChest,
    chestWoundCavity,
    chestWound,
    tornClothLeft,
    tornClothRight,
    belt,
    neck,
    trapeziusLeft,
    trapeziusRight,
    head,
    skull,
    cheekLeft,
    cheekRight,
    browLeft,
    browRight,
    leftEyeSocket: leftEye.socket,
    rightEyeSocket: rightEye.socket,
    leftEye: leftEye.eye,
    rightEye: rightEye.eye,
    noseBridge,
    noseCavity,
    mouthCavity,
    upperJaw,
    lowerJaw,
    lowerJawMesh,
    teeth,
    faceWoundCavity,
    faceWound,
    exposedBone,
    hair,
    hairBack,
    hairTuftLeft,
    hairTuftRight,
    leftArm: leftArm.arm,
    rightArm: rightArm.arm,
    leftUpperArm: leftArm.upper,
    rightUpperArm: rightArm.upper,
    leftForearm: leftArm.forearm,
    rightForearm: rightArm.forearm,
    leftHand: leftArm.hand,
    rightHand: rightArm.hand,
    leftLeg: leftLeg.leg,
    rightLeg: rightLeg.leg,
    leftThigh: leftLeg.thigh,
    rightThigh: rightLeg.thigh,
    leftShin: leftLeg.shin,
    rightShin: rightLeg.shin,
    leftFoot: leftLeg.foot,
    rightFoot: rightLeg.foot,
    shoulderStrapLeft,
    shoulderStrapRight,
    leftShoulderShroud,
    rightShoulderCap,
    sternumRidge,
    exposedRibs,
    abdomenWrap,
    hangingStrap,
    civilianVariantParts: [civilianCollar, civilianSideTatter, civilianJacketLeft, civilianJacketRight],
    workerVariantParts: [workerShoulderGuard, workerChestPatch, workerBeltPouch, workerVestShell, workerBootGuardLeft, workerBootGuardRight],
    ravagedVariantParts: [ravagedRibCage, ravagedShoulderTear, ravagedBackSpine, ravagedHipTatter, ravagedUpperArmBone],
    performanceMicroParts: [
      sternumRidge,
      ...exposedRibs,
      shoulderStrapLeft,
      shoulderStrapRight,
      hangingStrap,
      exposedBone,
      leftArm.woundCavity,
      leftArm.wound,
      rightArm.woundCavity,
      rightArm.wound,
      ...leftArm.fingers.flatMap((entry) => [entry.finger, entry.claw]),
      ...rightArm.fingers.flatMap((entry) => [entry.finger, entry.claw]),
      leftArm.thumb,
      rightArm.thumb,
      leftArm.handWrap,
      rightArm.handWrap,
    ],
  };

  applyShamblerVariant(root, root.userData.variant);
  setHeroShamblerRenderTier(root, root.userData.renderTier);

  root.traverse((child) => {
    child.userData.keepMaterial = true;
    child.userData.isHeroShambler = true;
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
    }
  });

  root.visible = false;
  return root;
}

export function updateHeroShamblerStyle(root, config = {}) {
  if (!root?.userData?.materials) return false;
  const materials = root.userData.materials;
  const seedColor = Number(config.color) || 0x526b58;
  const seed = new THREE.Color(seedColor);
  const variant = normalizeShamblerVariant(root.userData.variant);
  const variantSkinTarget = variant === 'RAVAGED' ? 0x817565 : (variant === 'WORKER' ? 0x8b846f : 0x8a806c);
  const warmSkin = seed.clone().lerp(new THREE.Color(variantSkinTarget), variant === 'RAVAGED' ? 0.50 : 0.42);
  const shadowSkin = warmSkin.clone().multiplyScalar(variant === 'RAVAGED' ? 0.57 : 0.63);
  const deadSkin = warmSkin.clone().lerp(new THREE.Color(0x9b927c), variant === 'RAVAGED' ? 0.62 : 0.52);

  materials.skin.color.copy(warmSkin);
  materials.skinShadow.color.copy(shadowSkin);
  materials.deadSkin.color.copy(deadSkin);
  materials.cloth.color.setHex(variant === 'WORKER' ? 0x313833 : (variant === 'RAVAGED' ? 0x211b1c : 0x252d2d));
  materials.clothDark.color.setHex(variant === 'WORKER' ? 0x171c19 : (variant === 'RAVAGED' ? 0x120d0f : 0x111718));
  materials.clothAccent.color.setHex(variant === 'WORKER' ? 0x4a5148 : (variant === 'RAVAGED' ? 0x3a2528 : 0x344044));
  materials.hazard.color.setHex(variant === 'WORKER' ? 0xb47728 : 0x6b3d22);
  materials.eye.color.setHex(variant === 'RAVAGED' ? 0xc9e780 : 0xd7ef86);
  materials.eye.emissive.setHex(variant === 'RAVAGED' ? 0x7fae3b : 0x97bd45);
  materials.eye.emissiveIntensity = variant === 'RAVAGED' ? 0.42 : 0.48;
  applyShamblerVariant(root, variant);
  setHeroShamblerRenderTier(root, root.userData.renderTier);
  root.userData.typeName = 'SHAMBLER';
  return true;
}

export function updateHeroShamblerMotion(root, timeSeconds, speed = 1, state = {}) {
  const parts = root?.userData?.parts;
  if (!parts) return false;

  const phase = root.userData.motionPhase || 0;
  const variant = normalizeShamblerVariant(root.userData.variant);
  const profile = root.userData.motionProfile
    || buildShamblerMotionProfile(variant, root.userData.motionSeed);
  root.userData.motionProfile = profile;

  const motionSpeed = Math.max(0.2, speed);
  const t = timeSeconds * 5.6 * motionSpeed * profile.cadence
    + phase
    + profile.phaseOffset;
  const walk = Math.sin(t);
  const opposite = Math.sin(t + Math.PI);
  const halfStep = Math.sin(t * 0.5 + profile.breathPhase);
  const bob = Math.abs(Math.sin(t));
  const limpPulse = Math.max(0, Math.sin(t + profile.phaseOffset * 0.5));
  const attackT = Math.max(0, Number(state.attackT) || 0);
  const attackDuration = Math.max(0.05, Number(state.attackDuration) || 0.30);
  const attackProgress = attackT > 0 ? 1 - Math.min(1, attackT / attackDuration) : 0;
  const attackPulse = attackT > 0 ? Math.sin(attackProgress * Math.PI) : 0;
  const hitReactT = Math.max(0, Number(state.hitReactT) || 0);
  const hitReactDir = Number(state.hitReactDir) || 1;
  const deathT = Number(state.deathT ?? -1);

  [
    root,
    parts.pelvis,
    parts.torso,
    parts.neck,
    parts.head,
    parts.lowerJaw,
    parts.leftArm,
    parts.rightArm,
    parts.leftLeg,
    parts.rightLeg,
    parts.leftShoulderShroud,
    parts.rightShoulderCap,
    parts.hangingStrap,
    ...(parts.civilianVariantParts || []),
    ...(parts.workerVariantParts || []),
    ...(parts.ravagedVariantParts || []),
  ].forEach(resetTransform);

  root.rotation.y = root.userData.baseYaw ?? Math.PI;
  root.position.y += bob * profile.bob;
  root.rotation.x += -profile.forwardLean * 0.22;
  root.rotation.z += walk * profile.sway;

  parts.torso.rotation.x += -profile.forwardLean + walk * 0.024;
  parts.torso.rotation.z += walk * (profile.sway + 0.008);
  parts.pelvis.rotation.z += opposite * 0.022;
  parts.neck.rotation.z += opposite * 0.018 + profile.headBias * 0.20;
  parts.head.rotation.y += walk * profile.headYaw;
  parts.head.rotation.z += opposite * profile.headRoll + profile.headBias;
  parts.head.rotation.x += Math.sin(timeSeconds * 1.7 + profile.breathPhase) * 0.018;

  parts.leftArm.rotation.x += opposite * profile.armSwingLeft;
  parts.rightArm.rotation.x += walk * profile.armSwingRight;
  parts.leftArm.rotation.z += walk * 0.040;
  parts.rightArm.rotation.z += opposite * 0.040;
  parts.leftLeg.rotation.x += walk * (profile.legSwingLeft + profile.strideBias);
  parts.rightLeg.rotation.x += opposite * (profile.legSwingRight - profile.strideBias);
  parts.leftLeg.position.z += walk * 0.035;
  parts.rightLeg.position.z += opposite * 0.035;
  parts.leftShoulderShroud.rotation.z += walk * 0.020;
  parts.rightShoulderCap.rotation.z += opposite * 0.014;
  parts.hangingStrap.rotation.z += walk * 0.055;

  if (variant === 'CIVILIAN') {
    parts.rightArm.rotation.z += 0.055 + halfStep * 0.025;
    parts.head.rotation.y += Math.sin(timeSeconds * 0.85 + profile.breathPhase) * 0.035;
    parts.torso.rotation.z += halfStep * 0.012;
  } else if (variant === 'WORKER') {
    root.position.y += bob * 0.010;
    parts.torso.rotation.x -= 0.025;
    parts.leftShoulderShroud.rotation.x += opposite * 0.018;
    parts.rightShoulderCap.rotation.x += walk * 0.018;
    parts.head.rotation.y *= 0.72;
  } else {
    const dragLeft = profile.dragSide < 0;
    const dragArm = dragLeft ? parts.leftArm : parts.rightArm;
    const activeArm = dragLeft ? parts.rightArm : parts.leftArm;
    const dragLeg = dragLeft ? parts.leftLeg : parts.rightLeg;
    const activeLeg = dragLeft ? parts.rightLeg : parts.leftLeg;

    dragArm.rotation.x *= 0.44;
    dragArm.rotation.z += profile.dragSide * profile.shoulderDrop;
    dragArm.position.y -= profile.shoulderDrop * 0.18;
    activeArm.rotation.x *= 1.10;
    dragLeg.rotation.x *= 0.52;
    dragLeg.position.y -= limpPulse * profile.limp * 0.085;
    dragLeg.position.z += limpPulse * profile.limp * 0.060;
    activeLeg.rotation.x *= 1.08;
    parts.torso.rotation.z -= profile.dragSide * 0.055;
    parts.head.rotation.z -= profile.dragSide * 0.045;
  }

  const idleJaw = 0.032
    + (Math.sin(timeSeconds * 2.55 + profile.jawPhase) + 1) * 0.011;
  parts.lowerJaw.rotation.x += idleJaw + attackPulse * 0.22;
  parts.lowerJaw.position.y -= attackPulse * 0.025;

  const eyePulse = 1 + Math.sin(timeSeconds * 5.1 + profile.phaseOffset) * 0.012;
  parts.leftEye.scale.set(1.0 * eyePulse, 0.62 * eyePulse, 0.45 * eyePulse);
  parts.rightEye.scale.set(1.0 * eyePulse, 0.62 * eyePulse, 0.45 * eyePulse);

  if (attackPulse > 0) {
    parts.torso.position.z -= 0.075 * attackPulse;
    parts.head.position.z -= 0.060 * attackPulse;
    parts.leftArm.rotation.x += 0.48 * attackPulse;
    parts.rightArm.rotation.x += 0.48 * attackPulse;
    parts.leftArm.position.z -= 0.10 * attackPulse;
    parts.rightArm.position.z -= 0.10 * attackPulse;
  }

  if (hitReactT > 0) {
    const kick = Math.min(1, hitReactT / 0.16);
    parts.torso.rotation.z += hitReactDir * 0.14 * kick;
    parts.head.rotation.z += hitReactDir * 0.20 * kick;
    parts.head.rotation.y += hitReactDir * 0.14 * kick;
  }

  if (deathT >= 0) {
    const death = Math.min(1, deathT / 0.65);
    parts.torso.rotation.x += death * 0.72;
    parts.head.rotation.x += death * 0.34;
    parts.leftArm.rotation.x += death * 0.72;
    parts.rightArm.rotation.x += death * 0.72;
    root.position.y -= death * 0.16;
    root.rotation.z += death * 0.18;
  }

  return true;
}

export function getHeroShamblerMetrics() {
  return Object.freeze({
    patch: 'vis6-r2b1-shambler-render-budget-hotfix',
    nearRangeOnly: true,
    archetype: 'SHAMBLER',
    variants: SHAMBLER_VARIANTS,
    customGeometry: true,
    headshotHierarchy: true,
    embeddedWounds: true,
    silhouetteVariation: true,
    variantBodyProportions: true,
    deterministicMotionProfiles: true,
    asymmetricGaits: true,
    tieredRenderDetail: true,
    renderTiers: HERO_RENDER_TIERS,
  });
}
