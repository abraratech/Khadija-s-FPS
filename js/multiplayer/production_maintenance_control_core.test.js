// js/multiplayer/production_maintenance_control_core.test.js
import assert from 'node:assert/strict';
import {
  createExpectedProductionMaintenanceManifest,evaluateProductionMaintenanceEvidence,createCertifiedMaintenanceBaseline,
  classifyProductionMaintenanceChange,createMaintenanceChangeAuthorization
} from './production_maintenance_control_core.js';

const sha='a'.repeat(64); const runSha='b'.repeat(64); const baseSha='c'.repeat(64);
const now=Date.parse('2026-07-10T20:00:00.000Z');
const identity={protocol:6,build:'m3-team-final-world-reconnect-r3',releasePatch:'m3-production-release-manifest-r1',certifiedFrontendSha:'3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b',releaseStatus:'CERTIFIED'};
const active={frontendOrigin:'https://khadija-s-fps.pages.dev',frontendCommitSha:'93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8',archiveConsoleCommitSha:'8522495c77764142f6aa60af1af688dc88c31938',workerOrigin:'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev',workerVersionId:'40175919-3d62-4986-9215-edf06eeddb98'};
const rollback={frontendCommitSha:'9f83a7254c06995aa9a4d46e8de4e9dfa18c3250',workerVersionId:'40175919-3d62-4986-9215-edf06eeddb98',retainWorkerDeployment:true};
const archive={schema:1,milestone:'M3.93-M3.94',patch:'m3-certified-release-archive-r1',createdAt:'2025-01-01T00:00:00.000Z',decision:'CERTIFIED_RELEASE_ARCHIVED',status:'ARCHIVE_SEALED',archiveConfirmed:true,documentSha256:sha,releaseIdentity:identity,activeDeployment:active,rollbackReference:rollback,retention:{class:'RELEASE_LIFECYCLE_PERMANENT',immutable:true}};
const runbook={schema:1,milestone:'M3.93-M3.94',patch:'m3-certified-release-archive-r1',createdAt:'2025-01-01T00:01:00.000Z',decision:'RECOVERY_RUNBOOK_AUTHORIZED',mode:'DRILL_ONLY_DO_NOT_EXECUTE',nonExecuting:true,documentSha256:runSha,sourceArchiveSha256:sha,releaseIdentity:identity,currentDeployment:active,rollbackTarget:rollback,triggerPolicy:{liveActionAuthorized:false}};
const manifest=createExpectedProductionMaintenanceManifest();
let evaluation=evaluateProductionMaintenanceEvidence({manifest,certifiedArchive:archive,archiveDigestValid:true,recoveryRunbook:runbook,runbookDigestValid:true,nowMs:now});
assert.equal(evaluation.ready,true); assert.equal(evaluation.status,'PASS');
assert.ok(evaluation.warnings.some(item=>item.code==='PERMANENT_ARCHIVE_AGE'));
assert.equal(evaluateProductionMaintenanceEvidence({manifest,certifiedArchive:{...archive,documentSha256:'bad'},archiveDigestValid:false,recoveryRunbook:runbook,runbookDigestValid:true,nowMs:now}).ready,false);
assert.equal(evaluateProductionMaintenanceEvidence({manifest,certifiedArchive:archive,archiveDigestValid:true,recoveryRunbook:{...runbook,sourceArchiveSha256:'d'.repeat(64)},runbookDigestValid:true,nowMs:now}).ready,false);
const baseline=createCertifiedMaintenanceBaseline(evaluation,archive,runbook,{owner:'Operations',confirmation:true,createdAt:'2026-07-10T20:02:00.000Z'});
assert.equal(baseline.decision,'CERTIFIED_MAINTENANCE_BASELINE'); assert.equal(baseline.changePolicy.liveActionAuthorized,false);
assert.throws(()=>createCertifiedMaintenanceBaseline(evaluation,archive,runbook,{owner:'',confirmation:true}),/owner/i);
let classification=classifyProductionMaintenanceChange();
assert.equal(classification.scope,'NO_CHANGE'); assert.equal(classification.ready,false); assert.equal(classification.deploymentPlan.workerDeploymentRequired,false);
classification=classifyProductionMaintenanceChange({affectedPaths:['js/main.js','index.html']});
assert.equal(classification.scope,'FRONTEND_ONLY'); assert.equal(classification.deploymentPlan.pagesDeploymentRequired,true); assert.equal(classification.deploymentPlan.workerDeploymentRequired,false); assert.equal(classification.deploymentPlan.preserveCurrentWorkerDeployment,true);
const worker=classifyProductionMaintenanceChange({affectedPaths:['multiplayer-server/src/index.js']});
assert.equal(worker.scope,'WORKER_CODE'); assert.equal(worker.deploymentPlan.workerDeploymentRequired,true); assert.equal(worker.deploymentPlan.fullCertificationRequired,true);
const identityChange=classifyProductionMaintenanceChange({proposedProtocol:7});
assert.equal(identityChange.scope,'RELEASE_IDENTITY'); assert.equal(identityChange.deploymentPlan.workerDeploymentRequired,true); assert.ok(identityChange.warnings.some(item=>item.code==='IDENTITY_CHANGE_IMPLIES_WORKER_DEPLOY'));
const invalid=classifyProductionMaintenanceChange({affectedPaths:['../secret.txt']}); assert.equal(invalid.status,'BLOCKED');
const sealedBaseline={...baseline,documentSha256:baseSha};
const authorization=createMaintenanceChangeAuthorization(sealedBaseline,classification,{ticket:'M4.1',approver:'Release Owner',summary:'Frontend maintenance.',confirmation:true,createdAt:'2026-07-10T20:03:00.000Z'});
assert.equal(authorization.decision,'MAINTENANCE_CHANGE_AUTHORIZED'); assert.equal(authorization.mode,'CHANGE_CONTROL_ONLY_DO_NOT_DEPLOY'); assert.equal(authorization.liveActionAuthorized,false); assert.equal(authorization.deploymentPlan.workerDeploymentRequired,false);
assert.throws(()=>createMaintenanceChangeAuthorization(sealedBaseline,classifyProductionMaintenanceChange(),{ticket:'X',approver:'Y',summary:'Z',confirmation:true}),/deployable/i);
console.log('production maintenance control core tests passed');
