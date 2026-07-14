// js/weapons/procedural_helpers.js
import * as THREE from 'three';

export const WEAPON_VISUAL_PATCH = 'vis8-r1-1-weapon-silhouette-hand-integration';

const AUTHORED_BOX_GEOMETRY_CACHE = new Map();

function authoredBoxGeometry(size, name = '') {
  const sx = Math.max(0.0001, Number(size?.x) || 0.0001);
  const sy = Math.max(0.0001, Number(size?.y) || 0.0001);
  const sz = Math.max(0.0001, Number(size?.z) || 0.0001);
  const micro = Math.min(sx, sy, sz) <= 0.011 || Math.max(sx, sy, sz) < 0.055;
  const keepSquare = /(?:accent|light|dot|notch|rail_|rib_|serration|tooth|trigger|pin|port|shell|brass|muzzleFlash)/i.test(String(name));
  if (micro || keepSquare) return new THREE.BoxGeometry(sx, sy, sz);

  const ratio = /(?:grip|stock|magazine|mag_base|handguard|pump|cheek)/i.test(String(name)) ? 0.22 : 0.14;
  const cut = Math.min(sx, sy) * ratio * 0.5;
  const key = `${sx.toFixed(5)}:${sy.toFixed(5)}:${sz.toFixed(5)}:${cut.toFixed(5)}`;
  const cached = AUTHORED_BOX_GEOMETRY_CACHE.get(key);
  if (cached) return cached;

  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const outline = [
    [-hx + cut, -hy], [hx - cut, -hy], [hx, -hy + cut], [hx, hy - cut],
    [hx - cut, hy], [-hx + cut, hy], [-hx, hy - cut], [-hx, -hy + cut]
  ];
  const positions = [];
  outline.forEach(([x, y]) => positions.push(x, y, hz));
  outline.forEach(([x, y]) => positions.push(x, y, -hz));
  const frontCenter = positions.length / 3;
  positions.push(0, 0, hz);
  const backCenter = positions.length / 3;
  positions.push(0, 0, -hz);
  const indices = [];
  for (let i = 0; i < 8; i += 1) {
    const next = (i + 1) % 8;
    indices.push(frontCenter, i, next);
    indices.push(backCenter, 8 + next, 8 + i);
    indices.push(i, 8 + i, next, next, 8 + i, 8 + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  AUTHORED_BOX_GEOMETRY_CACHE.set(key, geometry);
  return geometry;
}


export function makeStandardMaterial({
  color,
  metalness = 0.2,
  roughness = 0.55,
  emissive = 0x000000,
  emissiveIntensity = 0
} = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity,
    flatShading: true,
    envMapIntensity: 0.30
  });
  material.needsUpdate = true;
  return material;
}

export function makeBoxPart(group, name, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(authoredBoxGeometry(size, name), material);
  mesh.name = name;
  mesh.position.copy(position);

  if (rotation) {
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  }

  mesh.userData.basePosition = mesh.position.clone();
  mesh.userData.visualPatch = WEAPON_VISUAL_PATCH;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);

  return mesh;
}

export function makeCylinderPart(group, name, radius, length, position, rotation, material, segments = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  mesh.userData.basePosition = mesh.position.clone();
  mesh.userData.visualPatch = WEAPON_VISUAL_PATCH;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);

  return mesh;
}

export function getPartBasePosition(part) {
  return part?.userData?.basePosition || part?.position || null;
}


function markProceduralHandObject(object, defaultVisible) {
  object.userData.isProceduralHand = true;
  object.userData.defaultVisible = defaultVisible;
  object.castShadow = false;
  object.receiveShadow = false;
  return object;
}

function addRigMesh(rig, name, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  markProceduralHandObject(mesh, true);
  rig.add(mesh);
  return mesh;
}

