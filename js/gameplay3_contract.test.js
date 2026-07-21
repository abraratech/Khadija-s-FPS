// js/gameplay3_contract.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(here, relative), 'utf8');

const core = read('gameplay3_map_evolution_core.js');
const content = read('content1.js');
const mapGameplay = read('map_gameplay.js');
const main = read('main.js');
const weapons = read('weapons.js');
const foundation = read('multiplayer/foundation.js');

assert.match(core, /GAMEPLAY3_PATCH = 'gameplay3-r1-interactive-evolving-maps'/);
assert.match(core, /GAMEPLAY3_STAGE_WAVES = Object\.freeze\(\[4, 7, 10\]\)/);
assert.match(core, /'grid_bunker'/);
assert.match(core, /'industrial_yard'/);
assert.match(core, /'hospital_wing'/);
assert.match(core, /mode\.includes\('pvp'\) \? 'pvp' : 'survival'/);
assert.match(core, /class Gameplay3EvolutionDirector/);
assert.match(core, /replaceSnapshot\(snapshot, now = Date\.now\(\)\)/);

assert.match(content, /Gameplay3EvolutionDirector/);
assert.match(content, /this\.mapEvolutionDirector = new Gameplay3EvolutionDirector\(\)/);
assert.match(content, /const gameplay3 = this\.mapEvolutionDirector\.update\(epochNow\)/);
assert.match(content, /return \{ \.\.\.base, postFinal4, postFinal7, postFinal8, gameplay2, gameplay3 \}/);
assert.match(content, /payload\.action === 'GAMEPLAY3_INTERACT'/);
assert.match(content, /snapshot\.gameplay3/);
assert.match(content, /this\.mapEvolutionDirector\.replaceSnapshot\(snapshot\.gameplay3/);
assert.match(content, /this\.applyGameplay3Snapshot\(snapshot\.gameplay3/);
assert.match(content, /window\.KARequestGameplay3Interaction/);

assert.match(foundation, /applyGameplay3EvolutionState:/);
assert.match(foundation, /worldAdapter\?\.applyGameplay3EvolutionState/);

assert.match(main, /configureGameplay3MapEvolution/);
assert.match(main, /updateGameplay3MapEvolution\(dt/);
assert.match(main, /applyGameplay3EvolutionState: \(snapshot\)/);

assert.match(mapGameplay, /GAMEPLAY3_PATCH/);
assert.match(mapGameplay, /createGameplay3Barrier/);
assert.match(mapGameplay, /setGameplay3Collision/);
assert.match(mapGameplay, /configureGameplay3MapEvolution/);
assert.match(mapGameplay, /updateGameplay3MapEvolution/);
assert.match(mapGameplay, /GAMEPLAY3_CONTROL/);
assert.match(mapGameplay, /MAP_EVOLUTION_HAZARD/);
assert.match(mapGameplay, /walls\.includes\(item\.wall\)/);
assert.match(mapGameplay, /mapMeshes\.includes\(item\.mesh\)/);

assert.match(weapons, /mapInteractable\?\.kind === 'GAMEPLAY3_CONTROL'/);
assert.match(weapons, /activateMapGameplayInteractable\(interaction\.mapInteractable\)/);

const pvpCheck = weapons.indexOf('if (isPvpRulesRun())');
const onlineCheck = weapons.indexOf('if (isOnlineEconomyRun())', pvpCheck);
assert.ok(pvpCheck >= 0 && onlineCheck > pvpCheck, 'PvP isolation must precede GAMEPLAY.3 world interaction routing.');

const pvpEnd = foundation.indexOf('content1Manager?.endRun?.()', foundation.indexOf('if (pvpRun)'));
assert.ok(pvpEnd >= 0, 'PvP runs must keep CONTENT.1/GAMEPLAY.3 inactive.');

console.log('GAMEPLAY.3 source integration contract passed');
