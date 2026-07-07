// js/weapons/procedural_helpers.js
import * as THREE from 'three';

export function makeStandardMaterial({
  color,
  metalness = 0.2,
  roughness = 0.55,
  emissive = 0x000000,
  emissiveIntensity = 0
} = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity
  });
}

export function makeBoxPart(group, name, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  mesh.position.copy(position);

  if (rotation) {
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  }

  mesh.userData.basePosition = mesh.position.clone();
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
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);

  return mesh;
}

export function getPartBasePosition(part) {
  return part?.userData?.basePosition || part?.position || null;
}
