// js/actors/hero_brute_exploder.js
// VIS.6 R2D — Batched authored Brute and Exploder foundation.
import * as THREE from 'three';

const GEOMETRY_CACHE = new Map();
const HEAVY_ARCHETYPES = Object.freeze(['BRUTE', 'EXPLODER']);
const RENDER_TIERS = Object.freeze(['FULL', 'STANDARD']);

function cachedGeometry(key, factory) {
  if (!GEOMETRY_CACHE.has(key)) GEOMETRY_CACHE.set(key, factory());
  return GEOMETRY_CACHE.get(key);
}

function normalizeArchetype(value) {
  const type = String(value || '').trim().toUpperCase();
  return HEAVY_ARCHETYPES.includes(type) ? type : 'BRUTE';
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
    opacity: 0.76,
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
    throw new Error(`Unknown heavy zombie primitive: ${kind}`);
  });
}

function part(kind, args, color, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return { kind, args, color, position, rotation, scale };
}

function mergedColoredGeometry(key, parts) {
  return cachedGeometry(`heavy-merged:${key}`, () => {
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
  object.userData.isHeroHeavyZombie = true;
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

function applyHeavyFamilyCohesion(root, rig, archetype) {
  if (!root || !rig) return;

  if (archetype === 'EXPLODER') {
    // Uneven mass now drives the silhouette: one swollen arm, a dragged side,
    // and a smaller displaced skull around the integrated volatile torso.
    root.scale.set(0.99, 1.03, 1.01);
    rig.torso.scale.set(1.04, 1.05, 1.10);
    rig.torso.rotation.z -= 0.035;
    rig.head.scale.set(0.93, 1.02, 0.96);
    rig.head.position.x -= 0.030;
    rig.head.position.y -= 0.010;
    rig.jaw.scale.set(0.97, 1.04, 1.02);
    rig.leftArm.scale.set(0.94, 1.03, 0.96);
    rig.rightArm.scale.set(1.16, 1.07, 1.13);
    rig.rightArm.position.x += 0.018;
    rig.leftLeg.scale.set(0.93, 1.04, 0.95);
    rig.rightLeg.scale.set(1.06, 1.02, 1.05);
  } else {
    // Brute reads as one continuous mass: deeper rib cage, lowered compact head,
    // larger forelimbs, and planted legs rather than an enlarged human frame.
    root.scale.set(1.01, 1.00, 1.02);
    rig.torso.scale.set(1.10, 1.04, 1.11);
    rig.torso.position.y += 0.010;
    rig.head.scale.set(0.99, 0.93, 1.03);
    rig.head.position.y -= 0.018;
    rig.jaw.scale.set(1.12, 0.88, 1.10);
    rig.leftArm.scale.set(1.14, 1.07, 1.12);
    rig.rightArm.scale.set(1.14, 1.07, 1.12);
    rig.leftArm.position.x -= 0.020;
    rig.rightArm.position.x += 0.020;
    rig.leftLeg.scale.set(1.09, 1.04, 1.08);
    rig.rightLeg.scale.set(1.09, 1.04, 1.08);
  }

  [
    root, rig.torso, rig.head, rig.jaw, rig.leftArm, rig.rightArm,
    rig.leftLeg, rig.rightLeg,
  ].forEach(commitCohesionTransform);
}

function createBrute(materials, seed) {
  const rig = {};
  const root = new THREE.Group();

  const torso = makePivot('hero_brute_torso_rig', [0, 1.18, 0], [-0.10, 0, 0]);
  const torsoMesh = makeMergedMesh('hero_brute_core', 'brute-core-v1', [
    part('cylinder', [0.43, 0.31, 0.82, 8], 0x55435e, [0, 0.02, 0], [0, 0, 0], [1, 1, 0.72]),
    part('cylinder', [0.32, 0.29, 0.28, 8], 0x19171d, [0, -0.48, 0.01], [0, 0, 0], [1, 1, 0.74]),
    part('box', [0.68, 0.46, 0.085], 0x302a36, [0, 0.10, -0.285], [0, 0, 0]),
    part('box', [0.20, 0.29, 0.070], 0x5a1119, [-0.18, 0.02, -0.332], [0, 0, -0.14]),
    part('box', [0.095, 0.66, 0.055], 0x17141a, [-0.18, -0.01, -0.325], [0, 0, -0.20]),
    part('box', [0.095, 0.66, 0.055], 0x17141a, [0.18, -0.01, -0.325], [0, 0, 0.20]),
    part('dodeca', [0.20, 0], 0x51495c, [-0.44, 0.37, -0.02], [0, 0, 0], [1.35, 0.72, 1.05]),
    part('dodeca', [0.20, 0], 0x51495c, [0.44, 0.37, -0.02], [0, 0, 0], [1.35, 0.72, 1.05]),
    part('box', [0.44, 0.075, 0.050], 0x8f5ac4, [0, -0.15, -0.345], [0, 0, 0]),
  ], materials.solid);
  torso.add(torsoMesh);
  root.add(torso);

  const head = makePivot('hero_brute_head_rig', [0, 1.78, -0.06], [0.03, 0, 0], { head: true });
  const headMesh = makeMergedMesh('hero_brute_head', 'brute-head-v1', [
    part('sphere', [0.5, 7, 5], 0x65506d, [0, 0, 0], [0, 0, 0], [0.58, 0.57, 0.50]),
    part('box', [0.49, 0.10, 0.10], 0x362e3b, [0, 0.12, -0.275], [0.04, 0, 0]),
    part('box', [0.15, 0.22, 0.075], 0x443b49, [0, -0.02, -0.295], [0.03, 0, 0]),
    part('box', [0.42, 0.14, 0.065], 0x130608, [0, -0.22, -0.285], [0, 0, 0]),
    part('box', [0.19, 0.18, 0.060], 0x62121a, [0.18, -0.04, -0.280], [0, 0, 0.18]),
    part('box', [0.48, 0.11, 0.10], 0x4d4658, [0, -0.26, -0.245], [0, 0, 0]),
    part('cone', [0.027, 0.075, 4], 0xd2c69d, [-0.10, -0.20, -0.330], [Math.PI, 0, 0]),
    part('cone', [0.024, 0.068, 4], 0xd2c69d, [0.00, -0.205, -0.334], [Math.PI, 0, 0]),
    part('cone', [0.022, 0.060, 4], 0xd2c69d, [0.105, -0.20, -0.330], [Math.PI, 0, 0]),
  ], materials.solid, { head: true });
  const eyeMesh = makeMergedMesh('hero_brute_eyes', 'brute-eyes-v1', [
    part('sphere', [0.032, 6, 4], 0xffffff, [-0.125, 0.035, -0.325], [0, 0, 0], [1.18, 0.62, 0.52]),
    part('sphere', [0.032, 6, 4], 0xffffff, [0.125, 0.035, -0.325], [0, 0, 0], [1.18, 0.62, 0.52]),
  ], materials.eye, { head: true });
  const jaw = makePivot('hero_brute_jaw_rig', [0, -0.225, -0.035], [0.05, 0, 0], { head: true });
  const jawMesh = makeMergedMesh('hero_brute_jaw', 'brute-jaw-v1', [
    part('dodeca', [0.17, 0], 0x463b48, [0, 0, -0.21], [0, 0, 0], [1.42, 0.70, 0.92]),
    part('box', [0.27, 0.050, 0.045], 0x130608, [0, 0.035, -0.340], [0, 0, 0]),
    part('box', [0.30, 0.075, 0.070], 0x4d4658, [0, -0.055, -0.280], [0, 0, 0]),
  ], materials.solid, { head: true });
  jaw.add(jawMesh);
  head.add(headMesh, eyeMesh, jaw);
  root.add(head);
  markHeadHierarchy(head);

  function makeArm(side) {
    const arm = makePivot(
      `hero_brute_${side < 0 ? 'left' : 'right'}_arm_rig`,
      [side * 0.48, 1.49, -0.02],
      [-0.18, 0, side * 0.09],
    );
    const mesh = makeMergedMesh(
      `hero_brute_${side < 0 ? 'left' : 'right'}_arm`,
      `brute-arm-${side}`,
      [
        part('cylinder', [0.145, 0.175, 0.45, 7], side < 0 ? 0x55435e : 0x29232d, [0, -0.21, 0], [0, 0, 0], [1, 1, 0.88]),
        part('cylinder', [0.120, 0.145, 0.50, 7], 0x5f5065, [side * 0.035, -0.65, 0.03], [0.05, 0, side * 0.04], [1, 1, 0.88]),
        part('dodeca', [0.14, 0], 0x675b68, [side * 0.055, -0.96, 0.055], [0, 0, 0], [1.05, 1.18, 0.92]),
        part('box', [0.27, 0.32, 0.24], 0x4d4658, [side * 0.035, -0.64, 0.035], [0.04, 0, side * 0.04]),
        part('box', [0.11, 0.18, 0.040], 0x64121a, [side * 0.08, -0.43, -0.105], [0, 0, side * 0.16]),
      ],
      materials.solid,
    );
    arm.add(mesh);
    root.add(arm);
    return arm;
  }

  function makeLeg(side) {
    const leg = makePivot(
      `hero_brute_${side < 0 ? 'left' : 'right'}_leg_rig`,
      [side * 0.19, 0.79, 0],
      [0.02, 0, side * 0.02],
    );
    const mesh = makeMergedMesh(
      `hero_brute_${side < 0 ? 'left' : 'right'}_leg`,
      `brute-leg-${side}`,
      [
        part('cylinder', [0.135, 0.165, 0.48, 7], 0x19171d, [0, -0.23, 0], [0, 0, 0], [1, 1, 0.90]),
        part('cylinder', [0.105, 0.135, 0.46, 7], 0x51475a, [side * 0.015, -0.67, 0.02], [0.03, 0, side * 0.02], [1, 1, 0.86]),
        part('box', [0.28, 0.17, 0.42], 0x0b0a0d, [side * 0.02, -0.96, -0.10], [0.02, 0, side * 0.02]),
        part('box', [0.15, 0.17, 0.050], 0x62121a, [-side * 0.03, -0.64, -0.120], [0, 0, side * 0.12]),
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

function createExploder(materials, seed) {
  const rig = {};
  const root = new THREE.Group();

  const torso = makePivot('hero_exploder_torso_rig', [0, 1.17, 0], [-0.14, 0, -0.055]);
  const torsoMesh = makeMergedMesh('hero_exploder_core', 'exploder-core-v1', [
    part('cylinder', [0.36, 0.27, 0.78, 8], 0x6d4937, [0, 0.01, 0], [0, 0, 0], [1, 1, 0.72]),
    part('cylinder', [0.28, 0.25, 0.27, 7], 0x201814, [0, -0.47, 0], [0, 0, 0], [1, 1, 0.74]),
    part('sphere', [0.5, 7, 5], 0x9d4f1d, [0.17, 0.08, -0.13], [0, 0, 0], [0.46, 0.58, 0.36]),
    part('sphere', [0.5, 7, 5], 0xc05c18, [-0.15, -0.06, -0.19], [0, 0, 0], [0.31, 0.43, 0.28]),
    part('box', [0.48, 0.32, 0.070], 0x35251f, [-0.04, 0.13, -0.275], [0, 0, -0.08]),
    part('box', [0.14, 0.24, 0.060], 0x5e1110, [-0.17, -0.06, -0.315], [0, 0, -0.20]),
    part('box', [0.070, 0.60, 0.045], 0x1c1613, [-0.14, -0.02, -0.310], [0, 0, -0.20]),
    part('box', [0.070, 0.58, 0.045], 0x1c1613, [0.14, -0.03, -0.310], [0, 0, 0.20]),
    part('torus', [0.14, 0.030, 6, 10], 0xff8a25, [0.17, 0.08, -0.335], [Math.PI / 2, 0, 0]),
    part('cylinder', [0.018, 0.018, 0.36, 5], 0xff6b1a, [-0.20, 0.29, -0.23], [0.30, 0.12, 0.58]),
    part('cylinder', [0.016, 0.016, 0.31, 5], 0xff6b1a, [0.22, -0.25, -0.22], [-0.28, -0.08, -0.52]),
  ], materials.solid);
  torso.add(torsoMesh);
  root.add(torso);

  const head = makePivot('hero_exploder_head_rig', [-0.05, 1.73, -0.08], [0.10, 0, -0.10], { head: true });
  const headMesh = makeMergedMesh('hero_exploder_head', 'exploder-head-v1', [
    part('sphere', [0.5, 7, 5], 0x79503c, [0, 0, 0], [0, 0, 0], [0.51, 0.53, 0.46]),
    part('sphere', [0.5, 7, 5], 0xa55721, [0.17, 0.05, -0.04], [0, 0, 0], [0.23, 0.31, 0.22]),
    part('box', [0.40, 0.09, 0.085], 0x493125, [0, 0.11, -0.250], [0.04, 0, -0.04]),
    part('box', [0.13, 0.20, 0.065], 0x52382b, [0, -0.02, -0.265], [0.03, 0, 0]),
    part('box', [0.36, 0.12, 0.055], 0x170506, [0.01, -0.20, -0.255], [0, 0, -0.05]),
    part('box', [0.16, 0.16, 0.055], 0x68120f, [-0.15, -0.05, -0.255], [0, 0, -0.20]),
    part('cone', [0.024, 0.067, 4], 0xd0c29a, [-0.085, -0.18, -0.300], [Math.PI, 0, 0]),
    part('cone', [0.021, 0.058, 4], 0xd0c29a, [0.00, -0.19, -0.304], [Math.PI, 0, 0]),
    part('cone', [0.018, 0.052, 4], 0xd0c29a, [0.080, -0.18, -0.300], [Math.PI, 0, 0]),
  ], materials.solid, { head: true });
  const eyeMesh = makeMergedMesh('hero_exploder_eyes', 'exploder-eyes-v1', [
    part('sphere', [0.029, 6, 4], 0xffffff, [-0.108, 0.030, -0.300], [0, 0, 0], [1.16, 0.62, 0.54]),
    part('sphere', [0.029, 6, 4], 0xffffff, [0.108, 0.030, -0.300], [0, 0, 0], [1.16, 0.62, 0.54]),
  ], materials.eye, { head: true });
  const jaw = makePivot('hero_exploder_jaw_rig', [0.01, -0.21, -0.03], [0.06, 0, -0.06], { head: true });
  const jawMesh = makeMergedMesh('hero_exploder_jaw', 'exploder-jaw-v1', [
    part('dodeca', [0.145, 0], 0x49362b, [0, 0, -0.19], [0, 0, 0], [1.30, 0.66, 0.84]),
    part('box', [0.23, 0.048, 0.042], 0x170506, [0, 0.03, -0.310], [0, 0, -0.03]),
  ], materials.solid, { head: true });
  jaw.add(jawMesh);
  head.add(headMesh, eyeMesh, jaw);
  root.add(head);
  markHeadHierarchy(head);

  function makeArm(side) {
    const swollen = side > 0;
    const arm = makePivot(
      `hero_exploder_${side < 0 ? 'left' : 'right'}_arm_rig`,
      [side * (swollen ? 0.40 : 0.37), 1.45, -0.02],
      [-0.24, 0, side * (swollen ? 0.16 : 0.10)],
    );
    const mesh = makeMergedMesh(
      `hero_exploder_${side < 0 ? 'left' : 'right'}_arm`,
      `exploder-arm-${side}`,
      [
        part('cylinder', [swollen ? 0.115 : 0.088, swollen ? 0.140 : 0.108, 0.43, 7], swollen ? 0x8f4a25 : 0x6d4937, [0, -0.20, 0], [0, 0, 0], [1, 1, 0.84]),
        part('cylinder', [swollen ? 0.092 : 0.065, swollen ? 0.115 : 0.085, 0.48, 7], 0x76503a, [side * 0.040, -0.61, 0.03], [0.08, 0, side * 0.06], [1, 1, 0.82]),
        part('dodeca', [swollen ? 0.115 : 0.090, 0], 0x80604a, [side * 0.070, -0.90, 0.055], [0, 0, 0], [0.88, 1.16, 0.76]),
        part('sphere', [0.5, 6, 4], 0xb85a19, [side * 0.06, -0.54, -0.055], [0, 0, 0], [swollen ? 0.18 : 0.11, swollen ? 0.24 : 0.15, 0.09]),
        part('box', [0.09, 0.16, 0.040], 0x5e1110, [side * 0.08, -0.39, -0.090], [0, 0, side * 0.18]),
      ],
      materials.solid,
    );
    arm.add(mesh);
    root.add(arm);
    return arm;
  }

  function makeLeg(side) {
    const dragging = side < 0;
    const leg = makePivot(
      `hero_exploder_${side < 0 ? 'left' : 'right'}_leg_rig`,
      [side * 0.16, 0.78, 0],
      [0.02, 0, side * (dragging ? 0.07 : 0.02)],
    );
    const mesh = makeMergedMesh(
      `hero_exploder_${side < 0 ? 'left' : 'right'}_leg`,
      `exploder-leg-${side}`,
      [
        part('cylinder', [dragging ? 0.105 : 0.115, dragging ? 0.130 : 0.140, 0.46, 7], 0x201814, [0, -0.22, 0], [0, 0, 0], [1, 1, 0.87]),
        part('cylinder', [dragging ? 0.075 : 0.085, dragging ? 0.105 : 0.115, 0.45, 7], 0x714a34, [side * 0.015, -0.64, 0.02], [0.04, 0, side * 0.03], [1, 1, 0.82]),
        part('box', [0.23, 0.14, 0.37], 0x0c0908, [side * 0.02, -0.93, -0.10], [0.03, 0, side * 0.03]),
        part('box', [0.13, 0.16, 0.045], 0x5e1110, [-side * 0.03, -0.61, -0.105], [0, 0, side * 0.14]),
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

export function createHeroHeavyZombieVisual(options = {}) {
  const archetype = normalizeArchetype(options.archetype || options.type);
  const seed = Number.isFinite(Number(options.motionSeed)) ? Number(options.motionSeed) : 0.5;
  const materials = {
    solid: makeSolidMaterial(),
    eye: makeEyeMaterial(archetype === 'BRUTE' ? 0xc87cff : 0xff6b1a),
  };
  const rig = archetype === 'EXPLODER'
    ? createExploder(materials, seed)
    : createBrute(materials, seed);
  const root = rig.root;

  root.name = `hero_${archetype.toLowerCase()}_visual`;
  root.rotation.y = Math.PI;
  root.userData.baseYaw = Math.PI;
  root.userData.basePosition = root.position.clone();
  root.userData.baseRotation = root.rotation.clone();
  root.userData.baseScale = root.scale.clone();
  root.userData.isHeroHeavyZombie = true;
  root.userData.archetype = archetype;
  root.userData.renderTier = normalizeTier(options.renderTier);
  root.userData.motionSeed = seed;
  root.userData.motionPhase = Number(options.motionPhase) || seed * Math.PI * 2;
  root.userData.visualPatch = 'vis6-r2f-enemy-family-cohesion';
  root.userData.materials = materials;
  root.userData.parts = rig;
  applyHeavyFamilyCohesion(root, rig, archetype);

  root.traverse((child) => {
    child.userData.keepMaterial = true;
    child.userData.isHeroHeavyZombie = true;
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
    }
  });

  setHeroHeavyZombieRenderTier(root, root.userData.renderTier);
  root.visible = false;
  return root;
}

export function setHeroHeavyZombieRenderTier(root, tierValue = 'FULL') {
  if (!root?.userData?.parts) return false;
  const tier = normalizeTier(tierValue);
  root.userData.renderTier = tier;
  const parts = root.userData.parts;
  if (parts.jaw) parts.jaw.visible = tier === 'FULL';
  return true;
}

export function updateHeroHeavyZombieStyle(root, config = {}) {
  if (!root?.userData?.materials) return false;
  const archetype = normalizeArchetype(config.name || config.type || root.userData.archetype);
  root.userData.archetype = archetype;
  const materials = root.userData.materials;
  const eyeColor = archetype === 'BRUTE' ? 0xc87cff : 0xff6b1a;
  materials.eye.color.setHex(eyeColor);
  materials.eye.opacity = archetype === 'BRUTE' ? 0.68 : 0.80;
  materials.solid.roughness = archetype === 'BRUTE' ? 0.87 : 0.92;
  materials.solid.metalness = archetype === 'BRUTE' ? 0.055 : 0.020;
  return true;
}

export function updateHeroHeavyZombieMotion(root, timeSeconds, speed = 1, state = {}) {
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
  const telegraph = Math.max(0, Math.min(1, Number(state.telegraphProgress) || 0));
  const deathT = Number(state.deathT ?? -1);
  const braceT = Math.max(0, Number(state.bruteBraceT) || 0);
  const exploderPrimed = String(state.exploderStage || 'IDLE').toUpperCase() !== 'IDLE';

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

  if (archetype === 'BRUTE') {
    const cadence = 3.05 * Math.max(0.25, speed) * (0.94 + seed * 0.12);
    const t = timeSeconds * cadence + phase;
    const stride = Math.sin(t);
    const opposite = Math.sin(t + Math.PI);
    const weight = Math.abs(Math.sin(t * 0.5));
    const brace = Math.min(1, braceT / 0.8);

    root.position.y += weight * 0.026;
    root.rotation.z += stride * 0.012;
    parts.torso.rotation.x += -0.10 + brace * 0.08 - telegraph * 0.05;
    parts.torso.rotation.z += stride * 0.020;
    parts.head.rotation.x += 0.03 - brace * 0.05;
    parts.head.rotation.y += stride * 0.025;
    parts.leftArm.rotation.x += opposite * 0.34 - brace * 0.30;
    parts.rightArm.rotation.x += stride * 0.34 - brace * 0.30;
    parts.leftArm.rotation.z += brace * 0.12;
    parts.rightArm.rotation.z -= brace * 0.12;
    parts.leftLeg.rotation.x += stride * 0.28;
    parts.rightLeg.rotation.x += opposite * 0.28;
    parts.jaw.rotation.x += 0.05 + attackPulse * 0.28;
  } else {
    const cadence = 5.4 * Math.max(0.25, speed) * (0.93 + seed * 0.14);
    const t = timeSeconds * cadence + phase;
    const stride = Math.sin(t);
    const opposite = Math.sin(t + Math.PI);
    const wobble = Math.sin(t * 0.5);
    const tremor = exploderPrimed || telegraph > 0
      ? Math.sin(timeSeconds * 21 + phase) * (0.018 + telegraph * 0.026)
      : 0;

    root.position.y += Math.abs(stride) * 0.020;
    root.position.x += tremor;
    root.rotation.z += wobble * 0.035 + tremor * 0.8;
    parts.torso.rotation.x += -0.14 + telegraph * 0.10;
    parts.torso.rotation.z += wobble * 0.055 + tremor;
    parts.head.rotation.x += 0.10 + Math.abs(wobble) * 0.025;
    parts.head.rotation.y += stride * 0.055;
    parts.head.rotation.z += tremor * 1.8;
    parts.leftArm.rotation.x += opposite * 0.42 - telegraph * 0.18;
    parts.rightArm.rotation.x += stride * 0.52 - telegraph * 0.22;
    parts.leftLeg.rotation.x += stride * 0.30;
    parts.rightLeg.rotation.x += opposite * 0.38;
    parts.leftLeg.rotation.z -= Math.abs(stride) * 0.045;
    parts.jaw.rotation.x += 0.06 + (Math.sin(timeSeconds * 4.0 + phase) + 1) * 0.018 + attackPulse * 0.24;
    if (exploderPrimed || telegraph > 0) {
      const pulse = 1 + (0.025 + telegraph * 0.045) * (0.5 + 0.5 * Math.sin(timeSeconds * 12 + phase));
      parts.torso.scale.multiplyScalar(pulse);
    }
  }

  if (attackPulse > 0) {
    parts.torso.position.z -= attackPulse * (archetype === 'BRUTE' ? 0.12 : 0.09);
    parts.head.position.z -= attackPulse * 0.08;
    parts.leftArm.rotation.x += attackPulse * 0.30;
    parts.rightArm.rotation.x += attackPulse * 0.30;
  }

  if (hitReactT > 0) {
    const kick = Math.min(1, hitReactT / 0.16);
    parts.torso.rotation.z += hitReactDir * 0.12 * kick;
    parts.head.rotation.z += hitReactDir * 0.18 * kick;
  }

  if (deathT >= 0) {
    const death = Math.min(1, deathT / 0.65);
    parts.torso.rotation.x += death * 0.62;
    parts.head.rotation.x += death * 0.28;
    parts.leftArm.rotation.x += death * 0.50;
    parts.rightArm.rotation.x += death * 0.50;
    root.position.y -= death * 0.16;
    root.rotation.z += death * (archetype === 'BRUTE' ? 0.16 : 0.24);
  }

  return true;
}

export function getHeroHeavyZombieMetrics() {
  return Object.freeze({
    patch: 'vis6-r2d-authored-brute-exploder-foundation',
    archetypes: HEAVY_ARCHETYPES,
    renderTiers: RENDER_TIERS,
    drawCallsFullPerActor: 8,
    drawCallsStandardPerActor: 7,
    mergedVertexColoredBodySections: true,
    deterministicMotionProfiles: true,
    headshotHierarchy: true,
    proceduralFallbackPreserved: true,
  });
}
