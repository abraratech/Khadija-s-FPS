// js/actors/survivor_operator.js
// VIS.5 R2 — shared low-poly tactical operator foundation.

export const SURVIVOR_OPERATOR_PATCH = 'vis7-authored-survivor-refinement-r1-2-1';

const GEOMETRY_CACHE = new WeakMap();

function cachedGeometry(THREE, key, factory) {
  let cache = GEOMETRY_CACHE.get(THREE);
  if (!cache) {
    cache = new Map();
    GEOMETRY_CACHE.set(THREE, cache);
  }
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

function makeMaterial(THREE, color, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0.06,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    flatShading: true,
    envMapIntensity: options.envMapIntensity ?? 0.22,
  });
  material.needsUpdate = true;
  return material;
}

function makeMaterials(THREE, palette = {}) {
  const skin = palette.skin ?? 0xb88767;
  const suit = palette.suit ?? 0x176f88;
  const armor = palette.armor ?? 0x123448;
  const accent = palette.accent ?? 0x10d8ff;
  const hair = palette.hair ?? 0x101820;
  return {
    skin: makeMaterial(THREE, skin, { roughness: 0.92 }),
    skinDetail: makeMaterial(THREE, palette.skinDetail ?? 0x81533f, { roughness: 0.92 }),
    suit: makeMaterial(THREE, suit, { roughness: 0.84 }),
    suitDark: makeMaterial(THREE, palette.suitDark ?? 0x0b2631, { roughness: 0.92 }),
    undersuit: makeMaterial(THREE, palette.undersuit ?? 0x07151c, { roughness: 0.96 }),
    armor: makeMaterial(THREE, armor, { roughness: 0.52, metalness: 0.28 }),
    armorEdge: makeMaterial(THREE, palette.armorEdge ?? 0x315568, { roughness: 0.44, metalness: 0.34 }),
    utility: makeMaterial(THREE, palette.utility ?? 0x202a30, { roughness: 0.80, metalness: 0.14 }),
    strap: makeMaterial(THREE, palette.strap ?? 0x10171b, { roughness: 0.96 }),
    glove: makeMaterial(THREE, palette.glove ?? 0x0a1116, { roughness: 0.90 }),
    boot: makeMaterial(THREE, palette.boot ?? 0x081015, { roughness: 0.92 }),
    hair: makeMaterial(THREE, hair, { roughness: 0.88 }),
    accent: makeMaterial(THREE, accent, {
      roughness: 0.26,
      metalness: 0.18,
      emissive: accent,
      emissiveIntensity: 0.78,
    }),
  };
}

