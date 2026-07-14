// js/actors/hero_spitter_goliath.js
// VIS.6 R2E — Batched authored Spitter and Goliath foundation.
import * as THREE from 'three';

const GEOMETRY_CACHE = new Map();
const SPECIAL_ARCHETYPES = Object.freeze(['RANGED', 'GOLIATH']);
const RENDER_TIERS = Object.freeze(['FULL', 'STANDARD']);

function cachedGeometry(key, factory) {
  if (!GEOMETRY_CACHE.has(key)) GEOMETRY_CACHE.set(key, factory());
  return GEOMETRY_CACHE.get(key);
}

function normalizeArchetype(value) {
  const type = String(value || '').trim().toUpperCase();
  return SPECIAL_ARCHETYPES.includes(type) ? type : 'RANGED';
}

function normalizeTier(value) {
  const tier = String(value || '').trim().toUpperCase();
  return RENDER_TIERS.includes(tier) ? tier : 'FULL';
}

function makeSolidMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.91,
    metalness: 0.035,
    flatShading: true,
    envMapIntensity: 0.25,
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
    if (kind === 'torus') return new THREE.TorusGeometry(...args);
    throw new Error(`Unknown special zombie primitive: ${kind}`);
  });
}

function part(kind, args, color, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return { kind, args, color, position, rotation, scale };
}