export function addTacticalHandRig(group, {
  name,
  position,
  rotation = new THREE.Vector3(),
  defaultVisible = true,
  upgraded = false,
  support = false,
  accentColor = 0x32d6ff
}) {
  const rig = new THREE.Group();
  rig.name = name;
  rig.position.copy(position);
  rig.rotation.set(rotation.x, rotation.y, rotation.z);
  markProceduralHandObject(rig, defaultVisible);
  rig.visible = defaultVisible;

  const gloveMat = makeStandardMaterial({
    color: upgraded ? 0x171114 : 0x101519,
    metalness: 0.04,
    roughness: 0.86
  });
  const armorMat = makeStandardMaterial({
    color: upgraded ? 0x4a262d : 0x293239,
    metalness: 0.24,
    roughness: 0.54
  });
  const sleeveMat = makeStandardMaterial({
    color: upgraded ? 0x3a2028 : 0x27323a,
    metalness: 0.02,
    roughness: 0.92
  });
  const accentMat = makeStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: upgraded ? 0.62 : 0.24,
    roughness: 0.40
  });

  const palmWidth = support ? 0.066 : 0.064;
  const palmDepth = support ? 0.092 : 0.084;
  addRigMesh(
    rig,
    `${name}_palm`,
    authoredBoxGeometry(new THREE.Vector3(palmWidth, 0.052, palmDepth), `${name}_palm`),
    gloveMat,
    new THREE.Vector3(0, 0, 0)
  );
  addRigMesh(
    rig,
    `${name}_knuckle_guard`,
    authoredBoxGeometry(new THREE.Vector3(palmWidth + 0.006, 0.020, palmDepth * 0.48), `${name}_knuckle_guard`),
    armorMat,
    new THREE.Vector3(0, 0.030, -0.012),
    new THREE.Vector3(-0.08, 0, 0)
  );

  for (let i = 0; i < 3; i++) {
    addRigMesh(
      rig,
      `${name}_knuckle_${i + 1}`,
      new THREE.BoxGeometry(0.014, 0.010, 0.020),
      upgraded && i === 1 ? accentMat : armorMat,
      new THREE.Vector3((i - 1) * 0.020, 0.042, -0.026)
    );
  }

  addRigMesh(
    rig,
    `${name}_cuff`,
    authoredBoxGeometry(new THREE.Vector3(palmWidth + 0.014, 0.060, 0.046), `${name}_cuff`),
    armorMat,
    new THREE.Vector3(0, -0.006, 0.056)
  );
  addRigMesh(
    rig,
    `${name}_cuff_light`,
    new THREE.BoxGeometry(0.032, 0.008, 0.050),
    accentMat,
    new THREE.Vector3(0, 0.022, 0.057)
  );
  addRigMesh(
    rig,
    `${name}_sleeve`,
    authoredBoxGeometry(new THREE.Vector3(palmWidth + 0.020, 0.068, 0.092), `${name}_sleeve`),
    sleeveMat,
    new THREE.Vector3(0, -0.010, 0.108),
    new THREE.Vector3(0.05, 0, 0)
  );

  for (let i = 0; i < 3; i += 1) {
    addRigMesh(
      rig,
      `${name}_finger_wrap_${i + 1}`,
      authoredBoxGeometry(new THREE.Vector3(0.012, 0.013, support ? 0.058 : 0.052), `${name}_finger_wrap_${i + 1}`),
      gloveMat,
      new THREE.Vector3((i - 1) * 0.020, 0.010, -0.052),
      new THREE.Vector3(-0.48, 0, 0)
    );
  }

  group.add(rig);
  return rig;
}

function addDetailBox(root, name, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(authoredBoxGeometry(size, name), material);
  mesh.name = name;
  mesh.position.copy(position);
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  mesh.userData.isWeaponPresentationDetail = true;
  mesh.userData.visualPatch = WEAPON_VISUAL_PATCH;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return mesh;
}

function addDetailCylinder(root, name, radius, length, position, rotation, material, segments = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  mesh.userData.isWeaponPresentationDetail = true;
  mesh.userData.visualPatch = WEAPON_VISUAL_PATCH;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return mesh;
}

