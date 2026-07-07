// js/weapons.js
import * as THREE from 'three';
import { camera, muzzleLight, mapMeshes, scene, addScreenShake, doors, openDoor, barricades, traps, walls, spawnPoints, currentMapId, updateBarricadeRepairGhost } from './map.js';
import { player } from './player.js';
import { activeEnemies, killEnemy, getEnemyPointReward, currentWave } from './enemy.js';
import { updateAmmoHUD, showHitMarker, updateWeaponNameHUD, setInteractionPrompt, updateScoreHUD, spawnFloatingScore, updateHealthHUD, showStatusToast, updateCombatStatusHUD, showShopFeedback, updateShopFeedbackProgress, hideShopFeedback } from './ui.js';
import { spawnBulletHole, spawnBloodBurst, spawnShell, spawnGunSmoke, spawnImpactSpark } from './particles.js'; 
import { playWeaponSound, playWeaponReloadSound, playWorldSound, playUISound } from './audio.js';
import { getGameplayPointsForMap } from './maps/gameplay_points.js';
import { createProceduralPistolMesh, updateProceduralPistolReloadParts, resetProceduralPistolParts } from './weapons/pistol.js';
import { createProceduralSMGMesh, updateProceduralSMGReloadParts, resetProceduralSMGParts, updateProceduralSMGFireParts } from './weapons/smg.js';
import { createProceduralRifleMesh, updateProceduralRifleReloadParts, resetProceduralRifleParts, updateProceduralRifleFireParts } from './weapons/rifle.js';
import { createProceduralShotgunMesh, updateProceduralShotgunReloadParts, resetProceduralShotgunParts, updateProceduralShotgunFireParts } from './weapons/shotgun.js';
import { createProceduralSniperMesh, updateProceduralSniperReloadParts, resetProceduralSniperParts, updateProceduralSniperFireParts } from './weapons/sniper.js';
import {
  recordDirectorShot,
  recordDirectorHit,
  recordDirectorKill
} from './ai_director.js';

const ray = new THREE.Raycaster();
const _shotTargets = [];
const _rayHits = [];
const _centerShotOffset = new THREE.Vector2(0, 0);
const _pelletShotOffset = new THREE.Vector2();
const _surfaceNormal = new THREE.Vector3();
const _surfaceNormalMatrix = new THREE.Matrix3();
export let muzzleT = 0;
let fireCooldown = 0;
let flashVisibleT = 0;
const activeShops = [];

const SNIPER_SCOPE_ZOOM_KEY = 'ka_sniper_scope_fov';
const SNIPER_SCOPE_FOV_DEFAULT = 24;
const SNIPER_SCOPE_FOV_MIN = 18;
const SNIPER_SCOPE_FOV_MAX = 32;
let sniperScopeOverlay = null;

function readStoredSniperScopeFOV() {
  try {
    const stored = Number(localStorage.getItem(SNIPER_SCOPE_ZOOM_KEY));
    if (Number.isFinite(stored)) {
      return THREE.MathUtils.clamp(stored, SNIPER_SCOPE_FOV_MIN, SNIPER_SCOPE_FOV_MAX);
    }
  } catch {
    // Ignore storage failures.
  }

  return SNIPER_SCOPE_FOV_DEFAULT;
}

let sniperScopeFOV = readStoredSniperScopeFOV();

function saveSniperScopeFOV() {
  try {
    localStorage.setItem(SNIPER_SCOPE_ZOOM_KEY, String(Math.round(sniperScopeFOV)));
  } catch {
    // Ignore storage failures.
  }
}

function getSniperScopeOverlay() {
  if (sniperScopeOverlay && document.body?.contains(sniperScopeOverlay)) return sniperScopeOverlay;

  const root = document.createElement('div');
  root.id = 'sniper-scope-overlay';
  root.className = 'sniper-scope-overlay';
  root.innerHTML = `
    <div class="sniper-scope-vignette"></div>
    <div class="sniper-scope-ring"></div>
    <div class="sniper-scope-line sniper-scope-line-v-top"></div>
    <div class="sniper-scope-line sniper-scope-line-v-bottom"></div>
    <div class="sniper-scope-line sniper-scope-line-h-left"></div>
    <div class="sniper-scope-line sniper-scope-line-h-right"></div>
    <div class="sniper-scope-dot"></div>
    <div class="sniper-scope-range-ticks"></div>
    <div class="sniper-scope-zoom-label"></div>
  `;

  sniperScopeOverlay = root;
  document.body.appendChild(root);
  return root;
}

function getSniperZoomLabelText() {
  const zoomApprox = Math.max(1, 82 / Math.max(1, sniperScopeFOV));
  return `${zoomApprox.toFixed(1)}x · wheel zoom`;
}

function setSniperScopeOverlayVisible(visible) {
  const overlay = getSniperScopeOverlay();
  overlay.classList.toggle('active', visible);

  const label = overlay.querySelector('.sniper-scope-zoom-label');
  if (label) label.textContent = getSniperZoomLabelText();
}

export function adjustSniperScopeZoom(delta = 0) {
  const activeWeapon = getActiveWeapon();
  const isSniperADS = Boolean(
    player.isADS &&
    activeWeapon?.meshGroup?.userData?.isProceduralWeapon &&
    activeWeapon.meshGroup.userData.weaponFamily === 'SNIPER'
  );

  if (!isSniperADS || !Number.isFinite(delta) || delta === 0) return false;

  // Wheel up zooms in. Smaller FOV = stronger zoom.
  sniperScopeFOV = THREE.MathUtils.clamp(
    sniperScopeFOV + (delta > 0 ? 2 : -2),
    SNIPER_SCOPE_FOV_MIN,
    SNIPER_SCOPE_FOV_MAX
  );

  saveSniperScopeFOV();

  const overlay = getSniperScopeOverlay();
  const label = overlay.querySelector('.sniper-scope-zoom-label');
  if (label) label.textContent = getSniperZoomLabelText();

  showStatusToast(`SCOPE ZOOM ${getSniperZoomLabelText().split(' · ')[0]}`, '#66ccff', 650);
  return true;
}

function clearScopedPresentation() {
  player.currentADSFOV = null;
  setSniperScopeOverlayVisible(false);

  const activeWeapon = getActiveWeapon();
  if (activeWeapon?.meshGroup) activeWeapon.meshGroup.visible = true;
}

// C9.6: active weapons are fully procedural ES modules. No active weapon GLB fallback remains.

const MYSTERY_BOX_SPIN_TIME = 4.0;
const MYSTERY_BOX_READY_TIME = 12.0;
const MYSTERY_BOX_FEEDBACK_RANGE = 3.15;
const INTERACTION_COOLDOWN_MS = 280;
let lastInteractionUseAt = 0;
let barricadeRepairScoreThisRound = 0;
let barricadeRepairScoreWave = 0;

function isPlayerNearShop(shop, range = MYSTERY_BOX_FEEDBACK_RANGE) {
  if (!shop?.pos || !player?.pos) return false;
  return flatDistance(player.pos, shop.pos) <= range;
}

function isMysteryFeedbackCurrentlyShowing() {
  const title = document.getElementById('shop-feedback-title')?.textContent || '';
  return title === 'MYSTERY BOX' ||
    title === 'MYSTERY BOX READY' ||
    title === 'MYSTERY BOX CLOSED' ||
    title === 'MYSTERY BOX MOVED' ||
    title === 'TEDDY BEAR';
}

function hideMysteryFeedbackForShop(shop) {
  if (shop) shop._mysteryFeedbackVisible = false;

  // Do not accidentally hide normal shop messages, trap messages, or purchase feedback.
  if (isMysteryFeedbackCurrentlyShowing()) {
    hideShopFeedback();
  }
}

function showMysteryFeedbackIfNear(shop, payload) {
  if (!isPlayerNearShop(shop)) {
    hideMysteryFeedbackForShop(shop);
    return false;
  }

  shop._mysteryFeedbackVisible = true;
  showShopFeedback(payload);
  return true;
}

function updateMysteryFeedbackIfNear(shop, progress, body, fallbackPayload) {
  if (!isPlayerNearShop(shop)) {
    hideMysteryFeedbackForShop(shop);
    return false;
  }

  if (!shop._mysteryFeedbackVisible || !isMysteryFeedbackCurrentlyShowing()) {
    showMysteryFeedbackIfNear(shop, fallbackPayload);
  } else {
    updateShopFeedbackProgress(progress, body);
  }

  return true;
}

function shouldHandleInteraction(pressed, cooldownMs = INTERACTION_COOLDOWN_MS) {
  if (!pressed) return false;
  const now = performance.now();
  if (now - lastInteractionUseAt < cooldownMs) return false;
  lastInteractionUseAt = now;
  return true;
}

function clearMysteryReadyWeapon(shop, options = {}) {
  if (!shop || shop.type !== 'MYSTERY_BOX') return;

  const previousKey = shop.finalWeapon?.key || null;

  if (options.rememberUnclaimed && previousKey) {
    shop.lastUnclaimedWeaponKey = previousKey;
  } else if (options.clearUnclaimed) {
    shop.lastUnclaimedWeaponKey = null;
  }

  if (shop.spinMesh) {
    shop.spinMesh.clear();
  }

  shop.finalWeapon = null;
  shop.timer = 0;
  shop.cycleTimer = 0;
  shop.state = 'IDLE';
  hideMysteryFeedbackForShop(shop);
}

function showNotEnoughPoints(cost, label = 'Purchase') {
  const have = Math.max(0, player.score || 0);
  const need = Math.max(0, cost - have);
  setInteractionPrompt(true, `NOT ENOUGH POINTS! NEED ${need} MORE`);
  showStatusToast(`NEED ${need} MORE PTS`, '#ffaa00', 1100);
  showShopFeedback({
    title: 'NOT ENOUGH POINTS',
    body: `${label}: ${cost} required · You have ${have}`,
    tone: 'warning',
    durationMs: 2200
  });
}

function showBlockedShopFeedback(title, body) {
  showStatusToast(title, '#ffaa00', 1000);
  showShopFeedback({ title, body, tone: 'warning', durationMs: 2100 });
}

function describeShopSignal(pos) {
  if (!pos || !player?.pos) return 'New box signal detected nearby.';
  const dx = pos.x - player.pos.x;
  const dz = pos.z - player.pos.z;
  const distance = Math.max(1, Math.round(Math.sqrt(dx * dx + dz * dz)));
  const eastWest = Math.abs(dx) > 6 ? (dx > 0 ? 'east' : 'west') : '';
  const northSouth = Math.abs(dz) > 6 ? (dz > 0 ? 'south' : 'north') : '';
  const direction = [northSouth, eastWest].filter(Boolean).join('-') || 'nearby';
  return `New signal ${direction.toUpperCase()} · approx. ${distance}m away`;
}

function getBarricadeRepairReward() {
  if (barricadeRepairScoreWave !== currentWave) {
    barricadeRepairScoreWave = currentWave;
    barricadeRepairScoreThisRound = 0;
  }

  const remaining = Math.max(0, ECONOMY.BARRICADE_REPAIR_ROUND_SCORE_CAP - barricadeRepairScoreThisRound);
  return Math.min(ECONOMY.BARRICADE_REPAIR_SCORE, remaining);
}

function addBarricadeRepairReward(points) {
  if (points <= 0) return;
  barricadeRepairScoreThisRound += points;
  player.score += points;
  updateScoreHUD(player.score);
  spawnFloatingScore(points, false);
}

// ── ECONOMY / INTERACTION TUNING ──
// Centralized so future balancing does not require hunting magic numbers.
const ECONOMY = Object.freeze({
  DOOR_COST: 900,

  MYSTERY_BOX_COST: 950,

  WALL_WEAPON_COSTS: {
    SMG: 1150,
    SHOTGUN: 1650
  },

  WALL_AMMO_COSTS: {
    SMG: 425,
    SHOTGUN: 575
  },

  AMMO_COST: 525,
  HEALTH_COST: 400,
  UPGRADE_COST: 4200,
  PERK_HEALTH_COST: 2500,
  PERK_RELOAD_COST: 3000,

  BARRICADE_REPAIR_SCORE: 8,
  BARRICADE_REPAIR_COOLDOWN: 0.75,
  BARRICADE_REPAIR_ROUND_SCORE_CAP: 120,

  TRAP_COST: 1000,
  TRAP_DURATION: 14.0
});

