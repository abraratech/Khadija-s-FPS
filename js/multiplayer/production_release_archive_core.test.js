// js/multiplayer/production_release_archive_core.test.js
import assert from 'node:assert/strict';
import {
  canonicalProductionReleaseArchiveJson,
  createExpectedProductionReleaseArchiveManifest,
  evaluateProductionReleaseArchive,
  createCertifiedReleaseArchive,
  createProductionRecoveryRunbook
} from './production_release_archive_core.js';

const shaA='a'.repeat(64), shaB='b'.repeat(64), shaC='c'.repeat(64);
const now=Date.parse('2026-07-10T20:00:00.000Z');
function identity(){ return { protocol:6, build:'m3-team-final-world-reconnect-r3', releasePatch:'m3-production-release-manifest-r1', certifiedFrontendSha:'3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b', releaseStatus:'CERTIFIED' }; }
function closure(){ return {
  schema:1, milestone:'M3.91-M3.92', patch:'m3-production-release-closure-r1', createdAt:'2026-07-10T19:00:00.000Z',
  decision:'PRODUCTION_RELEASE_CLOSED', status:'CLOSED_GREEN', closureConfirmed:true, operationsState:'HANDOFF_READY', documentSha256:shaA,
  releaseIdentity:identity(),
  deployment:{ frontendOrigin:'https://khadija-s-fps.pages.dev', frontendCommitSha:'93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8', workerOrigin:'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev', workerVersionId:'40175919-3d62-4986-9215-edf06eeddb98' },
  rollbackAuthorization:{ frontendCommitSha:'9f83a7254c06995aa9a4d46e8de4e9dfa18c3250', retainWorkerDeployment:true }
}; }
function handoff(){ return {
  schema:1, milestone:'M3.91-M3.92', patch:'m3-production-release-closure-r1', createdAt:'2026-07-10T19:05:00.000Z',
  decision:'OPERATIONS_HANDOFF_ACCEPTED', sourceClosureCertificateSha256:shaA, documentSha256:shaB,
  releaseIdentity:identity(),
  activeDeployment:{ frontendOrigin:'https://khadija-s-fps.pages.dev', frontendCommitSha:'93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8', workerOrigin:'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev', workerVersionId:'40175919-3d62-4986-9215-edf06eeddb98' },
  rollbackPlan:{ frontendCommitSha:'9f83a7254c06995aa9a4d46e8de4e9dfa18c3250', retainWorkerDeployment:true }
}; }
const manifest=createExpectedProductionReleaseArchiveManifest();
const pass=evaluateProductionReleaseArchive({ manifest, closureCertificate:closure(), closureDigestValid:true, operationsHandoff:handoff(), handoffDigestValid:true, nowMs:now });
assert.equal(pass.ready,true); assert.equal(pass.status,'PASS'); assert.equal(pass.errors.length,0);
assert.equal(canonicalProductionReleaseArchiveJson({z:1,a:{y:2,x:3}}),'{"a":{"x":3,"y":2},"z":1}');

const badSeal=evaluateProductionReleaseArchive({ manifest, closureCertificate:closure(), closureDigestValid:false, operationsHandoff:handoff(), handoffDigestValid:true, nowMs:now });
assert.equal(badSeal.ready,false); assert.ok(badSeal.errors.some(x=>x.code==='CLOSURE_DIGEST_MISMATCH'));
const badChain=handoff(); badChain.sourceClosureCertificateSha256=shaC;
const chainResult=evaluateProductionReleaseArchive({ manifest, closureCertificate:closure(), closureDigestValid:true, operationsHandoff:badChain, handoffDigestValid:true, nowMs:now });
assert.equal(chainResult.ready,false); assert.ok(chainResult.errors.some(x=>x.code==='HANDOFF_FIELD_MISMATCH'));
const badStatus=closure(); badStatus.status='DEGRADED';
assert.equal(evaluateProductionReleaseArchive({manifest,closureCertificate:badStatus,closureDigestValid:true,operationsHandoff:handoff(),handoffDigestValid:true,nowMs:now}).ready,false);
const oldClosure=closure(); oldClosure.createdAt='2026-05-01T00:00:00.000Z';
assert.ok(evaluateProductionReleaseArchive({manifest,closureCertificate:oldClosure,closureDigestValid:true,operationsHandoff:handoff(),handoffDigestValid:true,nowMs:now}).errors.some(x=>x.code==='CLOSURE_STALE'));
const earlyHandoff=handoff(); earlyHandoff.createdAt='2026-07-10T18:00:00.000Z';
assert.ok(evaluateProductionReleaseArchive({manifest,closureCertificate:closure(),closureDigestValid:true,operationsHandoff:earlyHandoff,handoffDigestValid:true,nowMs:now}).errors.some(x=>x.code==='HANDOFF_PRECEDES_CLOSURE'));

assert.throws(()=>createCertifiedReleaseArchive(pass,closure(),handoff(),{archivedBy:'Abrar',confirmation:false}),/confirmation/);
const archive=createCertifiedReleaseArchive(pass,closure(),handoff(),{archivedBy:'Abrar',confirmation:true,createdAt:'2026-07-10T20:00:00.000Z'});
assert.equal(archive.decision,'CERTIFIED_RELEASE_ARCHIVED'); assert.equal(archive.status,'ARCHIVE_SEALED');
const sealed={...archive,documentSha256:shaC};
assert.throws(()=>createProductionRecoveryRunbook(sealed,{owner:'Abrar',confirmation:false}),/confirmation/);
const runbook=createProductionRecoveryRunbook(sealed,{owner:'Abrar',confirmation:true,createdAt:'2026-07-10T20:05:00.000Z'});
assert.equal(runbook.mode,'DRILL_ONLY_DO_NOT_EXECUTE'); assert.equal(runbook.nonExecuting,true); assert.equal(runbook.triggerPolicy.liveActionAuthorized,false);
console.log('production release archive core tests passed');