function trapezoidPrismGeometry(THREE, topWidth, bottomWidth, height, depth) {
  const tw = topWidth * 0.5;
  const bw = bottomWidth * 0.5;
  const hh = height * 0.5;
  const hd = depth * 0.5;
  const positions = new Float32Array([
    -bw, -hh, -hd, bw, -hh, -hd, bw, -hh, hd, -bw, -hh, hd,
    -tw, hh, -hd, tw, hh, -hd, tw, hh, hd, -tw, hh, hd,
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function chamferPlateGeometry(THREE, width, height, depth, chamfer = 0.12) {
  const shape = new THREE.Shape();
  const hw = width * 0.5;
  const hh = height * 0.5;
  const c = Math.min(width, height) * chamfer;
  shape.moveTo(-hw + c, hh);
  shape.lineTo(hw - c, hh);
  shape.lineTo(hw, hh - c);
  shape.lineTo(hw, -hh + c * 0.7);
  shape.lineTo(hw - c * 0.7, -hh);
  shape.lineTo(-hw + c * 0.7, -hh);
  shape.lineTo(-hw, -hh + c * 0.7);
  shape.lineTo(-hw, hh - c);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

function wedgeGeometry(THREE, width, height, depth, toeLift = 0.04) {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const hd = depth * 0.5;
  const positions = new Float32Array([
    -hw, -hh, -hd, hw, -hh, -hd, hw, -hh + toeLift, hd, -hw, -hh + toeLift, hd,
    -hw, hh, -hd, hw, hh, -hd, hw, hh * 0.72, hd, -hw, hh * 0.72, hd,
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}


function ringProfileGeometry(THREE, key, rings, segments = 8) {
  return cachedGeometry(THREE, `operator-ring:${key}`, () => {
    const positions = [];
    const indices = [];
    const uvs = [];

    rings.forEach((ring, ringIndex) => {
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const frontDepth = ring.frontDepth ?? ring.depth;
        const backDepth = ring.backDepth ?? ring.depth;
        const depth = sin < 0 ? frontDepth : backDepth;
        positions.push(
          (ring.xOffset || 0) + cos * ring.width,
          ring.y,
          (ring.zOffset || 0) + sin * depth,
        );
        uvs.push(segment / segments, ringIndex / Math.max(1, rings.length - 1));
      }
    });

    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      const lower = ringIndex * segments;
      const upper = (ringIndex + 1) * segments;
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        const a = lower + segment;
        const b = lower + next;
        const c = upper + next;
        const d = upper + segment;
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
    geometry.computeBoundingSphere();
    return geometry;
  });
}

function organicTorsoGeometry(THREE) {
  return ringProfileGeometry(THREE, 'torso-r1-1', [
    { y: -0.32, width: 0.215, frontDepth: 0.158, backDepth: 0.150 },
    { y: -0.17, width: 0.245, frontDepth: 0.178, backDepth: 0.160 },
    { y: 0.03, width: 0.292, frontDepth: 0.205, backDepth: 0.180 },
    { y: 0.20, width: 0.328, frontDepth: 0.214, backDepth: 0.190 },
    { y: 0.30, width: 0.258, frontDepth: 0.176, backDepth: 0.168 },
  ], 10);
}

function organicPelvisGeometry(THREE) {
  return ringProfileGeometry(THREE, 'pelvis-r1', [
    { y: -0.13, width: 0.215, frontDepth: 0.155, backDepth: 0.150 },
    { y: 0.00, width: 0.265, frontDepth: 0.185, backDepth: 0.175 },
    { y: 0.13, width: 0.245, frontDepth: 0.175, backDepth: 0.165 },
  ], 8);
}

function organicHeadGeometry(THREE) {
  return ringProfileGeometry(THREE, 'head-r1-2', [
    { y: -0.225, width: 0.082, frontDepth: 0.108, backDepth: 0.100, xOffset: 0.003 },
    { y: -0.165, width: 0.132, frontDepth: 0.148, backDepth: 0.132, xOffset: 0.003 },
    { y: -0.070, width: 0.170, frontDepth: 0.178, backDepth: 0.158 },
    { y: 0.070, width: 0.188, frontDepth: 0.188, backDepth: 0.178 },
    { y: 0.175, width: 0.174, frontDepth: 0.166, backDepth: 0.184, xOffset: -0.002 },
    { y: 0.240, width: 0.142, frontDepth: 0.132, backDepth: 0.158 },
    { y: 0.270, width: 0.082, frontDepth: 0.075, backDepth: 0.092 },
  ], 12);
}

function operatorHairGeometry(THREE) {
  return cachedGeometry(THREE, 'operator-hair:crop-r1-2', () => {
    const segments = 12;
    const rings = [
      { y: -0.078, width: 0.188, frontDepth: 0.184, backDepth: 0.190 },
      { y: -0.010, width: 0.194, frontDepth: 0.188, backDepth: 0.198 },
      { y: 0.072, width: 0.176, frontDepth: 0.166, backDepth: 0.186 },
      { y: 0.132, width: 0.118, frontDepth: 0.108, backDepth: 0.142 },
      { y: 0.158, width: 0.052, frontDepth: 0.046, backDepth: 0.066 },
    ];
    const positions = [];
    const indices = [];
    const uvs = [];

    rings.forEach((ring, ringIndex) => {
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const front = Math.max(0, sin);
        const back = Math.max(0, -sin);
        const temple = Math.abs(cos);
        const depth = sin >= 0 ? ring.frontDepth : ring.backDepth;
        let y = ring.y;
        if (ringIndex === 0) {
          // Raise the forehead hairline while keeping temple and rear coverage.
          y += front * 0.060;
          y -= back * 0.012;
          y -= temple * 0.008;
          if (front > 0.45) y += (1 - temple) * 0.010;
        }
        positions.push(cos * ring.width, y, sin * depth);
        uvs.push(segment / segments, ringIndex / Math.max(1, rings.length - 1));
      }
    });

    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      const lower = ringIndex * segments;
      const upper = (ringIndex + 1) * segments;
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        const a = lower + segment;
        const b = lower + next;
        const c = upper + next;
        const d = upper + segment;
        indices.push(a, d, b, b, d, c);
      }
    }

    const topCenter = positions.length / 3;
    positions.push(0, rings[rings.length - 1].y + 0.004, 0);
    uvs.push(0.5, 0.5);
    const topStart = (rings.length - 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(topCenter, topStart + segment, topStart + next);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  });
}

function taperedSegmentGeometry(THREE, key, radiusTop, radiusBottom) {
  return ringProfileGeometry(THREE, `segment:${key}`, [
    { y: -0.50, width: radiusBottom, depth: radiusBottom * 0.84 },
    { y: -0.16, width: radiusBottom * 1.02, depth: radiusBottom * 0.86 },
    { y: 0.38, width: radiusTop, depth: radiusTop * 0.86 },
    { y: 0.50, width: radiusTop * 0.94, depth: radiusTop * 0.84 },
  ], 7);
}

function tag(object, name, role = '', flags = {}) {
  object.name = name;
  object.userData = {
    ...(object.userData || {}),
    cameraIgnore: flags.cameraIgnore ?? true,
    isThirdPersonAvatar: flags.isThirdPersonAvatar ?? true,
    visualPatch: SURVIVOR_OPERATOR_PATCH,
  };
  if (role) object.userData.kaAvatarPaletteRole = role;
  if (object.isMesh) {
    object.castShadow = true;
    object.receiveShadow = false;
    object.frustumCulled = true;
  }
  return object;
}

function addTo(parent, object, position, name, role = '', rotation = null, scale = null, flags = {}) {
  tag(object, name, role, flags);
  if (position) object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  if (scale) object.scale.set(...scale);
  parent.add(object);
  return object;
}

function makeSegment(THREE, materials, radiusTop, radiusBottom, name, role = 'suit-dark') {
  const segment = tag(
    new THREE.Mesh(
      taperedSegmentGeometry(THREE, name, radiusTop, radiusBottom),
      materials.suitDark,
    ),
    name,
    role,
  );
  segment.userData.operatorSegment = true;
  return segment;
}

function makeHand(THREE, materials, name, frontSign) {
  const group = tag(new THREE.Group(), name);
  addTo(
    group,
    new THREE.Mesh(new THREE.DodecahedronGeometry(0.086, 0), materials.glove),
    [0, 0, 0],
    `${name}-palm`,
    'glove',
    [0.04, 0, 0],
    [1.04, 1.20, 0.94],
  );
  addTo(
    group,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.108, 0.045, 0.076, 0.18), materials.armor),
    [0, 0.040, frontSign * 0.065],
    `${name}-knuckle`,
    'armor',
  );
  addTo(
    group,
    new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.075, 7), materials.strap),
    [0, 0.095, 0],
    `${name}-cuff`,
    'utility',
  );
  return group;
}