function getCurrentGameplayPoints() {
  return getGameplayPointsForMap(currentMapId);
}

// Gameplay point pools are now shared from js/maps/gameplay_points.js
// Perk spawn pools are shared from js/maps/gameplay_points.js

const SHOP_WALL_CLEARANCE = 0.95;
const SHOP_MIN_SHOP_DISTANCE = 3.0;
const SHOP_MIN_PLAYER_DISTANCE = 7.0;
const SHOP_MIN_FEATURE_DISTANCE = 2.25;

// C4.5: current demo build is single-player only. One-time perks are hidden after use,
// while wall buys stay active as ammo refill boards for the owned weapon.
const SINGLE_PLAYER_SHOP_CLEANUP = true;
const WALL_BUY_MOUNT_OFFSET = 0.18;
const WALL_BUY_MIN_WALL_LENGTH = 2.8;

function flatDistance(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function shuffledCopy(list) {
  const arr = list.slice();

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  return arr;
}

function cloneShopPoint(pos) {
  return new THREE.Vector3(pos.x, 0.4, pos.z);
}

function pointOverlapsWall(pos, padding = SHOP_WALL_CLEARANCE) {
  for (const w of walls) {
    if (!w) continue;
    if (w.minX === undefined || w.maxX === undefined || w.minZ === undefined || w.maxZ === undefined) continue;

    if (
      pos.x > w.minX - padding &&
      pos.x < w.maxX + padding &&
      pos.z > w.minZ - padding &&
      pos.z < w.maxZ + padding
    ) {
      return true;
    }
  }

  return false;
}

function getShopCandidatePoints(spawnList) {
  const candidates = [];

  spawnList.forEach((pt) => {
    if (pt) candidates.push(cloneShopPoint(pt));
  });

  // Emergency fallback: if a hardcoded shop list is bad for a future map,
  // use known open floor zombie spawn points instead of forcing a wall spawn.
  spawnPoints.forEach((pt) => {
    if (pt) candidates.push(cloneShopPoint(pt));
  });

  return candidates;
}

function isShopSpawnSafe(pos, ignoreShop = null, options = {}) {
  if (!pos) return false;

  if (pointOverlapsWall(pos, SHOP_WALL_CLEARANCE)) return false;

  for (const shop of activeShops) {
    if (!shop || shop === ignoreShop) continue;
    if (flatDistance(pos, shop.pos) < SHOP_MIN_SHOP_DISTANCE) return false;
  }

  if (!options.ignorePlayer && player?.pos) {
    if (flatDistance(pos, player.pos) < SHOP_MIN_PLAYER_DISTANCE) return false;
  }

  for (const d of doors) {
    if (d?.pos && flatDistance(pos, d.pos) < SHOP_MIN_FEATURE_DISTANCE) return false;
  }

  for (const b of barricades) {
    if (b?.pos && flatDistance(pos, b.pos) < SHOP_MIN_FEATURE_DISTANCE) return false;
  }

  for (const t of traps) {
    const trapPos = t?.center || t?.pos;
    if (trapPos && flatDistance(pos, trapPos) < SHOP_MIN_FEATURE_DISTANCE) return false;
  }

  return true;
}

function pickSafeShopSpawn(shop, spawnList) {
  const currentPos = shop?.pos || null;
  const candidates = shuffledCopy(getShopCandidatePoints(spawnList));

  // Pass 1: ideal pick. Different location, clear of walls/features/player/shops.
  for (const candidate of candidates) {
    if (currentPos && flatDistance(candidate, currentPos) < 1.0) continue;
    if (isShopSpawnSafe(candidate, shop)) return candidate;
  }

  // Pass 2: allow player proximity, but still block walls/features/other shops.
  for (const candidate of candidates) {
    if (currentPos && flatDistance(candidate, currentPos) < 1.0) continue;
    if (isShopSpawnSafe(candidate, shop, { ignorePlayer: true })) return candidate;
  }

  // Pass 3: keep current position only if it is not inside/too close to a wall.
  if (currentPos && !pointOverlapsWall(currentPos, 0.65)) {
    console.warn(`No better safe shop spawn found for ${shop.type}. Keeping previous safe position.`);
    return cloneShopPoint(currentPos);
  }

  // Pass 4: last-resort open-floor fallback.
  for (const candidate of candidates) {
    if (!pointOverlapsWall(candidate, 0.65)) {
      console.warn(`Using fallback open-floor shop spawn for ${shop?.type || "shop"}.`);
      return candidate;
    }
  }

  console.warn(`No safe shop spawn found for ${shop?.type || "shop"}. Using origin fallback.`);
  return new THREE.Vector3(0, 0.4, 0);
}

function getWallWidth(wall) {
  return Math.abs((wall?.maxX ?? 0) - (wall?.minX ?? 0));
}

function getWallDepth(wall) {
  return Math.abs((wall?.maxZ ?? 0) - (wall?.minZ ?? 0));
}

function clampToWallSpan(value, min, max, margin = 1.35) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max - min <= margin * 2) return (min + max) / 2;
  return Math.max(min + margin, Math.min(max - margin, value));
}

function isWallBuyWallCandidate(wall) {
  if (!wall) return false;
  if (wall.isBarricade || wall.isDoor || wall.ref?.isDoor) return false;
  if (!Number.isFinite(wall.minX) || !Number.isFinite(wall.maxX) || !Number.isFinite(wall.minZ) || !Number.isFinite(wall.maxZ)) return false;

  const length = Math.max(getWallWidth(wall), getWallDepth(wall));
  return length >= WALL_BUY_MIN_WALL_LENGTH;
}

function distancePointToWallBounds(pos, wall) {
  const x = Math.max(wall.minX, Math.min(wall.maxX, pos.x));
  const z = Math.max(wall.minZ, Math.min(wall.maxZ, pos.z));
  return Math.hypot(pos.x - x, pos.z - z);
}

function makeWallBuyPlacementFromWall(candidate, wall) {
  // C4.5 hotfix: grid maps use many square wall blocks, so choosing only by
  // "wide vs deep" can mount one board on the wrong face and hide it from view.
  // Pick the closest face to the curated wall-buy point instead.
  const xOnWall = clampToWallSpan(candidate.x, wall.minX, wall.maxX);
  const zOnWall = clampToWallSpan(candidate.z, wall.minZ, wall.maxZ);

  const faceOptions = [
    {
      dist: Math.abs(candidate.z - wall.maxZ),
      pos: new THREE.Vector3(xOnWall, 0.4, wall.maxZ + WALL_BUY_MOUNT_OFFSET),
      rotationY: 0
    },
    {
      dist: Math.abs(candidate.z - wall.minZ),
      pos: new THREE.Vector3(xOnWall, 0.4, wall.minZ - WALL_BUY_MOUNT_OFFSET),
      rotationY: Math.PI
    },
    {
      dist: Math.abs(candidate.x - wall.maxX),
      pos: new THREE.Vector3(wall.maxX + WALL_BUY_MOUNT_OFFSET, 0.4, zOnWall),
      rotationY: Math.PI / 2
    },
    {
      dist: Math.abs(candidate.x - wall.minX),
      pos: new THREE.Vector3(wall.minX - WALL_BUY_MOUNT_OFFSET, 0.4, zOnWall),
      rotationY: -Math.PI / 2
    }
  ].sort((a, b) => a.dist - b.dist);

  const best = faceOptions[0];

  return {
    pos: best.pos,
    rotationY: best.rotationY,
    wallMounted: true
  };
}

function isWallBuyPlacementSafe(placement, ignoreShop = null, options = {}) {
  const pos = placement?.pos;
  if (!pos) return false;

  const minShopDistance = options.relaxedShopSpacing ? 1.25 : SHOP_MIN_SHOP_DISTANCE;

  for (const shop of activeShops) {
    if (!shop || shop === ignoreShop) continue;

    // In tight maps, a wall buy may be near another shop, but it should never
    // overlap another wall-buy board. This guarantees both SMG and shotgun boards spawn.
    const otherIsWallBuy = String(shop.type || '').startsWith('WALL_');
    const requiredDistance = options.relaxedShopSpacing && !otherIsWallBuy ? 0.85 : minShopDistance;

    if (flatDistance(pos, shop.pos) < requiredDistance) return false;
  }

  if (!options.ignorePlayer && player?.pos) {
    if (flatDistance(pos, player.pos) < SHOP_MIN_PLAYER_DISTANCE) return false;
  }

  for (const d of doors) {
    if (d?.pos && flatDistance(pos, d.pos) < SHOP_MIN_FEATURE_DISTANCE) return false;
  }

  for (const b of barricades) {
    if (b?.pos && flatDistance(pos, b.pos) < SHOP_MIN_FEATURE_DISTANCE) return false;
  }

  for (const t of traps) {
    const trapPos = t?.center || t?.pos;
    if (trapPos && flatDistance(pos, trapPos) < SHOP_MIN_FEATURE_DISTANCE) return false;
  }

  return true;
}

function getWallBuyCandidateOrder(type, spawnList) {
  const candidates = getShopCandidatePoints(spawnList);

  // Keep the two demo wall buys from fighting over the same first candidate.
  // SMG uses the list in authored order; shotgun starts from the opposite end.
  if (String(type || '').includes('SHOTGUN')) {
    return candidates.reverse();
  }

  return candidates;
}

function pickSafeWallBuyPlacement(type, shop, spawnList) {
  const candidates = getWallBuyCandidateOrder(type, spawnList);
  const mountableWalls = walls
    .filter(isWallBuyWallCandidate)
    .sort((a, b) => Math.max(getWallWidth(b), getWallDepth(b)) - Math.max(getWallWidth(a), getWallDepth(a)));

  const tryCandidates = (options = {}) => {
    for (const candidate of candidates) {
      const nearbyWalls = mountableWalls
        .map((wall) => ({ wall, dist: distancePointToWallBounds(candidate, wall) }))
        .sort((a, b) => a.dist - b.dist);

      for (const { wall } of nearbyWalls) {
        const placement = makeWallBuyPlacementFromWall(candidate, wall);
        if (shop?.pos && flatDistance(placement.pos, shop.pos) < 1.0) continue;
        if (isWallBuyPlacementSafe(placement, shop, options)) return placement;
      }
    }

    return null;
  };

  return tryCandidates()
    || tryCandidates({ ignorePlayer: true })
    || tryCandidates({ ignorePlayer: true, relaxedShopSpacing: true })
    || (() => {
      console.warn(`No safe wall-mounted spawn found for ${type || shop?.type || 'wall buy'}. Using floor fallback.`);
      return {
        pos: pickSafeShopSpawn(shop, spawnList),
        rotationY: 0,
        wallMounted: false
      };
    })();
}

function getShopPlacement(type, shop, spawnList) {
  if (type?.startsWith?.('WALL_')) {
    return pickSafeWallBuyPlacement(type, shop, spawnList);
  }

  return {
    pos: pickSafeShopSpawn(shop, spawnList),
    rotationY: 0,
    wallMounted: false
  };
}

function normalizeShopPlacement(placement) {
  if (placement?.pos) {
    return {
      pos: placement.pos.clone(),
      rotationY: Number.isFinite(placement.rotationY) ? placement.rotationY : 0,
      wallMounted: Boolean(placement.wallMounted)
    };
  }

  return {
    pos: placement?.clone ? placement.clone() : new THREE.Vector3(0, 0.4, 0),
    rotationY: 0,
    wallMounted: false
  };
}

function removeShop(shop) {
  if (!shop) return;
  scene.remove(shop.mesh);
  const idx = activeShops.indexOf(shop);
  if (idx > -1) activeShops.splice(idx, 1);
}

// ── UNIVERSAL SHOP RELOCATOR ──
function relocateShop(shop, spawnList) {
  const nextPlacement = getShopPlacement(shop.type, shop, spawnList);

  removeShop(shop);

  return spawnShop(shop.type, nextPlacement);
}



// ── PROCEDURAL WEAPON MODULE ENTRYPOINTS ──
// C9.3: weapon-specific viewmodel builders live in js/weapons/*.js.
// weapons.js remains the manager for inventory, shooting, shops, economy, and interaction logic.

function buildPistolViewmodel(upgraded = false) {
  return createProceduralPistolMesh({ upgraded });
}



function buildSMGViewmodel(upgraded = false) {
  return createProceduralSMGMesh({ upgraded });
}


