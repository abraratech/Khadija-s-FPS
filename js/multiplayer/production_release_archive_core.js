// js/multiplayer/production_release_archive_core.js
// M3.93-M3.94 — deterministic certified release archive and recovery runbook.

export const PRODUCTION_RELEASE_ARCHIVE_PATCH = 'm3-certified-release-archive-r1';
export const PRODUCTION_RELEASE_ARCHIVE_CONSOLE_SHA = '8522495c77764142f6aa60af1af688dc88c31938';
export const PRODUCTION_RELEASE_ARCHIVE_CLOSED_FRONTEND_SHA = '93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8';
export const PRODUCTION_RELEASE_ARCHIVE_ROLLBACK_SHA = '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250';
export const PRODUCTION_RELEASE_ARCHIVE_CLOSURE_PATCH = 'm3-production-release-closure-r1';
export const PRODUCTION_RELEASE_ARCHIVE_PROTOCOL = 6;
export const PRODUCTION_RELEASE_ARCHIVE_BUILD = 'm3-team-final-world-reconnect-r3';
export const PRODUCTION_RELEASE_ARCHIVE_RELEASE_PATCH = 'm3-production-release-manifest-r1';
export const PRODUCTION_RELEASE_ARCHIVE_CERTIFIED_SHA = '3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b';
export const PRODUCTION_RELEASE_ARCHIVE_RELEASE_STATUS = 'CERTIFIED';
export const PRODUCTION_RELEASE_ARCHIVE_FRONTEND_ORIGIN = 'https://khadija-s-fps.pages.dev';
export const PRODUCTION_RELEASE_ARCHIVE_WORKER_ORIGIN = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const PRODUCTION_RELEASE_ARCHIVE_WORKER_VERSION_ID = '40175919-3d62-4986-9215-edf06eeddb98';
export const PRODUCTION_RELEASE_ARCHIVE_MAX_EVIDENCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function cleanText(value, fallback = '', limit = 1600) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}
function finiteInteger(value, fallback = -1) { const number=Number(value); return Number.isFinite(number) ? Math.trunc(number) : fallback; }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function normalizedOrigin(value) { try { return new URL(String(value || '')).origin; } catch { return ''; } }
function finding(code, message, details = {}) { return Object.freeze({ code, message, details:Object.freeze({...details}) }); }
function isSha256(value) { return /^[a-f0-9]{64}$/.test(cleanText(value).toLowerCase()); }

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('Canonical JSON cannot contain non-finite numbers.'); return value; }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isObject(value)) {
    const output={};
    for (const key of Object.keys(value).sort()) {
      const item=value[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') throw new TypeError(`Canonical JSON contains unsupported value at ${key}.`);
      output[key]=canonicalValue(item);
    }
    return output;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
}
export function canonicalProductionReleaseArchiveJson(value) { return JSON.stringify(canonicalValue(value)); }

export function createExpectedProductionReleaseArchiveManifest() {
  return Object.freeze({"ok":true,"service":"khadijas-arena-production-release-archive","patch":"m3-certified-release-archive-r1","releaseClosureCommitSha":"8522495c77764142f6aa60af1af688dc88c31938","closedFrontendCommitSha":"93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8","rollbackFrontendSha":"9f83a7254c06995aa9a4d46e8de4e9dfa18c3250","protocol":6,"build":"m3-team-final-world-reconnect-r3","releasePatch":"m3-production-release-manifest-r1","certifiedFrontendSha":"3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b","releaseStatus":"CERTIFIED","frontendUrl":"https://khadija-s-fps.pages.dev","workerUrl":"https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev","workerVersionId":"40175919-3d62-4986-9215-edf06eeddb98","sourceClosurePath":"/production-release-closure.html","pagePath":"/production-release-archive.html","requiredClosureDecision":"PRODUCTION_RELEASE_CLOSED","requiredClosureStatus":"CLOSED_GREEN","requiredHandoffDecision":"OPERATIONS_HANDOFF_ACCEPTED","retentionClass":"RELEASE_LIFECYCLE_PERMANENT","recoveryMode":"DRILL_ONLY_DO_NOT_EXECUTE"});
}

function checkIdentity(errors, source, prefix) {
  const value=isObject(source) ? source : {};
  for (const [field, expected, received] of [
    ['protocol', PRODUCTION_RELEASE_ARCHIVE_PROTOCOL, finiteInteger(value.protocol)],
    ['build', PRODUCTION_RELEASE_ARCHIVE_BUILD, cleanText(value.build)],
    ['releasePatch', PRODUCTION_RELEASE_ARCHIVE_RELEASE_PATCH, cleanText(value.releasePatch)],
    ['certifiedFrontendSha', PRODUCTION_RELEASE_ARCHIVE_CERTIFIED_SHA, cleanText(value.certifiedFrontendSha)],
    ['releaseStatus', PRODUCTION_RELEASE_ARCHIVE_RELEASE_STATUS, cleanText(value.releaseStatus).toUpperCase()]
  ]) if (expected !== received) errors.push(finding(`${prefix}_IDENTITY_MISMATCH`, `${prefix.toLowerCase()} release identity field ${field} does not match.`, {field,expected,received}));
}

function checkAge(errors, timestamp, nowMs, maxAgeMs, prefix) {
  const value=Date.parse(cleanText(timestamp));
  if (!Number.isFinite(value)) { errors.push(finding(`${prefix}_TIME_INVALID`, `${prefix.toLowerCase()} timestamp is invalid.`)); return NaN; }
  if (value > nowMs + 5*60*1000) errors.push(finding(`${prefix}_TIME_FUTURE`, `${prefix.toLowerCase()} timestamp is unexpectedly in the future.`));
  if (nowMs - value > maxAgeMs) errors.push(finding(`${prefix}_STALE`, `${prefix.toLowerCase()} evidence is older than the archive acceptance window.`));
  return value;
}

export function evaluateProductionReleaseArchive({
  manifest=null, closureCertificate=null, closureDigestValid=false,
  operationsHandoff=null, handoffDigestValid=false,
  nowMs=Date.now(), maxEvidenceAgeMs=PRODUCTION_RELEASE_ARCHIVE_MAX_EVIDENCE_AGE_MS
}={}) {
  const errors=[]; const warnings=[];
  const expectedManifest=createExpectedProductionReleaseArchiveManifest();
  const actualManifest=isObject(manifest) ? manifest : {};
  for (const [field,expected] of Object.entries(expectedManifest)) {
    let received=actualManifest[field];
    if (field.endsWith('Url')) received=normalizedOrigin(received);
    const normalizedExpected=field.endsWith('Url') ? normalizedOrigin(expected) : expected;
    if (normalizedExpected !== received) errors.push(finding('ARCHIVE_MANIFEST_MISMATCH', `Archive manifest field ${field} does not match.`, {field,expected:normalizedExpected,received}));
  }

  const closure=isObject(closureCertificate) ? closureCertificate : {};
  if (closureDigestValid !== true || !isSha256(closure.documentSha256)) errors.push(finding('CLOSURE_DIGEST_MISMATCH','Closure certificate SHA-256 seal is missing or invalid.'));
  for (const [field,expected,received] of [
    ['schema',1,finiteInteger(closure.schema)],
    ['milestone','M3.91-M3.92',cleanText(closure.milestone)],
    ['patch',PRODUCTION_RELEASE_ARCHIVE_CLOSURE_PATCH,cleanText(closure.patch)],
    ['decision','PRODUCTION_RELEASE_CLOSED',cleanText(closure.decision).toUpperCase()],
    ['status','CLOSED_GREEN',cleanText(closure.status).toUpperCase()],
    ['closureConfirmed',true,closure.closureConfirmed === true],
    ['operationsState','HANDOFF_READY',cleanText(closure.operationsState).toUpperCase()]
  ]) if (expected !== received) errors.push(finding('CLOSURE_FIELD_MISMATCH',`Closure certificate field ${field} does not match.`,{field,expected,received}));
  checkIdentity(errors,closure.releaseIdentity,'CLOSURE');
  for (const [field,expected,received] of [
    ['frontendOrigin',PRODUCTION_RELEASE_ARCHIVE_FRONTEND_ORIGIN,normalizedOrigin(closure.deployment?.frontendOrigin)],
    ['frontendCommitSha',PRODUCTION_RELEASE_ARCHIVE_CLOSED_FRONTEND_SHA,cleanText(closure.deployment?.frontendCommitSha)],
    ['workerOrigin',PRODUCTION_RELEASE_ARCHIVE_WORKER_ORIGIN,normalizedOrigin(closure.deployment?.workerOrigin)],
    ['workerVersionId',PRODUCTION_RELEASE_ARCHIVE_WORKER_VERSION_ID,cleanText(closure.deployment?.workerVersionId)],
    ['rollbackFrontendSha',PRODUCTION_RELEASE_ARCHIVE_ROLLBACK_SHA,cleanText(closure.rollbackAuthorization?.frontendCommitSha)],
    ['retainWorkerDeployment',true,closure.rollbackAuthorization?.retainWorkerDeployment === true]
  ]) if (expected !== received) errors.push(finding('CLOSURE_DEPLOYMENT_MISMATCH',`Closure deployment field ${field} does not match.`,{field,expected,received}));
  const closureTime=checkAge(errors,closure.createdAt,nowMs,maxEvidenceAgeMs,'CLOSURE');

  const handoff=isObject(operationsHandoff) ? operationsHandoff : {};
  if (handoffDigestValid !== true || !isSha256(handoff.documentSha256)) errors.push(finding('HANDOFF_DIGEST_MISMATCH','Operations handoff SHA-256 seal is missing or invalid.'));
  for (const [field,expected,received] of [
    ['schema',1,finiteInteger(handoff.schema)],
    ['milestone','M3.91-M3.92',cleanText(handoff.milestone)],
    ['patch',PRODUCTION_RELEASE_ARCHIVE_CLOSURE_PATCH,cleanText(handoff.patch)],
    ['decision','OPERATIONS_HANDOFF_ACCEPTED',cleanText(handoff.decision).toUpperCase()],
    ['sourceClosureCertificateSha256',cleanText(closure.documentSha256).toLowerCase(),cleanText(handoff.sourceClosureCertificateSha256).toLowerCase()]
  ]) if (expected !== received) errors.push(finding('HANDOFF_FIELD_MISMATCH',`Operations handoff field ${field} does not match.`,{field,expected,received}));
  checkIdentity(errors,handoff.releaseIdentity,'HANDOFF');
  for (const [field,expected,received] of [
    ['frontendOrigin',PRODUCTION_RELEASE_ARCHIVE_FRONTEND_ORIGIN,normalizedOrigin(handoff.activeDeployment?.frontendOrigin)],
    ['frontendCommitSha',PRODUCTION_RELEASE_ARCHIVE_CLOSED_FRONTEND_SHA,cleanText(handoff.activeDeployment?.frontendCommitSha)],
    ['workerOrigin',PRODUCTION_RELEASE_ARCHIVE_WORKER_ORIGIN,normalizedOrigin(handoff.activeDeployment?.workerOrigin)],
    ['workerVersionId',PRODUCTION_RELEASE_ARCHIVE_WORKER_VERSION_ID,cleanText(handoff.activeDeployment?.workerVersionId)],
    ['rollbackFrontendSha',PRODUCTION_RELEASE_ARCHIVE_ROLLBACK_SHA,cleanText(handoff.rollbackPlan?.frontendCommitSha)],
    ['retainWorkerDeployment',true,handoff.rollbackPlan?.retainWorkerDeployment === true]
  ]) if (expected !== received) errors.push(finding('HANDOFF_DEPLOYMENT_MISMATCH',`Operations handoff deployment field ${field} does not match.`,{field,expected,received}));
  const handoffTime=checkAge(errors,handoff.createdAt,nowMs,maxEvidenceAgeMs,'HANDOFF');
  if (Number.isFinite(closureTime) && Number.isFinite(handoffTime) && handoffTime < closureTime) errors.push(finding('HANDOFF_PRECEDES_CLOSURE','Operations handoff predates the closure certificate.'));

  const ready=errors.length === 0;
  return Object.freeze({
    ready, status:ready ? 'PASS' : 'BLOCKED',
    errors:Object.freeze(errors), warnings:Object.freeze(warnings),
    source:Object.freeze({
      closureSha256:cleanText(closure.documentSha256).toLowerCase(),
      handoffSha256:cleanText(handoff.documentSha256).toLowerCase(),
      closedFrontendCommitSha:PRODUCTION_RELEASE_ARCHIVE_CLOSED_FRONTEND_SHA,
      archiveConsoleCommitSha:PRODUCTION_RELEASE_ARCHIVE_CONSOLE_SHA
    })
  });
}

export function createCertifiedReleaseArchive(evaluation, closureCertificate, operationsHandoff, {
  archivedBy='', confirmation=false, createdAt=new Date().toISOString(), notes=''
}={}) {
  const result=isObject(evaluation) ? evaluation : {};
  if (result.ready !== true || cleanText(result.status).toUpperCase() !== 'PASS') throw new TypeError('Release evidence is not ready for archival.');
  const archivist=cleanText(archivedBy,'',120); if (!archivist) throw new TypeError('Archivist is required.');
  if (confirmation !== true) throw new TypeError('Explicit archive confirmation is required.');
  const timestamp=cleanText(createdAt,'',80); if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError('createdAt must be a valid timestamp.');
  return Object.freeze({
    schema:1, milestone:'M3.93-M3.94', patch:PRODUCTION_RELEASE_ARCHIVE_PATCH,
    createdAt:timestamp, archivedBy:archivist,
    decision:'CERTIFIED_RELEASE_ARCHIVED', status:'ARCHIVE_SEALED', archiveConfirmed:true,
    sourceClosureCertificateSha256:cleanText(closureCertificate?.documentSha256).toLowerCase(),
    sourceOperationsHandoffSha256:cleanText(operationsHandoff?.documentSha256).toLowerCase(),
    releaseIdentity:Object.freeze({
      protocol:PRODUCTION_RELEASE_ARCHIVE_PROTOCOL, build:PRODUCTION_RELEASE_ARCHIVE_BUILD,
      releasePatch:PRODUCTION_RELEASE_ARCHIVE_RELEASE_PATCH, certifiedFrontendSha:PRODUCTION_RELEASE_ARCHIVE_CERTIFIED_SHA,
      releaseStatus:PRODUCTION_RELEASE_ARCHIVE_RELEASE_STATUS
    }),
    activeDeployment:Object.freeze({
      frontendOrigin:PRODUCTION_RELEASE_ARCHIVE_FRONTEND_ORIGIN,
      frontendCommitSha:PRODUCTION_RELEASE_ARCHIVE_CLOSED_FRONTEND_SHA,
      archiveConsoleCommitSha:PRODUCTION_RELEASE_ARCHIVE_CONSOLE_SHA,
      workerOrigin:PRODUCTION_RELEASE_ARCHIVE_WORKER_ORIGIN,
      workerVersionId:PRODUCTION_RELEASE_ARCHIVE_WORKER_VERSION_ID
    }),
    rollbackReference:Object.freeze({
      frontendCommitSha:PRODUCTION_RELEASE_ARCHIVE_ROLLBACK_SHA,
      workerVersionId:PRODUCTION_RELEASE_ARCHIVE_WORKER_VERSION_ID,
      retainWorkerDeployment:true
    }),
    retention:Object.freeze({ class:'RELEASE_LIFECYCLE_PERMANENT', immutable:true, minimumCopies:2 }),
    inventory:Object.freeze([
      'public deployment acceptance diagnostic', 'go-live certificate', 'production watch evidence',
      'production release closure certificate', 'operations handoff', 'certified release archive', 'recovery runbook'
    ]),
    notes:cleanText(notes,'',1600) || null
  });
}

export function createProductionRecoveryRunbook(certifiedArchive, {
  owner='', confirmation=false, createdAt=new Date().toISOString(), notes=''
}={}) {
  const source=isObject(certifiedArchive) ? certifiedArchive : {};
  if (!isSha256(source.documentSha256)) throw new TypeError('A sealed certified release archive is required.');
  for (const [field,expected,received] of [
    ['milestone','M3.93-M3.94',cleanText(source.milestone)],
    ['patch',PRODUCTION_RELEASE_ARCHIVE_PATCH,cleanText(source.patch)],
    ['decision','CERTIFIED_RELEASE_ARCHIVED',cleanText(source.decision).toUpperCase()],
    ['status','ARCHIVE_SEALED',cleanText(source.status).toUpperCase()],
    ['archiveConfirmed',true,source.archiveConfirmed === true]
  ]) if (expected !== received) throw new TypeError(`Certified archive field ${field} does not match.`);
  const recoveryOwner=cleanText(owner,'',120); if (!recoveryOwner) throw new TypeError('Recovery owner is required.');
  if (confirmation !== true) throw new TypeError('Explicit drill-only confirmation is required.');
  const timestamp=cleanText(createdAt,'',80); if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError('createdAt must be a valid timestamp.');
  return Object.freeze({
    schema:1, milestone:'M3.93-M3.94', patch:PRODUCTION_RELEASE_ARCHIVE_PATCH,
    createdAt:timestamp, owner:recoveryOwner,
    decision:'RECOVERY_RUNBOOK_AUTHORIZED', mode:'DRILL_ONLY_DO_NOT_EXECUTE', nonExecuting:true,
    sourceArchiveSha256:cleanText(source.documentSha256).toLowerCase(),
    releaseIdentity:Object.freeze({...source.releaseIdentity}),
    currentDeployment:Object.freeze({...source.activeDeployment}),
    rollbackTarget:Object.freeze({...source.rollbackReference}),
    triggerPolicy:Object.freeze({
      required:'Use the production release watch and require its confirmed rollback threshold before any live action.',
      liveActionAuthorized:false
    }),
    steps:Object.freeze([
      'Capture current production-release-watch evidence before changing any deployment.',
      'Stop if the watch does not authorize rollback; this runbook alone never authorizes live action.',
      'Preserve the current Pages deployment identifier and all evidence files.',
      `For an authorized frontend rollback, restore commit ${PRODUCTION_RELEASE_ARCHIVE_ROLLBACK_SHA} through Cloudflare Pages.`,
      `Retain Worker version ${PRODUCTION_RELEASE_ARCHIVE_WORKER_VERSION_ID} unless Worker code or certified identity changed.`,
      'Recheck Worker /health and /release for protocol 6, the certified build, and CERTIFIED status.',
      'Run public deployment acceptance and a two-client create/join, short-run, leave/rejoin test.',
      'Generate new go-live, watch, closure, handoff, and archive evidence for the recovered deployment.'
    ]),
    notes:cleanText(notes,'',1600) || null
  });
}
