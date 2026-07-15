import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const lobby = read('./lobby.js');
const ui = read('./lobby_ui.js');
const transport = read('./transport.js');
const directory = read('./room_directory.js');
const worker = fs.readFileSync(new URL('../../multiplayer-server/src/index.js', import.meta.url), 'utf8');
const workerCore = fs.readFileSync(new URL('../../multiplayer-server/src/room_directory_core.js', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('../../multiplayer-server/src/matchmaking_hub.js', import.meta.url), 'utf8');

assert(workerCore.includes("ROOM_DIRECTORY_PATCH = 'match2-public-room-admission-r1-1'"));
assert(workerCore.includes('ROOM_DIRECTORY_ADMISSION_TTL_MS'));
assert(worker.includes("url.searchParams.get('admissionToken')"));
assert(worker.includes('directoryAdmissions'));
assert(worker.includes("sessionId: this.room.sessionId"));
assert(hub.includes('admissionExpiresAt'));
assert(hub.includes('delete this.state.rooms[listingId]'));
assert(directory.includes('this.joinPromise'));
assert(directory.includes("status: 'join-rejected'"));
assert(lobby.includes('admissionToken: assignment.admissionToken'));
assert(lobby.includes('this.pendingDirectoryJoin'));
assert(transport.includes("url.searchParams.set('admissionToken'"));
assert(ui.includes('entry.reservedHumans > 0'));
console.log('MATCH.2 R1.1 admission and rejoin contract tests passed');
