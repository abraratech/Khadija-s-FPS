import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const lobby = read('./lobby.js');
const ui = read('./lobby_ui.js');
const css = fs.readFileSync(new URL('../../css/multiplayer.css', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../../multiplayer-server/src/index.js', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('../../multiplayer-server/src/matchmaking_hub.js', import.meta.url), 'utf8');
const sniper = fs.readFileSync(new URL('../weapons/sniper.js', import.meta.url), 'utf8');

assert(lobby.includes('browseOpenRooms') && lobby.includes('joinOpenRoom') && lobby.includes('createPublicRoom'));
assert(ui.includes('BROWSE PUBLIC ROOMS') && ui.includes('CREATE PUBLIC CO-OP ROOM'));
assert(ui.includes('CREATE PUBLIC PVP ROOM') && ui.includes('UNRANKED TEAM ELIMINATION ROOMS'));
assert(ui.includes('FIND PUBLIC PVP 1V1'));
assert(ui.includes('LIST AS PUBLIC ROOM'));
assert(css.includes('.ka-room-browser-card'));
assert(worker.includes("url.pathname === '/directory-admission'"));
assert(worker.includes("action === 'directory-heartbeat'"));
assert(hub.includes("'/matchmaking/rooms/list'"));
assert(hub.includes("'/matchmaking/rooms/join'"));
assert(sniper.includes('removeSniperAdsObstruction(group)'));
assert(sniper.includes("adsClearancePatch = 'match2-r1-sniper-ads-clearance'"));
console.log('MATCH.2 R1 browser and sniper ADS contract tests passed');