function makeBoot(THREE, materials, name, frontSign) {
  const group = tag(new THREE.Group(), name);
  addTo(
    group,
    new THREE.Mesh(
      ringProfileGeometry(THREE, `${name}-ankle-r1`, [
        { y: -0.08, width: 0.090, depth: 0.095 },
        { y: 0.00, width: 0.098, depth: 0.102 },
        { y: 0.09, width: 0.082, depth: 0.088 },
      ], 7),
      materials.boot,
    ),
    [0, 0.045, 0],
    `${name}-ankle`,
    'boot',
  );
  addTo(
    group,
    new THREE.Mesh(wedgeGeometry(THREE, 0.205, 0.105, 0.285, 0.032), materials.boot),
    [0, -0.018, frontSign * 0.148],
    `${name}-toe`,
    'boot',
  );
  addTo(
    group,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.195, 0.036, 0.255, 0.08), materials.utility),
    [0, -0.080, frontSign * 0.082],
    `${name}-sole`,
    'utility',
    [Math.PI / 2, 0, 0],
  );
  addTo(
    group,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.115, 0.095, 0.042, 0.16), materials.armorEdge),
    [0, 0.075, frontSign * 0.098],
    `${name}-instep`,
    'armor',
  );
  return group;
}

function addBodyCore(THREE, root, materials, frontSign) {
  const parts = { performanceMicroParts: [] };

  parts.hips = addTo(root, new THREE.Group(), [0, 0.80, 0], 'ka-avatar-hips');
  addTo(
    parts.hips,
    new THREE.Mesh(organicPelvisGeometry(THREE), materials.undersuit),
    [0, 0, 0],
    'ka-avatar-hip-core',
    'suit-dark',
    [0.02, 0, 0],
  );
  [-1, 1].forEach((side) => {
    const hipPlate = addTo(
      parts.hips,
      new THREE.Mesh(chamferPlateGeometry(THREE, 0.125, 0.165, 0.075, 0.18), materials.armorEdge),
      [side * 0.235, 0.015, frontSign * 0.015],
      `ka-avatar-hip-plate-${side}`,
      'armor',
      [0, side * 0.12, side * 0.05],
    );
    parts.performanceMicroParts.push(hipPlate);
  });

  parts.torso = addTo(root, new THREE.Group(), [0, 1.19, 0], 'ka-avatar-torso');
  addTo(
    parts.torso,
    new THREE.Mesh(organicTorsoGeometry(THREE), materials.suit),
    [0, 0, 0],
    'ka-avatar-torso-core',
    'suit',
    [-0.025, 0, 0],
  );
  addTo(
    parts.torso,
    new THREE.Mesh(
      ringProfileGeometry(THREE, 'operator-abdomen-r1', [
        { y: -0.12, width: 0.185, depth: 0.135 },
        { y: 0.00, width: 0.205, depth: 0.145 },
        { y: 0.12, width: 0.225, depth: 0.155 },
      ], 8),
      materials.undersuit,
    ),
    [0, -0.35, 0],
    'ka-avatar-abdomen',
    'suit-dark',
  );

  [-1, 1].forEach((side) => {
    addTo(
      parts.torso,
      new THREE.Mesh(
        ringProfileGeometry(THREE, `operator-trapezius-${side}`, [
          { y: -0.09, width: 0.115, depth: 0.095 },
          { y: 0.09, width: 0.080, depth: 0.080, xOffset: side * 0.012 },
        ], 7),
        materials.suitDark,
      ),
      [side * 0.215, 0.285, 0],
      `ka-avatar-trapezius-${side}`,
      'suit-dark',
      [0.02, 0, side * -0.48],
    );
  });

  parts.vest = addTo(root, new THREE.Group(), [0, 1.19, 0], 'ka-avatar-vest');
  const frontPlate = addTo(
    parts.vest,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.465, 0.355, 0.070, 0.12), materials.armor),
    [0, 0.060, frontSign * 0.218],
    'ka-avatar-front-plate',
    'armor',
    frontSign < 0 ? [0, Math.PI, 0] : null,
  );
  const backPlate = addTo(
    parts.vest,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.445, 0.340, 0.064, 0.12), materials.armor),
    [0, 0.050, -frontSign * 0.208],
    'ka-avatar-back-plate',
    'armor',
    frontSign > 0 ? [0, Math.PI, 0] : null,
  );
  frontPlate.scale.set(1.0, 1.0, 1.0);
  backPlate.scale.set(1.0, 1.0, 1.0);

  [-1, 1].forEach((side) => {
    const sidePlate = addTo(
      parts.vest,
      new THREE.Mesh(chamferPlateGeometry(THREE, 0.090, 0.26, 0.18, 0.15), materials.armorEdge),
      [side * 0.273, 0.005, 0],
      `ka-avatar-side-plate-${side}`,
      'armor',
      [0, side * 0.10, side * 0.02],
    );
    const shoulder = addTo(
      parts.vest,
      new THREE.Mesh(new THREE.DodecahedronGeometry(0.115, 0), materials.armor),
      [side * 0.342, 0.205, -frontSign * 0.010],
      `ka-avatar-shoulder-${side}`,
      'armor',
      [0, side * 0.14, side * 0.11],
      [1.22, 0.60, 0.98],
    );
    const harness = addTo(
      parts.vest,
      new THREE.Mesh(chamferPlateGeometry(THREE, 0.034, 0.340, 0.025, 0.12), materials.strap),
      [side * 0.125, 0.020, frontSign * 0.258],
      `ka-avatar-harness-${side}`,
      'utility',
      [0, 0, side * 0.12],
    );
    parts.performanceMicroParts.push(sidePlate, shoulder, harness);
  });

  const chestBridge = addTo(
    parts.vest,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.320, 0.072, 0.038, 0.12), materials.armorEdge),
    [0, 0.220, frontSign * 0.260],
    'ka-avatar-chest-bridge',
    'armor',
  );
  const accentStrip = addTo(
    parts.vest,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.034, 0.205, 0.024, 0.12), materials.accent),
    [0, 0.045, frontSign * 0.260],
    'ka-avatar-accent-strip',
    'accent',
  );
  addTo(
    parts.vest,
    new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.068, 0.265), materials.strap),
    [0, -0.27, 0],
    'ka-avatar-belt',
    'utility',
  );

  [-0.155, 0, 0.155].forEach((x, index) => {
    const pouch = addTo(
      parts.vest,
      new THREE.Mesh(
        chamferPlateGeometry(THREE, index === 1 ? 0.13 : 0.115, 0.135, 0.075, 0.16),
        materials.utility,
      ),
      [x, -0.225, frontSign * 0.205],
      `ka-avatar-pouch-${index}`,
      'utility',
      [frontSign * -0.04, 0, index === 0 ? -0.04 : index === 2 ? 0.04 : 0],
    );
    parts.performanceMicroParts.push(pouch);
  });

  parts.pack = addTo(parts.vest, new THREE.Group(), [0, 0, 0], 'ka-avatar-pack-rig');
  addTo(
    parts.pack,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.315, 0.315, 0.115, 0.16), materials.utility),
    [0, 0.035, -frontSign * 0.252],
    'ka-avatar-pack-core',
    'utility',
    frontSign > 0 ? [0, Math.PI, 0] : null,
  );
  const packRoll = addTo(
    parts.pack,
    new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.34, 8), materials.armor),
    [0, 0.238, -frontSign * 0.248],
    'ka-avatar-pack-roll',
    'armor',
    [0, 0, Math.PI / 2],
  );
  [-1, 1].forEach((side) => {
    const packSide = addTo(
      parts.pack,
      new THREE.Mesh(chamferPlateGeometry(THREE, 0.09, 0.22, 0.12, 0.18), materials.armorEdge),
      [side * 0.185, 0.015, -frontSign * 0.252],
      `ka-avatar-pack-side-${side}`,
      'armor',
      frontSign > 0 ? [0, Math.PI, 0] : null,
    );
    const packLower = addTo(
      parts.pack,
      new THREE.Mesh(chamferPlateGeometry(THREE, 0.105, 0.105, 0.11, 0.18), materials.utility),
      [side * 0.105, -0.190, -frontSign * 0.248],
      `ka-avatar-pack-lower-${side}`,
      'utility',
      frontSign > 0 ? [0, Math.PI, 0] : null,
    );
    parts.performanceMicroParts.push(packSide, packLower);
  });
  const packAccent = addTo(
    parts.pack,
    new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.026, 0.018), materials.accent),
    [0, -0.045, -frontSign * 0.318],
    'ka-avatar-pack-accent',
    'accent',
  );
  const collar = addTo(
    parts.vest,
    new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.028, 6, 12), materials.armor),
    [0, 0.35, 0],
    'ka-avatar-collar',
    'armor',
    [Math.PI / 2, 0, 0],
  );
  parts.performanceMicroParts.push(packRoll, packAccent, collar, chestBridge);

  parts.neck = addTo(
    root,
    new THREE.Mesh(
      ringProfileGeometry(THREE, 'operator-neck-r1', [
        { y: -0.065, width: 0.082, depth: 0.072 },
        { y: 0.065, width: 0.074, depth: 0.067 },
      ], 8),
      materials.skin,
    ),
    [0, 1.59, 0],
    'ka-avatar-neck',
    'skin',
    [0.02, 0, 0],
  );

  parts.head = addTo(root, new THREE.Group(), [0, 1.77, 0], 'ka-avatar-head', 'skin');
  const headMesh = addTo(
    parts.head,
    new THREE.Mesh(organicHeadGeometry(THREE), materials.skin),
    [0, 0, 0],
    'ka-avatar-head-core',
    'skin',
  );
  const leftCheek = addTo(
    parts.head,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.080, 0.072, 0.018, 0.18), materials.skinDetail),
    [-0.078, -0.052, frontSign * 0.162],
    'ka-avatar-left-cheek',
    'skin',
    [0, sideAngle(frontSign, -0.045), -0.025],
  );
  const rightCheek = addTo(
    parts.head,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.080, 0.072, 0.018, 0.18), materials.skinDetail),
    [0.078, -0.052, frontSign * 0.162],
    'ka-avatar-right-cheek',
    'skin',
    [0, sideAngle(frontSign, 0.045), 0.025],
  );
  const jaw = addTo(
    parts.head,
    new THREE.Mesh(
      ringProfileGeometry(THREE, 'operator-jaw-r1-2', [
        { y: -0.075, width: 0.088, depth: 0.068 },
        { y: 0.012, width: 0.126, depth: 0.082 },
        { y: 0.068, width: 0.144, depth: 0.090 },
      ], 10),
      materials.skin,
    ),
    [0, -0.168, frontSign * 0.024],
    'ka-avatar-jaw',
    'skin',
  );
  void headMesh;
  void leftCheek;
  void rightCheek;
  void jaw;

  [-1, 1].forEach((side) => {
    const ear = addTo(
      parts.head,
      new THREE.Mesh(new THREE.DodecahedronGeometry(0.032, 0), materials.skinDetail),
      [side * 0.185, 0.015, 0],
      `ka-avatar-ear-${side}`,
      'skin',
      [0, 0, side * 0.08],
      [0.72, 1.10, 0.62],
    );
    const earpiece = addTo(
      root,
      new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.048, 8), materials.utility),
      [side * 0.188, 1.785, 0],
      `ka-avatar-earpiece-${side}`,
      'utility',
      [0, 0, Math.PI / 2],
    );
    parts.performanceMicroParts.push(ear, earpiece);
  });

  parts.hair = addTo(
    root,
    new THREE.Mesh(operatorHairGeometry(THREE), materials.hair),
    [0, 1.892, -frontSign * 0.006],
    'ka-avatar-hair',
    'hair',
    [0.006, 0, 0],
    [1.01, 1.00, 1.00],
  );
  parts.brim = addTo(
    root,
    new THREE.Mesh(chamferPlateGeometry(THREE, 0.295, 0.036, 0.145, 0.12), materials.hair),
    [0, 1.817, frontSign * 0.168],
    'ka-avatar-cap-brim',
    'hair',
    [frontSign * -0.08, 0, 0],
  );
  parts.brim.visible = false;

  parts.authoredCore = {
    hips: parts.hips,
    torso: parts.torso,
    vest: parts.vest,
    head: parts.head,
    frontPlate,
    backPlate,
    accentStrip,
  };
  return parts;
}

