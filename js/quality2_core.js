// QUALITY.2 R1 — consolidated Low-GPU rendering optimization core.
export const QUALITY2_PATCH = 'quality2-r1-consolidated-low-gpu-rendering';
export const QUALITY2_PRODUCT_VERSION = '1.10.0-quality2-r1';
export const QUALITY2_RELEASE_SEQUENCE = 2026072202;

export const QUALITY2_FEATURES = Object.freeze({
  ZOMBIE_DETAIL: 'zombieDetail',
  MATERIAL_TIER: 'materialTier',
  PARTICLE_BUDGET: 'particleBudget',
  ANTIALIAS: 'antialias'
});

const QUALITY2_FEATURE_STORAGE_KEYS = Object.freeze({
  [QUALITY2_FEATURES.ZOMBIE_DETAIL]: 'ka_quality2_zombie_detail',
  [QUALITY2_FEATURES.MATERIAL_TIER]: 'ka_quality2_material_tier',
  [QUALITY2_FEATURES.PARTICLE_BUDGET]: 'ka_quality2_particle_budget',
  [QUALITY2_FEATURES.ANTIALIAS]: 'ka_quality2_antialias'
});

export const QUALITY2_FULL_PARTICLE_LIMITS = Object.freeze({
  decals: 110,
  blood: 56,
  bloodMist: 18,
  shells: 28,
  smoke: 24,
  sparks: 64,
  impactDust: 24,
  muzzleFlash: 16,
  shockRings: 14,
  electricArcs: 20,
  enemyWarnings: 14,
  enemyTrails: 34,
  enemyImpacts: 18
});

export const QUALITY2_LOW_PARTICLE_LIMITS = Object.freeze({
  decals: 36,
  blood: 18,
  bloodMist: 1,
  shells: 10,
  smoke: 8,
  sparks: 18,
  impactDust: 8,
  muzzleFlash: 6,
  shockRings: 5,
  electricArcs: 7,
  enemyWarnings: 8,
  enemyTrails: 10,
  enemyImpacts: 7
});

const LOW_ZOMBIE_CORE_PARTS = new Set([
  'procedural_zombie_torso',
  'procedural_zombie_shoulders',
  'procedural_zombie_pelvis',
  'procedural_zombie_neck',
  'procedural_zombie_head',
  'procedural_zombie_lower_jaw',
  'procedural_zombie_mouth',
  'procedural_zombie_left_eye_glow',
  'procedural_zombie_right_eye_glow',
  'procedural_zombie_left_arm',
  'procedural_zombie_right_arm',
  'procedural_zombie_left_sleeve',
  'procedural_zombie_right_sleeve',
  'procedural_zombie_left_upper_arm',
  'procedural_zombie_right_upper_arm',
  'procedural_zombie_left_forearm',
  'procedural_zombie_right_forearm',
  'procedural_zombie_left_hand',
  'procedural_zombie_right_hand',
  'procedural_zombie_left_leg',
  'procedural_zombie_right_leg',
  'procedural_zombie_left_thigh',
  'procedural_zombie_right_thigh',
  'procedural_zombie_left_shin',
  'procedural_zombie_right_shin',
  'procedural_zombie_left_bare_foot',
  'procedural_zombie_right_bare_foot'
]);

const LOW_ZOMBIE_ARCHETYPE_PARTS = new Set([
  'procedural_zombie_toxic_chest_node',
  'procedural_zombie_goliath_chest_plate',
  'procedural_zombie_goliath_left_pauldron',
  'procedural_zombie_goliath_right_pauldron',
  'procedural_zombie_containment_canister',
  'procedural_zombie_containment_canister_glow',
  'procedural_zombie_hazard_chest_bar',
  'procedural_zombie_jaw_guard',
  'procedural_zombie_exploder_core',
  'procedural_zombie_exploder_core_glow',
  'procedural_zombie_ranged_face_band',
  'procedural_zombie_ranged_lens',
  'procedural_zombie_runner_spike_a',
  'procedural_zombie_runner_spike_b',
  'procedural_zombie_left_forearm_guard',
  'procedural_zombie_right_forearm_guard',
  'procedural_zombie_left_claw_plate',
  'procedural_zombie_right_claw_plate'
]);

