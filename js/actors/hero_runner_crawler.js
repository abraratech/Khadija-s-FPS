// js/actors/hero_runner_crawler.js
// VIS.6 R2C — Batched authored Runner and Crawler foundation.
import * as THREE from 'three';

const GEOMETRY_CACHE = new Map();
const AGILE_ARCHETYPES = Object.freeze(['RUNNER', 'CRAWLER']);
const RENDER_TIERS = Object.freeze(['FULL', 'STANDARD']);

function cachedGeometry(key, factory) {
  if (!GEOMETRY_CACHE.has(key)) GEOMETRY_CACHE.set(key, factory());
  return GEOMETRY_CACHE.get(key);
}

function normalizeArchetype(value) {
  const type = String(value || '').trim().toUpperCase();
  return AGILE_ARCHETYPES.includes(type) ? type : 'RUNNER';
}

function normalizeTier(value) {
  const tier = String(value || '').trim().toUpperCase();
  return RENDER_TIERS.includes(tier) ? tier : 'FULL';
}

function makeSolidMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.025,
    flatShading: true,
    envMapIntensity: 0.24,
  });
}

function makeEyeMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function primitive(kind, args) {
  const key = `${kind}:${args.join(':')}`;
  return cachedGeometry(key, () => {
    if (kind === 'box') return new THREE.BoxGeometry(...args);
    if (kind === 'cylinder') return new THREE.CylinderGeometry(...args);
    if (kind === 'sphere') return new THREE.SphereGeometry(...args);
    if (kind === 'dodeca') return new THREE.DodecahedronGeometry(...args);
    if (kind === 'cone') return new THREE.ConeGeometry(...args);
    throw new Error(`Unknown agile zombie primitive: ${kind}`);
  });
}

function part(kind, args, color, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return { kind, args, color, position, rotation, scale };
}