function sideAngle(frontSign, value) {
  return frontSign < 0 ? -value : value;
}

function addDynamicLimbs(THREE, root, materials, parts, frontSign) {
  parts.leftUpperArm = makeSegment(THREE, materials, 0.080, 0.092, 'ka-avatar-left-upper-arm');
  parts.leftForearm = makeSegment(THREE, materials, 0.068, 0.080, 'ka-avatar-left-forearm');
  parts.rightUpperArm = makeSegment(THREE, materials, 0.080, 0.092, 'ka-avatar-right-upper-arm');
  parts.rightForearm = makeSegment(THREE, materials, 0.068, 0.080, 'ka-avatar-right-forearm');
  parts.leftUpperLeg = makeSegment(THREE, materials, 0.105, 0.122, 'ka-avatar-left-upper-leg');
  parts.leftLowerLeg = makeSegment(THREE, materials, 0.090, 0.103, 'ka-avatar-left-lower-leg');
  parts.rightUpperLeg = makeSegment(THREE, materials, 0.105, 0.122, 'ka-avatar-right-upper-leg');
  parts.rightLowerLeg = makeSegment(THREE, materials, 0.090, 0.103, 'ka-avatar-right-lower-leg');

  [parts.leftForearm, parts.rightForearm].forEach((segment, index) => {
    const guard = addTo(segment, new THREE.Mesh(chamferPlateGeometry(THREE, 0.112, 0.19, 0.072, 0.16), materials.armorEdge), [0, 0.02, frontSign * 0.074], `ka-avatar-forearm-guard-${index}`, 'armor');
    parts.performanceMicroParts.push(guard);
  });
  [parts.leftUpperLeg, parts.rightUpperLeg].forEach((segment, index) => {
    const guard = addTo(segment, new THREE.Mesh(chamferPlateGeometry(THREE, 0.145, 0.17, 0.077, 0.16), materials.armorEdge), [0, 0.00, frontSign * 0.072], `ka-avatar-thigh-guard-${index}`, 'armor');
    parts.performanceMicroParts.push(guard);
  });
  [parts.leftLowerLeg, parts.rightLowerLeg].forEach((segment, index) => {
    const guard = addTo(segment, new THREE.Mesh(chamferPlateGeometry(THREE, 0.120, 0.21, 0.068, 0.16), materials.armorEdge), [0, 0.01, frontSign * 0.066], `ka-avatar-shin-guard-${index}`, 'armor');
    parts.performanceMicroParts.push(guard);
  });

  parts.leftHand = makeHand(THREE, materials, 'ka-avatar-left-hand', frontSign);
  parts.rightHand = makeHand(THREE, materials, 'ka-avatar-right-hand', frontSign);
  parts.leftBoot = makeBoot(THREE, materials, 'ka-avatar-left-boot', frontSign);
  parts.rightBoot = makeBoot(THREE, materials, 'ka-avatar-right-boot', frontSign);
  parts.weaponMount = tag(new THREE.Group(), 'ka-third-person-weapon-mount');
  [
    parts.leftUpperArm, parts.leftForearm, parts.rightUpperArm, parts.rightForearm,
    parts.leftUpperLeg, parts.leftLowerLeg, parts.rightUpperLeg, parts.rightLowerLeg,
    parts.leftHand, parts.rightHand, parts.leftBoot, parts.rightBoot, parts.weaponMount,
  ].forEach((object) => root.add(object));
  return parts;
}