function buildRifleViewmodel(upgraded = false) {
  return createProceduralRifleMesh({ upgraded });
}


function buildShotgunViewmodel(upgraded = false) {
  return createProceduralShotgunMesh({ upgraded });
}


function buildSniperViewmodel(upgraded = false) {
  return createProceduralSniperMesh({ upgraded });
}



// C9.1 ADS hotfix: procedural pistol ADS is aligned to the actual sight line.
// The front/rear sight meshes sit around x=0.014 and y=0.087 inside the viewmodel,
// so ADS offsets counter those values instead of centering the whole gun body.
// ── WEAPON DEFINITIONS ──
export const WEAPON_DEFS = {
  PISTOL: { 
    key: "PISTOL", name: "Starting Pistol", shootSound: 'shoot_pistol', damage: 24, maxAmmo: 10, fireRate: 0.24, isAutomatic: false, reloadDuration: 1.15, recoilZ: 0.05, recoilY: 0.02, cameraKick: 0.02, basePos: new THREE.Vector3(0.240, -0.250, -0.620), adsPos: new THREE.Vector3(0.000, -0.090, -0.610), baseRot: new THREE.Vector3(-0.055, -0.075, 0.035), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: false,
    buildMesh: () => buildPistolViewmodel(false) 
  },
  PISTOL_UPG: { 
    key: "PISTOL_UPG", name: "Mustang & Sally", shootSound: 'shoot_pistol', damage: 58, maxAmmo: 24, fireRate: 0.14, isAutomatic: true, reloadDuration: 0.85, recoilZ: 0.04, recoilY: 0.02, cameraKick: 0.02, basePos: new THREE.Vector3(0.240, -0.250, -0.620), adsPos: new THREE.Vector3(0.000, -0.090, -0.610), baseRot: new THREE.Vector3(-0.055, -0.075, 0.035), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: true,
    buildMesh: () => buildPistolViewmodel(true) 
  },
  RIFLE: { 
    key: "RIFLE", name: "Assault Rifle", shootSound: 'shoot_rifle', damage: 38, maxAmmo: 32, fireRate: 0.115, isAutomatic: true, reloadDuration: 1.75, recoilZ: 0.06, recoilY: 0.03, cameraKick: 0.025, 
    basePos: new THREE.Vector3(0.245, -0.215, -0.620), adsPos: new THREE.Vector3(0.000, -0.128, -0.470), baseRot: new THREE.Vector3(-0.045, -0.090, 0.020), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: false, 
    buildMesh: () => buildRifleViewmodel(false) 
  },
  RIFLE_UPG: { 
    key: "RIFLE_UPG", name: "Khadija's Fury", shootSound: 'shoot_rifle', damage: 88, maxAmmo: 64, fireRate: 0.085, isAutomatic: true, reloadDuration: 1.25, recoilZ: 0.04, recoilY: 0.02, cameraKick: 0.015, 
    basePos: new THREE.Vector3(0.245, -0.215, -0.620), adsPos: new THREE.Vector3(0.000, -0.128, -0.470), baseRot: new THREE.Vector3(-0.045, -0.090, 0.020), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: true, 
    buildMesh: () => buildRifleViewmodel(true) 
  },
  SMG: { 
    key: "SMG", name: "Tactical SMG", shootSound: 'shoot_rifle', damage: 20, maxAmmo: 45, fireRate: 0.07, isAutomatic: true, reloadDuration: 1.35, recoilZ: 0.03, recoilY: 0.015, cameraKick: 0.015, 
    basePos: new THREE.Vector3(0.235, -0.205, -0.575), adsPos: new THREE.Vector3(0.000, -0.118, -0.430), baseRot: new THREE.Vector3(-0.040, -0.110, 0.030), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: false, 
    buildMesh: () => buildSMGViewmodel(false) 
  },
  SMG_UPG: { 
    key: "SMG_UPG", name: "The Shredder", shootSound: 'shoot_rifle', damage: 38, maxAmmo: 90, fireRate: 0.05, isAutomatic: true, reloadDuration: 0.95, recoilZ: 0.02, recoilY: 0.01, cameraKick: 0.01, 
    basePos: new THREE.Vector3(0.235, -0.205, -0.575), adsPos: new THREE.Vector3(0.000, -0.118, -0.430), baseRot: new THREE.Vector3(-0.040, -0.110, 0.030), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: true, 
    buildMesh: () => buildSMGViewmodel(true) 
  },
  SHOTGUN: { 
    key: "SHOTGUN", name: "Pump Shotgun", shootSound: 'shoot_shotgun', damage: 28, maxAmmo: 8, fireRate: 0.82, isAutomatic: false, reloadDuration: 2.05, recoilZ: 0.15, recoilY: 0.05, cameraKick: 0.05, 
    basePos: new THREE.Vector3(0.260, -0.230, -0.690), adsPos: new THREE.Vector3(0.000, -0.148, -0.520), baseRot: new THREE.Vector3(-0.055, -0.105, 0.030), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: false, 
    buildMesh: () => buildShotgunViewmodel(false) 
  },
  SHOTGUN_UPG: { 
    key: "SHOTGUN_UPG", name: "The Boomstick", shootSound: 'shoot_shotgun', damage: 48, maxAmmo: 16, fireRate: 0.54, isAutomatic: true, reloadDuration: 1.45, recoilZ: 0.12, recoilY: 0.04, cameraKick: 0.04, 
    basePos: new THREE.Vector3(0.260, -0.230, -0.690), adsPos: new THREE.Vector3(0.000, -0.148, -0.520), baseRot: new THREE.Vector3(-0.055, -0.105, 0.030), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: true, 
    buildMesh: () => buildShotgunViewmodel(true) 
  },
  SNIPER: {
    key: "SNIPER", name: "Longshot Sniper", shootSound: 'shoot_sniper', damage: 155, maxAmmo: 5, fireRate: 1.15, isAutomatic: false, reloadDuration: 2.40, recoilZ: 0.20, recoilY: 0.07, cameraKick: 0.075,
    basePos: new THREE.Vector3(0.285, -0.245, -0.790), adsPos: new THREE.Vector3(0.000, -0.190, -0.760), baseRot: new THREE.Vector3(-0.052, -0.085, 0.026), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: false,
    buildMesh: () => buildSniperViewmodel(false)
  },
  SNIPER_UPG: {
    key: "SNIPER_UPG", name: "Khadija's Judgment", shootSound: 'shoot_sniper', damage: 320, maxAmmo: 10, fireRate: 0.92, isAutomatic: false, reloadDuration: 1.85, recoilZ: 0.16, recoilY: 0.055, cameraKick: 0.060,
    basePos: new THREE.Vector3(0.285, -0.245, -0.790), adsPos: new THREE.Vector3(0.000, -0.190, -0.760), baseRot: new THREE.Vector3(-0.052, -0.085, 0.026), adsRot: new THREE.Vector3(0.000, 0.000, 0.000), isUpgraded: true,
    buildMesh: () => buildSniperViewmodel(true)
  }

};

// ── C4 WEAPON BALANCE / UPGRADE TUNING ──
// Damage falloff and reserve tuning keep every weapon useful without letting one gun dominate.
const WEAPON_BALANCE = Object.freeze({
  PISTOL: { reserveMags: 5, falloffStart: 20, falloffEnd: 36, minDamageScale: 0.62, headshotMult: 2.35, pellets: 1, upgradedPellets: 1 },
  RIFLE: { reserveMags: 4, falloffStart: 34, falloffEnd: 58, minDamageScale: 0.76, headshotMult: 2.10, pellets: 1, upgradedPellets: 1 },
  SMG: { reserveMags: 4, falloffStart: 17, falloffEnd: 34, minDamageScale: 0.56, headshotMult: 1.85, pellets: 1, upgradedPellets: 1 },
  SHOTGUN: { reserveMags: 4, falloffStart: 6.5, falloffEnd: 18, minDamageScale: 0.30, headshotMult: 1.45, pellets: 9, upgradedPellets: 12, pelletSpread: 0.052, upgradedPelletSpread: 0.044 },
  SNIPER: { reserveMags: 4, falloffStart: 52, falloffEnd: 92, minDamageScale: 0.88, headshotMult: 3.25, pellets: 1, upgradedPellets: 1 }
});

// C9.7: sniper is Mystery Box-only. Weights sum to 1.00.
const MYSTERY_BOX_WEAPON_POOL = Object.freeze([
  { key: 'SMG', weight: 0.30 },
  { key: 'RIFLE', weight: 0.32 },
  { key: 'SHOTGUN', weight: 0.25 },
  { key: 'SNIPER', weight: 0.13 }
]);

function getWeaponFamily(weapon) {
  return String(weapon?.key || '').replace('_UPG', '');
}

function getWeaponBalance(weapon) {
  return WEAPON_BALANCE[getWeaponFamily(weapon)] || WEAPON_BALANCE.PISTOL;
}

function getReserveAmmoForWeapon(weapon) {
  const balance = getWeaponBalance(weapon);
  return Math.max(weapon.maxAmmo, Math.round(weapon.maxAmmo * balance.reserveMags));
}

function refillWeaponAmmo(weapon) {
  if (!weapon) return;
  weapon.ammo = weapon.maxAmmo;
  weapon.reserve = getReserveAmmoForWeapon(weapon);
}

function isWeaponAmmoFull(weapon) {
  return Boolean(weapon) &&
    weapon.ammo >= weapon.maxAmmo &&
    weapon.reserve >= getReserveAmmoForWeapon(weapon);
}

function createWeaponInstance(def) {
  const instance = {
    ...def,
    ammo: def.maxAmmo,
    reserve: getReserveAmmoForWeapon(def),
    reloading: false,
    reloadT: 0,
    meshGroup: def.buildMesh()
  };

  return instance;
}

function rollMysteryWeaponKey(excludeKey = null) {
  const allowedPool = MYSTERY_BOX_WEAPON_POOL.filter((item) => {
    return !excludeKey || item.key !== excludeKey;
  });

  const pool = allowedPool.length > 0 ? allowedPool : MYSTERY_BOX_WEAPON_POOL;
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item.key;
  }

  return pool[pool.length - 1]?.key || 'RIFLE';
}

function getPreviewWeaponKey() {
  return MYSTERY_BOX_WEAPON_POOL[Math.floor(Math.random() * MYSTERY_BOX_WEAPON_POOL.length)]?.key || 'RIFLE';
}

function getShotgunPelletCount(weapon) {
  const balance = getWeaponBalance(weapon);
  return weapon?.isUpgraded ? balance.upgradedPellets : balance.pellets;
}

function getShotgunPelletSpread(weapon, feel) {
  const balance = getWeaponBalance(weapon);
  if (weapon?.isUpgraded) return balance.upgradedPelletSpread || balance.pelletSpread || feel.pelletSpread || 0.048;
  return balance.pelletSpread || feel.pelletSpread || 0.048;
}

function getDamageDistanceScale(weapon, point) {
  const balance = getWeaponBalance(weapon);
  const distance = getHitFxDistance(point);

  if (distance <= balance.falloffStart) return 1;
  if (distance >= balance.falloffEnd) return balance.minDamageScale;

  const t = (distance - balance.falloffStart) / Math.max(0.001, balance.falloffEnd - balance.falloffStart);
  return THREE.MathUtils.lerp(1, balance.minDamageScale, t);
}

function getHeadshotMultiplier(weapon) {
  return getWeaponBalance(weapon).headshotMult || 2.0;
}

// ── 3D CLONING ENGINE ──
// C9.6: clone3DAsset removed for active weapons. Weapon visuals now come from procedural modules.


export function getActiveWeapon() { return player.inventory[player.currentWeaponIdx]; }

function updateProceduralHandVisibility(weapon) {
  const group = weapon?.meshGroup;
  if (!group) return;

  const hideSprintHands = Boolean(group.userData.hideProceduralHandsWhileSprinting && player.isSprinting && !player.isADS);

  group.traverse((child) => {
    if (!child?.userData?.isProceduralHand) return;
    const defaultVisible = child.userData.defaultVisible !== false;
    child.visible = hideSprintHands ? false : defaultVisible;
  });
}