function mergedColoredGeometry(key, parts) {
  return cachedGeometry(`agile-merged:${key}`, () => {
    const positions = [];
    const normals = [];
    const colors = [];
    const quaternion = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();

    for (const descriptor of parts) {
      const geometry = primitive(descriptor.kind, descriptor.args).clone();
      const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
      quaternion.setFromEuler(new THREE.Euler(...descriptor.rotation));
      matrix.compose(
        new THREE.Vector3(...descriptor.position),
        quaternion,
        new THREE.Vector3(...descriptor.scale),
      );
      nonIndexed.applyMatrix4(matrix);

      const position = nonIndexed.getAttribute('position');
      const normal = nonIndexed.getAttribute('normal');
      const color = new THREE.Color(descriptor.color);
      for (let index = 0; index < position.count; index += 1) {
        positions.push(position.getX(index), position.getY(index), position.getZ(index));
        if (normal) normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
        else normals.push(0, 1, 0);
        colors.push(color.r, color.g, color.b);
      }
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    result.computeBoundingSphere();
    return result;
  });
}

function markObject(object, name, { head = false } = {}) {
  object.name = name;
  object.castShadow = false;
  object.receiveShadow = false;
  object.frustumCulled = true;
  object.userData.keepMaterial = true;
  object.userData.isHeroAgileZombie = true;
  object.userData.basePosition = object.position.clone();
  object.userData.baseRotation = object.rotation.clone();
  object.userData.baseScale = object.scale.clone();
  if (head) object.userData.isHead = true;
  return object;
}

function makePivot(name, position, rotation = null, options = {}) {
  const pivot = markObject(new THREE.Group(), name, options);
  pivot.position.set(...position);
  if (rotation) pivot.rotation.set(...rotation);
  pivot.userData.basePosition.copy(pivot.position);
  pivot.userData.baseRotation.copy(pivot.rotation);
  return pivot;
}

function makeMergedMesh(name, key, parts, material, options = {}) {
  return markObject(
    new THREE.Mesh(mergedColoredGeometry(key, parts), material),
    name,
    options,
  );
}

function resetObject(object) {
  if (!object) return;
  object.position.copy(object.userData.basePosition || object.position);
  object.rotation.copy(object.userData.baseRotation || object.rotation);
  object.scale.copy(object.userData.baseScale || object.scale);
}

function markHeadHierarchy(object) {
  object.userData.isHead = true;
  object.traverse((child) => {
    child.userData.isHead = true;
  });
}

function commitCohesionTransform(object) {
  if (!object) return;
  object.userData.basePosition = object.position.clone();
  object.userData.baseRotation = object.rotation.clone();
  object.userData.baseScale = object.scale.clone();
}

function applyAgileFamilyCohesion(root, rig, archetype) {
  if (!root || !rig) return;

  if (archetype === 'CRAWLER') {
    // Preserve the external 0.62 gameplay scale while restoring enough internal
    // height and cranial mass for the creature to read as anatomy, not a squash.
    root.scale.set(1.00, 1.12, 1.00);
    root.position.y = -0.075;
    rig.torso.scale.set(1.08, 1.03, 1.10);
    rig.torso.position.y += 0.035;
    rig.head.scale.set(1.06, 1.10, 1.05);
    rig.head.position.y += 0.045;
    rig.head.position.z -= 0.025;
    rig.jaw.scale.set(1.10, 0.96, 1.08);
    rig.leftArm.scale.set(1.08, 1.06, 1.08);
    rig.rightArm.scale.set(1.08, 1.06, 1.08);
    rig.leftArm.position.x -= 0.018;
    rig.rightArm.position.x += 0.018;
    rig.leftLeg.scale.set(1.03, 1.08, 1.03);
    rig.rightLeg.scale.set(1.03, 1.08, 1.03);
  } else {
    // Runner gains a narrower head, deeper chest, and unequal limb tension so
    // its speed reads through anatomy rather than through the accent spikes.
    root.scale.set(0.99, 1.02, 1.01);
    rig.torso.scale.set(1.07, 1.03, 1.10);
    rig.torso.position.y += 0.015;
    rig.head.scale.set(0.94, 1.03, 0.96);
    rig.head.position.x -= 0.012;
    rig.head.position.y += 0.012;
    rig.jaw.scale.set(1.08, 0.92, 1.08);
    rig.leftArm.scale.set(1.06, 1.05, 1.02);
    rig.rightArm.scale.set(0.98, 1.09, 1.00);
    rig.leftArm.position.x -= 0.014;
    rig.rightArm.position.x += 0.010;
    rig.leftLeg.scale.set(0.98, 1.06, 0.98);
    rig.rightLeg.scale.set(0.98, 1.06, 0.98);
  }

  [
    root, rig.torso, rig.head, rig.jaw, rig.leftArm, rig.rightArm,
    rig.leftLeg, rig.rightLeg,
  ].forEach(commitCohesionTransform);
}

function createRunner(materials, seed) {
  const rig = {};
  const root = new THREE.Group();

  const torso = makePivot('hero_runner_torso_rig', [0, 1.18, 0], [-0.24, 0, 0.01]);
  const torsoMesh = makeMergedMesh('hero_runner_core', 'runner-core-v1', [
    part('cylinder', [0.27, 0.20, 0.73, 7], 0x512e31, [0, 0.02, 0], [0, 0, 0], [1, 1, 0.70]),
    part('cylinder', [0.22, 0.20, 0.26, 7], 0x1d171a, [0, -0.42, 0.01], [0, 0, 0], [1, 1, 0.72]),
    part('box', [0.42, 0.30, 0.055], 0x2e2024, [0, 0.13, -0.22], [0, 0, -0.07]),
    part('box', [0.16, 0.25, 0.060], 0x5d0f13, [0.12, 0.04, -0.255], [0, 0, 0.18]),
    part('box', [0.075, 0.62, 0.040], 0x171315, [-0.13, -0.01, -0.245], [0, 0, -0.22]),
    part('box', [0.075, 0.60, 0.040], 0x171315, [0.13, -0.02, -0.245], [0, 0, 0.20]),
    part('cone', [0.055, 0.22, 5], 0x6cff5e, [-0.22, 0.39, -0.04], [0.15, 0, 0.25]),
    part('cone', [0.050, 0.19, 5], 0x6cff5e, [0.21, 0.37, -0.05], [0.14, 0, -0.24]),
  ], materials.solid);
  torso.add(torsoMesh);
  root.add(torso);

  const head = makePivot('hero_runner_head_rig', [0.005, 1.70, -0.16], [0.15, 0, 0.02], { head: true });
  const headMesh = makeMergedMesh('hero_runner_head', 'runner-head-v1', [
    part('sphere', [0.5, 7, 5], 0x71413f, [0, 0, 0], [0, 0, 0], [0.47, 0.54, 0.42]),
    part('box', [0.37, 0.085, 0.080], 0x392728, [0, 0.10, -0.225], [0.06, 0, 0]),
    part('box', [0.12, 0.20, 0.060], 0x423033, [0.005, -0.035, -0.240], [0.04, 0, 0]),
    part('box', [0.34, 0.11, 0.052], 0x100405, [0.015, -0.19, -0.235], [0, 0, -0.04]),
    part('box', [0.14, 0.16, 0.050], 0x5b0b0e, [-0.15, -0.04, -0.235], [0, 0, -0.18]),
    part('cone', [0.025, 0.070, 4], 0xd2c69d, [-0.07, -0.17, -0.275], [Math.PI, 0, 0]),
    part('cone', [0.021, 0.060, 4], 0xd2c69d, [0.01, -0.18, -0.278], [Math.PI, 0, 0]),
    part('cone', [0.018, 0.054, 4], 0xd2c69d, [0.085, -0.175, -0.274], [Math.PI, 0, 0]),
  ], materials.solid, { head: true });
  const eyeMesh = makeMergedMesh('hero_runner_eyes', 'runner-eyes-v1', [
    part('sphere', [0.027, 6, 4], 0xffffff, [-0.105, 0.035, -0.272], [0, 0, 0], [1.15, 0.62, 0.55]),
    part('sphere', [0.027, 6, 4], 0xffffff, [0.105, 0.035, -0.272], [0, 0, 0], [1.15, 0.62, 0.55]),
  ], materials.eye, { head: true });
  const jaw = makePivot('hero_runner_jaw_rig', [0.01, -0.20, -0.03], [0.04, 0, -0.04], { head: true });
  const jawMesh = makeMergedMesh('hero_runner_jaw', 'runner-jaw-v1', [
    part('dodeca', [0.13, 0], 0x3e3030, [0, 0, -0.18], [0, 0, 0], [1.20, 0.62, 0.80]),
    part('box', [0.20, 0.045, 0.040], 0x100405, [0.01, 0.03, -0.285], [0, 0, -0.04]),
  ], materials.solid, { head: true });
  jaw.add(jawMesh);
  head.add(headMesh, eyeMesh, jaw);
  root.add(head);
  markHeadHierarchy(head);

  function makeArm(side) {
    const arm = makePivot(
      `hero_runner_${side < 0 ? 'left' : 'right'}_arm_rig`,
      [side * 0.34, 1.42, -0.03],
      [-0.42, 0, side * 0.12],
    );
    const mesh = makeMergedMesh(
      `hero_runner_${side < 0 ? 'left' : 'right'}_arm`,
      `runner-arm-${side}`,
      [
        part('cylinder', [0.075, 0.095, 0.42, 6], side < 0 ? 0x6d3f3f : 0x302226, [0, -0.20, 0], [0, 0, 0], [1, 1, 0.82]),
        part('cylinder', [0.052, 0.072, 0.48, 6], 0x6d3f3f, [side * 0.045, -0.62, 0.03], [0.08, 0, side * 0.08], [1, 1, 0.80]),
        part('dodeca', [0.080, 0], 0x776052, [side * 0.075, -0.90, 0.055], [0, 0, 0], [0.82, 1.18, 0.72]),
        part('box', [0.075, 0.15, 0.035], 0x5b0b0e, [side * 0.08, -0.56, -0.055], [0, 0, side * 0.20]),
      ],
      materials.solid,
    );
    arm.add(mesh);
    root.add(arm);
    return arm;
  }

  function makeLeg(side) {
    const leg = makePivot(
      `hero_runner_${side < 0 ? 'left' : 'right'}_leg_rig`,
      [side * 0.135, 0.82, 0],
      [0.02, 0, side * 0.02],
    );
    const mesh = makeMergedMesh(
      `hero_runner_${side < 0 ? 'left' : 'right'}_leg`,
      `runner-leg-${side}`,
      [
        part('cylinder', [0.085, 0.115, 0.49, 6], 0x1d171a, [0, -0.24, 0], [0, 0, 0], [1, 1, 0.86]),
        part('cylinder', [0.060, 0.083, 0.50, 6], 0x3f3030, [side * 0.015, -0.70, 0.02], [0.03, 0, side * 0.03], [1, 1, 0.80]),
        part('box', [0.19, 0.13, 0.35], 0x090a0b, [side * 0.02, -1.01, -0.09], [0.03, 0, side * 0.02]),
        part('box', [0.11, 0.15, 0.040], 0x5b0b0e, [-side * 0.03, -0.67, -0.085], [0, 0, side * 0.14]),
      ],
      materials.solid,
    );
    leg.add(mesh);
    root.add(leg);
    return leg;
  }

  rig.root = root;
  rig.torso = torso;
  rig.head = head;
  rig.jaw = jaw;
  rig.eyeMesh = eyeMesh;
  rig.leftArm = makeArm(-1);
  rig.rightArm = makeArm(1);
  rig.leftLeg = makeLeg(-1);
  rig.rightLeg = makeLeg(1);
  rig.seed = seed;
  return rig;
}

function createCrawler(materials, seed) {
  const rig = {};
  const root = new THREE.Group();

  const torso = makePivot('hero_crawler_torso_rig', [0, 0.95, 0.02], [0.88, 0, 0.02]);
  const torsoMesh = makeMergedMesh('hero_crawler_core', 'crawler-core-v1', [
    part('cylinder', [0.26, 0.20, 0.68, 7], 0x56623f, [0, 0, 0], [0, 0, 0], [1, 1, 0.75]),
    part('cylinder', [0.22, 0.18, 0.26, 7], 0x171b17, [0, -0.42, 0], [0, 0, 0], [1, 1, 0.72]),
    part('box', [0.38, 0.26, 0.060], 0x293022, [0, 0.08, -0.225], [0, 0, -0.04]),
    part('box', [0.18, 0.23, 0.060], 0x4d0c0d, [-0.11, 0.00, -0.255], [0, 0, -0.18]),
    part('box', [0.055, 0.52, 0.038], 0x111511, [-0.12, 0.00, -0.245], [0, 0, -0.18]),
    part('box', [0.055, 0.50, 0.038], 0x111511, [0.12, 0.00, -0.245], [0, 0, 0.18]),
  ], materials.solid);
  torso.add(torsoMesh);
  root.add(torso);

  const head = makePivot('hero_crawler_head_rig', [0, 1.12, -0.43], [0.34, 0, -0.02], { head: true });
  const headMesh = makeMergedMesh('hero_crawler_head', 'crawler-head-v1', [
    part('sphere', [0.5, 7, 5], 0x65704a, [0, 0, 0], [0, 0, 0], [0.50, 0.43, 0.47]),
    part('box', [0.39, 0.085, 0.080], 0x35402f, [0, 0.075, -0.235], [0.04, 0, 0]),
    part('box', [0.13, 0.17, 0.060], 0x3f4937, [0, -0.035, -0.245], [0.03, 0, 0]),
    part('box', [0.38, 0.12, 0.050], 0x0d0404, [0, -0.18, -0.245], [0, 0, 0.01]),
    part('box', [0.16, 0.13, 0.045], 0x5a1010, [0.15, -0.05, -0.238], [0, 0, 0.20]),
    part('cone', [0.026, 0.068, 4], 0xd0c59c, [-0.09, -0.16, -0.285], [Math.PI, 0, 0]),
    part('cone', [0.022, 0.058, 4], 0xd0c59c, [0.00, -0.17, -0.288], [Math.PI, 0, 0]),
    part('cone', [0.020, 0.052, 4], 0xd0c59c, [0.09, -0.16, -0.284], [Math.PI, 0, 0]),
  ], materials.solid, { head: true });
  const eyeMesh = makeMergedMesh('hero_crawler_eyes', 'crawler-eyes-v1', [
    part('sphere', [0.025, 6, 4], 0xffffff, [-0.11, 0.018, -0.278], [0, 0, 0], [1.18, 0.60, 0.55]),
    part('sphere', [0.025, 6, 4], 0xffffff, [0.11, 0.018, -0.278], [0, 0, 0], [1.18, 0.60, 0.55]),
  ], materials.eye, { head: true });
  const jaw = makePivot('hero_crawler_jaw_rig', [0, -0.19, -0.035], [0.12, 0, 0.02], { head: true });
  const jawMesh = makeMergedMesh('hero_crawler_jaw', 'crawler-jaw-v1', [
    part('dodeca', [0.14, 0], 0x414836, [0, 0, -0.18], [0, 0, 0], [1.30, 0.60, 0.82]),
    part('box', [0.22, 0.048, 0.040], 0x0d0404, [0, 0.03, -0.292], [0, 0, 0]),
  ], materials.solid, { head: true });
  jaw.add(jawMesh);
  head.add(headMesh, eyeMesh, jaw);
  root.add(head);
  markHeadHierarchy(head);

  function makeForelimb(side) {
    const limb = makePivot(
      `hero_crawler_${side < 0 ? 'left' : 'right'}_forelimb_rig`,
      [side * 0.30, 0.95, -0.12],
      [-0.92, 0, side * 0.14],
    );
    const mesh = makeMergedMesh(
      `hero_crawler_${side < 0 ? 'left' : 'right'}_forelimb`,
      `crawler-forelimb-${side}`,
      [
        part('cylinder', [0.075, 0.105, 0.48, 6], 0x64704a, [0, -0.22, 0], [0, 0, 0], [1, 1, 0.84]),
        part('cylinder', [0.050, 0.072, 0.55, 6], 0x6e7655, [side * 0.035, -0.66, 0.025], [0.08, 0, side * 0.05], [1, 1, 0.80]),
        part('dodeca', [0.082, 0], 0x7b7a5d, [side * 0.06, -0.98, 0.06], [0, 0, 0], [0.86, 1.22, 0.75]),
        part('cone', [0.018, 0.095, 5], 0xd0c59c, [side * 0.02, -1.10, -0.01], [0.65, 0, side * 0.10]),
        part('cone', [0.016, 0.085, 5], 0xd0c59c, [side * 0.075, -1.09, -0.005], [0.68, 0, side * 0.16]),
      ],
      materials.solid,
    );
    limb.add(mesh);
    root.add(limb);
    return limb;
  }

  function makeHindlimb(side) {
    const limb = makePivot(
      `hero_crawler_${side < 0 ? 'left' : 'right'}_hindlimb_rig`,
      [side * 0.15, 0.74, 0.12],
      [0.52, 0, side * 0.10],
    );
    const mesh = makeMergedMesh(
      `hero_crawler_${side < 0 ? 'left' : 'right'}_hindlimb`,
      `crawler-hindlimb-${side}`,
      [
        part('cylinder', [0.080, 0.115, 0.43, 6], 0x171b17, [0, -0.20, 0], [0, 0, 0], [1, 1, 0.86]),
        part('cylinder', [0.055, 0.080, 0.43, 6], 0x5b6546, [side * 0.02, -0.58, 0.04], [0.07, 0, side * 0.03], [1, 1, 0.80]),
        part('box', [0.18, 0.11, 0.30], 0x111411, [side * 0.02, -0.84, -0.08], [0.06, 0, side * 0.03]),
        part('box', [0.11, 0.13, 0.040], 0x4d0c0d, [-side * 0.02, -0.56, -0.08], [0, 0, side * 0.15]),
      ],
      materials.solid,
    );
    limb.add(mesh);
    root.add(limb);
    return limb;
  }

  rig.root = root;
  rig.torso = torso;
  rig.head = head;
  rig.jaw = jaw;
  rig.eyeMesh = eyeMesh;
  rig.leftArm = makeForelimb(-1);
  rig.rightArm = makeForelimb(1);
  rig.leftLeg = makeHindlimb(-1);
  rig.rightLeg = makeHindlimb(1);
  rig.seed = seed;
  return rig;
}

export function createHeroAgileZombieVisual(options = {}) {
  const archetype = normalizeArchetype(options.archetype || options.type);
  const seed = Number.isFinite(Number(options.motionSeed)) ? Number(options.motionSeed) : 0.5;
  const materials = {
    solid: makeSolidMaterial(),
    eye: makeEyeMaterial(archetype === 'RUNNER' ? 0xff3b2f : 0xb8ff65),
  };
  const rig = archetype === 'CRAWLER'
    ? createCrawler(materials, seed)
    : createRunner(materials, seed);
  const root = rig.root;

  root.name = `hero_${archetype.toLowerCase()}_visual`;
  root.rotation.y = Math.PI;
  root.userData.baseYaw = Math.PI;
  root.userData.basePosition = root.position.clone();
  root.userData.baseRotation = root.rotation.clone();
  root.userData.baseScale = root.scale.clone();
  root.userData.isHeroAgileZombie = true;
  root.userData.archetype = archetype;
  root.userData.renderTier = normalizeTier(options.renderTier);
  root.userData.motionSeed = seed;
  root.userData.motionPhase = Number(options.motionPhase) || seed * Math.PI * 2;
  root.userData.visualPatch = 'vis6-r2f-enemy-family-cohesion';
  root.userData.materials = materials;
  root.userData.parts = rig;
  applyAgileFamilyCohesion(root, rig, archetype);

  root.traverse((child) => {
    child.userData.keepMaterial = true;
    child.userData.isHeroAgileZombie = true;
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
    }
  });

  setHeroAgileZombieRenderTier(root, root.userData.renderTier);
  root.visible = false;
  return root;
}

