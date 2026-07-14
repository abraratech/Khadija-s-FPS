// PERF.1 R1 — cross-platform renderer, frame-loop, and allocation optimization.
// js/particles.js
// VIS.4 — pooled, quality-aware combat and enemy visual effects.
import * as THREE from 'three';
import { scene, getEffectiveGraphicsQuality } from './map.js';

const MAX_DECALS = 110;
const MAX_BLOOD = 56;
const MAX_BLOOD_MIST = 18;
const MAX_SHELLS = 28;
const MAX_SMOKE = 24;
const MAX_SPARKS = 64;
const MAX_IMPACT_DUST = 24;
const MAX_MUZZLE_FLASH = 16;
const MAX_SHOCK_RINGS = 14;
const MAX_ELECTRIC_ARCS = 20;
const MAX_ENEMY_WARNINGS = 14;
const MAX_ENEMY_TRAILS = 34;
const MAX_ENEMY_IMPACTS = 18;

const pools = {
  decals: { items: [], index: 0 },
  blood: { items: [], index: 0 },
  bloodMist: { items: [], index: 0 },
  shells: { items: [], index: 0 },
  smoke: { items: [], index: 0 },
  sparks: { items: [], index: 0 },
  impactDust: { items: [], index: 0 },
  muzzleFlash: { items: [], index: 0 },
  shockRings: { items: [], index: 0 },
  electricArcs: { items: [], index: 0 },
  enemyWarnings: { items: [], index: 0 },
  enemyTrails: { items: [], index: 0 },
  enemyImpacts: { items: [], index: 0 }
};

let initialized = false;
const _zAxis = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _tempDir = new THREE.Vector3();
const _tempRight = new THREE.Vector3();
const _tempMid = new THREE.Vector3();
const _tempNormal = new THREE.Vector3();
const _tempVelocity = new THREE.Vector3();

const textureCache = new Map();

