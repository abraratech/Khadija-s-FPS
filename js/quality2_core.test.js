import assert from 'node:assert/strict';
import {
  QUALITY2_FEATURES,
  QUALITY2_FULL_PARTICLE_LIMITS,
  QUALITY2_LOW_PARTICLE_LIMITS,
  QUALITY2_PATCH,
  QUALITY2_PRODUCT_VERSION,
  QUALITY2_RELEASE_SEQUENCE,
  classifyQuality2ZombiePart,
  getQuality2MaterialTier,
  getQuality2ParticleLimits,
  guessQuality2AutoTier,
  isLikelySoftwareRenderer,
  isQuality2FeatureEnabled,
  normalizeQuality2GraphicsMode,
  quality2NeedsReload,
  resolveQuality2InitialTier,
  setQuality2FeatureEnabled,
  shouldQuality2EnableAntialias,
  shouldQuality2ShowZombiePart
} from './quality2_core.js';

assert.equal(QUALITY2_PATCH, 'quality2-r1-consolidated-low-gpu-rendering');
assert.equal(QUALITY2_PRODUCT_VERSION, '1.10.0-quality2-r1');
assert.equal(QUALITY2_RELEASE_SEQUENCE, 2026072202);
assert.equal(normalizeQuality2GraphicsMode('LOW'), 'low');
assert.equal(normalizeQuality2GraphicsMode('invalid'), 'auto');
assert.equal(guessQuality2AutoTier({ consoleBrowser: true, cores: 8, memory: 8, dpr: 1 }), 'low');
assert.equal(guessQuality2AutoTier({ cores: 8, memory: 16, dpr: 1 }), 'high');
assert.equal(resolveQuality2InitialTier('medium', {}), 'medium');
assert.equal(resolveQuality2InitialTier('auto', { mobile: true }), 'low');
assert.equal(shouldQuality2EnableAntialias('low'), false);
assert.equal(shouldQuality2EnableAntialias('medium'), true);
assert.equal(shouldQuality2EnableAntialias('low', false), true);
assert.equal(quality2NeedsReload('medium', 'low', true, false), true);
assert.equal(quality2NeedsReload('low', 'high', false, true), true);
assert.equal(quality2NeedsReload('medium', 'high', true, true), false);
assert.equal(quality2NeedsReload('high', 'medium', true, true), false);
assert.equal(quality2NeedsReload('low', 'low', false, false), false);
assert.equal(quality2NeedsReload('low', 'low', false, true), true);
assert.deepEqual(getQuality2ParticleLimits('low'), QUALITY2_LOW_PARTICLE_LIMITS);
assert.deepEqual(getQuality2ParticleLimits('high'), QUALITY2_FULL_PARTICLE_LIMITS);
assert.equal(QUALITY2_LOW_PARTICLE_LIMITS.blood < QUALITY2_FULL_PARTICLE_LIMITS.blood, true);
assert.equal(QUALITY2_LOW_PARTICLE_LIMITS.bloodMist, 1);
assert.equal(classifyQuality2ZombiePart('procedural_zombie_torso'), 'core');
assert.equal(classifyQuality2ZombiePart('procedural_zombie_ranged_lens'), 'archetype');
assert.equal(classifyQuality2ZombiePart('procedural_zombie_tooth_a'), 'detail');
assert.equal(shouldQuality2ShowZombiePart('procedural_zombie_tooth_a', 'low'), false);
assert.equal(shouldQuality2ShowZombiePart('procedural_zombie_torso', 'low'), true);
assert.equal(shouldQuality2ShowZombiePart('procedural_zombie_tooth_a', 'medium'), true);
assert.equal(getQuality2MaterialTier('low'), 'lambert');
assert.equal(getQuality2MaterialTier('medium'), 'standard');
assert.equal(isLikelySoftwareRenderer('ANGLE (Google, Vulkan 1.3 SwiftShader Device)'), true);
assert.equal(isLikelySoftwareRenderer('ANGLE (AMD, AMD FirePro W4100, D3D11)'), false);

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key)
};
assert.equal(isQuality2FeatureEnabled(storage, QUALITY2_FEATURES.ZOMBIE_DETAIL), true);
assert.equal(setQuality2FeatureEnabled(storage, QUALITY2_FEATURES.ZOMBIE_DETAIL, false), true);
assert.equal(isQuality2FeatureEnabled(storage, QUALITY2_FEATURES.ZOMBIE_DETAIL), false);

console.log('QUALITY.2 consolidated Low-GPU core tests passed');