// ── INITIALIZE PROCEDURAL MAP SHOPS ──
export function buildGun() {
  player.inventory.forEach(w => camera.remove(w.meshGroup));
  activeShops.forEach(s => scene.remove(s.mesh));
  player.inventory = []; 
  activeShops.length = 0;

  const pistolDef = WEAPON_DEFS.PISTOL;
  player.inventory.push(createWeaponInstance(pistolDef));
  equipWeapon(0);

// ── SPAWN PROCEDURAL SHOPS ──
  const gameplayPoints = getCurrentGameplayPoints();

  spawnShop('AMMO', pickSafeShopSpawn(null, gameplayPoints.AMMO_SPAWNS));
  spawnShop('MYSTERY_BOX', pickSafeShopSpawn(null, gameplayPoints.BOX_SPAWNS));
  spawnShop('HEALTH', pickSafeShopSpawn(null, gameplayPoints.HEALTH_SPAWNS));
  spawnShop('UPGRADE', pickSafeShopSpawn(null, gameplayPoints.UPGRADE_SPAWNS));
  spawnShop('PERK_HEALTH', pickSafeShopSpawn(null, gameplayPoints.PERK_HEALTH_SPAWNS)); // Juggernog
  spawnShop('PERK_RELOAD', pickSafeShopSpawn(null, gameplayPoints.PERK_RELOAD_SPAWNS)); // Speed Cola

  // ── WALL BUYS ──
  spawnShop('WALL_SMG', getShopPlacement('WALL_SMG', null, gameplayPoints.WALL_SPAWNS));
  spawnShop('WALL_SHOTGUN', getShopPlacement('WALL_SHOTGUN', null, gameplayPoints.WALL_SPAWNS));
  }

function spawnShop(type, placementInput) {
  const placement = normalizeShopPlacement(placementInput);
  const position = placement.pos;
  const g = new THREE.Group();
  let shopData = {
    type: type,
    mesh: g,
    pos: position.clone(),
    wallMounted: placement.wallMounted,
    rotationY: placement.rotationY
  };
  
  if (type === 'AMMO') {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x225522, roughness: 0.8 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.6), crateMat));
  } else if (type === 'MYSTERY_BOX') {
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x442211, roughness: 0.9 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.5 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.7), boxMat), new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8), glowMat));
    
    // ── MYSTERY BOX STATE RIGGING ──
    shopData.state = 'IDLE'; 
    shopData.timer = 0;
    shopData.cycleTimer = 0;
    shopData.finalWeapon = null;
    shopData.lastUnclaimedWeaponKey = null;
    shopData._mysteryFeedbackVisible = false;
    shopData.spinMesh = new THREE.Group();
    shopData.spinMesh.position.set(0, 1.2, 0); // Float above the box
    g.add(shopData.spinMesh);
  } else if (type === 'HEALTH') {
    const medMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x440000 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), medMat), new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.82, 0.1), crossMat), new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.4), crossMat));
  } else if (type === 'UPGRADE') {
    const machMat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.2 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xaa00ff, emissive: 0x6600aa, emissiveIntensity: 0.8 }); 
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.0), machMat);
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16), glowMat);
    roller.rotation.z = Math.PI / 2; roller.position.y = 0.5; g.add(base, roller);
  } else if (type === 'PERK_HEALTH' || type === 'PERK_RELOAD') {
    const machMat = new THREE.MeshStandardMaterial({ color: type === 'PERK_HEALTH' ? 0x880000 : 0x005500, roughness: 0.4 });
    const glowMat = new THREE.MeshStandardMaterial({ color: type === 'PERK_HEALTH' ? 0xff0000 : 0x00ff00, emissive: type === 'PERK_HEALTH' ? 0xaa0000 : 0x00aa00 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.8), machMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), glowMat);
    screen.position.set(0, 0.5, 0.41); base.position.y = 0.6; g.add(base, screen);
 } else if (type.startsWith('WALL_')) {
    const wKey = type.split('_')[1]; // Extracts "SMG" or "SHOTGUN"
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
    const mountY = placement.wallMounted ? 1.18 : 0.6;

    if (placement.wallMounted) {
      board.name = `${wKey}_wall_buy_board`;
    }
    
    // Recycle the Mystery Box hologram to make a "Chalk Outline"
    const chalkMesh = getHologramMesh(wKey);
    chalkMesh.position.z = 0.15; 
    chalkMesh.position.y = mountY;

    // C9.7 axis fix:
    // Procedural weapons are long on local Z. For wall-buy boards, rotate local Z
    // onto the board's X axis, then flatten local X depth only.
    // Do NOT flatten local Z or the gun becomes a thin glowing vertical strip.
    if (wKey === 'SMG' || wKey === 'SHOTGUN') {
      chalkMesh.rotation.y = Math.PI / 2;
      chalkMesh.position.z = 0.13;
      chalkMesh.position.x = wKey === 'SHOTGUN' ? -0.03 : 0.0;
      chalkMesh.scale.x *= 0.001;
      chalkMesh.scale.y *= wKey === 'SHOTGUN' ? 1.05 : 1.10;
      chalkMesh.scale.z *= wKey === 'SHOTGUN' ? 1.22 : 1.35;
    } else {
      chalkMesh.scale.z = 0.001; // Default flat board silhouette.
    }

    const chalkMat = new THREE.MeshBasicMaterial({
      color: 0xb8c7d2,
      wireframe: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false
    });

    chalkMesh.traverse(child => {
      if (!child.isMesh) return;

      // Keep the wall-buy readable without the old pure-white bloom blob.
      if (
        child.name === 'muzzleFlashMesh' ||
        child.userData?.isProceduralHand ||
        child.name.includes('ejected_shell') ||
        child.name.includes('reload_shell')
      ) {
        child.visible = false;
        return;
      }

      child.material = chalkMat;
    });

    board.position.y = mountY;
    g.add(board, chalkMesh);
    g.rotation.y = placement.rotationY;
    shopData.weaponKey = wKey; // Save what weapon this wall holds
  }
  
  g.position.copy(position); scene.add(g);
  activeShops.push(shopData);
  return shopData;
}

function announceWeaponEquipped(weapon) {
  if (!weapon) return;

  const color = weapon.isUpgraded ? '#ff66ff' : '#00d4ff';
  showStatusToast(`EQUIPPED: ${weapon.name}`, color, 1500);
}

function equipWeapon(idx) {
  clearScopedPresentation();
  player.inventory.forEach(w => { if(w.meshGroup.parent) camera.remove(w.meshGroup); w.meshGroup.visible = false; });
  player.currentWeaponIdx = idx;
  const active = getActiveWeapon();
  active.meshGroup.visible = true;
  camera.add(active.meshGroup);
    updateAmmoHUD(active.ammo, active.reserve, active.maxAmmo);
  updateWeaponNameHUD(active.name);

  if (player.alive) {
    announceWeaponEquipped(active);
  }
}

export function cycleWeapon() {
  if (player.inventory.length <= 1) return; 
  equipWeapon((player.currentWeaponIdx + 1) % player.inventory.length);
}

