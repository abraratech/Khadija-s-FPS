import assert from 'node:assert/strict';
import {
  canonicalAutomaticPagesDeploymentJson,createExpectedAutomaticPagesDeploymentManifest,evaluateAutomaticPagesDeploymentEvidence,
  createAutomaticPagesDeploymentReceipt,createCertifiedMaintenanceActivation,EXPECTED_MAINTENANCE_ARTIFACT_SHA256
} from './automatic_pages_deployment_core.js';

const manifest=createExpectedAutomaticPagesDeploymentManifest();
const maintenance={service:'khadijas-arena-production-maintenance-control',patch:'m3-production-maintenance-control-r1',maintenanceControlCommitSha:'ff3fd2e86bea3505015359a8293e99d6baad7ab4',protocol:6,build:'m3-team-final-world-reconnect-r3',releasePatch:'m3-production-release-manifest-r1',certifiedFrontendSha:'3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b',releaseStatus:'CERTIFIED',workerVersionId:'40175919-3d62-4986-9215-edf06eeddb98',workerRedeployRequired:false};
const identity={protocol:6,build:'m3-team-final-world-reconnect-r3',patch:'m3-production-release-manifest-r1',certifiedFrontendSha:'3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b',releaseStatus:'CERTIFIED'};
const worker={...identity,workerUrl:'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev'};
const checks=Object.entries(EXPECTED_MAINTENANCE_ARTIFACT_SHA256).map(([path,actualSha256])=>({path,actualSha256,httpStatus:200,ok:true}));
const passing=()=>evaluateAutomaticPagesDeploymentEvidence({manifest,productionOrigin:'https://khadija-s-fps.pages.dev',submittedCommitSha:'bb2545fad7c7589af25348b4d6f7359e0f9aa8be',githubPushConfirmed:true,automaticDeploymentConfirmed:true,maintenanceManifest:maintenance,artifactChecks:checks,frontendRelease:identity,workerRelease:worker});
const good=passing();
assert.equal(good.ready,true); assert.equal(good.decision,'PAGES_DEPLOYMENT_VERIFIED'); assert.equal(good.verifiedArtifactCount,5);
assert.equal(evaluateAutomaticPagesDeploymentEvidence({manifest,productionOrigin:'https://preview.pages.dev',submittedCommitSha:'bb2545fad7c7589af25348b4d6f7359e0f9aa8be',githubPushConfirmed:true,automaticDeploymentConfirmed:true,maintenanceManifest:maintenance,artifactChecks:checks,frontendRelease:identity,workerRelease:worker}).ready,false);
assert.equal(evaluateAutomaticPagesDeploymentEvidence({manifest,productionOrigin:'https://khadija-s-fps.pages.dev',submittedCommitSha:'bb2545fad7c7589af25348b4d6f7359e0f9aa8be',githubPushConfirmed:true,automaticDeploymentConfirmed:true,maintenanceManifest:maintenance,artifactChecks:checks.map((x,i)=>i?x:{...x,actualSha256:'0'.repeat(64)}),frontendRelease:identity,workerRelease:worker}).ready,false);
assert.equal(evaluateAutomaticPagesDeploymentEvidence({manifest,productionOrigin:'https://khadija-s-fps.pages.dev',submittedCommitSha:'bb2545fad7c7589af25348b4d6f7359e0f9aa8be',githubPushConfirmed:false,automaticDeploymentConfirmed:true,maintenanceManifest:maintenance,artifactChecks:checks,frontendRelease:identity,workerRelease:worker}).ready,false);
assert.equal(evaluateAutomaticPagesDeploymentEvidence({manifest,productionOrigin:'https://khadija-s-fps.pages.dev',submittedCommitSha:'bb2545fad7c7589af25348b4d6f7359e0f9aa8be',githubPushConfirmed:true,automaticDeploymentConfirmed:true,maintenanceManifest:maintenance,artifactChecks:checks,frontendRelease:identity,workerRelease:{...worker,build:'wrong'}}).ready,false);
const receipt=createAutomaticPagesDeploymentReceipt({evaluation:good,operator:'Abrar',notes:'GitHub push deployed automatically.',createdAt:'2026-07-10T20:00:00.000Z'});
assert.equal(receipt.status,'AUTO_DEPLOYMENT_ACCEPTED'); assert.equal(receipt.worker.redeployRequired,false);
const activation=createCertifiedMaintenanceActivation({deploymentReceipt:receipt,deploymentReceiptSha256:'a'.repeat(64),approver:'Abrar',activationConfirmed:true,createdAt:'2026-07-10T20:01:00.000Z'});
assert.equal(activation.decision,'CERTIFIED_MAINTENANCE_ACTIVE'); assert.equal(activation.nextMilestone,'M3.99-M3.100');
assert.throws(()=>createCertifiedMaintenanceActivation({deploymentReceipt:receipt,deploymentReceiptSha256:'bad',approver:'Abrar',activationConfirmed:true}));
assert.equal(canonicalAutomaticPagesDeploymentJson({b:2,a:1}),'{"a":1,"b":2}');
console.log('automatic Pages deployment core tests passed');
