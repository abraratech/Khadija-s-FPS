// js/content2_enemy_visuals.js
// Low-cost silhouette attachments for CONTENT.2 enemies.

import * as THREE from 'three';
import { isContent2EnemyType } from './content2_core.js';

const MATERIALS = new Map();
const GEOMETRIES = new Map();

function material(key, options) {
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial(options));
  return MATERIALS.get(key);
}

function box(w, h, d) {
  const key = `box:${w}:${h}:${d}`;
  if (!GEOMETRIES.has(key)) GEOMETRIES.set(key, new THREE.BoxGeometry(w, h, d));
  return GEOMETRIES.get(key);
}

function cone(radius, height, segments = 6) {
  const key = `cone:${radius}:${height}:${segments}`;
  if (!GEOMETRIES.has(key)) GEOMETRIES.set(key, new THREE.ConeGeometry(radius, height, segments));
  return GEOMETRIES.get(key);
}

function cylinder(radius, height, segments = 8) {
  const key = `cylinder:${radius}:${height}:${segments}`;
  if (!GEOMETRIES.has(key)) GEOMETRIES.set(key, new THREE.CylinderGeometry(radius, radius, height, segments));
  return GEOMETRIES.get(key);
}

function addMesh(group, geometry, meshMaterial, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.keepMaterial = true;
  group.add(mesh);
  return mesh;
}

function createWarden() {
  const group = new THREE.Group();
  const armor = material('warden-armor', { color: 0x304b59, roughness: 0.74, metalness: 0.28 });
  const glow = material('warden-glow', { color: 0x8ae9ff, emissive: 0x2ac8ff, emissiveIntensity: 1.15, roughness: 0.45 });
  addMesh(group, box(1.35, 1.65, 0.18), armor, [0, 1.15, 0.48]);
  addMesh(group, box(0.18, 0.86, 0.24), glow, [0, 1.22, 0.60]);
  addMesh(group, box(0.34, 0.92, 0.32), armor, [-0.72, 1.20, 0.03], [0, 0, 0.18]);
  addMesh(group, box(0.34, 0.92, 0.32), armor, [0.72, 1.20, 0.03], [0, 0, -0.18]);
  group.name = 'content2_warden_silhouette';
  return group;
}

function createStalker() {
  const group = new THREE.Group();
  const bone = material('stalker-bone', { color: 0x7c344d, roughness: 0.92, metalness: 0.02 });
  const glow = material('stalker-glow', { color: 0xff6f9b, emissive: 0xff245e, emissiveIntensity: 0.9, roughness: 0.5 });
  addMesh(group, cone(0.12, 0.72), bone, [-0.35, 1.55, -0.18], [0.34, 0, -0.28]);
  addMesh(group, cone(0.12, 0.72), bone, [0.35, 1.55, -0.18], [0.34, 0, 0.28]);
  addMesh(group, box(0.10, 0.70, 0.16), glow, [-0.48, 0.82, 0.12], [0, 0, 0.42]);
  addMesh(group, box(0.10, 0.70, 0.16), glow, [0.48, 0.82, 0.12], [0, 0, -0.42]);
  group.name = 'content2_stalker_silhouette';
  return group;
}

function createSapper() {
  const group = new THREE.Group();
  const casing = material('sapper-casing', { color: 0x5d4934, roughness: 0.76, metalness: 0.22 });
  const charge = material('sapper-charge', { color: 0xffa13b, emissive: 0xff5c16, emissiveIntensity: 1.1, roughness: 0.42 });
  addMesh(group, box(0.86, 1.02, 0.34), casing, [0, 1.15, -0.40]);
  addMesh(group, cylinder(0.16, 0.78), charge, [-0.26, 1.18, -0.63]);
  addMesh(group, cylinder(0.16, 0.78), charge, [0.26, 1.18, -0.63]);
  addMesh(group, box(0.48, 0.10, 0.10), charge, [0, 1.62, -0.62]);
  group.name = 'content2_sapper_silhouette';
  return group;
}

const BUILDERS = Object.freeze({
  WARDEN: createWarden,
  STALKER: createStalker,
  SAPPER: createSapper
});

export function applyContent2EnemySilhouette(enemy, type) {
  if (!enemy?.mesh) return null;
  const normalized = String(type || '').toUpperCase();
  if (!enemy._content2Visuals) enemy._content2Visuals = Object.create(null);
  Object.values(enemy._content2Visuals).forEach((visual) => { if (visual) visual.visible = false; });
  if (!isContent2EnemyType(normalized)) return null;
  if (!enemy._content2Visuals[normalized]) {
    const visual = BUILDERS[normalized]();
    visual.userData.eRef = enemy;
    visual.traverse((child) => { child.userData.eRef = enemy; });
    enemy.mesh.add(visual);
    enemy._content2Visuals[normalized] = visual;
  }
  enemy._content2Visuals[normalized].visible = true;
  return enemy._content2Visuals[normalized];
}

export function clearContent2EnemySilhouette(enemy) {
  if (!enemy?._content2Visuals) return;
  Object.values(enemy._content2Visuals).forEach((visual) => { if (visual) visual.visible = false; });
}

export function updateContent2EnemySilhouette(enemy, timeSeconds = 0) {
  const type = String(enemy?.type || '').toUpperCase();
  const visual = enemy?._content2Visuals?.[type];
  if (!visual?.visible) return;
  if (type === 'STALKER') {
    visual.rotation.z = Math.sin(timeSeconds * 5.5 + (enemy.walkT || 0)) * 0.035;
  } else if (type === 'SAPPER') {
    const pulse = 0.94 + Math.sin(timeSeconds * 6.4) * 0.06;
    visual.scale.set(pulse, pulse, pulse);
  } else {
    visual.rotation.z = 0;
    visual.scale.set(1, 1, 1);
  }
}
