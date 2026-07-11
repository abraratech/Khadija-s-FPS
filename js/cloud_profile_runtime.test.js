import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return Array.from(this.map.keys())[index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

globalThis.localStorage = new MemoryStorage({
  ka_progression_v1: JSON.stringify({ version: 1, xp: 50, bestScore: 100 }),
  ka_challenges_v1: JSON.stringify({ version: 1, unlocked: {}, totalUnlocked: 0 }),
  fps_hi_score: '100',
  fps_hi_wave: '2',
  ka_accessibility_v1: JSON.stringify({ hudScale: 100 })
});

const runtime = await import('./cloud_profile.js');
const core = await import('./cloud_profile_core.js');

const first = runtime.syncCloudProfile('runtime-test');
assert.equal(first.revision, 1);
assert.equal(first.records.highScore, 100);
assert.equal(localStorage.getItem('ka_cloud_profile_v1') !== null, true);

localStorage.setItem('fps_hi_score', '500');
const second = runtime.syncCloudProfile('score-change');
assert.equal(second.revision, 2);
assert.equal(second.records.highScore, 500);

const incoming = core.createGuestCloudProfile({
  profileId: 'guest-runtime-import',
  legacyStorage: {
    ka_progression_v1: JSON.stringify({ version: 1, xp: 500, bestScore: 450 }),
    ka_challenges_v1: JSON.stringify({ version: 1, unlocked: { WAVE_10: 5000 }, totalUnlocked: 1 }),
    fps_hi_score: '450',
    fps_hi_wave: '10',
    ka_accessibility_v1: JSON.stringify({ hudScale: 125 })
  },
  now: Date.now() + 1000,
  createdAt: Date.now() + 500,
  revision: 4
});
const envelope = core.createCloudProfileExport(incoming);
const imported = runtime.importCloudProfileText(JSON.stringify(envelope), { merge: true, reload: false });
assert.equal(imported.accepted, true);
const finalProfile = runtime.getCloudProfileSnapshot();
assert.equal(finalProfile.progression.xp, 500);
assert.equal(finalProfile.records.highScore, 500);
assert.equal(finalProfile.records.highWave, 10);
assert.equal(finalProfile.achievements.totalUnlocked, 1);
assert.equal(JSON.parse(localStorage.getItem('ka_accessibility_v1')).hudScale, 125);

console.log('Cloud profile runtime tests: PASS');