export function addWeaponPresentationDetails(group, family, {
  upgraded = false,
  accentColor = 0x32d6ff
} = {}) {
  const root = new THREE.Group();
  root.name = `${String(family).toLowerCase()}_vis3_presentation`;
  root.userData.isWeaponPresentationDetail = true;
  root.userData.visualPatch = WEAPON_VISUAL_PATCH;
  root.userData.liveBrowserProfile = 'authored-low-draw';
  group.userData.visualPatch = WEAPON_VISUAL_PATCH;
  group.userData.liveBrowserProfile = 'authored-low-draw';
  group.add(root);

  const armorMat = makeStandardMaterial({
    color: upgraded ? 0x5a3038 : 0x343e45,
    metalness: 0.44,
    roughness: 0.42
  });
  const darkMat = makeStandardMaterial({
    color: 0x080b0d,
    metalness: 0.34,
    roughness: 0.56
  });
  const accentMat = makeStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: upgraded ? 0.42 : 0.08,
    roughness: 0.28
  });
  const brassMat = makeStandardMaterial({
    color: 0xb77a2e,
    metalness: 0.62,
    roughness: 0.34
  });

  if (family === 'PISTOL') {
    addDetailBox(root, 'pistol_vis3_underbarrel', new THREE.Vector3(0.072, 0.020, 0.112), new THREE.Vector3(0, -0.050, -0.150), darkMat);
    for (let i = 0; i < 4; i++) {
      addDetailBox(root, `pistol_vis3_rail_${i}`, new THREE.Vector3(0.068, 0.010, 0.010), new THREE.Vector3(0, -0.062, -0.112 - i * 0.025), armorMat);
    }
    addDetailBox(root, 'pistol_vis3_side_plate_left', new THREE.Vector3(0.006, 0.030, 0.130), new THREE.Vector3(-0.051, 0.020, -0.112), armorMat);
    addDetailBox(root, 'pistol_vis3_side_plate_right', new THREE.Vector3(0.006, 0.030, 0.130), new THREE.Vector3(0.051, 0.020, -0.112), armorMat);
    addDetailBox(root, 'pistol_vis3_status_light', new THREE.Vector3(0.008, 0.010, 0.045), new THREE.Vector3(0.055, 0.010, -0.078), accentMat);
    addDetailCylinder(root, 'pistol_vis3_lanyard', 0.014, 0.010, new THREE.Vector3(0, -0.224, 0.056), new THREE.Vector3(0, 0, Math.PI / 2), darkMat, 8);
  } else if (family === 'SMG') {
    for (let i = 0; i < 4; i++) {
      addDetailBox(root, `smg_vis3_top_tooth_${i}`, new THREE.Vector3(0.088, 0.010, 0.012), new THREE.Vector3(0, 0.090, 0.018 - i * 0.052), darkMat);
    }
    addDetailBox(root, 'smg_vis3_foregrip', new THREE.Vector3(0.052, 0.095, 0.046), new THREE.Vector3(0, -0.060, -0.218), armorMat, new THREE.Vector3(-0.10, 0, 0));
    addDetailBox(root, 'smg_vis3_foregrip_light', new THREE.Vector3(0.008, 0.062, 0.036), new THREE.Vector3(0.034, -0.062, -0.240), accentMat, new THREE.Vector3(-0.10, 0, 0));
    for (const side of [-1, 1]) {
      addDetailBox(root, `smg_vis3_vent_${side}`, new THREE.Vector3(0.006, 0.032, 0.110), new THREE.Vector3(side * 0.068, 0.025, -0.205), armorMat);
    }
    addDetailBox(root, 'smg_vis3_stock_bar', new THREE.Vector3(0.020, 0.028, 0.130), new THREE.Vector3(0, 0.016, 0.185), darkMat);
    addDetailBox(root, 'smg_vis3_stock_pad', new THREE.Vector3(0.076, 0.074, 0.024), new THREE.Vector3(0, 0.000, 0.275), armorMat);
  } else if (family === 'RIFLE') {
    for (let i = 0; i < 5; i++) {
      addDetailBox(root, `rifle_vis3_rail_${i}`, new THREE.Vector3(0.096, 0.010, 0.014), new THREE.Vector3(0, 0.100, 0.025 - i * 0.070), darkMat);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        addDetailBox(root, `rifle_vis3_handguard_vent_${side}_${i}`, new THREE.Vector3(0.006, 0.018, 0.050), new THREE.Vector3(side * 0.064, 0.018, -0.290 - i * 0.070), darkMat);
      }
    }
    addDetailBox(root, 'rifle_vis3_cheek_pad', new THREE.Vector3(0.104, 0.032, 0.150), new THREE.Vector3(0, 0.048, 0.330), armorMat, new THREE.Vector3(0.10, 0, 0));
    addDetailBox(root, 'rifle_vis3_receiver_badge', new THREE.Vector3(0.008, 0.030, 0.080), new THREE.Vector3(0.070, 0.024, -0.050), accentMat);
    for (let i = 0; i < 3; i++) {
      addDetailBox(root, `rifle_vis3_mag_rib_${i}`, new THREE.Vector3(0.074, 0.010, 0.012), new THREE.Vector3(0, -0.115 - i * 0.075, -0.104 - i * 0.032), armorMat, new THREE.Vector3(-0.28 - i * 0.05, 0, 0));
    }
  } else if (family === 'SHOTGUN') {
    for (let i = 0; i < 4; i++) {
      addDetailBox(root, `shotgun_vis3_heat_rib_${i}`, new THREE.Vector3(0.108, 0.012, 0.016), new THREE.Vector3(0, 0.082, -0.290 - i * 0.085), darkMat);
    }
    addDetailBox(root, 'shotgun_vis3_receiver_plate', new THREE.Vector3(0.008, 0.056, 0.190), new THREE.Vector3(0.080, 0.020, -0.100), armorMat);
    for (let i = 0; i < 4; i++) {
      addDetailCylinder(root, `shotgun_vis3_shell_${i}`, 0.015, 0.070, new THREE.Vector3(0.095, 0.042 - i * 0.026, -0.050), new THREE.Vector3(Math.PI / 2, 0, 0), i === 0 && upgraded ? accentMat : brassMat, 10);
    }
    addDetailBox(root, 'shotgun_vis3_pump_guard_left', new THREE.Vector3(0.008, 0.060, 0.185), new THREE.Vector3(-0.074, -0.035, -0.390), armorMat);
    addDetailBox(root, 'shotgun_vis3_pump_guard_right', new THREE.Vector3(0.008, 0.060, 0.185), new THREE.Vector3(0.074, -0.035, -0.390), armorMat);
    addDetailBox(root, 'shotgun_vis3_status_light', new THREE.Vector3(0.010, 0.012, 0.070), new THREE.Vector3(-0.084, 0.044, -0.095), accentMat);
  } else if (family === 'SNIPER') {
    addDetailCylinder(root, 'sniper_vis3_scope_front_lens', 0.033, 0.008, new THREE.Vector3(0, 0.134, -0.220), new THREE.Vector3(Math.PI / 2, 0, 0), accentMat, 16);
    addDetailCylinder(root, 'sniper_vis3_scope_rear_lens', 0.029, 0.008, new THREE.Vector3(0, 0.134, 0.130), new THREE.Vector3(Math.PI / 2, 0, 0), darkMat, 16);
    addDetailCylinder(root, 'sniper_vis3_scope_turret_top', 0.018, 0.045, new THREE.Vector3(0, 0.205, -0.035), new THREE.Vector3(0, 0, 0), armorMat, 10);
    addDetailCylinder(root, 'sniper_vis3_scope_turret_side', 0.016, 0.045, new THREE.Vector3(0.050, 0.150, -0.035), new THREE.Vector3(0, 0, Math.PI / 2), armorMat, 10);
    for (let i = 0; i < 5; i++) {
      addDetailBox(root, `sniper_vis3_barrel_flute_${i}`, new THREE.Vector3(0.006, 0.006, 0.120), new THREE.Vector3((i - 2) * 0.012, 0.056, -0.610), darkMat);
    }
    addDetailBox(root, 'sniper_vis3_cheek_armor', new THREE.Vector3(0.108, 0.034, 0.190), new THREE.Vector3(0, 0.058, 0.325), armorMat);
    addDetailBox(root, 'sniper_vis3_cheek_light', new THREE.Vector3(0.010, 0.012, 0.105), new THREE.Vector3(0.059, 0.068, 0.325), accentMat);
    for (let i = 0; i < 3; i++) {
      addDetailBox(root, `sniper_vis3_mag_rib_${i}`, new THREE.Vector3(0.076, 0.010, 0.014), new THREE.Vector3(0, -0.120 - i * 0.055, -0.055), armorMat);
    }
  }

  return root;
}