function makeRadialTexture(key, stops) {
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  stops.forEach(([at, color]) => gradient.addColorStop(at, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

function getSoftSmokeTexture() {
  return makeRadialTexture('soft-smoke', [
    [0, 'rgba(255,255,255,0.46)'],
    [0.34, 'rgba(220,225,228,0.24)'],
    [0.72, 'rgba(135,145,150,0.08)'],
    [1, 'rgba(120,130,135,0)']
  ]);
}

function getBloodMistTexture() {
  return makeRadialTexture('blood-mist', [
    [0, 'rgba(185,10,12,0.58)'],
    [0.30, 'rgba(120,0,5,0.38)'],
    [0.72, 'rgba(70,0,2,0.12)'],
    [1, 'rgba(40,0,0,0)']
  ]);
}

function getDustTexture() {
  return makeRadialTexture('impact-dust', [
    [0, 'rgba(230,225,210,0.34)'],
    [0.45, 'rgba(155,150,140,0.18)'],
    [1, 'rgba(95,95,95,0)']
  ]);
}

function getFlashTexture() {
  return makeRadialTexture('muzzle-flash', [
    [0, 'rgba(255,255,245,1)'],
    [0.20, 'rgba(255,235,120,0.95)'],
    [0.52, 'rgba(255,125,25,0.52)'],
    [1, 'rgba(255,70,0,0)']
  ]);
}

function qualityName() {
  try {
    return String(getEffectiveGraphicsQuality?.() || 'medium').toLowerCase();
  } catch {
    return 'medium';
  }
}

function qualityRank() {
  const quality = qualityName();
  if (quality === 'low') return 0;
  if (quality === 'high') return 2;
  return 1;
}

function qualityCount(low, medium, high) {
  const rank = qualityRank();
  return rank === 0 ? low : (rank === 2 ? high : medium);
}

function next(pool, size) {
  const item = pool.items[pool.index];
  pool.index = (pool.index + 1) % size;
  return item;
}

export function initParticles() {
  if (initialized) return;

  const decalGeo = new THREE.RingGeometry(0.028, 0.085, 7);
  const decalMat = new THREE.MeshBasicMaterial({
    color: 0x090707,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    side: THREE.DoubleSide
  });
  for (let i = 0; i < MAX_DECALS; i++) {
    const mesh = new THREE.Mesh(decalGeo, decalMat);
    mesh.visible = false;
    scene.add(mesh);
    pools.decals.items.push(mesh);
  }

  const bloodGeo = new THREE.IcosahedronGeometry(0.052, 0);
  for (let i = 0; i < MAX_BLOOD; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: i % 3 === 0 ? 0x5a0507 : 0x8e090c,
      roughness: 0.72,
      metalness: 0.02,
      transparent: true,
      opacity: 1
    });
    const mesh = new THREE.Mesh(bloodGeo, material);
    mesh.visible = false;
    scene.add(mesh);
    pools.blood.items.push({ mesh, life: 0, baseLife: 0.9, vel: new THREE.Vector3(), rotVel: new THREE.Vector3() });
  }

  const bloodMistMat = new THREE.SpriteMaterial({
    map: getBloodMistTexture(),
    color: 0xaa1014,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  for (let i = 0; i < MAX_BLOOD_MIST; i++) {
    const mesh = new THREE.Sprite(bloodMistMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    pools.bloodMist.items.push({ mesh, life: 0, baseLife: 0.32, vel: new THREE.Vector3(), startScale: 0.35 });
  }

  const shellGeo = new THREE.CylinderGeometry(0.01, 0.015, 0.06, 6);
  shellGeo.rotateX(Math.PI / 2);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xd89425, metalness: 0.82, roughness: 0.28 });
  for (let i = 0; i < MAX_SHELLS; i++) {
    const mesh = new THREE.Mesh(shellGeo, shellMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    pools.shells.items.push({
      mesh,
      life: 0,
      baseLife: 1.35,
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3()
    });
  }

  const smokeMat = new THREE.SpriteMaterial({
    map: getSoftSmokeTexture(),
    color: 0xcfd7da,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true
  });
  for (let i = 0; i < MAX_SMOKE; i++) {
    const mesh = new THREE.Sprite(smokeMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    pools.smoke.items.push({ mesh, life: 0, vel: new THREE.Vector3(), baseLife: 0.45, startScale: 0.18 });
  }

  const sparkGeo = new THREE.BoxGeometry(0.018, 0.018, 0.13);
  for (let i = 0; i < MAX_SPARKS; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 4 === 0 ? 0xffffff : 0xffb23f,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(sparkGeo, material);
    mesh.visible = false;
    scene.add(mesh);
    pools.sparks.items.push({ mesh, life: 0, vel: new THREE.Vector3(), baseLife: 0.22 });
  }

  const dustMat = new THREE.SpriteMaterial({
    map: getDustTexture(),
    color: 0xbab4a8,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  for (let i = 0; i < MAX_IMPACT_DUST; i++) {
    const mesh = new THREE.Sprite(dustMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    pools.impactDust.items.push({ mesh, life: 0, baseLife: 0.28, vel: new THREE.Vector3(), startScale: 0.20 });
  }

  const flashMat = new THREE.SpriteMaterial({
    map: getFlashTexture(),
    color: 0xffb13b,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  for (let i = 0; i < MAX_MUZZLE_FLASH; i++) {
    const sprite = new THREE.Sprite(flashMat.clone());
    const light = new THREE.PointLight(0xff9a35, 0, 5.5, 2.0);
    sprite.visible = false;
    light.visible = false;
    scene.add(sprite, light);
    pools.muzzleFlash.items.push({ sprite, light, life: 0, baseLife: 0.055, startScale: 0.34 });
  }

  const shockGeo = new THREE.TorusGeometry(0.48, 0.055, 5, 22);
  for (let i = 0; i < MAX_SHOCK_RINGS; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xff6a18,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(shockGeo, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    pools.shockRings.items.push({ mesh, life: 0, baseLife: 0.36, startScale: 0.45 });
  }

  for (let i = 0; i < MAX_ELECTRIC_ARCS; i++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(15), 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x7cffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    scene.add(line);
    pools.electricArcs.items.push({ line, life: 0, baseLife: 0.09 });
  }

  const warningGeo = new THREE.TorusGeometry(0.42, 0.045, 5, 16);
  for (let i = 0; i < MAX_ENEMY_WARNINGS; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x44ffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(warningGeo, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    pools.enemyWarnings.items.push({ mesh, life: 0, baseLife: 0.55, startScale: 0.6 });
  }

  const trailGeo = new THREE.SphereGeometry(0.052, 5, 4);
  for (let i = 0; i < MAX_ENEMY_TRAILS; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x8dff4a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(trailGeo, material);
    mesh.visible = false;
    scene.add(mesh);
    pools.enemyTrails.items.push({ mesh, life: 0, baseLife: 0.18 });
  }

  const impactGeo = new THREE.IcosahedronGeometry(0.16, 1);
  for (let i = 0; i < MAX_ENEMY_IMPACTS; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x8dff4a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      wireframe: true
    });
    const mesh = new THREE.Mesh(impactGeo, material);
    mesh.visible = false;
    scene.add(mesh);
    pools.enemyImpacts.items.push({ mesh, life: 0, baseLife: 0.24 });
  }

  initialized = true;
  console.log('🟢 VIS.4 pooled combat FX initialized');
}

export function spawnBulletHole(pos, normal) {
  if (!initialized) initParticles();
  const mesh = next(pools.decals, MAX_DECALS);
  const safeNormal = normal ? _tempNormal.copy(normal).normalize() : _up;
  mesh.position.copy(pos).addScaledVector(safeNormal, 0.012);
  mesh.quaternion.setFromUnitVectors(_zAxis, safeNormal);
  mesh.rotateZ(Math.random() * Math.PI * 2);
  mesh.scale.setScalar(0.82 + Math.random() * 0.42);
  mesh.visible = true;
}

export function spawnBloodBurst(pos, intensity = 1, isHeadshot = false) {
  if (!initialized) initParticles();
  const burstPower = Math.max(0.72, Math.min(2.25, Number(intensity) || 1));
  const baseCount = qualityCount(2, 4, 6);
  const dropletCount = Math.min(MAX_BLOOD, Math.ceil(baseCount * burstPower * (isHeadshot ? 1.18 : 1)));

  for (let i = 0; i < dropletCount; i++) {
    const item = next(pools.blood, MAX_BLOOD);
    item.mesh.position.copy(pos);
    item.mesh.scale.setScalar((0.55 + Math.random() * 0.50) * burstPower * (isHeadshot ? 1.08 : 1));
    item.mesh.material.opacity = 1;
    item.vel.set(
      (Math.random() - 0.5) * 4.0 * burstPower,
      (1.5 + Math.random() * 3.2) * burstPower,
      (Math.random() - 0.5) * 4.0 * burstPower
    );
    item.rotVel.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    item.baseLife = isHeadshot ? 0.92 : 0.74;
    item.life = item.baseLife;
    item.mesh.visible = true;
  }

  if (qualityRank() > 0) {
    const mist = next(pools.bloodMist, MAX_BLOOD_MIST);
    mist.mesh.position.copy(pos);
    mist.startScale = (isHeadshot ? 0.48 : 0.34) * burstPower;
    mist.mesh.scale.setScalar(mist.startScale);
    mist.mesh.material.opacity = isHeadshot ? 0.54 : 0.38;
    mist.vel.set((Math.random() - 0.5) * 0.5, 0.28 + Math.random() * 0.22, (Math.random() - 0.5) * 0.5);
    mist.baseLife = isHeadshot ? 0.38 : 0.28;
    mist.life = mist.baseLife;
    mist.mesh.visible = true;
  }
}

export function spawnShell(pos, camDir, options = {}) {
  if (!initialized) initParticles();
  const item = next(pools.shells, MAX_SHELLS);
  const safeDir = camDir ? _tempNormal.copy(camDir).normalize() : _zAxis;
  const family = String(options.family || 'PISTOL').toUpperCase();
  const sideSpeed = Math.max(0.8, Number(options.sideSpeed) || 2.0);
  const upSpeed = Math.max(0.8, Number(options.upSpeed) || 3.0);
  const scale = Array.isArray(options.scale) ? options.scale : [1, 1, 1];

  item.mesh.position.copy(pos);
  item.mesh.scale.set(
    Math.max(0.35, Number(scale[0]) || 1),
    Math.max(0.35, Number(scale[1]) || 1),
    Math.max(0.35, Number(scale[2]) || 1)
  );
  item.mesh.material.color.setHex(Number(options.color) || 0xd89425);
  item.mesh.material.emissive?.setHex?.(options.upgraded ? 0x120602 : 0x000000);
  item.mesh.material.emissiveIntensity = options.upgraded ? 0.10 : 0;

  _tempRight.crossVectors(safeDir, _up).normalize();
  item.vel
    .copy(_tempRight)
    .multiplyScalar(sideSpeed * (0.82 + Math.random() * 0.36))
    .addScaledVector(_up, upSpeed * (0.82 + Math.random() * 0.34))
    .addScaledVector(safeDir, (Math.random() - 0.5) * 0.55);

  const spinScale = family === 'SHOTGUN' ? 0.72 : (family === 'SNIPER' ? 0.84 : 1.0);
  item.rotVel.set(
    (6 + Math.random() * 8) * spinScale,
    (7 + Math.random() * 9) * spinScale,
    (5 + Math.random() * 10) * spinScale
  );
  item.baseLife = Math.max(0.55, Number(options.life) || 1.35);
  item.life = item.baseLife;
  item.mesh.visible = true;
}

export function spawnGunSmoke(pos, dir, power = 1, options = {}) {
  if (!initialized) initParticles();
  const smokePower = Math.max(0.45, Math.min(1.55, Number(power) || 1));
  const requestedCount = Math.max(1, Math.min(3, Math.round(Number(options.count) || 1)));
  const smokeCount = qualityRank() === 0 ? 1 : requestedCount;
  const spread = Math.max(0, Math.min(0.14, Number(options.spread) || 0.035));

  for (let index = 0; index < smokeCount; index += 1) {
    const item = next(pools.smoke, MAX_SMOKE);
    const lateral = (index - (smokeCount - 1) * 0.5) * spread;
    _tempRight.crossVectors(dir, _up).normalize();

    item.mesh.position
      .copy(pos)
      .addScaledVector(_tempRight, lateral)
      .addScaledVector(_up, index * 0.006);
    item.mesh.material.opacity = qualityRank() === 0 ? 0.09 * smokePower : 0.14 * smokePower;
    item.startScale = 0.10 + smokePower * 0.050 + index * 0.012;
    item.mesh.scale.setScalar(item.startScale);
    item.vel
      .copy(dir)
      .multiplyScalar(0.25 + index * 0.045)
      .addScaledVector(_up, (0.18 + index * 0.035) * smokePower)
      .addScaledVector(_tempRight, lateral * 0.45);
    item.baseLife = 0.24 + smokePower * 0.07 + index * 0.025;
    item.life = item.baseLife;
    item.mesh.visible = true;
  }
}

export function spawnMuzzleFlash(pos, dir, power = 1, options = {}) {
  if (!initialized) initParticles();
  const item = next(pools.muzzleFlash, MAX_MUZZLE_FLASH);
  const flashPower = Math.max(0.55, Math.min(1.8, Number(power) || 1));
  const fallbackColor = options.upgraded ? 0xc85cff : 0xffa12a;
  const color = Number(options.color) || fallbackColor;
  const family = String(options.family || 'PISTOL').toUpperCase();
  const familyScale = family === 'SHOTGUN'
    ? 1.12
    : (family === 'SNIPER' ? 1.08 : (family === 'SMG' ? 0.90 : 1.0));

  item.sprite.position.copy(pos).addScaledVector(dir, 0.025);
  item.sprite.material.color.setHex(color);
  item.sprite.material.opacity = 0.92;
  item.startScale = 0.24 * flashPower * familyScale;
  item.sprite.scale.setScalar(item.startScale);
  item.baseLife = 0.032 + flashPower * 0.016;
  item.life = item.baseLife;
  item.sprite.visible = true;

  item.light.position.copy(pos);
  item.light.color.setHex(color);
  item.light.intensity = qualityRank() === 0 ? 0 : (2.2 + flashPower * 2.4);
  item.light.distance = family === 'SHOTGUN' || family === 'SNIPER' ? 6.0 : 4.6;
  item.light.visible = item.light.intensity > 0;
}

function spawnImpactDust(pos, normal = _up, power = 1) {
  if (qualityRank() === 0 && Math.random() > 0.55) return;
  const item = next(pools.impactDust, MAX_IMPACT_DUST);
  const dustPower = Math.max(0.45, Math.min(1.55, Number(power) || 1));
  item.mesh.position.copy(pos).addScaledVector(normal, 0.018);
  item.startScale = 0.12 + dustPower * 0.07;
  item.mesh.scale.setScalar(item.startScale);
  item.mesh.material.opacity = 0.18 + dustPower * 0.08;
  item.vel.copy(normal).multiplyScalar(0.08 + dustPower * 0.05);
  item.vel.addScaledVector(_up, 0.08 + dustPower * 0.04);
  item.baseLife = 0.18 + dustPower * 0.08;
  item.life = item.baseLife;
  item.mesh.visible = true;
}

export function spawnImpactSpark(pos, normal = null, power = 1) {
  if (!initialized) initParticles();
  const sparkPower = Math.max(0.45, Math.min(1.55, Number(power) || 1));
  const count = qualityCount(1, 3, 5) + (sparkPower > 1.25 ? 1 : 0);
  const pushDir = normal ? _tempNormal.copy(normal).normalize() : _up;

  for (let i = 0; i < Math.min(MAX_SPARKS, count); i++) {
    const item = next(pools.sparks, MAX_SPARKS);
    item.mesh.position.copy(pos).addScaledVector(pushDir, 0.025);
    item.mesh.scale.set(0.55 + Math.random() * 0.5, 0.55 + Math.random() * 0.5, 0.75 + Math.random() * 0.8);
    item.mesh.material.opacity = 0.82;
    item.vel.copy(pushDir).multiplyScalar(0.9 + Math.random() * 1.25);
    item.vel.x += (Math.random() - 0.5) * 2.5 * sparkPower;
    item.vel.y += Math.random() * 1.8 * sparkPower;
    item.vel.z += (Math.random() - 0.5) * 2.5 * sparkPower;
    item.mesh.quaternion.setFromUnitVectors(_zAxis, _tempVelocity.copy(item.vel).normalize());
    item.baseLife = 0.10 + Math.random() * 0.10;
    item.life = item.baseLife;
    item.mesh.visible = true;
  }

  spawnImpactDust(pos, pushDir, sparkPower);
}

export function spawnEnemyExplosionFX(pos, power = 1) {
  if (!initialized) initParticles();
  const explosionPower = Math.max(0.7, Math.min(1.8, Number(power) || 1));
  const ring = next(pools.shockRings, MAX_SHOCK_RINGS);
  ring.mesh.position.copy(pos);
  ring.mesh.position.y += 0.12;
  ring.mesh.material.color.setHex(0xff5a12);
  ring.mesh.material.opacity = 0.92;
  ring.startScale = 0.36 * explosionPower;
  ring.mesh.scale.setScalar(ring.startScale);
  ring.baseLife = 0.30 + explosionPower * 0.08;
  ring.life = ring.baseLife;
  ring.mesh.visible = true;

  const sparks = qualityCount(4, 8, 12);
  for (let i = 0; i < sparks; i++) {
    _tempDir.set(Math.random() - 0.5, 0.25 + Math.random(), Math.random() - 0.5).normalize();
    spawnImpactSpark(pos, _tempDir, 1.1 * explosionPower);
  }

  if (qualityRank() > 0) {
    for (let i = 0; i < qualityCount(0, 2, 3); i++) {
      spawnGunSmoke(pos, _tempDir.set(Math.random() - 0.5, 0.4 + Math.random(), Math.random() - 0.5).normalize(), 1.2 * explosionPower);
    }
  }
}

export function spawnElectricArc(start, end, intensity = 1) {
  if (!initialized) initParticles();
  if (qualityRank() === 0 && Math.random() > 0.45) return;
  const item = next(pools.electricArcs, MAX_ELECTRIC_ARCS);
  const positions = item.line.geometry.attributes.position.array;
  _tempDir.subVectors(end, start);
  _tempMid.copy(start);
  const power = Math.max(0.5, Math.min(1.5, Number(intensity) || 1));

  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const offset = (i === 0 || i === 4) ? 0 : (0.08 + power * 0.05);
    positions[i * 3] = start.x + _tempDir.x * t + (Math.random() - 0.5) * offset;
    positions[i * 3 + 1] = start.y + _tempDir.y * t + (Math.random() - 0.5) * offset;
    positions[i * 3 + 2] = start.z + _tempDir.z * t + (Math.random() - 0.5) * offset;
  }

  item.line.geometry.attributes.position.needsUpdate = true;
  item.line.material.color.setHex(Math.random() > 0.25 ? 0x7cffff : 0xffffff);
  item.line.material.opacity = 0.72 + Math.random() * 0.26;
  item.baseLife = 0.055 + Math.random() * 0.055;
  item.life = item.baseLife;
  item.line.visible = true;
}

export function spawnEnemyAttackWarning(pos, kind = 'RANGED', duration = 0.55) {
  if (!initialized) initParticles();
  const item = next(pools.enemyWarnings, MAX_ENEMY_WARNINGS);
  const colorByKind = {
    INTERRUPTED: 0xffffff,
    RANGED: 0x8dff4a,
    HEAVY_GOLIATH: 0xff5a00,
    HEAVY_BRUTE: 0xffa126,
    EXPLODER: 0xff3300,
    RUNNER_BURST: 0xff3344,
    SPITTER_REPOSITION: 0x7dff4c,
    BRUTE_BRACE: 0xaa55ff,
    GOLIATH_PHASE_2: 0xff9900,
    GOLIATH_PHASE_3: 0xff3300,
    CRAWLER: 0xb8ff65
  };
  const color = colorByKind[kind] ?? 0xb8ff65;
  item.mesh.position.copy(pos);
  item.mesh.position.y += kind === 'RANGED' ? 1.25 : (kind.startsWith('GOLIATH_PHASE') ? 0.40 : 0.16);
  item.mesh.material.color.setHex(color);
  item.mesh.material.opacity = 0.88;
  item.startScale = kind === 'RANGED' ? 0.48 : (kind === 'EXPLODER' ? 0.60 : 0.72);
  item.mesh.scale.setScalar(item.startScale);
  item.baseLife = Math.max(0.20, Number(duration) || 0.55);
  item.life = item.baseLife;
  item.mesh.visible = true;
}

export function spawnEnemyArchetypePulse(pos, kind = 'RUNNER_BURST') {
  const durations = {
    RUNNER_BURST: 0.42,
    SPITTER_REPOSITION: 0.38,
    BRUTE_BRACE: 0.48,
    GOLIATH_PHASE_2: 0.72,
    GOLIATH_PHASE_3: 0.86
  };
  spawnEnemyAttackWarning(pos, kind, durations[kind] || 0.45);
}

export function spawnEnemyProjectileTrail(pos) {
  if (!initialized) initParticles();
  const item = next(pools.enemyTrails, MAX_ENEMY_TRAILS);
  item.mesh.position.copy(pos);
  item.mesh.scale.setScalar(0.68 + Math.random() * 0.48);
  item.mesh.material.opacity = qualityRank() === 0 ? 0.42 : 0.68;
  item.baseLife = 0.14 + Math.random() * 0.07;
  item.life = item.baseLife;
  item.mesh.visible = true;
}

export function spawnEnemyProjectileImpact(pos, hitPlayer = false) {
  if (!initialized) initParticles();
  const item = next(pools.enemyImpacts, MAX_ENEMY_IMPACTS);
  item.mesh.position.copy(pos);
  item.mesh.material.color.setHex(hitPlayer ? 0xff4c4c : 0x8dff4a);
  item.mesh.material.opacity = 0.92;
  item.mesh.scale.setScalar(hitPlayer ? 0.78 : 0.58);
  item.baseLife = hitPlayer ? 0.28 : 0.24;
  item.life = item.baseLife;
  item.mesh.visible = true;
  spawnImpactSpark(pos, null, hitPlayer ? 1.12 : 0.78);
}

export function spawnEnemyAttackInterrupted(pos) {
  spawnEnemyAttackWarning(pos, 'INTERRUPTED', 0.28);
}

export function updateParticles(dt) {
  if (!initialized) return;

  pools.blood.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    item.vel.y -= 9.8 * dt;
    item.mesh.position.addScaledVector(item.vel, dt);
    item.mesh.rotation.x += item.rotVel.x * dt;
    item.mesh.rotation.y += item.rotVel.y * dt;
    item.mesh.rotation.z += item.rotVel.z * dt;
    item.mesh.scale.multiplyScalar(Math.max(0.86, 1 - dt * 2.4));
    item.mesh.material.opacity = Math.min(1, item.life / Math.max(0.001, item.baseLife) * 1.8);
    if (item.life <= 0 || item.mesh.position.y < 0.08) item.mesh.visible = false;
  });

  pools.bloodMist.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    item.mesh.position.addScaledVector(item.vel, dt);
    item.mesh.scale.addScalar(dt * 0.62);
    item.mesh.material.opacity = Math.max(0, item.life / Math.max(0.001, item.baseLife) * 0.48);
    if (item.life <= 0) item.mesh.visible = false;
  });

  pools.shells.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    item.vel.y -= 15 * dt;
    item.mesh.position.addScaledVector(item.vel, dt);
    item.mesh.rotation.x += item.rotVel.x * dt;
    item.mesh.rotation.y += item.rotVel.y * dt;
    item.mesh.rotation.z += item.rotVel.z * dt;
    if (item.mesh.position.y <= 0.1) {
      item.mesh.position.y = 0.1;
      item.vel.y *= -0.26;
      item.vel.x *= 0.48;
      item.vel.z *= 0.48;
      item.rotVel.multiplyScalar(0.72);
    }
    if (item.life <= 0) item.mesh.visible = false;
  });

  pools.smoke.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    item.mesh.position.addScaledVector(item.vel, dt);
    item.mesh.scale.addScalar(dt * 0.42);
    item.mesh.material.opacity = Math.max(0, item.life / Math.max(0.001, item.baseLife) * 0.18);
    if (item.life <= 0) item.mesh.visible = false;
  });

  pools.sparks.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    item.vel.y -= 8.0 * dt;
    item.mesh.position.addScaledVector(item.vel, dt);
    item.mesh.material.opacity = Math.max(0, item.life / Math.max(0.001, item.baseLife));
    if (item.life <= 0) item.mesh.visible = false;
  });

  pools.impactDust.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    item.mesh.position.addScaledVector(item.vel, dt);
    item.mesh.scale.addScalar(dt * 0.45);
    item.mesh.material.opacity = Math.max(0, item.life / Math.max(0.001, item.baseLife) * 0.30);
    if (item.life <= 0) item.mesh.visible = false;
  });

  pools.muzzleFlash.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    const ratio = Math.max(0, item.life / Math.max(0.001, item.baseLife));
    item.sprite.scale.setScalar(item.startScale * (1 + (1 - ratio) * 0.70));
    item.sprite.material.opacity = ratio * 0.95;
    item.light.intensity *= Math.max(0, 1 - dt * 28);
    if (item.life <= 0) {
      item.sprite.visible = false;
      item.light.visible = false;
      item.light.intensity = 0;
    }
  });

  pools.shockRings.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    const progress = 1 - item.life / Math.max(0.001, item.baseLife);
    item.mesh.scale.setScalar(item.startScale + progress * 4.8);
    item.mesh.material.opacity = Math.max(0, (1 - progress) * 0.88);
    if (item.life <= 0) item.mesh.visible = false;
  });

  pools.electricArcs.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    item.line.material.opacity = Math.max(0, item.life / Math.max(0.001, item.baseLife));
    if (item.life <= 0) item.line.visible = false;
  });

  pools.enemyWarnings.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    const progress = 1 - item.life / Math.max(0.001, item.baseLife);
    item.mesh.scale.setScalar(item.startScale + progress * 0.85);
    item.mesh.rotation.z += dt * 3.2;
    item.mesh.material.opacity = Math.max(0, (1 - progress) * 0.82);
    if (item.life <= 0) item.mesh.visible = false;
  });

  pools.enemyTrails.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    const ratio = item.life / Math.max(0.001, item.baseLife);
    item.mesh.scale.multiplyScalar(0.94);
    item.mesh.material.opacity = Math.max(0, ratio * 0.68);
    if (item.life <= 0) item.mesh.visible = false;
  });

  pools.enemyImpacts.items.forEach((item) => {
    if (item.life <= 0) return;
    item.life -= dt;
    const progress = 1 - item.life / Math.max(0.001, item.baseLife);
    item.mesh.scale.addScalar(dt * 3.8);
    item.mesh.rotation.x += dt * 4.0;
    item.mesh.rotation.y += dt * 5.2;
    item.mesh.material.opacity = Math.max(0, (1 - progress) * 0.88);
    if (item.life <= 0) item.mesh.visible = false;
  });
}

export function clearAllDecals() {
  if (!initialized) return;
  pools.decals.items.forEach((item) => { item.visible = false; });
  pools.blood.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.bloodMist.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.shells.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.smoke.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.sparks.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.impactDust.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.muzzleFlash.items.forEach((item) => { item.sprite.visible = false; item.light.visible = false; item.life = 0; });
  pools.shockRings.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.electricArcs.items.forEach((item) => { item.line.visible = false; item.life = 0; });
  pools.enemyWarnings.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.enemyTrails.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
  pools.enemyImpacts.items.forEach((item) => { item.mesh.visible = false; item.life = 0; });
}
