import assert from 'node:assert/strict';
import {deriveMultiplayerProductionReleaseUiState,MULTIPLAYER_PRODUCTION_RELEASE_UI_PATCH} from './production_release_ui_core.js';
assert.equal(MULTIPLAYER_PRODUCTION_RELEASE_UI_PATCH,'m3-production-release-ui-r1');
assert.equal(deriveMultiplayerProductionReleaseUiState().blockActions,false);
assert.equal(deriveMultiplayerProductionReleaseUiState({productionRelease:{status:'CHECKING',blocking:true}}).retryDisabled,true);
assert.equal(deriveMultiplayerProductionReleaseUiState({productionRelease:{status:'PASS',ready:true}}).status,'PASS');
assert.equal(deriveMultiplayerProductionReleaseUiState({productionRelease:{status:'FAIL',blocking:true,errors:[{message:'mismatch'}]}}).blockActions,true);
console.log('production_release_ui_core tests passed');