function setSegmentBetween(THREE, mesh, start, end) {
  const midpoint = new THREE.Vector3().copy(start).add(end).multiplyScalar(0.5);
  const vector = new THREE.Vector3().copy(end).sub(start);
  const length = vector.length();
  mesh.position.copy(midpoint);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  mesh.scale.set(1, length, 1);
}

export function poseOperatorNeutral(THREE, rig, frontSign = 1) {
  const p = rig.parts;
  const leftShoulder = new THREE.Vector3(-0.342, 1.415, 0);
  const rightShoulder = new THREE.Vector3(0.342, 1.415, 0);
  const leftElbow = new THREE.Vector3(-0.405, 1.175, frontSign * 0.050);
  const rightElbow = new THREE.Vector3(0.405, 1.175, frontSign * 0.050);
  const leftHand = new THREE.Vector3(-0.372, 0.930, frontSign * 0.110);
  const rightHand = new THREE.Vector3(0.372, 0.930, frontSign * 0.110);
  setSegmentBetween(THREE, p.leftUpperArm, leftShoulder, leftElbow);
  setSegmentBetween(THREE, p.leftForearm, leftElbow, leftHand);
  setSegmentBetween(THREE, p.rightUpperArm, rightShoulder, rightElbow);
  setSegmentBetween(THREE, p.rightForearm, rightElbow, rightHand);
  p.leftHand.position.copy(leftHand);
  p.rightHand.position.copy(rightHand);

  const leftHip = new THREE.Vector3(-0.158, 0.82, 0);
  const rightHip = new THREE.Vector3(0.158, 0.82, 0);
  const leftKnee = new THREE.Vector3(-0.184, 0.45, frontSign * 0.038);
  const rightKnee = new THREE.Vector3(0.184, 0.45, frontSign * 0.038);
  const leftFoot = new THREE.Vector3(-0.212, 0.10, frontSign * 0.018);
  const rightFoot = new THREE.Vector3(0.212, 0.10, frontSign * 0.018);
  setSegmentBetween(THREE, p.leftUpperLeg, leftHip, leftKnee);
  setSegmentBetween(THREE, p.leftLowerLeg, leftKnee, leftFoot);
  setSegmentBetween(THREE, p.rightUpperLeg, rightHip, rightKnee);
  setSegmentBetween(THREE, p.rightLowerLeg, rightKnee, rightFoot);
  p.leftBoot.position.copy(leftFoot).setY(0.055);
  p.rightBoot.position.copy(rightFoot).setY(0.055);
}