export function checkWorldInteractions(checkInteractionPressed = false) {
  if (!player.alive) return;

// ── REPAIRABLE BARRICADE INTERACTION TRACKER (PASTE HERE) ──
  let closestBarricade = null;
  let minBarricadeDist = 3.0;

  barricades.forEach(b => {
    const d = player.pos.distanceTo(b.pos);
    if (d < minBarricadeDist) {
      minBarricadeDist = d;
      closestBarricade = b;
    }
  });

  if (closestBarricade) {
    const frameDt = typeof dt === 'number' ? dt : 0.016;
    closestBarricade.cooldown = Math.max(0, (closestBarricade.cooldown ?? 0) - frameDt);

    if (closestBarricade.currentPlanks < closestBarricade.maxPlanks) {
      if (closestBarricade.cooldown > 0) {
        setInteractionPrompt(true, `Repair cooldown: ${closestBarricade.cooldown.toFixed(1)}s`);
        return;
      }

      const repairReward = getBarricadeRepairReward();
      const repairPrompt = repairReward > 0
        ? `Press [E] to repair barricade (+${repairReward} PTS)`
        : `Press [E] to repair barricade (round repair points capped)`;
      setInteractionPrompt(true, repairPrompt);

      if (shouldHandleInteraction(checkInteractionPressed)) {
        closestBarricade.cooldown = ECONOMY.BARRICADE_REPAIR_COOLDOWN;

        // Add plank back physically
        const targetPlank = closestBarricade.planks[closestBarricade.currentPlanks];
        closestBarricade.plankGroup.add(targetPlank);
        closestBarricade.currentPlanks++;
        updateBarricadeRepairGhost(closestBarricade);

        // Reward score progression with anti-farm round cap.
        const pointsAwarded = getBarricadeRepairReward();
        addBarricadeRepairReward(pointsAwarded);
        playWorldSound('plankRepair', 0.48, true, { cooldownKey: 'plank_repair', cooldownMs: 260, pitchMin: 0.92, pitchMax: 1.12 });
        showShopFeedback({
          title: 'BARRICADE REPAIRED',
          body: pointsAwarded > 0
            ? `+${pointsAwarded} points · ${closestBarricade.currentPlanks}/${closestBarricade.maxPlanks} planks restored`
            : `Plank restored · round repair points capped`,
          tone: pointsAwarded > 0 ? 'ready' : 'warning',
          durationMs: 1300
        });

        // Re-engage mathematical collision wall if it was previously wide open
        if (closestBarricade.currentPlanks === 1 && !walls.includes(closestBarricade.wallTracker)) {
          walls.push(closestBarricade.wallTracker);
        }
      }
    } else {
      setInteractionPrompt(true, `BARRICADE IS FULLY REPAIRED`);
    }

    return; // Halt other checks so shop prompts don't overlap
  }
  // ── TRAP INTERACTION TRACKER ──
  let closestTrap = null;
  let minTrapDist = 2.5;

  traps.forEach(t => {
    if (player.pos.distanceTo(t.pos) < minTrapDist) {
      minTrapDist = player.pos.distanceTo(t.pos);
      closestTrap = t;
    }
  });

    if (closestTrap) {
    if (closestTrap.state === 'READY') {
      setInteractionPrompt(true, `Press [E] to activate Electric Trap [${ECONOMY.TRAP_COST} PTS]`);

      if (shouldHandleInteraction(checkInteractionPressed)) {
        if (player.score >= ECONOMY.TRAP_COST) {
          player.score -= ECONOMY.TRAP_COST;
          updateScoreHUD(player.score);

          closestTrap.state = 'ACTIVE';
          closestTrap.timer = ECONOMY.TRAP_DURATION;
          closestTrap.field.visible = true;
          closestTrap.switchMesh.material.color.setHex(0x00ff00);

          playWorldSound('trapActivate', 0.62, false, { cooldownKey: 'trap_activate', cooldownMs: 650 });
          showShopFeedback({
            title: 'TRAP ACTIVE',
            body: `Electric trap armed for ${ECONOMY.TRAP_DURATION}s`,
            tone: 'ready',
            durationMs: 1800,
            progress: 1
          });
        } else {
          showNotEnoughPoints(ECONOMY.TRAP_COST, 'Electric Trap');
        }
      }
    } else if (closestTrap.state === 'ACTIVE') {
      setInteractionPrompt(true, `TRAP ACTIVE (${Math.ceil(closestTrap.timer)}s)`);
    } else if (closestTrap.state === 'COOLDOWN') {
      setInteractionPrompt(true, `TRAP RECHARGING (${Math.ceil(closestTrap.timer)}s)`);
    }

    return;
  }
  // ──────────────────────────────────────────────────────────

  let closestInteractable = null;
  let minShopDist = 2.5; 
  let minDoorDist = 7.0; 

  activeShops.forEach(s => { 
    const d = player.pos.distanceTo(s.pos); 
    if (d < minShopDist) { minShopDist = d; closestInteractable = { type: 'SHOP', data: s }; } 
  });
  
  if (!closestInteractable) {
    doors.forEach(d => { 
      const dist = player.pos.distanceTo(d.pos); 
      if (dist < minDoorDist) { minDoorDist = dist; closestInteractable = { type: 'DOOR', data: d }; } 
    });
  }

  if (closestInteractable) {
    if (closestInteractable.type === 'DOOR') {
      const doorCost = ECONOMY.DOOR_COST;
      const distToDoor = player.pos.distanceTo(closestInteractable.data.pos);
      
      if (distToDoor > 5.5) {
        setInteractionPrompt(true, `Move closer to open Energy Gate [${doorCost} PTS]`);
      } else {
        setInteractionPrompt(true, `Press [E] to open energy gate [${doorCost} PTS]`);
        
        if (shouldHandleInteraction(checkInteractionPressed)) {
          if (player.score >= doorCost) {
            player.score -= doorCost; updateScoreHUD(player.score);
            openDoor(closestInteractable.data);
            playWorldSound('doorOpen', 0.75, false, { cooldownKey: 'door_open', cooldownMs: 300 });
            showShopFeedback({
              title: 'ENERGY GATE OPENED',
              body: `${doorCost} points spent · new route unlocked`,
              tone: 'ready',
              durationMs: 1800
            }); 
          } else {
            showNotEnoughPoints(doorCost, 'Energy Gate');
          }
        }
      }
    } 
    else if (closestInteractable.type === 'SHOP') {
      const closestShop = closestInteractable.data;
      const activeW = getActiveWeapon();

      // ── MYSTERY BOX LOGIC (FULLY ISOLATED) ──
      if (closestShop.type === 'MYSTERY_BOX') {
        if (closestShop.state === 'IDLE') {
          setInteractionPrompt(true, `Press [E] to buy Mystery Box [${ECONOMY.MYSTERY_BOX_COST} PTS]`);
          if (shouldHandleInteraction(checkInteractionPressed)) {
            if (player.score >= ECONOMY.MYSTERY_BOX_COST) {
			  player.score -= ECONOMY.MYSTERY_BOX_COST;
			  updateScoreHUD(player.score);
			  closestShop.state = 'SPINNING';
              closestShop.timer = MYSTERY_BOX_SPIN_TIME;
              showStatusToast('MYSTERY BOX SPINNING...', '#ffaa00', 1500);
              showMysteryFeedbackIfNear(closestShop, {
                title: 'MYSTERY BOX',
                body: 'Rolling weapon... stay close.',
                tone: 'mystery',
                durationMs: 0,
                progress: 0
              });
              playWorldSound('mysteryStart', 0.76, true, { cooldownKey: 'mystery_start', cooldownMs: 650, pitchMin: 0.94, pitchMax: 1.04 });
            } else {
              showNotEnoughPoints(ECONOMY.MYSTERY_BOX_COST, 'Mystery Box');
            }
          }
        } 
        else if (closestShop.state === 'READY') {
          const readyTimeLeft = Math.max(0, Math.ceil(closestShop.timer || 0));
          setInteractionPrompt(true, `Press [E] to take ${closestShop.finalWeapon.name} (${readyTimeLeft}s)`);
          updateMysteryFeedbackIfNear(
            closestShop,
            (closestShop.timer || 0) / MYSTERY_BOX_READY_TIME,
            `${closestShop.finalWeapon.name} ready · ${readyTimeLeft}s left`,
            {
              title: 'MYSTERY BOX READY',
              body: `${closestShop.finalWeapon.name} ready · ${readyTimeLeft}s left`,
              tone: 'ready',
              durationMs: 0,
              progress: (closestShop.timer || 0) / MYSTERY_BOX_READY_TIME
            }
          );
          if (shouldHandleInteraction(checkInteractionPressed)) {
            const rolledDef = closestShop.finalWeapon;
            const existingGunIdx = player.inventory.findIndex(w => w.key === rolledDef.key || w.key === rolledDef.key + "_UPG");
            
            if (existingGunIdx !== -1) {
              refillWeaponAmmo(player.inventory[existingGunIdx]);
              equipWeapon(existingGunIdx);
            } else {
              player.inventory.push(createWeaponInstance(rolledDef));
              equipWeapon(player.inventory.length - 1);
            }
            
            showStatusToast(`MYSTERY BOX: ${rolledDef.name}`, '#ffaa00', 1800);

            clearMysteryReadyWeapon(closestShop, { clearUnclaimed: true });
            playWorldSound('mysteryTake', 0.76, true, { cooldownKey: 'mystery_take', cooldownMs: 550, pitchMin: 1.02, pitchMax: 1.14 });
            
            // NEW: Instantly relocate the box after the player grabs the gun!
            relocateShop(closestShop, getCurrentGameplayPoints().BOX_SPAWNS);
          }
        } 
        else if (closestShop.state === 'SPINNING') {
          const spinLeft = Math.max(0, Math.ceil(closestShop.timer || 0));
          setInteractionPrompt(true, `Mystery Box rolling... (${spinLeft}s)`);
          updateMysteryFeedbackIfNear(
            closestShop,
            1 - ((closestShop.timer || 0) / MYSTERY_BOX_SPIN_TIME),
            `Rolling weapon... ${spinLeft}s`,
            {
              title: 'MYSTERY BOX',
              body: `Rolling weapon... ${spinLeft}s`,
              tone: 'mystery',
              durationMs: 0,
              progress: 1 - ((closestShop.timer || 0) / MYSTERY_BOX_SPIN_TIME)
            }
          );
        }
        else if (closestShop.state === 'TEDDY') {
          setInteractionPrompt(true, `Mystery Box moving...`);
        }
        else {
          setInteractionPrompt(false);
        }

        return; 
      }

      // ── STANDARD SHOP LOGIC (AMMO, PERKS, ETC) ──
// ── STANDARD SHOP LOGIC (AMMO, PERKS, WALL BUYS) ──
      let cost = 0; let shopName = "";
      const isWallBuy = closestShop.type.startsWith('WALL_');
      let hasWallWeapon = false;
      let wallWeaponIdx = -1;
      let ownedWallWeapon = null;

            // Dynamically check if they already own the Wall-Buy weapon
      if (isWallBuy) {
        wallWeaponIdx = player.inventory.findIndex(w => w.key === closestShop.weaponKey || w.key === closestShop.weaponKey + "_UPG");
        hasWallWeapon = wallWeaponIdx !== -1;
        ownedWallWeapon = hasWallWeapon ? player.inventory[wallWeaponIdx] : null;

        const wallWeaponCost = ECONOMY.WALL_WEAPON_COSTS[closestShop.weaponKey] ?? 1200;
        const wallAmmoCost = ECONOMY.WALL_AMMO_COSTS[closestShop.weaponKey] ?? 450;

        cost = hasWallWeapon ? wallAmmoCost : wallWeaponCost;
        shopName = hasWallWeapon ? `${closestShop.weaponKey} Ammo` : `Wall ${closestShop.weaponKey}`;
      }
      else if (closestShop.type === 'AMMO') { cost = ECONOMY.AMMO_COST; shopName = "Ammo Refill"; }
      else if (closestShop.type === 'HEALTH') { cost = ECONOMY.HEALTH_COST; shopName = "Medkit"; }
      else if (closestShop.type === 'UPGRADE') { cost = ECONOMY.UPGRADE_COST; shopName = "Pack-a-Punch"; }
      else if (closestShop.type === 'PERK_HEALTH') { cost = ECONOMY.PERK_HEALTH_COST; shopName = "Juggernog"; }
      else if (closestShop.type === 'PERK_RELOAD') { cost = ECONOMY.PERK_RELOAD_COST; shopName = "Speed Cola"; }

      if (closestShop.type === 'HEALTH' && player.health >= player.maxHealth) {
        setInteractionPrompt(true, `HEALTH IS ALREADY FULL!`);
        if (shouldHandleInteraction(checkInteractionPressed, 500)) showBlockedShopFeedback('HEALTH FULL', 'Medkit unavailable because your health is already full.');
      }
      else if (closestShop.type === 'AMMO' && isWeaponAmmoFull(activeW)) {
        setInteractionPrompt(true, `AMMO IS ALREADY FULL!`);
        if (shouldHandleInteraction(checkInteractionPressed, 500)) showBlockedShopFeedback('AMMO FULL', `${activeW.name} already has maximum ammo.`);
      }
      else if (isWallBuy && hasWallWeapon && isWeaponAmmoFull(ownedWallWeapon)) {
        setInteractionPrompt(true, `${closestShop.weaponKey} AMMO IS ALREADY FULL!`);
        if (shouldHandleInteraction(checkInteractionPressed, 500)) showBlockedShopFeedback('WALL AMMO FULL', `${ownedWallWeapon.name} already has maximum ammo.`);
      } 
      else if (closestShop.type === 'UPGRADE' && activeW.isUpgraded) {
        setInteractionPrompt(true, `WEAPON ALREADY UPGRADED!`);
        if (shouldHandleInteraction(checkInteractionPressed, 500)) showBlockedShopFeedback('ALREADY UPGRADED', `${activeW.name} is already Pack-a-Punched.`);
      } 
      else if (closestShop.type === 'PERK_HEALTH' && player.maxHealth >= 250) {
        setInteractionPrompt(true, `ALREADY HAVE JUGGERNOG!`);
        if (shouldHandleInteraction(checkInteractionPressed, 500)) showBlockedShopFeedback('JUGGERNOG ACTIVE', 'Max health perk is already active.');
      } 
      else if (closestShop.type === 'PERK_RELOAD' && player.reloadMult <= 0.5) {
        setInteractionPrompt(true, `ALREADY HAVE SPEED COLA!`);
        if (shouldHandleInteraction(checkInteractionPressed, 500)) showBlockedShopFeedback('SPEED COLA ACTIVE', 'Fast reload perk is already active.');
      } 
      else {
        setInteractionPrompt(true, `Press [E] to buy ${shopName} [${cost} PTS]`);
        
        if (shouldHandleInteraction(checkInteractionPressed)) {
          if (player.score >= cost) {
            player.score -= cost;
            updateScoreHUD(player.score);
            playUISound('confirm', 0.48, true, { cooldownKey: 'shop_confirm', cooldownMs: 220, pitchMin: 1.04, pitchMax: 1.14 }); 
            
            if (isWallBuy) {
              if (hasWallWeapon) {
                refillWeaponAmmo(player.inventory[wallWeaponIdx]);
                equipWeapon(wallWeaponIdx);
                showStatusToast(`${closestShop.weaponKey} AMMO REFILLED`, '#00ff88', 1500);
                showShopFeedback({ title: 'WALL AMMO REFILLED', body: `${cost} points spent · ${player.inventory[wallWeaponIdx].name}`, tone: 'ready', durationMs: 1700 });
              } else {
                const def = WEAPON_DEFS[closestShop.weaponKey];
                player.inventory.push(createWeaponInstance(def));
                equipWeapon(player.inventory.length - 1);
                showStatusToast(`BOUGHT ${def.name}`, '#00d4ff', 1600);
                showShopFeedback({ title: 'WALL BUY COMPLETE', body: `${def.name} purchased · ${cost} points spent`, tone: 'ready', durationMs: 1800 });
              }
            }
            else if (closestShop.type === 'AMMO') {
              refillWeaponAmmo(activeW);
              updateAmmoHUD(activeW.ammo, activeW.reserve, activeW.maxAmmo);
              showStatusToast('AMMO REFILLED', '#00ff88', 1500);
              showShopFeedback({ title: 'AMMO REFILLED', body: `${cost} points spent`, tone: 'ready', durationMs: 1800 });
            }
            else if (closestShop.type === 'HEALTH') {
              player.health = player.maxHealth;
              updateHealthHUD(player.health, player.maxHealth);
              showStatusToast('HEALTH RESTORED', '#ff5555', 1500);
              showShopFeedback({ title: 'HEALTH RESTORED', body: `${cost} points spent`, tone: 'ready', durationMs: 1800 });
            }
            else if (closestShop.type === 'PERK_HEALTH') {
              player.maxHealth = 250;
              player.health = 250;
              updateHealthHUD(player.health, player.maxHealth);
              showStatusToast('JUGGERNOG ACTIVE: MAX HEALTH 250', '#ff3333', 1900);
              showShopFeedback({ title: 'JUGGERNOG ACTIVE', body: `${cost} points spent`, tone: 'ready', durationMs: 1800 });
              playUISound('perkRetroJingle', 0.78, false, { cooldownKey: 'perk_purchase', cooldownMs: 900 });
            }
            else if (closestShop.type === 'PERK_RELOAD') {
              player.reloadMult = 0.5;
              showStatusToast('SPEED COLA ACTIVE: FASTER RELOAD', '#00ff88', 1900);
              showShopFeedback({ title: 'SPEED COLA ACTIVE', body: `${cost} points spent`, tone: 'ready', durationMs: 1800 });
              playUISound('perkRetroJingle', 0.78, false, { cooldownKey: 'perk_purchase', cooldownMs: 900 });
            }
			else if (closestShop.type === 'UPGRADE') {
              showStatusToast('PACK-A-PUNCH COMPLETE', '#ff66ff', 1900);
              showShopFeedback({ title: 'PACK-A-PUNCH COMPLETE', body: `${cost} points spent · damage, ammo, reload improved`, tone: 'ready', durationMs: 2000 });
              playUISound('arcadeSparklePing', 0.82, true, { cooldownKey: 'upgrade_complete', cooldownMs: 900, pitchMin: 1.08, pitchMax: 1.22 });
              const upgKey = activeW.key + "_UPG";
              const upgDef = WEAPON_DEFS[upgKey];
              camera.remove(activeW.meshGroup);
              player.inventory[player.currentWeaponIdx] = createWeaponInstance(upgDef);
              equipWeapon(player.currentWeaponIdx);
            }
            
// ── SHOP POST-USE CLEANUP / RELOCATION ──
            const gameplayPoints = getCurrentGameplayPoints();

            if (isWallBuy) {
              // Wall buys should stay mounted on the same wall so the owned weapon can buy ammo later.
            }
            else if (closestShop.type === 'AMMO') relocateShop(closestShop, gameplayPoints.AMMO_SPAWNS);
            else if (closestShop.type === 'HEALTH') relocateShop(closestShop, gameplayPoints.HEALTH_SPAWNS);
            else if (closestShop.type === 'UPGRADE') relocateShop(closestShop, gameplayPoints.UPGRADE_SPAWNS);
            else if (closestShop.type === 'PERK_HEALTH') {
              if (SINGLE_PLAYER_SHOP_CLEANUP) removeShop(closestShop);
              else relocateShop(closestShop, gameplayPoints.PERK_HEALTH_SPAWNS);
            }
            else if (closestShop.type === 'PERK_RELOAD') {
              if (SINGLE_PLAYER_SHOP_CLEANUP) removeShop(closestShop);
              else relocateShop(closestShop, gameplayPoints.PERK_RELOAD_SPAWNS);
            }
          } else {
            showNotEnoughPoints(cost, shopName);
          }
        }
      }
    }
  } else { setInteractionPrompt(false); }
}

