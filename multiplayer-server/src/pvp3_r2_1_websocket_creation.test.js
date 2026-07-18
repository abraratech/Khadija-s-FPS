import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');

assert.ok(index.includes("websocketRoomCreationHotfix: 'pvp3-r2-1-null-matchmaking-region-fix'"));
assert.ok(index.includes("directoryRegion: 'ZZ'"));
assert.ok(index.includes('this.room.directoryRegion = String('));
assert.ok(!index.includes('this.room.matchmaking.region = String('));
assert.ok(index.includes("region: room.matchmaking?.region || room.directoryRegion || 'ZZ'"));
assert.match(index, /this\.room\.directoryRegion\s*=\s*String\([\s\S]*?this\.room\.matchmaking\?\.region[\s\S]*?'ZZ'[\s\S]*?\)\.toUpperCase\(\)\.slice\(0, 16\)/);

console.log('PVP.3 R2.1 WebSocket room creation hotfix contract: PASS');