export function setOperatorRenderTier(target, tierValue = 'FULL') {
  const rig = target?.parts ? target : target?.userData?.operatorRig;
  const parts = rig?.parts;
  if (!parts) return false;
  const tier = String(tierValue || 'FULL').trim().toUpperCase() === 'STANDARD'
    ? 'STANDARD'
    : 'FULL';
  const full = tier === 'FULL';
  (parts.performanceMicroParts || []).forEach((object) => {
    if (object) object.visible = full;
  });

  const root = rig.root || rig.model;
  const standardDetailPattern = /(?:pouch|pack-side|pack-lower|pack-roll|pack-accent|earpiece|ka-avatar-ear-|forearm-guard|thigh-guard|shin-guard|knuckle|cuff|instep|sole|side-plate|shoulder-|harness|chest-bridge|collar)/;
  root?.traverse?.((object) => {
    if (standardDetailPattern.test(String(object.name || ''))) {
      object.visible = full;
    }
  });

  if (root) root.userData.renderTier = tier;
  return true;
}

export function createOperatorPreviewRig(THREE, { faceFactory = null } = {}) {
  const root = tag(new THREE.Group(), 'ka-avatar-studio-3d-model');
  root.userData.visualPatch = SURVIVOR_OPERATOR_PATCH;
  root.userData.visualFamily = 'authored-tactical-survivor';
  root.userData.renderBudget = 'full-local-standard-remote';
  const materials = makeMaterials(THREE);
  const parts = addBodyCore(THREE, root, materials, 1);
  addDynamicLimbs(THREE, root, materials, parts, 1);
  if (typeof faceFactory === 'function') {
    const face = faceFactory({ front: 1, name: 'ka-avatar-preview-face-details' });
    face.scale.setScalar(0.82);
    parts.head.add(face);
  }
  const rig = { model: root, root, parts, materials, hair: parts.hair, brim: parts.brim };
  root.userData.operatorRig = rig;
  poseOperatorNeutral(THREE, rig, 1);
  setOperatorRenderTier(rig, 'FULL');
  const groupAt = (name, pivot, objects) => {
    const group = tag(new THREE.Group(), name);
    group.position.copy(pivot);
    objects.forEach((object) => {
      object.position.sub(pivot);
      group.add(object);
    });
    root.add(group);
    return group;
  };
  rig.leftArm = groupAt(
    'ka-preview-left-arm-rig',
    new THREE.Vector3(-0.342, 1.415, 0),
    [parts.leftUpperArm, parts.leftForearm, parts.leftHand],
  );
  rig.rightArm = groupAt(
    'ka-preview-right-arm-rig',
    new THREE.Vector3(0.342, 1.415, 0),
    [parts.rightUpperArm, parts.rightForearm, parts.rightHand],
  );
  return rig;
}