export function giveMaxAmmo() {
  player.inventory.forEach(refillWeaponAmmo);
  const active = getActiveWeapon();
  updateAmmoHUD(active.ammo, active.reserve, active.maxAmmo);
}

// ── C3 WEAPON FEEL / FEEDBACK TUNING ──
// Visual-only tuning: keeps damage/economy/wave balance intact.
const WEAPON_FEEL = Object.freeze({
  PISTOL: {
    screenShake: 0.065, cameraKick: 0.018, yawKick: 0.010, gunPitch: -0.060, gunRoll: 0.020,
    recoilZ: 0.055, recoilY: 0.020, muzzleIntensity: 4.2, muzzleTime: 0.070, flashTime: 0.040, flashScale: 0.95,
    smokePower: 0.82, soundVolume: 0.58, pitchMin: 0.98, pitchMax: 1.08, crosshairBase: 15, crosshairKick: 16, impactPower: 0.85, adsRecoilMultiplier: 0.62
  },
  RIFLE: {
    screenShake: 0.075, cameraKick: 0.020, yawKick: 0.012, gunPitch: -0.050, gunRoll: 0.014,
    recoilZ: 0.060, recoilY: 0.026, muzzleIntensity: 4.8, muzzleTime: 0.072, flashTime: 0.038, flashScale: 1.05,
    smokePower: 0.95, soundVolume: 0.62, pitchMin: 0.94, pitchMax: 1.05, crosshairBase: 17, crosshairKick: 18, impactPower: 1.0, adsRecoilMultiplier: 0.58
  },
  SMG: {
    screenShake: 0.042, cameraKick: 0.010, yawKick: 0.018, gunPitch: -0.030, gunRoll: 0.018,
    recoilZ: 0.030, recoilY: 0.014, muzzleIntensity: 3.7, muzzleTime: 0.052, flashTime: 0.030, flashScale: 0.82,
    smokePower: 0.68, soundVolume: 0.47, pitchMin: 1.06, pitchMax: 1.22, crosshairBase: 19, crosshairKick: 13, impactPower: 0.72, adsRecoilMultiplier: 0.52
  },
  SHOTGUN: {
    screenShake: 0.19, cameraKick: 0.048, yawKick: 0.020, gunPitch: -0.125, gunRoll: 0.035,
    recoilZ: 0.150, recoilY: 0.050, muzzleIntensity: 7.2, muzzleTime: 0.105, flashTime: 0.055, flashScale: 1.45,
    smokePower: 1.55, soundVolume: 1.0, pitchMin: 0.86, pitchMax: 0.98, crosshairBase: 28, crosshairKick: 24, impactPower: 1.55, adsRecoilMultiplier: 0.64, pelletSpread: 0.048
  },
  SNIPER: {
    screenShake: 0.26, cameraKick: 0.070, yawKick: 0.030, gunPitch: -0.165, gunRoll: 0.045,
    recoilZ: 0.200, recoilY: 0.062, muzzleIntensity: 8.2, muzzleTime: 0.130, flashTime: 0.062, flashScale: 1.55,
    smokePower: 1.35, soundVolume: 0.92, pitchMin: 0.78, pitchMax: 0.92, crosshairBase: 20, crosshairKick: 32, impactPower: 1.75, adsRecoilMultiplier: 0.55
  }
});

let _lastDryFireAt = 0;

function getWeaponFeel(weapon) {
  const family = getWeaponFamily(weapon);
  const base = WEAPON_FEEL[family] || WEAPON_FEEL.PISTOL;

  if (!weapon?.isUpgraded) return base;

  return {
    ...base,
    screenShake: base.screenShake * 0.86,
    cameraKick: base.cameraKick * 0.80,
    yawKick: base.yawKick * 0.85,
    gunPitch: base.gunPitch * 0.82,
    gunRoll: base.gunRoll * 0.85,
    recoilZ: base.recoilZ * 0.82,
    recoilY: base.recoilY * 0.82,
    muzzleIntensity: base.muzzleIntensity * 1.18,
    flashScale: base.flashScale * 1.10,
    smokePower: base.smokePower * 0.85,
    soundVolume: Math.min(1, base.soundVolume * 0.96),
    crosshairKick: base.crosshairKick * 0.86,
    impactPower: base.impactPower * 1.12
  };
}

function isShotgunWeapon(weapon) {
  return getWeaponFamily(weapon) === 'SHOTGUN';
}

function triggerDryFireFeedback(weapon) {
  const now = performance.now();
  if (now - _lastDryFireAt < 420) return;
  _lastDryFireAt = now;

  showStatusToast((weapon?.reserve || 0) <= 0 ? 'NO AMMO' : 'RELOAD', '#ff5533', 700);
  playUISound('warning', 0.18, true, { cooldownKey: 'dry_fire_warning', cooldownMs: 380, pitchMin: 1.1, pitchMax: 1.25 });
}

function playShotSound(weapon, feel) {
  playWeaponSound(weapon.shootSound, feel.soundVolume, true, {
    cooldownKey: `weapon_${weapon.key}`,
    cooldownMs: isShotgunWeapon(weapon) ? 70 : 16,
    pitchMin: feel.pitchMin,
    pitchMax: feel.pitchMax
  });
}

function applyShotCameraAndGunKick(weapon, feel) {
  const adsMultiplier = player.isADS ? (feel.adsRecoilMultiplier ?? 0.62) : 1.0;

  addScreenShake(feel.screenShake * adsMultiplier);

  _recoilZ += feel.recoilZ * adsMultiplier;
  _recoilY += feel.recoilY * adsMultiplier;
  _recoilPitch += feel.gunPitch * adsMultiplier;
  _recoilYaw += (Math.random() - 0.5) * feel.yawKick * adsMultiplier;
  _recoilRoll += (Math.random() - 0.5) * feel.gunRoll * adsMultiplier;

  player.pitch += feel.cameraKick * adsMultiplier;
  player.yaw += (Math.random() - 0.5) * feel.yawKick * 0.45 * adsMultiplier;
}

function triggerMuzzleFeedback(weapon, feel, dir) {
  muzzleT = feel.muzzleTime;
  muzzleLight.intensity = feel.muzzleIntensity;
  muzzleLight.color.setHex(weapon.isUpgraded ? 0xdd00ff : 0xffaa00);

  flashVisibleT = feel.flashTime;
  const flashMesh = weapon.meshGroup.getObjectByName('muzzleFlashMesh');

  if (!flashMesh) {
    const fallbackTip = player.pos.clone().addScaledVector(dir, 0.75);
    spawnGunSmoke(fallbackTip, dir, feel.smokePower);
    return;
  }

  flashMesh.visible = true;
  flashMesh.rotation.z = Math.random() * Math.PI * 2;
  flashMesh.scale.setScalar(feel.flashScale * (0.82 + Math.random() * 0.36));

  const worldTipPos = new THREE.Vector3();
  flashMesh.getWorldPosition(worldTipPos);
  spawnGunSmoke(worldTipPos, dir, feel.smokePower);
}

function playHitConfirmFeedback({ headshot = false, killed = false, weapon = null } = {}) {
  showHitMarker({ headshot, kill: killed });

  const hitVolume = killed ? 0.50 : (headshot ? 0.45 : 0.33);
  const cooldownKey = killed ? 'bullet_kill_confirm' : (headshot ? 'bullet_head_confirm' : 'bullet_body_confirm');

  playWeaponSound('hit', hitVolume, true, {
    cooldownKey,
    cooldownMs: isShotgunWeapon(weapon) ? 42 : 20,
    pitchMin: headshot ? 1.12 : 0.96,
    pitchMax: killed ? 1.28 : 1.12
  });
}

function getHitFxDistance(pos) {
  if (!pos || !player?.pos || typeof player.pos.distanceTo !== 'function') return 0;
  return player.pos.distanceTo(pos);
}

function getWorldSurfaceNormal(hit) {
  if (hit.face?.normal && typeof hit.face.normal.copy === 'function') {
    _surfaceNormal.copy(hit.face.normal);
  } else {
    _surfaceNormal.set(0, 1, 0);
  }

  _surfaceNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
  return _surfaceNormal.applyMatrix3(_surfaceNormalMatrix).normalize();
}

function buildShotTargets() {
  _shotTargets.length = 0;

  for (let i = 0; i < activeEnemies.length; i++) {
    const enemy = activeEnemies[i];
    if (enemy?.mesh) _shotTargets.push(enemy.mesh);
  }

  for (let i = 0; i < mapMeshes.length; i++) {
    _shotTargets.push(mapMeshes[i]);
  }

  return _shotTargets;
}

function castFromCamera(offset, targets) {
  _rayHits.length = 0;
  ray.setFromCamera(offset, camera);
  ray.intersectObjects(targets, true, _rayHits);

  const hit = _rayHits.length > 0 ? _rayHits[0] : null;
  _rayHits.length = 0;
  return hit;
}

export function resetGunState() {
  clearScopedPresentation();
  fireCooldown = 0;
  muzzleT = 0;
  flashVisibleT = 0;
  lastInteractionUseAt = 0;
  barricadeRepairScoreThisRound = 0;
  barricadeRepairScoreWave = currentWave;
  _lastDryFireAt = 0;
  _recoilZ = 0;
  _recoilY = 0;
  _recoilPitch = 0;
  _recoilYaw = 0;
  _recoilRoll = 0;
  bobT = 0;

  hideShopFeedback();
  setInteractionPrompt(false);

  const reloadWrap = document.getElementById('reload-wrap');
  if (reloadWrap) reloadWrap.style.display = 'none';

  const reloadBar = document.getElementById('reload-bar');
  if (reloadBar) reloadBar.style.width = '0%';

  const active = getActiveWeapon();
  if (active) {
    active.reloading = false;
    active.reloadT = 0;

    const flashMesh = active.meshGroup?.getObjectByName?.("muzzleFlashMesh");
    if (flashMesh) flashMesh.visible = false;
  }
}