export function setHeroAgileZombieRenderTier(root, tierValue = 'FULL') {
  if (!root?.userData?.parts) return false;
  const tier = normalizeTier(tierValue);
  root.userData.renderTier = tier;
  const parts = root.userData.parts;
  // STANDARD removes one animated draw while retaining the authored silhouette.
  if (parts.jaw) parts.jaw.visible = tier === 'FULL';
  return true;
}

export function updateHeroAgileZombieStyle(root, config = {}) {
  if (!root?.userData?.materials) return false;
  const archetype = normalizeArchetype(config.name || config.type || root.userData.archetype);
  root.userData.archetype = archetype;
  const materials = root.userData.materials;
  const eyeColor = archetype === 'RUNNER' ? 0xff3b2f : 0xb8ff65;
  materials.eye.color.setHex(eyeColor);
  materials.eye.opacity = archetype === 'RUNNER' ? 0.76 : 0.70;
  materials.solid.roughness = archetype === 'RUNNER' ? 0.88 : 0.93;
  return true;
}

export function updateHeroAgileZombieMotion(root, timeSeconds, speed = 1, state = {}) {
  const parts = root?.userData?.parts;
  if (!parts) return false;
  const archetype = root.userData.archetype;
  const seed = root.userData.motionSeed || 0.5;
  const phase = root.userData.motionPhase || 0;
  const hitReactT = Math.max(0, Number(state.hitReactT) || 0);
  const hitReactDir = Number(state.hitReactDir) || 1;
  const attackT = Math.max(0, Number(state.attackT) || 0);
  const attackDuration = Math.max(0.05, Number(state.attackDuration) || 0.30);
  const attackProgress = attackT > 0 ? 1 - Math.min(1, attackT / attackDuration) : 0;
  const attackPulse = attackT > 0 ? Math.sin(attackProgress * Math.PI) : 0;
  const deathT = Number(state.deathT ?? -1);
  const runnerBurstT = Math.max(0, Number(state.runnerBurstT) || 0);

  [
    root,
    parts.torso,
    parts.head,
    parts.jaw,
    parts.leftArm,
    parts.rightArm,
    parts.leftLeg,
    parts.rightLeg,
  ].forEach(resetObject);
  root.rotation.y = root.userData.baseYaw ?? Math.PI;

  if (archetype === 'RUNNER') {
    const cadence = 8.8 * Math.max(0.25, speed) * (0.94 + seed * 0.12);
    const t = timeSeconds * cadence + phase;
    const stride = Math.sin(t);
    const opposite = Math.sin(t + Math.PI);
    const bob = Math.abs(Math.sin(t * 0.5));
    const burst = Math.min(1, runnerBurstT / 0.45);

    root.position.y += bob * 0.035;
    root.rotation.z += stride * 0.018;
    parts.torso.rotation.x += -0.24 - burst * 0.12;
    parts.torso.rotation.z += stride * 0.028;
    parts.head.rotation.x += 0.15 + Math.sin(t * 0.5) * 0.025;
    parts.head.rotation.y += stride * 0.045;
    parts.leftArm.rotation.x += opposite * 0.78 - burst * 0.20;
    parts.rightArm.rotation.x += stride * 0.78 - burst * 0.20;
    parts.leftLeg.rotation.x += stride * 0.68;
    parts.rightLeg.rotation.x += opposite * 0.68;
    parts.leftLeg.position.z += stride * 0.045;
    parts.rightLeg.position.z += opposite * 0.045;
    parts.jaw.rotation.x += 0.05 + (Math.sin(timeSeconds * 4.2 + phase) + 1) * 0.016 + attackPulse * 0.24;
  } else {
    const cadence = 5.0 * Math.max(0.25, speed) * (0.93 + seed * 0.14);
    const t = timeSeconds * cadence + phase;
    const crawl = Math.sin(t);
    const opposite = Math.sin(t + Math.PI);
    const bob = Math.abs(Math.sin(t));

    root.position.y += bob * 0.018;
    root.rotation.z += crawl * 0.025;
    parts.torso.rotation.x += 0.88 + Math.sin(t * 0.5) * 0.030;
    parts.head.rotation.x += 0.34 - bob * 0.045;
    parts.head.rotation.y += crawl * 0.060;
    parts.leftArm.rotation.x += opposite * 0.62 - 0.92;
    parts.rightArm.rotation.x += crawl * 0.62 - 0.92;
    parts.leftArm.position.z += opposite * 0.055;
    parts.rightArm.position.z += crawl * 0.055;
    parts.leftLeg.rotation.x += crawl * 0.38 + 0.52;
    parts.rightLeg.rotation.x += opposite * 0.38 + 0.52;
    parts.jaw.rotation.x += 0.11 + (Math.sin(timeSeconds * 3.4 + phase) + 1) * 0.020 + attackPulse * 0.30;
  }

  if (attackPulse > 0) {
    parts.torso.position.z -= attackPulse * 0.10;
    parts.head.position.z -= attackPulse * 0.08;
    parts.leftArm.rotation.x += attackPulse * 0.34;
    parts.rightArm.rotation.x += attackPulse * 0.34;
  }

  if (hitReactT > 0) {
    const kick = Math.min(1, hitReactT / 0.16);
    parts.torso.rotation.z += hitReactDir * 0.15 * kick;
    parts.head.rotation.z += hitReactDir * 0.22 * kick;
  }

  if (deathT >= 0) {
    const death = Math.min(1, deathT / 0.65);
    parts.torso.rotation.x += death * (archetype === 'CRAWLER' ? 0.35 : 0.70);
    parts.head.rotation.x += death * 0.30;
    parts.leftArm.rotation.x += death * 0.60;
    parts.rightArm.rotation.x += death * 0.60;
    root.position.y -= death * 0.15;
    root.rotation.z += death * 0.20;
  }

  return true;
}

export function getHeroAgileZombieMetrics() {
  return Object.freeze({
    patch: 'vis6-r2c-authored-runner-crawler-foundation',
    archetypes: AGILE_ARCHETYPES,
    renderTiers: RENDER_TIERS,
    drawCallsFullPerActor: 8,
    drawCallsStandardPerActor: 7,
    mergedVertexColoredBodySections: true,
    deterministicMotionProfiles: true,
    headshotHierarchy: true,
    proceduralFallbackPreserved: true,
  });
}