export function createOperatorThirdPersonRig(THREE) {
  const root = tag(new THREE.Group(), 'ka-third-person-avatar');
  root.userData.visualPatch = SURVIVOR_OPERATOR_PATCH;
  root.userData.visualFamily = 'authored-tactical-survivor';
  root.userData.renderBudget = 'full-local-standard-remote';
  const materials = makeMaterials(THREE);
  const parts = addBodyCore(THREE, root, materials, -1);
  addDynamicLimbs(THREE, root, materials, parts, -1);
  const rig = { root, model: root, parts, materials, hair: parts.hair, brim: parts.brim };
  root.userData.operatorRig = rig;
  setOperatorRenderTier(rig, 'STANDARD');
  return rig;
}

export function applyOperatorPalette(THREE, rig, palette) {
  if (!rig?.materials || !palette) return false;
  const m = rig.materials;
  m.skin.color.set(palette.skin);
  m.skinDetail.color.set(palette.skin).multiplyScalar(0.84);
  m.suit.color.set(palette.suit);
  m.suitDark.color.set(palette.suit).multiplyScalar(0.40);
  m.undersuit.color.set(palette.suit).multiplyScalar(0.20);
  m.armor.color.set(palette.armor);
  m.armorEdge.color.set(palette.armor).multiplyScalar(1.15);
  m.utility.color.set(palette.armor).multiplyScalar(0.55);
  m.accent.color.set(palette.accent);
  m.accent.emissive.set(palette.accent);
  m.hair.color.set(palette.hair);
  Object.values(m).forEach((material) => { material.needsUpdate = true; });
  return true;
}

export function applyOperatorHeadwear(target, style = 'crop', frontSign = 1) {
  const root = target?.root || target?.model || target;
  const hair = target?.hair || root?.getObjectByName?.('ka-avatar-hair');
  const brim = target?.brim || root?.getObjectByName?.('ka-avatar-cap-brim');
  if (!hair || !brim) return false;
  hair.visible = style !== 'none';
  brim.visible = style === 'cap';
  if (style === 'cap') {
    hair.position.set(0, 1.878, -frontSign * 0.004);
    hair.scale.set(1.07, 0.86, 1.09);
    brim.position.set(0, 1.833, frontSign * 0.174);
    brim.rotation.x = frontSign * -0.065;
  } else {
    hair.position.set(0, 1.892, -frontSign * 0.006);
    hair.scale.set(1.01, 1.00, 1.00);
  }
  return true;
}

