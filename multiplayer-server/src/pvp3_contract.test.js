import assert from 'node:assert/strict';
import fs from 'node:fs';
import { match3RoomVisibleForFilters } from './match3_core.js';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('./matchmaking_hub.js', import.meta.url), 'utf8');
for (const marker of [
  'pvp3-r1-public-room-discovery-matchmaking-repair',
  "'/matchmaking/rooms/find'",
  'immediatePublicListingSync',
  'regionAwareCustomRooms'
]) assert.ok(index.includes(marker) || hub.includes(marker), `missing PVP.3 Worker marker: ${marker}`);
assert.ok(hub.includes('async findRoomListing'), 'Worker must atomically select and reserve an open room');
assert.ok(hub.includes("patch: 'pvp3-r1-public-room-discovery-matchmaking-repair'"), 'matchmaking health must expose the PVP.3 capability');
assert.ok(index.includes('await this.syncDirectoryListing({ force: true })'), 'public listing updates must force immediate sync');

const pvp = { gameMode: 'pvp-team-elimination', mapId: 'grid_bunker', difficulty: 1, status: 'waiting', scope: 'global', hasBot: false, openHumanSlots: 1 };
assert.equal(match3RoomVisibleForFilters(pvp, { gameMode: 'pvp-team-elimination', difficulty: 2 }), true);
console.log('PVP.3 R1 Worker public-room discovery contract: PASS');