// ── SHOOTING SYSTEM ──
export function shoot() {
  const w = getActiveWeapon();
  if (!player.alive || w.reloading || fireCooldown > 0) return;

  if (w.ammo <= 0) {
    triggerDryFireFeedback(w);
    startReload();
    return;
  }

  const feel = getWeaponFeel(w);

  w.ammo--;
  updateAmmoHUD(w.ammo, w.reserve, w.maxAmmo);
  fireCooldown = w.fireRate;

  recordDirectorShot({
    weaponFamily: getWeaponFamily(w),
    isADS: player.isADS
  });

  playShotSound(w, feel);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  spawnShell(player.pos, dir);

  triggerMuzzleFeedback(w, feel, dir);
  applyShotCameraAndGunKick(w, feel);

  // C5: reuse raycast arrays/vectors instead of allocating new arrays every shot.
  const hitTargets = buildShotTargets();
  const shotContext = { weapon: w, feel, scoredEnemies: new Set(), directorHitRegistered: false };

  if (isShotgunWeapon(w)) {
    const pelletCount = getShotgunPelletCount(w);
    const pelletSpread = getShotgunPelletSpread(w, feel);

    for (let i = 0; i < pelletCount; i++) {
      _pelletShotOffset.set(
        (Math.random() - 0.5) * pelletSpread,
        (Math.random() - 0.5) * pelletSpread
      );

      const hit = castFromCamera(_pelletShotOffset, hitTargets);
      if (hit) processHit(hit, shotContext);
    }
  } else {
    const hit = castFromCamera(_centerShotOffset, hitTargets);
    if (hit) processHit(hit, shotContext);
  }

  if (w.ammo <= 0) startReload();
}


function processHit(hit, shotContext = {}) {
  const e = hit.object.userData.eRef;
  const w = shotContext.weapon || getActiveWeapon();
  const feel = shotContext.feel || getWeaponFeel(w);

  if (e && e.alive) {
    let hs = hit.object.userData.isHead;

    // GLTF HEIGHT-BASED HEADSHOT DETECTION
    if (!hs) {
      const hitHeight = hit.point.y - e.mesh.position.y;
      const headThreshold = e.type === 'GOLIATH' ? 3.8 : (e.type === 'CRAWLER' ? 0.95 : 2.00);
      if (hitHeight > headThreshold) {
        hs = true;
      }
    }

    const baseDamage = w.damage;
    const isInstaKill = player.instaKillTimer > 0;
    const damageScale = getDamageDistanceScale(w, hit.point);
    const headshotMult = getHeadshotMultiplier(w);
    const finalDamage = isInstaKill
      ? 9999
      : Math.max(1, Math.round(baseDamage * damageScale * (hs ? headshotMult : 1)));
    const wasHealth = e.health;
    const killed = wasHealth > 0 && wasHealth - finalDamage <= 0;

    e.health -= finalDamage;

    const heavyStaggerScale = e.type === 'GOLIATH'
      ? 0.48
      : (e.type === 'BRUTE' ? 0.68 : 1.0);

    e.hitReactT = (hs ? 0.24 : 0.17) * heavyStaggerScale;
    e.hitReactDir = hit.point.x < e.mesh.position.x ? 1 : -1;

    // C4: shotgun pellets can hit the same enemy multiple times, but point farming should stay sane.
    const alreadyScoredThisShot = shotContext.scoredEnemies?.has(e);
    if (!alreadyScoredThisShot) shotContext.scoredEnemies?.add(e);

    const killReward = killed ? getEnemyPointReward(e, hs) : null;
    let pointsAwarded = killReward ? killReward.basePoints : (alreadyScoredThisShot ? 0 : 10);

    if (player.doublePointsTimer > 0) pointsAwarded *= 2;

    if (pointsAwarded > 0) {
      player.score = (player.score || 0) + pointsAwarded;
      const killScoreLabel = killReward
        ? (hs ? `${killReward.label.toUpperCase()} HEADSHOT` : killReward.label.toUpperCase())
        : '';

      spawnFloatingScore(pointsAwarded, killed && hs, killScoreLabel);
      updateScoreHUD(player.score);
    }

    playHitConfirmFeedback({ headshot: hs, killed, weapon: w });

    const fxDistance = getHitFxDistance(hit.point);

    // Register at most one successful hit per trigger pull. This keeps shotgun
    // pellets from inflating the director's accuracy model.
    if (!shotContext.directorHitRegistered) {
      shotContext.directorHitRegistered = true;
      recordDirectorHit({
        distance: fxDistance,
        headshot: hs,
        enemyType: e.type,
        weaponFamily: getWeaponFamily(w)
      });
    }

    const bloodDistanceScale = fxDistance > 30 ? 0 : (fxDistance > 20 ? 0.45 : 1.0);
    if (bloodDistanceScale > 0) {
      spawnBloodBurst(hit.point, (killed ? 1.45 : (hs ? 1.22 : 1.0)) * bloodDistanceScale, hs);
    }

    if (killed) {
      if (killReward?.bonusPoints > 0) {
        let bossBounty = killReward.bonusPoints;
        if (player.doublePointsTimer > 0) bossBounty *= 2;

        player.score += bossBounty;
        updateScoreHUD(player.score);
        spawnFloatingScore(bossBounty, false, 'ELITE BOUNTY');
      }

      if (killReward && e.type !== 'SHAMBLER') {
        showStatusToast(killReward.toast, killReward.color, e.type === 'GOLIATH' ? 1800 : 1000);
      } else if (hs) {
        showStatusToast('HEADSHOT KILL', '#ff5533', 650);
      }

      recordDirectorKill({
        enemyType: e.type,
        weaponFamily: getWeaponFamily(w),
        headshot: hs
      });

      killEnemy(e);
    }
  } else if (!e) {
    const normal = getWorldSurfaceNormal(hit);
    const fxDistance = getHitFxDistance(hit.point);

    // Keep distant hits readable through the screen hit marker/audio, but avoid
    // far world particles blooming into large square cards on walls or props.
    if (fxDistance <= 34) {
      spawnBulletHole(hit.point, normal);
    }

    if (fxDistance <= 22) {
      const sparkDistanceScale = Math.max(0.35, 1 - fxDistance / 28);
      spawnImpactSpark(hit.point, normal, feel.impactPower * sparkDistanceScale);
    }
  }
}


export function startReload() {
  const w = getActiveWeapon();
  if (w.reloading || w.ammo === w.maxAmmo || w.reserve <= 0) return;

  const totalReloadDuration = w.reloadDuration * player.reloadMult;

  playWeaponReloadSound(
    getWeaponFamily(w),
    totalReloadDuration,
    0.78,
    {
      cooldownKey: `reload_start_${w.key}`,
      cooldownMs: 120
    }
  );

  w.reloading = true;
  w.reloadT = totalReloadDuration;

  const reloadWrap = document.getElementById('reload-wrap');
  if (reloadWrap) reloadWrap.style.display = 'block';
}

export function processReloadTick(dt) {
  const w = getActiveWeapon();
  if (!w || !w.reloading) return;

  w.reloadT -= dt;
  const totalReloadTime = w.reloadDuration * player.reloadMult;
  const reloadBar = document.getElementById('reload-bar');
  if (reloadBar) reloadBar.style.width = Math.min(100, (1 - w.reloadT / totalReloadTime) * 100) + '%';

  if (w.reloadT <= 0) {
    const need = w.maxAmmo - w.ammo;
    const give = Math.min(need, w.reserve);
    w.ammo += give;
    w.reserve -= give;
    w.reloading = false;

    const reloadWrap = document.getElementById('reload-wrap');
    if (reloadWrap) reloadWrap.style.display = 'none';

    updateAmmoHUD(w.ammo, w.reserve, w.maxAmmo);
  }
}


let _recoilZ = 0, _recoilY = 0, _recoilPitch = 0, _recoilYaw = 0, _recoilRoll = 0, bobT = 0; 
const _currentGunTarget = new THREE.Vector3();
const _gunPoseTarget = new THREE.Vector3();
const _gunRotTarget = new THREE.Vector3();
const _zeroGunRot = new THREE.Vector3();

