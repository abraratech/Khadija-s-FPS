import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const release = JSON.parse(read('release-version.json'));
const multiplayerRelease = JSON.parse(read('multiplayer-release.json'));
const directory = read('js/multiplayer/room_directory.js');
const directoryCore = read('js/multiplayer/room_directory_core.js');
const lobby = read('js/multiplayer/lobby.js');
const lobbyUi = read('js/multiplayer/lobby_ui.js');
const updateDelivery = read('js/update_delivery_core.js');
const build = read('scripts/build_production.py');
const verifier = read('scripts/verify_launch2_build.py');

assert.equal(release.releaseId, 'quality3-r1-map-evolution-geometry-zero-failure');
assert.equal(release.productVersion, '1.13.1-quality3-r1');
assert.equal(release.releaseSequence, 2026072304);
assert.equal(release.sourceBaselineSha, '0a1533493e3e3a5d86db698be3972510ef41c5b1');
assert.equal(release.workerBaselineSha, 'a37d98313472d9f3706a7af2ce10810404b78607');
assert.equal(release.baselineWorkerVersionId, '6243d37c-191f-4a06-b6a7-b2e60c2a768a');
assert.equal(release.workerChangeRequired, false);

assert.equal(
  multiplayerRelease.releaseLabel,
  'QUALITY.3 R1 - Map Evolution Geometry and Zero-Failure Certification'
);
assert.equal(multiplayerRelease.productVersion, '1.13.1-quality3-r1');
assert.equal(multiplayerRelease.protocol, 6);
assert.equal(multiplayerRelease.quality2R2?.publicRoomDiscoveryRepair, true);
assert.equal(multiplayerRelease.quality2R2?.listJoinCompatibilityFallback, true);
assert.equal(multiplayerRelease.quality2R2?.visibleNoOpenRoomFeedback, true);
assert.equal(multiplayerRelease.quality2R2?.ratedQuickMatchPreserved, true);
assert.equal(multiplayerRelease.quality2R2?.publicRoomBrowserPreserved, true);
assert.equal(multiplayerRelease.quality2R2?.content2Preserved, true);
assert.equal(multiplayerRelease.quality2R2?.endgame1Preserved, true);
assert.equal(multiplayerRelease.quality2R2?.lowGpuQuality2R1Preserved, true);
assert.equal(multiplayerRelease.quality2R2?.workerChangeRequired, true);
assert.equal(multiplayerRelease.quality2R2?.frontendAndWorker, true);

assert.match(directory, /performFindOpenRoomCompatibilityFallback/);
assert.match(directory, /'\/matchmaking\/rooms\/find'/);
assert.match(directory, /'\/matchmaking\/rooms\/list'/);
assert.match(directory, /'\/matchmaking\/rooms\/join'/);
assert.match(directory, /compatibilityFallbackUsed:\s*true/);
assert.match(directory, /NO_OPEN_ROOM_AVAILABLE/);

assert.match(directoryCore, /quality2-r2-open-room-discovery-resilience/);
assert.match(directoryCore, /shouldFallbackRoomDirectoryFind/);
assert.match(directoryCore, /isRoomDirectoryNoOpenRoomError/);
assert.match(directoryCore, /Rated Quick Match/);
assert.match(lobby, /this\.ui\?\.switchHubTab\?\.\('rooms'\)/);
assert.match(lobbyUi, /\['loading', 'finding', 'joining'\]/);
assert.match(lobbyUi, /USING COMPATIBILITY ROOM BROWSER/);
assert.match(lobbyUi, /SEARCHING OPEN UNRANKED ROOMS/);

assert.match(updateDelivery, /quality3-r1-map-evolution-geometry-zero-failure/);
assert.match(updateDelivery, /releaseSequence: 2026072304/);
assert.match(updateDelivery, /1\.13\.1-quality3-r1/);
assert.match(build, /QUALITY2_R2_PATCH = 'quality2-r2-consolidated-polish-certification'/);
assert.match(build, /"quality2_r2": \{/);
assert.match(verifier, /QUALITY\.2 R2 production manifest patch mismatch/);

console.log('QUALITY.2 R2 consolidated polish frontend contract passed');