function mergedColoredGeometry(key, parts) {
  return cachedGeometry(`special-merged:${key}`, () => {
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
  object.userData.isHeroSpecialZombie = true;
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

function applySpecialFamilyCohesion(root, rig, archetype) {
  if (!root || !rig) return;

  if (archetype === 'GOLIATH') {
    // The boss becomes a continuous containment-mutant mass instead of a torso
    // with horizontal blocks: deeper core, compact head, huge arms, planted legs.
    root.scale.set(1.02, 1.00, 1.03);
    rig.torso.scale.set(1.11, 1.05, 1.13);
    rig.torso.position.y += 0.012;
    rig.head.scale.set(0.95, 0.90, 1.00);
    rig.head.position.y -= 0.020;
    if (rig.jaw) rig.jaw.scale.set(1.13, 0.88, 1.10);
    rig.leftArm.scale.set(1.16, 1.08, 1.14);
    rig.rightArm.scale.set(1.16, 1.08, 1.14);
    rig.leftArm.position.x -= 0.024;
    rig.rightArm.position.x += 0.024;
    rig.leftLeg.scale.set(1.10, 1.05, 1.09);
    rig.rightLeg.scale.set(1.10, 1.05, 1.09);
  } else {
    // Spitter keeps its thin ranged profile while emphasizing the diseased throat
    // apparatus and asymmetric containment hardware as part of the body mass.
    root.scale.set(0.98, 1.02, 1.00);
    rig.torso.scale.set(0.97, 1.07, 1.06);
    rig.torso.rotation.z += 0.025;
    rig.head.scale.set(0.95, 1.07, 0.98);
    rig.head.position.x -= 0.014;
    rig.head.position.y += 0.015;
    if (rig.throat) rig.throat.scale.set(1.12, 1.14, 1.12);
    rig.leftArm.scale.set(0.96, 1.08, 0.98);
    rig.rightArm.scale.set(1.03, 1.10, 1.02);
    rig.leftLeg.scale.set(0.96, 1.06, 0.97);
    rig.rightLeg.scale.set(0.96, 1.06, 0.97);
  }

  [
    root, rig.torso, rig.head, rig.throat, rig.jaw, rig.leftArm, rig.rightArm,
    rig.leftLeg, rig.rightLeg,
  ].forEach(commitCohesionTransform);
}

function createSpitter(materials, seed) {
  const rig = {};
  const root = new THREE.Group();

  const torso = makePivot('hero_spitter_torso_rig', [0, 1.20, 0], [-0.17, 0, 0.045]);
  const torsoMesh = makeMergedMesh('hero_spitter_core', 'spitter-core-v1', [
    part('cylinder', [0.29, 0.22, 0.88, 8], 0x315f61, [0, 0.01, 0], [0, 0, 0], [1, 1, 0.67]),
    part('cylinder', [0.23, 0.21, 0.26, 7], 0x121d20, [0, -0.53, 0.01], [0, 0, 0], [1, 1, 0.72]),
    part('box', [0.46, 0.57, 0.070], 0x182b2e, [-0.025, 0.02, -0.225], [0, 0, -0.05]),
    part('box', [0.15, 0.31, 0.060], 0x57151a, [-0.16, -0.07, -0.270], [0, 0, -0.18]),
    part('box', [0.060, 0.65, 0.045], 0x0d1719, [-0.14, 0, -0.270], [0, 0, -0.18]),
    part('box', [0.060, 0.62, 0.045], 0x0d1719, [0.14, -0.02, -0.270], [0, 0, 0.17]),
    part('cylinder', [0.115, 0.115, 0.58, 8], 0x33494f, [0.22, 0.02, 0.245], [0, 0, 0.10], [1, 1, 1]),
    part('box', [0.105, 0.33, 0.040], 0x35f0ff, [0.22, 0.02, 0.365], [0, 0, 0.10]),
    part('cylinder', [0.018, 0.018, 0.48, 5], 0x24b8c7, [0.09, 0.12, -0.23], [0.30, 0.12, 0.46]),
    part('cylinder', [0.016, 0.016, 0.39, 5], 0x24b8c7, [-0.13, -0.20, -0.21], [-0.25, -0.08, -0.40]),
    part('dodeca', [0.15, 0], 0x263f43, [-0.34, 0.34, -0.01], [0, 0, 0], [1.15, 0.62, 0.95]),
    part('dodeca', [0.15, 0], 0x263f43, [0.34, 0.34, -0.01], [0, 0, 0], [1.15, 0.62, 0.95]),
    part('box', [0.38, 0.055, 0.045], 0x35f0ff, [0, -0.18, -0.290], [0, 0, -0.05]),
  ], materials.solid);
  torso.add(torsoMesh);
  root.add(torso);

  const head = makePivot('hero_spitter_head_rig', [-0.025, 1.82, -0.065], [0.10, 0, -0.06], { head: true });
  const headMesh = makeMergedMesh('hero_spitter_head', 'spitter-head-v1', [
    part('sphere', [0.5, 7, 5], 0x426e70, [0, 0, 0], [0, 0, 0], [0.49, 0.58, 0.43]),
    part('box', [0.42, 0.10, 0.085], 0x1f373b, [0, 0.13, -0.250], [0.04, 0, 0]),
    part('box', [0.13, 0.21, 0.065], 0x2c4f52, [0, -0.02, -0.265], [0.03, 0, 0]),
    part('box', [0.44, 0.11, 0.055], 0x35f0ff, [0, 0.025, -0.300], [0, 0, 0]),
    part('box', [0.16, 0.17, 0.050], 0x63151b, [0.15, -0.06, -0.265], [0, 0, 0.18]),
    part('box', [0.35, 0.13, 0.060], 0x110506, [0, -0.21, -0.255], [0, 0, 0]),
    part('cone', [0.022, 0.060, 4], 0xd4c9a1, [-0.085, -0.19, -0.300], [Math.PI, 0, 0]),
    part('cone', [0.020, 0.055, 4], 0xd4c9a1, [0.00, -0.195, -0.304], [Math.PI, 0, 0]),
    part('cone', [0.018, 0.050, 4], 0xd4c9a1, [0.082, -0.19, -0.300], [Math.PI, 0, 0]),
    part('box', [0.045, 0.42, 0.045], 0x35f0ff, [-0.19, 0.30, -0.04], [0.14, 0, -0.30]),
  ], materials.solid, { head: true });
  const eyeMesh = makeMergedMesh('hero_spitter_eyes', 'spitter-eyes-v1', [
    part('sphere', [0.030, 6, 4], 0xffffff, [-0.112, 0.035, -0.310], [0, 0, 0], [1.20, 0.62, 0.54]),
    part('sphere', [0.030, 6, 4], 0xffffff, [0.112, 0.035, -0.310], [0, 0, 0], [1.20, 0.62, 0.54]),
  ], materials.eye, { head: true });

  const throat = makePivot('hero_spitter_throat_rig', [0, -0.24, -0.035], [0.08, 0, 0], { head: true });
  const throatMesh = makeMergedMesh('hero_spitter_throat', 'spitter-throat-v1', [
    part('dodeca', [0.16, 0], 0x35585a, [0, -0.02, -0.185], [0, 0, 0], [1.34, 0.82, 0.88]),
    part('sphere', [0.5, 7, 5], 0x2bc8cf, [0, -0.09, -0.250], [0, 0, 0], [0.22, 0.18, 0.10]),
    part('box', [0.25, 0.050, 0.042], 0x100506, [0, 0.045, -0.305], [0, 0, 0]),
    part('torus', [0.115, 0.022, 6, 10], 0x35f0ff, [0, -0.08, -0.290], [Math.PI / 2, 0, 0]),
  ], materials.solid, { head: true });
  throat.add(throatMesh);
  head.add(headMesh, eyeMesh, throat);
  root.add(head);
  markHeadHierarchy(head);

  function makeArm(side) {
    const arm = makePivot(
      `hero_spitter_${side < 0 ? 'left' : 'right'}_arm_rig`,
      [side * 0.36, 1.47, -0.02],
      [-0.20, 0, side * 0.11],
    );
    const mesh = makeMergedMesh(
      `hero_spitter_${side < 0 ? 'left' : 'right'}_arm`,
      `spitter-arm-${side}`,
      [
        part('cylinder', [0.085, 0.105, 0.44, 7], side < 0 ? 0x315f61 : 0x243c40, [0, -0.21, 0], [0, 0, 0], [1, 1, 0.84]),
        part('cylinder', [0.062, 0.082, 0.53, 7], 0x426e70, [side * 0.035, -0.65, 0.03], [0.08, 0, side * 0.05], [1, 1, 0.82]),
        part('dodeca', [0.088, 0], 0x4b7374, [side * 0.065, -0.98, 0.055], [0, 0, 0], [0.88, 1.10, 0.76]),
        part('box', [0.10, 0.17, 0.040], 0x65141a, [side * 0.075, -0.43, -0.095], [0, 0, side * 0.16]),
        part('box', [0.15, 0.30, 0.17], 0x1c3033, [side * 0.03, -0.66, 0.035], [0.05, 0, side * 0.04]),
      ],
      materials.solid,
    );
    arm.add(mesh);
    root.add(arm);
    return arm;
  }

  function makeLeg(side) {
    const leg = makePivot(
      `hero_spitter_${side < 0 ? 'left' : 'right'}_leg_rig`,
      [side * 0.15, 0.80, 0],
      [0.02, 0, side * 0.02],
    );
    const mesh = makeMergedMesh(
      `hero_spitter_${side < 0 ? 'left' : 'right'}_leg`,
      `spitter-leg-${side}`,
      [
        part('cylinder', [0.100, 0.125, 0.49, 7], 0x121d20, [0, -0.23, 0], [0, 0, 0], [1, 1, 0.86]),
        part('cylinder', [0.072, 0.098, 0.51, 7], 0x365f62, [side * 0.015, -0.68, 0.02], [0.04, 0, side * 0.03], [1, 1, 0.82]),
        part('box', [0.22, 0.13, 0.38], 0x080d0f, [side * 0.02, -0.99, -0.11], [0.03, 0, side * 0.03]),
        part('box', [0.13, 0.16, 0.045], 0x611319, [-side * 0.03, -0.66, -0.105], [0, 0, side * 0.14]),
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
  rig.throat = throat;
  rig.eyeMesh = eyeMesh;
  rig.leftArm = makeArm(-1);
  rig.rightArm = makeArm(1);
  rig.leftLeg = makeLeg(-1);
  rig.rightLeg = makeLeg(1);
  rig.seed = seed;
  return rig;
}

function createGoliath(materials, seed) {
  const rig = {};
  const root = new THREE.Group();

  const torso = makePivot('hero_goliath_torso_rig', [0, 1.20, 0], [-0.09, 0, 0]);
  const torsoMesh = makeMergedMesh('hero_goliath_core', 'goliath-core-v1', [
    part('cylinder', [0.54, 0.38, 0.88, 8], 0x343a3c, [0, 0.02, 0], [0, 0, 0], [1, 1, 0.78]),
    part('cylinder', [0.38, 0.34, 0.30, 8], 0x111416, [0, -0.52, 0.01], [0, 0, 0], [1, 1, 0.78]),
    part('dodeca', [0.28, 0], 0x454c50, [-0.51, 0.37, -0.01], [0, 0, 0], [1.42, 0.82, 1.12]),
    part('dodeca', [0.28, 0], 0x454c50, [0.51, 0.37, -0.01], [0, 0, 0], [1.42, 0.82, 1.12]),
    part('box', [0.76, 0.50, 0.095], 0x262b2e, [0, 0.10, -0.355], [0, 0, 0]),
    part('box', [0.22, 0.33, 0.075], 0x67151a, [0.20, 0.02, -0.410], [0, 0, 0.12]),
    part('box', [0.105, 0.72, 0.060], 0x0f1214, [-0.20, -0.01, -0.400], [0, 0, -0.16]),
    part('box', [0.105, 0.72, 0.060], 0x0f1214, [0.20, -0.01, -0.400], [0, 0, 0.16]),
    part('box', [0.54, 0.080, 0.055], 0xffa11a, [0, -0.17, -0.435], [0, 0, 0]),
    part('cylinder', [0.105, 0.105, 0.58, 8], 0x394145, [-0.31, 0.00, 0.36], [0, 0, -0.05]),
    part('cylinder', [0.105, 0.105, 0.58, 8], 0x394145, [0.31, 0.00, 0.36], [0, 0, 0.05]),
    part('box', [0.075, 0.34, 0.040], 0xa9c220, [-0.31, 0.00, 0.465], [0, 0, -0.05]),
    part('box', [0.075, 0.34, 0.040], 0xa9c220, [0.31, 0.00, 0.465], [0, 0, 0.05]),
    part('box', [0.36, 0.055, 0.045], 0xa9c220, [0, 0.25, -0.440], [0, 0, 0]),
  ], materials.solid);
  torso.add(torsoMesh);
  root.add(torso);

  const head = makePivot('hero_goliath_head_rig', [0, 1.84, -0.075], [0.04, 0, 0], { head: true });
  const headMesh = makeMergedMesh('hero_goliath_head', 'goliath-head-v1', [
    part('sphere', [0.5, 7, 5], 0x3b4244, [0, 0, 0], [0, 0, 0], [0.62, 0.60, 0.54]),
    part('box', [0.56, 0.12, 0.105], 0x202529, [0, 0.13, -0.315], [0.03, 0, 0]),
    part('box', [0.17, 0.24, 0.075], 0x2b3133, [0, -0.02, -0.335], [0.03, 0, 0]),
    part('box', [0.48, 0.16, 0.070], 0x100506, [0, -0.23, -0.320], [0, 0, 0]),
    part('box', [0.20, 0.19, 0.060], 0x651419, [-0.20, -0.05, -0.315], [0, 0, -0.18]),
    part('box', [0.52, 0.12, 0.105], 0x4a5155, [0, -0.28, -0.275], [0, 0, 0]),
    part('cone', [0.031, 0.086, 4], 0xd4c89d, [-0.12, -0.21, -0.370], [Math.PI, 0, 0]),
    part('cone', [0.028, 0.079, 4], 0xd4c89d, [0.00, -0.22, -0.376], [Math.PI, 0, 0]),
    part('cone', [0.025, 0.071, 4], 0xd4c89d, [0.12, -0.21, -0.370], [Math.PI, 0, 0]),
    part('dodeca', [0.10, 0], 0x50575a, [-0.24, 0.22, -0.20], [0, 0, -0.18], [1.10, 0.75, 0.95]),
    part('dodeca', [0.10, 0], 0x50575a, [0.24, 0.22, -0.20], [0, 0, 0.18], [1.10, 0.75, 0.95]),
  ], materials.solid, { head: true });
  const eyeMesh = makeMergedMesh('hero_goliath_eyes', 'goliath-eyes-v1', [
    part('sphere', [0.035, 6, 4], 0xffffff, [-0.145, 0.035, -0.375], [0, 0, 0], [1.22, 0.64, 0.56]),
    part('sphere', [0.035, 6, 4], 0xffffff, [0.145, 0.035, -0.375], [0, 0, 0], [1.22, 0.64, 0.56]),
  ], materials.eye, { head: true });

  const jaw = makePivot('hero_goliath_jaw_rig', [0, -0.245, -0.04], [0.05, 0, 0], { head: true });
  const jawMesh = makeMergedMesh('hero_goliath_jaw', 'goliath-jaw-v1', [
    part('dodeca', [0.19, 0], 0x42484b, [0, 0, -0.235], [0, 0, 0], [1.50, 0.74, 0.96]),
    part('box', [0.32, 0.055, 0.048], 0x100506, [0, 0.04, -0.390], [0, 0, 0]),
    part('box', [0.36, 0.080, 0.075], 0x4a5155, [0, -0.06, -0.325], [0, 0, 0]),
  ], materials.solid, { head: true });
  jaw.add(jawMesh);
  head.add(headMesh, eyeMesh, jaw);
  root.add(head);
  markHeadHierarchy(head);

  function makeArm(side) {
    const arm = makePivot(
      `hero_goliath_${side < 0 ? 'left' : 'right'}_arm_rig`,
      [side * 0.60, 1.52, -0.02],
      [-0.14, 0, side * 0.06],
    );
    const mesh = makeMergedMesh(
      `hero_goliath_${side < 0 ? 'left' : 'right'}_arm`,
      `goliath-arm-${side}`,
      [
        part('cylinder', [0.20, 0.24, 0.50, 7], 0x343a3c, [0, -0.23, 0], [0, 0, 0], [1, 1, 0.92]),
        part('cylinder', [0.17, 0.21, 0.58, 7], 0x454c50, [side * 0.035, -0.72, 0.03], [0.05, 0, side * 0.04], [1, 1, 0.92]),
        part('dodeca', [0.19, 0], 0x50575a, [side * 0.060, -1.08, 0.060], [0, 0, 0], [1.18, 1.30, 1.02]),
        part('box', [0.34, 0.39, 0.29], 0x4a5155, [side * 0.035, -0.72, 0.035], [0.04, 0, side * 0.04]),
        part('box', [0.13, 0.21, 0.045], 0x68151a, [side * 0.09, -0.47, -0.125], [0, 0, side * 0.16]),
        part('cone', [0.025, 0.12, 5], 0xd0c49c, [side * 0.03, -1.24, -0.02], [Math.PI, 0, side * 0.20]),
        part('cone', [0.022, 0.105, 5], 0xd0c49c, [side * 0.11, -1.22, 0.00], [Math.PI, 0, -side * 0.16]),
      ],
      materials.solid,
    );
    arm.add(mesh);
    root.add(arm);
    return arm;
  }

  function makeLeg(side) {
    const leg = makePivot(
      `hero_goliath_${side < 0 ? 'left' : 'right'}_leg_rig`,
      [side * 0.22, 0.80, 0],
      [0.02, 0, side * 0.02],
    );
    const mesh = makeMergedMesh(
      `hero_goliath_${side < 0 ? 'left' : 'right'}_leg`,
      `goliath-leg-${side}`,
      [
        part('cylinder', [0.17, 0.21, 0.52, 7], 0x111416, [0, -0.25, 0], [0, 0, 0], [1, 1, 0.92]),
        part('cylinder', [0.14, 0.18, 0.50, 7], 0x454c50, [side * 0.015, -0.73, 0.02], [0.03, 0, side * 0.02], [1, 1, 0.88]),
        part('box', [0.34, 0.19, 0.49], 0x090b0c, [side * 0.02, -1.05, -0.13], [0.02, 0, side * 0.02]),
        part('box', [0.18, 0.20, 0.055], 0x68151a, [-side * 0.03, -0.70, -0.145], [0, 0, side * 0.12]),
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

export function createHeroSpecialZombieVisual(options = {}) {
  const archetype = normalizeArchetype(options.archetype || options.type);
  const seed = Number.isFinite(Number(options.motionSeed)) ? Number(options.motionSeed) : 0.5;
  const materials = {
    solid: makeSolidMaterial(),
    eye: makeEyeMaterial(archetype === 'GOLIATH' ? 0xa9c220 : 0x35f0ff),
  };
  const rig = archetype === 'GOLIATH'
    ? createGoliath(materials, seed)
    : createSpitter(materials, seed);
  const root = rig.root;

  root.name = `hero_${archetype === 'RANGED' ? 'spitter' : 'goliath'}_visual`;
  root.rotation.y = Math.PI;
  root.userData.baseYaw = Math.PI;
  root.userData.basePosition = root.position.clone();
  root.userData.baseRotation = root.rotation.clone();
  root.userData.baseScale = root.scale.clone();
  root.userData.isHeroSpecialZombie = true;
  root.userData.archetype = archetype;
  root.userData.renderTier = normalizeTier(options.renderTier);
  root.userData.motionSeed = seed;
  root.userData.motionPhase = Number(options.motionPhase) || seed * Math.PI * 2;
  root.userData.visualPatch = 'vis6-r2f-enemy-family-cohesion';
  root.userData.materials = materials;
  root.userData.parts = rig;
  applySpecialFamilyCohesion(root, rig, archetype);

  root.traverse((child) => {
    child.userData.keepMaterial = true;
    child.userData.isHeroSpecialZombie = true;
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
    }
  });

  setHeroSpecialZombieRenderTier(root, root.userData.renderTier);
  root.visible = false;
  return root;
}

export function setHeroSpecialZombieRenderTier(root, tierValue = 'FULL') {
  if (!root?.userData?.parts) return false;
  const tier = normalizeTier(tierValue);
  root.userData.renderTier = tier;
  const parts = root.userData.parts;
  const detailPart = parts.throat || parts.jaw;
  if (detailPart) detailPart.visible = tier === 'FULL';
  return true;
}

export function updateHeroSpecialZombieStyle(root, config = {}) {
  if (!root?.userData?.materials) return false;
  const archetype = normalizeArchetype(config.name || config.type || root.userData.archetype);
  root.userData.archetype = archetype;
  const materials = root.userData.materials;
  const eyeColor = archetype === 'GOLIATH' ? 0xa9c220 : 0x35f0ff;
  materials.eye.color.setHex(eyeColor);
  materials.eye.opacity = archetype === 'GOLIATH' ? 0.72 : 0.82;
  materials.solid.roughness = archetype === 'GOLIATH' ? 0.86 : 0.92;
  materials.solid.metalness = archetype === 'GOLIATH' ? 0.065 : 0.030;
  return true;
}

export function updateHeroSpecialZombieMotion(root, timeSeconds, speed = 1, state = {}) {
  const parts = root?.userData?.parts;
  if (!parts) return false;

  const archetype = root.userData.archetype;
  const seed = root.userData.motionSeed || 0.5;
  const phase = root.userData.motionPhase || 0;
  const hitReactT = Math.max(0, Number(state.hitReactT) || 0);
  const hitReactDir = Number(state.hitReactDir) || 1;
  const attackT = Math.max(0, Number(state.attackT) || 0);
  const attackDuration = Math.max(0.05, Number(state.attackDuration) || 0.34);
  const attackProgress = attackT > 0 ? 1 - Math.min(1, attackT / attackDuration) : 0;
  const attackPulse = attackT > 0 ? Math.sin(attackProgress * Math.PI) : 0;
  const telegraph = Math.max(0, Math.min(1, Number(state.telegraphProgress) || 0));
  const deathT = Number(state.deathT ?? -1);

  [
    root,
    parts.torso,
    parts.head,
    parts.throat,
    parts.jaw,
    parts.leftArm,
    parts.rightArm,
    parts.leftLeg,
    parts.rightLeg,
  ].forEach(resetObject);
  root.rotation.y = root.userData.baseYaw ?? Math.PI;

  if (archetype === 'RANGED') {
    const cadence = 4.10 * Math.max(0.25, speed) * (0.95 + seed * 0.10);
    const t = timeSeconds * cadence + phase;
    const stride = Math.sin(t);
    const opposite = Math.sin(t + Math.PI);
    const repositionT = Math.max(0, Number(state.spitterRepositionT) || 0);
    const repositionPulse = Math.min(1, repositionT / Math.max(0.05, Number(state.spitterRepositionDuration) || 0.75));
    const firing = attackPulse * (0.7 + telegraph * 0.3);

    root.position.y += Math.abs(stride) * 0.018;
    root.rotation.z += Math.sin(t * 0.5) * 0.018;
    parts.torso.rotation.x -= 0.08 + firing * 0.12;
    parts.torso.rotation.y += Math.sin(t * 0.5) * 0.035;
    parts.head.rotation.y += Math.sin(t * 0.55) * 0.075;
    parts.head.rotation.x -= firing * 0.18;
    parts.leftArm.rotation.x += stride * 0.30 + firing * 0.36;
    parts.rightArm.rotation.x += opposite * 0.30 + firing * 0.36;
    parts.leftLeg.rotation.x += opposite * 0.34 + repositionPulse * 0.14;
    parts.rightLeg.rotation.x += stride * 0.34 - repositionPulse * 0.14;

    if (parts.throat) {
      const pulse = 1 + Math.sin(timeSeconds * 6.5 + phase) * 0.035 + firing * 0.26;
      parts.throat.scale.set(pulse, pulse, pulse);
      parts.throat.rotation.x -= firing * 0.22;
    }
    parts.eyeMesh.material.opacity = 0.70 + telegraph * 0.18 + firing * 0.08;
  } else {
    const cadence = 2.15 * Math.max(0.22, speed) * (0.96 + seed * 0.08);
    const t = timeSeconds * cadence + phase;
    const stride = Math.sin(t);
    const opposite = Math.sin(t + Math.PI);
    const weight = Math.abs(Math.sin(t * 0.5));
    const phaseIndex = Math.max(0, Number(state.goliathPhase) || 0);
    const phasePulseT = Math.max(0, Number(state.goliathPhasePulseT) || 0);
    const phasePulse = Math.min(1, phasePulseT / Math.max(0.05, Number(state.goliathPhasePulseDuration) || 0.75));
    const impact = attackPulse * (0.75 + telegraph * 0.25);

    root.position.y += weight * 0.030;
    root.rotation.z += Math.sin(t * 0.5) * 0.012;
    parts.torso.rotation.x -= 0.055 + impact * 0.15;
    parts.torso.scale.x *= 1 + phasePulse * 0.035;
    parts.torso.scale.z *= 1 + phasePulse * 0.035;
    parts.head.rotation.y += Math.sin(t * 0.35) * 0.035;
    parts.head.rotation.x -= impact * 0.10;
    parts.leftArm.rotation.x += stride * 0.22 + impact * 0.50;
    parts.rightArm.rotation.x += opposite * 0.22 + impact * 0.50;
    parts.leftArm.rotation.z -= impact * 0.12;
    parts.rightArm.rotation.z += impact * 0.12;
    parts.leftLeg.rotation.x += opposite * 0.23;
    parts.rightLeg.rotation.x += stride * 0.23;
    if (parts.jaw) parts.jaw.rotation.x += impact * 0.22;
    parts.eyeMesh.material.opacity = 0.66 + Math.min(0.22, phaseIndex * 0.05) + phasePulse * 0.12;
  }

  if (hitReactT > 0) {
    const hitPulse = Math.sin(Math.min(1, hitReactT / 0.18) * Math.PI);
    root.rotation.z += hitReactDir * hitPulse * 0.10;
    parts.torso.rotation.y += hitReactDir * hitPulse * 0.08;
    parts.head.rotation.y += hitReactDir * hitPulse * 0.13;
  }

  if (deathT >= 0) {
    const deathProgress = Math.min(1, deathT / 0.75);
    const fall = THREE.MathUtils.smoothstep(deathProgress, 0, 1);
    parts.torso.rotation.x -= fall * 0.55;
    parts.head.rotation.x += fall * 0.28;
    parts.leftArm.rotation.z -= fall * 0.34;
    parts.rightArm.rotation.z += fall * 0.34;
  }

  return true;
}