export function createRemoteOperatorRig(THREE, { accentColor = 0x10d8ff } = {}) {
  const group = tag(new THREE.Group(), 'remote-survivor-operator', '', { cameraIgnore: false, isThirdPersonAvatar: false });
  group.userData.visualPatch = SURVIVOR_OPERATOR_PATCH;
  group.userData.visualFamily = 'authored-tactical-survivor';
  group.userData.renderBudget = 'standard-remote';
  const materials = makeMaterials(THREE, {
    suit: 0x294b58,
    suitDark: 0x152a34,
    undersuit: 0x0d1d25,
    armor: 0x426372,
    armorEdge: 0x6c93a2,
    utility: 0x3a4c55,
    accent: accentColor,
  });
  // Balance remote ally readability across the full silhouette without white-hot accents.
  materials.accent.emissiveIntensity = 0.34;
  materials.accent.envMapIntensity = 0.22;
  materials.armorEdge.envMapIntensity = 0.46;
  materials.suit.envMapIntensity = 0.30;
  materials.armor.envMapIntensity = 0.36;
  materials.utility.envMapIntensity = 0.28;
  materials.accent.needsUpdate = true;
  materials.armorEdge.needsUpdate = true;
  materials.suit.needsUpdate = true;
  materials.armor.needsUpdate = true;
  materials.utility.needsUpdate = true;
  const parts = addBodyCore(THREE, group, materials, -1);
  addDynamicLimbs(THREE, group, materials, parts, -1);
  const rig = { root: group, model: group, parts, materials, hair: parts.hair, brim: parts.brim };
  group.userData.operatorRig = rig;
  poseOperatorNeutral(THREE, rig, -1);
  setOperatorRenderTier(rig, 'STANDARD');
  parts.hair.visible = false;
  parts.brim.visible = false;

  const helmet = addTo(group, new THREE.Mesh(new THREE.SphereGeometry(0.196, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.60), materials.armor), [0, 1.820, 0], 'remote-survivor-helmet', 'armor', [0.02, 0, 0], [1.05, 0.94, 1.04], { cameraIgnore: false, isThirdPersonAvatar: false });
  helmet.castShadow = true;
  addTo(group, new THREE.Mesh(chamferPlateGeometry(THREE, 0.284, 0.072, 0.034, 0.14), materials.accent), [0, 1.765, -0.186], 'remote-survivor-visor', 'accent', [0, Math.PI, 0], null, { cameraIgnore: false, isThirdPersonAvatar: false });
  addTo(group, new THREE.Mesh(chamferPlateGeometry(THREE, 0.218, 0.112, 0.050, 0.18), materials.strap), [0, 1.675, -0.183], 'remote-survivor-mask', 'utility', [0, Math.PI, 0], null, { cameraIgnore: false, isThirdPersonAvatar: false });

  const body = new THREE.Group();
  body.name = 'remote-survivor-body';
  [parts.hips, parts.torso, parts.vest, parts.pack, parts.neck, parts.head, helmet].forEach((object) => {
    if (object.parent) object.parent.remove(object);
    body.add(object);
  });
  group.add(body);

  const arms = new THREE.Group();
  arms.name = 'remote-survivor-arms';
  const armsPivot = new THREE.Vector3(0, 1.40, 0);
  arms.position.copy(armsPivot);
  [parts.leftUpperArm, parts.leftForearm, parts.rightUpperArm, parts.rightForearm, parts.leftHand, parts.rightHand].forEach((object) => {
    if (object.parent) object.parent.remove(object);
    object.position.sub(armsPivot);
    arms.add(object);
  });
  group.add(arms);

  const legs = new THREE.Group();
  legs.name = 'remote-survivor-legs';
  [parts.leftUpperLeg, parts.leftLowerLeg, parts.rightUpperLeg, parts.rightLowerLeg, parts.leftBoot, parts.rightBoot].forEach((object) => {
    if (object.parent) object.parent.remove(object);
    legs.add(object);
  });
  group.add(legs);

  const weapon = tag(new THREE.Group(), 'remote-survivor-weapon', '', { cameraIgnore: false, isThirdPersonAvatar: false });
  weapon.position.set(0.10, 1.23, -0.58);
  const weaponMaterial = makeMaterial(THREE, 0x27323a, { roughness: 0.43, metalness: 0.58 });
  const receiver = addTo(weapon, new THREE.Mesh(chamferPlateGeometry(THREE, 0.145, 0.145, 0.58, 0.12), weaponMaterial), [0, 0, 0], 'remote-weapon-receiver', '', [Math.PI / 2, 0, 0], null, { cameraIgnore: false, isThirdPersonAvatar: false });
  receiver.userData.weaponReceiver = true;
  const barrel = addTo(weapon, new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, 0.48, 8), weaponMaterial), [0, 0, -0.47], 'remote-weapon-barrel', '', [Math.PI / 2, 0, 0], null, { cameraIgnore: false, isThirdPersonAvatar: false });
  barrel.castShadow = true;
  addTo(weapon, new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.028, 0.42), materials.armor), [0, 0.085, -0.15], 'remote-weapon-rail', 'armor', null, null, { cameraIgnore: false, isThirdPersonAvatar: false });
  addTo(weapon, new THREE.Mesh(chamferPlateGeometry(THREE, 0.075, 0.20, 0.09, 0.16), materials.strap), [0, -0.16, 0.06], 'remote-weapon-grip', 'utility', [-0.16, 0, 0], null, { cameraIgnore: false, isThirdPersonAvatar: false });
  group.add(weapon);

  const muzzleFlash = tag(new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95, toneMapped: false }),
  ), 'remote-weapon-muzzle-flash', '', { cameraIgnore: false, isThirdPersonAvatar: false });
  muzzleFlash.position.set(0, 0, -0.78);
  muzzleFlash.visible = false;
  weapon.add(muzzleFlash);

  return { group, root: group, body, arms, legs, weapon, muzzleFlash, parts, materials };
}
