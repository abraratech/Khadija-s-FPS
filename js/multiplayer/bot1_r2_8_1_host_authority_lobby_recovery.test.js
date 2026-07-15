import assert from 'node:assert/strict';
import fs from 'node:fs';

const lobbyUi = fs.readFileSync(
  new URL('./lobby_ui.js', import.meta.url),
  'utf8'
);
const lobby = fs.readFileSync(
  new URL('./lobby.js', import.meta.url),
  'utf8'
);
const worker = fs.readFileSync(
  new URL('../../multiplayer-server/src/index.js', import.meta.url),
  'utf8'
);

assert.ok(
  lobbyUi.includes('this.elements.findPublicAlly.disabled = !canFindPublicAlly;'),
  'Find New Public Ally must be enabled from room authority, not the online connect gate'
);
assert.ok(
  lobbyUi.includes('this.elements.callWingman.disabled = !canCallWingman;'),
  'Call AI Wingman must be enabled after a removed human leaves an open slot'
);
assert.ok(
  lobby.includes('incomingAuthorityEpoch < this.lastAuthorityEpoch'),
  'client must reject stale room or host-migration authority snapshots'
);
assert.ok(
  lobby.includes('room.hostPlayerId !== payload.hostPlayerId'),
  'client must reject internally inconsistent host migration events'
);
assert.ok(
  worker.includes('resolvePinnedHostPlayerId'),
  'Worker must resolve host authority from the pinned room host identity'
);
assert.ok(
  worker.includes('shouldRetainHostDuringDisconnect'),
  'Worker must retain an active-run host during reconnect grace'
);
assert.ok(
  worker.includes("reason: 'host-reconnect-grace-expired'"),
  'host migration may occur only after reconnect grace expires'
);
assert.ok(
  !worker.includes("const isHost = existing?.isHost === true\n      || !this.room.hostPlayerId\n      || isFirstPlayer;"),
  'stale isHost flags and arrival order must not grant authority'
);

console.log('BOT.1 R2.8.1 authority and lobby recovery contract tests passed.');
