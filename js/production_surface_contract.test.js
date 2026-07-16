// js/production_surface_contract.test.js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  FORBIDDEN_PRODUCTION_GLOBALS,
  PRODUCTION_SURFACE_PATCH,
  REMOVED_PRODUCTION_PATHS,
  inspectProductionSurface
} from './production_surface_core.js';

const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('./multiplayer/foundation.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../multiplayer-server/src/index.js', import.meta.url), 'utf8');
const release = JSON.parse(readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8'));

assert.equal(PRODUCTION_SURFACE_PATCH, 'prog2-r1-production-hardening-cloud-integrity');
const inspection = inspectProductionSurface({
  mainSource: main,
  foundationSource: foundation,
  workerSource: worker,
  releaseManifest: release
});
assert.equal(inspection.voiceRemoved, true);
assert.equal(inspection.developmentRuntimeRemoved, true);
assert.equal(inspection.textChatPreserved, true);
assert.equal(inspection.progressionCommitExposed, true);

for (const relative of REMOVED_PRODUCTION_PATHS) {
  if (relative.endsWith('/')) continue;
  assert.equal(existsSync(new URL(`../${relative}`, import.meta.url)), false, `Removed production path still exists: ${relative}`);
}
for (const globalName of FORBIDDEN_PRODUCTION_GLOBALS) {
  const assignment = new RegExp(`window\\.${globalName}\\s*=`);
  assert.equal(assignment.test(main), false, `Forbidden main global assignment remains: ${globalName}`);
}
assert.doesNotMatch(worker, /voice-signal|voice-ice-config|getUserMedia|RTCPeerConnection/);
assert.match(foundation, /MultiplayerTextChat/);
assert.equal(release.productionHardening.voiceRuntimeRemoved, true);
assert.equal(release.m5Communication.textChatOnly.voiceRemoved, true);

console.log('production_surface contract tests passed');
