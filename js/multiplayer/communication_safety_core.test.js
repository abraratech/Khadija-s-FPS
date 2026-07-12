// js/multiplayer/communication_safety_core.test.js
import assert from 'node:assert/strict';
import {
  COMMUNICATION_SAFETY_MAX_MUTED_PLAYERS,
  COMMUNICATION_SAFETY_PATCH,
  CommunicationSafetyStore,
  normalizeCommunicationSafetyState
} from './communication_safety_core.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

assert.equal(COMMUNICATION_SAFETY_PATCH, 'm5-coop-communication-safety-r1');
const normalized = normalizeCommunicationSafetyState({
  muteAllText: true,
  mutedTextPlayerIds: [' player-a ', 'player-a', '', 'player-b']
});
assert.equal(normalized.muteAllText, true);
assert.deepEqual(normalized.mutedTextPlayerIds, ['player-a', 'player-b']);

const storage = new MemoryStorage();
const store = new CommunicationSafetyStore({ storage, storageKey: 'test-safety' });
assert.equal(store.shouldHideText('player-a'), false);
assert.equal(store.toggleTextPlayer('player-a').reason, 'muted');
assert.equal(store.isTextPlayerMuted('player-a'), true);
assert.equal(store.shouldHideText('player-a'), true);
assert.equal(store.toggleTextPlayer('player-a').reason, 'unmuted');
assert.equal(store.isTextPlayerMuted('player-a'), false);
store.setMuteAllText(true);
assert.equal(store.shouldHideText('any-player'), true);

const reloaded = new CommunicationSafetyStore({ storage, storageKey: 'test-safety' });
assert.equal(reloaded.getSnapshot().muteAllText, true);
reloaded.setMuteAllText(false);
for (let index = 0; index < COMMUNICATION_SAFETY_MAX_MUTED_PLAYERS + 10; index += 1) {
  reloaded.setTextPlayerMuted(`player-${index}`, true);
}
assert.equal(reloaded.getSnapshot().mutedTextPlayerIds.length, COMMUNICATION_SAFETY_MAX_MUTED_PLAYERS);
reloaded.clearTextPlayerMutes();
assert.deepEqual(reloaded.getSnapshot().mutedTextPlayerIds, []);
storage.setItem('broken', '{bad json');
const broken = new CommunicationSafetyStore({ storage, storageKey: 'broken' });
assert.equal(broken.getSnapshot().muteAllText, false);
assert.deepEqual(broken.getSnapshot().mutedTextPlayerIds, []);
console.log('communication_safety_core tests passed');