export function updateGun(dt, keys, isMoving) {
  if (player.instaKillTimer > 0) player.instaKillTimer = Math.max(0, player.instaKillTimer - dt);
  if (player.doublePointsTimer > 0) player.doublePointsTimer = Math.max(0, player.doublePointsTimer - dt);

  const w = getActiveWeapon();
  updateCombatStatusHUD(player, w);
  if (!w) {
    clearScopedPresentation();
    return;
  }

  updateProceduralHandVisibility(w);

  const sniperScopeActive = Boolean(
    player.isADS &&
    w.meshGroup?.userData?.isProceduralWeapon &&
    w.meshGroup.userData.weaponFamily === 'SNIPER'
  );

  player.currentADSFOV = sniperScopeActive ? sniperScopeFOV : null;
  setSniperScopeOverlayVisible(sniperScopeActive);

  // The scope overlay provides the view. Hide the weapon model while scoped.
  if (w.meshGroup) w.meshGroup.visible = !sniperScopeActive;

  if (fireCooldown > 0) fireCooldown -= dt;

  const targetPos = _gunPoseTarget.copy(player.isADS ? w.adsPos : w.basePos);
  const targetRot = _gunRotTarget.copy(player.isADS ? (w.adsRot || _zeroGunRot) : (w.baseRot || _zeroGunRot));

  if (!player.isADS && w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'PISTOL') {
    const wideFovT = THREE.MathUtils.clamp(((player.baseFOV || 82) - 82) / 18, 0, 1);

    // C9.2 micro 6: Micro5 had the right anchored direction, but was pushed
    // slightly too far down/right at 100 FOV. Pull it back toward the screen
    // just enough while keeping the bottom-right FPS pistol feel.
    targetPos.x += wideFovT * 0.175;
    targetPos.y -= wideFovT * 0.385;
    targetPos.z += wideFovT * 0.075;

    // Keep forward-facing. Only tiny pose correction at high FOV.
    targetRot.x -= wideFovT * 0.008;
    targetRot.y -= wideFovT * 0.012;
    targetRot.z += wideFovT * 0.008;
  }

  if (!player.isADS && w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SMG') {
    const wideFovT = THREE.MathUtils.clamp(((player.baseFOV || 82) - 82) / 18, 0, 1);

    // C9.4: keep procedural SMG anchored lower-right at wide FOV without
    // turning it away from the crosshair.
    targetPos.x += wideFovT * 0.145;
    targetPos.y -= wideFovT * 0.255;
    targetPos.z += wideFovT * 0.045;

    targetRot.x -= wideFovT * 0.010;
    targetRot.y -= wideFovT * 0.015;
    targetRot.z += wideFovT * 0.010;
  }

  if (!player.isADS && w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'RIFLE') {
    const wideFovT = THREE.MathUtils.clamp(((player.baseFOV || 82) - 82) / 18, 0, 1);

    targetPos.x += wideFovT * 0.150;
    targetPos.y -= wideFovT * 0.285;
    targetPos.z += wideFovT * 0.050;

    targetRot.x -= wideFovT * 0.010;
    targetRot.y -= wideFovT * 0.012;
    targetRot.z += wideFovT * 0.010;
  }

  if (!player.isADS && w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SHOTGUN') {
    const wideFovT = THREE.MathUtils.clamp(((player.baseFOV || 82) - 82) / 18, 0, 1);

    targetPos.x += wideFovT * 0.160;
    targetPos.y -= wideFovT * 0.300;
    targetPos.z += wideFovT * 0.045;

    targetRot.x -= wideFovT * 0.012;
    targetRot.y -= wideFovT * 0.012;
    targetRot.z += wideFovT * 0.012;
  }


  if (!player.isADS && w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SNIPER') {
    const wideFovT = THREE.MathUtils.clamp(((player.baseFOV || 82) - 82) / 18, 0, 1);

    targetPos.x += wideFovT * 0.170;
    targetPos.y -= wideFovT * 0.315;
    targetPos.z += wideFovT * 0.055;

    targetRot.x -= wideFovT * 0.012;
    targetRot.y -= wideFovT * 0.012;
    targetRot.z += wideFovT * 0.012;
  }

  if (w.reloading) {
    const totalTime = w.reloadDuration * player.reloadMult;
    const progress = 1.0 - (w.reloadT / totalTime);
    
    const dip = Math.sin(progress * Math.PI); 
    const twist = Math.sin(progress * Math.PI * 2); 

    targetPos.y -= dip * 0.15;
    targetPos.x += dip * 0.1;
    targetPos.z += dip * 0.05;

    if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'PISTOL') {
      updateProceduralPistolReloadParts(w, progress);

      targetRot.z += dip * 0.22;
      targetRot.x += dip * 0.18;
      targetRot.y += twist * 0.04;
    } else if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SMG') {
      updateProceduralSMGReloadParts(w, progress);

      targetRot.z += dip * 0.18;
      targetRot.x += dip * 0.15;
      targetRot.y += twist * 0.035;
    } else if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'RIFLE') {
      updateProceduralRifleReloadParts(w, progress);

      targetRot.z += dip * 0.19;
      targetRot.x += dip * 0.15;
      targetRot.y += twist * 0.035;
    } else if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SHOTGUN') {
      updateProceduralShotgunReloadParts(w, progress);

      targetRot.z += dip * 0.21;
      targetRot.x += dip * 0.17;
      targetRot.y += twist * 0.040;
    } else if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SNIPER') {
      updateProceduralSniperReloadParts(w, progress);

      targetRot.z += dip * 0.23;
      targetRot.x += dip * 0.18;
      targetRot.y += twist * 0.042;
    } else {
      targetRot.z += dip * (Math.PI / 4);
      targetRot.x += dip * (Math.PI / 6);
      targetRot.y += twist * 0.08;
    }        
  } 
  else {
    if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'PISTOL') {
      resetProceduralPistolParts(w, dt);
    } else if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SMG') {
      resetProceduralSMGParts(w, dt);

      const smgFeel = getWeaponFeel(w);
      const firePulse = muzzleT > 0
        ? THREE.MathUtils.clamp(muzzleT / Math.max(0.001, smgFeel.muzzleTime), 0, 1)
        : 0;
      updateProceduralSMGFireParts(w, firePulse);
    } else if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'RIFLE') {
      resetProceduralRifleParts(w, dt);

      const rifleFeel = getWeaponFeel(w);
      const firePulse = muzzleT > 0
        ? THREE.MathUtils.clamp(muzzleT / Math.max(0.001, rifleFeel.muzzleTime), 0, 1)
        : 0;
      updateProceduralRifleFireParts(w, firePulse);
    } else if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SHOTGUN') {
      resetProceduralShotgunParts(w, dt);

      const shotgunFeel = getWeaponFeel(w);
      const firePulse = muzzleT > 0
        ? THREE.MathUtils.clamp(muzzleT / Math.max(0.001, shotgunFeel.muzzleTime), 0, 1)
        : 0;
      updateProceduralShotgunFireParts(w, firePulse);
    } else if (w.meshGroup?.userData?.isProceduralWeapon && w.meshGroup.userData.weaponFamily === 'SNIPER') {
      resetProceduralSniperParts(w, dt);

      const sniperFeel = getWeaponFeel(w);
      const firePulse = muzzleT > 0
        ? THREE.MathUtils.clamp(muzzleT / Math.max(0.001, sniperFeel.muzzleTime), 0, 1)
        : 0;
      updateProceduralSniperFireParts(w, firePulse);
    }
  }
  if (isMoving && !player.isADS) { 
    const bobSpeed = player.isSprinting ? 11 : 7; 
    const bobAmount = player.isSprinting ? 0.025 : 0.013;
    bobT += dt * bobSpeed; 
    targetPos.y += Math.sin(bobT) * bobAmount; 
    targetPos.x += Math.cos(bobT * 0.5) * (bobAmount * 0.5); 
  } else { 
    bobT = 0; 
  }

  _currentGunTarget.lerp(targetPos, dt * 12);
  _recoilZ += (0 - _recoilZ) * 12 * dt;
  _recoilY += (0 - _recoilY) * 12 * dt;
  _recoilPitch += (0 - _recoilPitch) * 13 * dt;
  _recoilYaw += (0 - _recoilYaw) * 13 * dt;
  _recoilRoll += (0 - _recoilRoll) * 13 * dt;
  w.meshGroup.position.set(_currentGunTarget.x, _currentGunTarget.y + _recoilY, _currentGunTarget.z + _recoilZ);

  w.meshGroup.rotation.x += ((targetRot.x + _recoilPitch) - w.meshGroup.rotation.x) * 15 * dt;
  w.meshGroup.rotation.y += ((targetRot.y + _recoilYaw) - w.meshGroup.rotation.y) * 15 * dt;
  w.meshGroup.rotation.z += ((targetRot.z + _recoilRoll) - w.meshGroup.rotation.z) * 15 * dt;

  if (muzzleT > 0) {
    const feel = getWeaponFeel(w);
    muzzleT -= dt;
    muzzleLight.intensity = Math.max(0, (muzzleT / Math.max(0.001, feel.muzzleTime)) * feel.muzzleIntensity);
    if (muzzleT <= 0) muzzleLight.intensity = 0;
  }
  if (flashVisibleT > 0) {
    flashVisibleT -= dt;
    if (flashVisibleT <= 0) {
      const flashMesh = w.meshGroup.getObjectByName("muzzleFlashMesh");
      if (flashMesh) flashMesh.visible = false; 
    }
  }

  if (w.isAutomatic && keys['MousedownLeft'] && player.alive && !w.reloading) { shoot(); }
  updateCrosshair(dt, isMoving);
}

function updateCrosshair(dt, isMoving) {
  const chUI = document.getElementById('crosshair');
  if (!chUI) return;

  if (player.isADS) {
    chUI.style.opacity = '0';
    return;
  }

  chUI.style.opacity = '1';

  const activeWeapon = getActiveWeapon();
  const feel = getWeaponFeel(activeWeapon);
  let targetGap = feel.crosshairBase;

  if (player.isSprinting && isMoving) targetGap += 15;
  else if (isMoving) targetGap += 7;

  if (muzzleT > 0) targetGap += feel.crosshairKick;

  let currentGap = parseFloat(getComputedStyle(chUI).getPropertyValue('--gap')) || feel.crosshairBase;
  currentGap += (targetGap - currentGap) * dt * 15;
  chUI.style.setProperty('--gap', currentGap + 'px');

  chUI.classList.toggle('crosshair-firing', muzzleT > 0);
  chUI.classList.toggle('crosshair-shotgun', isShotgunWeapon(activeWeapon));
  chUI.classList.toggle('crosshair-upgraded', Boolean(activeWeapon?.isUpgraded));
}


// ── MYSTERY BOX ANIMATION SYSTEM ──
export function updateShops(dt) {
  activeShops.forEach(shop => {
    if (shop.type === 'MYSTERY_BOX') {
      if (['SPINNING', 'READY', 'TEDDY'].includes(shop.state) && !isPlayerNearShop(shop)) {
        hideMysteryFeedbackForShop(shop);
      }

      if (shop.state === 'SPINNING') {
        shop.timer -= dt;
        shop.cycleTimer -= dt;
        
        // Spin the hologram
        shop.spinMesh.rotation.y += dt * 8.0; 
        shop.spinMesh.position.y = 1.2 + Math.sin(Date.now() * 0.01) * 0.15; 
        
        // Cycle the random weapons every 0.12 seconds
        if (shop.cycleTimer <= 0) {
          shop.cycleTimer = 0.12;
          shop.spinMesh.clear();
          
          const randKey = getPreviewWeaponKey();
          shop.spinMesh.add(getHologramMesh(randKey));
          playWorldSound('mysteryTick', 0.045, false, { cooldownKey: 'mystery_tick', cooldownMs: 80 }); 
        }
        
        // When the 4 second spin ends, roll for a gun or a Teddy Bear
        if (shop.timer <= 0) {
          // 15% Chance to roll the Teddy Bear!
          if (Math.random() < 0.15) {
            shop.state = 'TEDDY';
            shop.timer = 3.5; 
            shop.spinMesh.clear();
            shop.spinMesh.add(getTeddyMesh());
            showStatusToast('TEDDY BEAR! BOX MOVING...', '#ff66ff', 2200);
            showMysteryFeedbackIfNear(shop, {
              title: 'TEDDY BEAR',
              body: 'Refund incoming · box is relocating',
              tone: 'mystery',
              durationMs: 0,
              progress: 1
            });
            playWorldSound('teddy', 0.55, true, { cooldownKey: 'mystery_teddy', cooldownMs: 500 });
          } else {
            // Roll a final weapon
            shop.state = 'READY';
            shop.timer = MYSTERY_BOX_READY_TIME; 
            shop.spinMesh.clear();
            
            const finalKey = rollMysteryWeaponKey(shop.lastUnclaimedWeaponKey);
            shop.finalWeapon = WEAPON_DEFS[finalKey];
            shop.lastUnclaimedWeaponKey = finalKey;
            
            const finalMesh = getHologramMesh(finalKey);
            finalMesh.traverse((child) => {
              if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.5 });
            });
            shop.spinMesh.add(finalMesh);
            showStatusToast(`${shop.finalWeapon.name} READY`, '#ffaa00', 1600);
            showMysteryFeedbackIfNear(shop, {
              title: 'MYSTERY BOX READY',
              body: `${shop.finalWeapon.name} ready · press [E] before it expires`,
              tone: 'ready',
              durationMs: 0,
              progress: 1
            });
            playWorldSound('mysteryReady', 0.75, false, { cooldownKey: 'mystery_ready', cooldownMs: 500 }); 
          }
        }
      } 
      // ── TEDDY BEAR TELEPORT SEQUENCE ──
      else if (shop.state === 'TEDDY') {
        shop.timer -= dt;
        shop.spinMesh.position.y += dt * 0.5; // Float up into the air
        shop.spinMesh.rotation.y += dt * 6.0; // Spin violently
        
        if (shop.timer <= 0) {
          import('./player.js').then(({ player }) => {
              player.score += ECONOMY.MYSTERY_BOX_COST; // Refund the player
            import('./ui.js').then(({ updateScoreHUD, spawnFloatingScore }) => {
              updateScoreHUD(player.score);
              spawnFloatingScore(ECONOMY.MYSTERY_BOX_COST, false);
              showStatusToast(`REFUNDED ${ECONOMY.MYSTERY_BOX_COST} PTS`, '#ffaa00', 1600);
            });
          });
          
          clearMysteryReadyWeapon(shop, { clearUnclaimed: true });

          // Move the Mystery Box using the same safe relocation system as every other shop.
          const movedBox = relocateShop(shop, getCurrentGameplayPoints().BOX_SPAWNS);
          if (movedBox?.pos) {
            showMysteryFeedbackIfNear(movedBox, {
              title: 'MYSTERY BOX MOVED',
              body: describeShopSignal(movedBox.pos),
              tone: 'mystery',
              durationMs: 2400
            });
          }
        }
      }
      else if (shop.state === 'READY') {
        shop.timer -= dt;
        shop.spinMesh.rotation.y += dt * 1.5; 
        shop.spinMesh.position.y = 1.2 + Math.sin(Date.now() * 0.003) * 0.1;
        
        if (shop.timer <= 0) {
          clearMysteryReadyWeapon(shop, { rememberUnclaimed: true });
          showMysteryFeedbackIfNear(shop, {
            title: 'MYSTERY BOX CLOSED',
            body: 'The weapon timed out. Next roll will avoid the skipped weapon.',
            tone: 'warning',
            durationMs: 1800
          });
        }
      }
    }
  });
}

function getHologramMesh(weaponKey = 'RIFLE') {
  const key = String(weaponKey || 'RIFLE').replace('_UPG', '');
  let mesh;

  if (key === 'PISTOL') {
    mesh = createProceduralPistolMesh({ upgraded: false });
  } else if (key === 'SMG') {
    mesh = createProceduralSMGMesh({ upgraded: false });
  } else if (key === 'SHOTGUN') {
    mesh = createProceduralShotgunMesh({ upgraded: false });
  } else if (key === 'SNIPER') {
    mesh = createProceduralSniperMesh({ upgraded: false });
  } else {
    mesh = createProceduralRifleMesh({ upgraded: false });
  }

  mesh.userData.isShopHologram = true;
  mesh.scale.setScalar(key === 'SNIPER' ? 0.86 : (key === 'SHOTGUN' ? 1.0 : 0.95));

  // Keep shop previews lightweight and consistent.
  mesh.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = false;

    if (child.name === 'muzzleFlashMesh') {
      child.visible = false;
    }
  });

  return mesh;
}


// ── PROCEDURAL TEDDY BEAR ──
function getTeddyMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 1.0 });
  
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.2), mat);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat);
  head.position.y = 0.25;
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat);
  earL.position.set(-0.12, 0.35, 0);
  const earR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat);
  earR.position.set(0.12, 0.35, 0);
  
  g.add(body, head, earL, earR);
  return g;
}