export function normalizeQuality2GraphicsMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  return value === 'low' || value === 'medium' || value === 'high' || value === 'auto'
    ? value
    : 'auto';
}

export function guessQuality2AutoTier(profile = {}) {
  const mobile = profile.mobile === true;
  const consoleBrowser = profile.consoleBrowser === true;
  const cores = Math.max(1, Number(profile.cores) || 4);
  const memory = Math.max(0, Number(profile.memory) || 0) || 4;
  const dpr = Math.max(0.5, Number(profile.dpr) || 1);

  if (mobile || consoleBrowser) return 'low';
  if (cores <= 4 && memory <= 4 && dpr > 1.6) return 'low';
  if (cores >= 8 && memory >= 8 && dpr <= 2.25) return 'high';
  if (cores >= 6 || memory >= 4) return 'medium';
  return 'low';
}

export function resolveQuality2InitialTier(requestedMode, profile = {}) {
  const requested = normalizeQuality2GraphicsMode(requestedMode);
  return requested === 'auto' ? guessQuality2AutoTier(profile) : requested;
}

export function isQuality2LowTier(effectiveQuality) {
  return String(effectiveQuality || '').toLowerCase() === 'low';
}

export function isQuality2FeatureEnabled(storage, feature) {
  const key = QUALITY2_FEATURE_STORAGE_KEYS[feature];
  if (!key) return true;
  try {
    return String(storage?.getItem?.(key) || 'on').toLowerCase() !== 'off';
  } catch {
    return true;
  }
}

export function setQuality2FeatureEnabled(storage, feature, enabled) {
  const key = QUALITY2_FEATURE_STORAGE_KEYS[feature];
  if (!key) return false;
  try {
    storage?.setItem?.(key, enabled === false ? 'off' : 'on');
    return true;
  } catch {
    return false;
  }
}

export function resetQuality2FeatureOverrides(storage) {
  Object.values(QUALITY2_FEATURE_STORAGE_KEYS).forEach((key) => {
    try { storage?.removeItem?.(key); } catch { /* Ignore restricted storage. */ }
  });
}

export function shouldQuality2EnableAntialias(effectiveQuality, featureEnabled = true) {
  if (featureEnabled === false) return true;
  return !isQuality2LowTier(effectiveQuality);
}

export function quality2NeedsReload(startupQuality, effectiveQuality, startupAntialias, desiredAntialias) {
  const crossedLowBoundary = isQuality2LowTier(startupQuality) !== isQuality2LowTier(effectiveQuality);
  const antialiasChanged = Boolean(startupAntialias) !== Boolean(desiredAntialias);
  return crossedLowBoundary || antialiasChanged;
}

export function getQuality2ParticleLimits(effectiveQuality, featureEnabled = true) {
  const source = isQuality2LowTier(effectiveQuality) && featureEnabled !== false
    ? QUALITY2_LOW_PARTICLE_LIMITS
    : QUALITY2_FULL_PARTICLE_LIMITS;
  return Object.freeze({ ...source });
}

export function classifyQuality2ZombiePart(name) {
  const value = String(name || '');
  if (LOW_ZOMBIE_CORE_PARTS.has(value)) return 'core';
  if (LOW_ZOMBIE_ARCHETYPE_PARTS.has(value)) return 'archetype';
  return 'detail';
}

export function shouldQuality2ShowZombiePart(name, effectiveQuality, featureEnabled = true) {
  if (!isQuality2LowTier(effectiveQuality) || featureEnabled === false) return true;
  return classifyQuality2ZombiePart(name) !== 'detail';
}

export function getQuality2MaterialTier(effectiveQuality, featureEnabled = true) {
  return isQuality2LowTier(effectiveQuality) && featureEnabled !== false ? 'lambert' : 'standard';
}

export function isLikelySoftwareRenderer(rendererIdentity) {
  return /swiftshader|llvmpipe|software adapter|software raster|basic render|basic display|\bwarp\b/i.test(
    String(rendererIdentity || '')
  );
}

export function summarizeQuality2Features(storage) {
  return Object.freeze(Object.fromEntries(
    Object.values(QUALITY2_FEATURES).map((feature) => [
      feature,
      isQuality2FeatureEnabled(storage, feature)
    ])
  ));
}
