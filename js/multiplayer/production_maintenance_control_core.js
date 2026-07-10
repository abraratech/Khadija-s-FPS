// js/multiplayer/production_maintenance_control_core.js
// M3.95-M3.96 — deterministic production maintenance baseline and change-control gate.

export const PRODUCTION_MAINTENANCE_PATCH = 'm3-production-maintenance-control-r1';
export const PRODUCTION_MAINTENANCE_CONSOLE_SHA = 'ff3fd2e86bea3505015359a8293e99d6baad7ab4';
export const PRODUCTION_MAINTENANCE_ARCHIVE_CONSOLE_SHA = '8522495c77764142f6aa60af1af688dc88c31938';
export const PRODUCTION_MAINTENANCE_ARCHIVED_FRONTEND_SHA = '93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8';
export const PRODUCTION_MAINTENANCE_ROLLBACK_SHA = '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250';
export const PRODUCTION_MAINTENANCE_ARCHIVE_PATCH = 'm3-certified-release-archive-r1';
export const PRODUCTION_MAINTENANCE_PROTOCOL = 6;
export const PRODUCTION_MAINTENANCE_BUILD = 'm3-team-final-world-reconnect-r3';
export const PRODUCTION_MAINTENANCE_RELEASE_PATCH = 'm3-production-release-manifest-r1';
export const PRODUCTION_MAINTENANCE_CERTIFIED_SHA = '3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b';
export const PRODUCTION_MAINTENANCE_RELEASE_STATUS = 'CERTIFIED';
export const PRODUCTION_MAINTENANCE_FRONTEND_ORIGIN = 'https://khadija-s-fps.pages.dev';
export const PRODUCTION_MAINTENANCE_WORKER_ORIGIN = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const PRODUCTION_MAINTENANCE_WORKER_VERSION_ID = '40175919-3d62-4986-9215-edf06eeddb98';

function cleanText(value, fallback='', limit=1800) {
  const text=String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0,limit);
}
function finiteInteger(value,fallback=-1){ const number=Number(value); return Number.isFinite(number)?Math.trunc(number):fallback; }
function isObject(value){ return value!==null && typeof value==='object' && !Array.isArray(value); }
function normalizedOrigin(value){ try{return new URL(String(value||'')).origin;}catch{return '';} }
function isSha256(value){ return /^[a-f0-9]{64}$/.test(cleanText(value).toLowerCase()); }
function finding(code,message,details={}){ return Object.freeze({code,message,details:Object.freeze({...details})}); }

function canonicalValue(value){
  if(value===null || typeof value==='string' || typeof value==='boolean') return value;
  if(typeof value==='number'){ if(!Number.isFinite(value)) throw new TypeError('Canonical JSON cannot contain non-finite numbers.'); return value; }
  if(Array.isArray(value)) return value.map(canonicalValue);
  if(isObject(value)){
    const output={};
    for(const key of Object.keys(value).sort()){
      const item=value[key];
      if(item===undefined || typeof item==='function' || typeof item==='symbol') throw new TypeError(`Canonical JSON contains unsupported value at ${key}.`);
      output[key]=canonicalValue(item);
    }
    return output;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
}
export function canonicalProductionMaintenanceJson(value){ return JSON.stringify(canonicalValue(value)); }

export function createExpectedProductionMaintenanceManifest(){
  return Object.freeze({"ok":true,"service":"khadijas-arena-production-maintenance-control","patch":"m3-production-maintenance-control-r1","maintenanceControlCommitSha":"ff3fd2e86bea3505015359a8293e99d6baad7ab4","archiveConsoleCommitSha":"8522495c77764142f6aa60af1af688dc88c31938","archivedFrontendCommitSha":"93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8","rollbackFrontendSha":"9f83a7254c06995aa9a4d46e8de4e9dfa18c3250","protocol":6,"build":"m3-team-final-world-reconnect-r3","releasePatch":"m3-production-release-manifest-r1","certifiedFrontendSha":"3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b","releaseStatus":"CERTIFIED","frontendUrl":"https://khadija-s-fps.pages.dev","workerUrl":"https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev","workerVersionId":"40175919-3d62-4986-9215-edf06eeddb98","sourceArchivePath":"/production-release-archive.html","pagePath":"/production-maintenance-control.html","requiredArchiveDecision":"CERTIFIED_RELEASE_ARCHIVED","requiredArchiveStatus":"ARCHIVE_SEALED","requiredRunbookDecision":"RECOVERY_RUNBOOK_AUTHORIZED","requiredRunbookMode":"DRILL_ONLY_DO_NOT_EXECUTE","defaultChangeScope":"NO_CHANGE","liveActionAuthorized":false});
}

function checkIdentity(errors,source,prefix){
  const value=isObject(source)?source:{};
  for(const [field,expected,received] of [
    ['protocol',PRODUCTION_MAINTENANCE_PROTOCOL,finiteInteger(value.protocol)],
    ['build',PRODUCTION_MAINTENANCE_BUILD,cleanText(value.build)],
    ['releasePatch',PRODUCTION_MAINTENANCE_RELEASE_PATCH,cleanText(value.releasePatch)],
    ['certifiedFrontendSha',PRODUCTION_MAINTENANCE_CERTIFIED_SHA,cleanText(value.certifiedFrontendSha)],
    ['releaseStatus',PRODUCTION_MAINTENANCE_RELEASE_STATUS,cleanText(value.releaseStatus).toUpperCase()]
  ]) if(expected!==received) errors.push(finding(`${prefix}_IDENTITY_MISMATCH`,`${prefix.toLowerCase()} release identity field ${field} does not match.`,{field,expected,received}));
}

function checkTimestamp(errors,timestamp,prefix,nowMs){
  const parsed=Date.parse(cleanText(timestamp));
  if(!Number.isFinite(parsed)){ errors.push(finding(`${prefix}_TIME_INVALID`,`${prefix.toLowerCase()} timestamp is invalid.`)); return NaN; }
  if(parsed>nowMs+5*60*1000) errors.push(finding(`${prefix}_TIME_FUTURE`,`${prefix.toLowerCase()} timestamp is unexpectedly in the future.`));
  return parsed;
}

export function evaluateProductionMaintenanceEvidence({manifest=null,certifiedArchive=null,archiveDigestValid=false,recoveryRunbook=null,runbookDigestValid=false,nowMs=Date.now()}={}){
  const errors=[]; const warnings=[];
  const expectedManifest=createExpectedProductionMaintenanceManifest();
  const actualManifest=isObject(manifest)?manifest:{};
  for(const [field,expected] of Object.entries(expectedManifest)){
    let received=actualManifest[field];
    const normalizedExpected=field.endsWith('Url')?normalizedOrigin(expected):expected;
    if(field.endsWith('Url')) received=normalizedOrigin(received);
    if(normalizedExpected!==received) errors.push(finding('MAINTENANCE_MANIFEST_MISMATCH',`Maintenance manifest field ${field} does not match.`,{field,expected:normalizedExpected,received}));
  }

  const archive=isObject(certifiedArchive)?certifiedArchive:{};
  if(archiveDigestValid!==true || !isSha256(archive.documentSha256)) errors.push(finding('ARCHIVE_DIGEST_MISMATCH','Certified archive SHA-256 seal is missing or invalid.'));
  for(const [field,expected,received] of [
    ['schema',1,finiteInteger(archive.schema)],
    ['milestone','M3.93-M3.94',cleanText(archive.milestone)],
    ['patch',PRODUCTION_MAINTENANCE_ARCHIVE_PATCH,cleanText(archive.patch)],
    ['decision','CERTIFIED_RELEASE_ARCHIVED',cleanText(archive.decision).toUpperCase()],
    ['status','ARCHIVE_SEALED',cleanText(archive.status).toUpperCase()],
    ['archiveConfirmed',true,archive.archiveConfirmed===true]
  ]) if(expected!==received) errors.push(finding('ARCHIVE_FIELD_MISMATCH',`Certified archive field ${field} does not match.`,{field,expected,received}));
  checkIdentity(errors,archive.releaseIdentity,'ARCHIVE');
  for(const [field,expected,received] of [
    ['frontendOrigin',PRODUCTION_MAINTENANCE_FRONTEND_ORIGIN,normalizedOrigin(archive.activeDeployment?.frontendOrigin)],
    ['frontendCommitSha',PRODUCTION_MAINTENANCE_ARCHIVED_FRONTEND_SHA,cleanText(archive.activeDeployment?.frontendCommitSha)],
    ['archiveConsoleCommitSha',PRODUCTION_MAINTENANCE_ARCHIVE_CONSOLE_SHA,cleanText(archive.activeDeployment?.archiveConsoleCommitSha)],
    ['workerOrigin',PRODUCTION_MAINTENANCE_WORKER_ORIGIN,normalizedOrigin(archive.activeDeployment?.workerOrigin)],
    ['workerVersionId',PRODUCTION_MAINTENANCE_WORKER_VERSION_ID,cleanText(archive.activeDeployment?.workerVersionId)],
    ['rollbackFrontendSha',PRODUCTION_MAINTENANCE_ROLLBACK_SHA,cleanText(archive.rollbackReference?.frontendCommitSha)],
    ['rollbackWorkerVersionId',PRODUCTION_MAINTENANCE_WORKER_VERSION_ID,cleanText(archive.rollbackReference?.workerVersionId)],
    ['retainWorkerDeployment',true,archive.rollbackReference?.retainWorkerDeployment===true],
    ['retentionClass','RELEASE_LIFECYCLE_PERMANENT',cleanText(archive.retention?.class)],
    ['immutable',true,archive.retention?.immutable===true]
  ]) if(expected!==received) errors.push(finding('ARCHIVE_DEPLOYMENT_MISMATCH',`Certified archive field ${field} does not match.`,{field,expected,received}));
  const archiveTime=checkTimestamp(errors,archive.createdAt,'ARCHIVE',nowMs);

  const runbook=isObject(recoveryRunbook)?recoveryRunbook:{};
  if(runbookDigestValid!==true || !isSha256(runbook.documentSha256)) errors.push(finding('RUNBOOK_DIGEST_MISMATCH','Recovery runbook SHA-256 seal is missing or invalid.'));
  for(const [field,expected,received] of [
    ['schema',1,finiteInteger(runbook.schema)],
    ['milestone','M3.93-M3.94',cleanText(runbook.milestone)],
    ['patch',PRODUCTION_MAINTENANCE_ARCHIVE_PATCH,cleanText(runbook.patch)],
    ['decision','RECOVERY_RUNBOOK_AUTHORIZED',cleanText(runbook.decision).toUpperCase()],
    ['mode','DRILL_ONLY_DO_NOT_EXECUTE',cleanText(runbook.mode).toUpperCase()],
    ['nonExecuting',true,runbook.nonExecuting===true],
    ['sourceArchiveSha256',cleanText(archive.documentSha256).toLowerCase(),cleanText(runbook.sourceArchiveSha256).toLowerCase()],
    ['liveActionAuthorized',false,runbook.triggerPolicy?.liveActionAuthorized===false?false:true]
  ]) if(expected!==received) errors.push(finding('RUNBOOK_FIELD_MISMATCH',`Recovery runbook field ${field} does not match.`,{field,expected,received}));
  checkIdentity(errors,runbook.releaseIdentity,'RUNBOOK');
  for(const [field,expected,received] of [
    ['frontendOrigin',PRODUCTION_MAINTENANCE_FRONTEND_ORIGIN,normalizedOrigin(runbook.currentDeployment?.frontendOrigin)],
    ['frontendCommitSha',PRODUCTION_MAINTENANCE_ARCHIVED_FRONTEND_SHA,cleanText(runbook.currentDeployment?.frontendCommitSha)],
    ['archiveConsoleCommitSha',PRODUCTION_MAINTENANCE_ARCHIVE_CONSOLE_SHA,cleanText(runbook.currentDeployment?.archiveConsoleCommitSha)],
    ['workerOrigin',PRODUCTION_MAINTENANCE_WORKER_ORIGIN,normalizedOrigin(runbook.currentDeployment?.workerOrigin)],
    ['workerVersionId',PRODUCTION_MAINTENANCE_WORKER_VERSION_ID,cleanText(runbook.currentDeployment?.workerVersionId)],
    ['rollbackFrontendSha',PRODUCTION_MAINTENANCE_ROLLBACK_SHA,cleanText(runbook.rollbackTarget?.frontendCommitSha)],
    ['retainWorkerDeployment',true,runbook.rollbackTarget?.retainWorkerDeployment===true]
  ]) if(expected!==received) errors.push(finding('RUNBOOK_DEPLOYMENT_MISMATCH',`Recovery runbook field ${field} does not match.`,{field,expected,received}));
  const runbookTime=checkTimestamp(errors,runbook.createdAt,'RUNBOOK',nowMs);
  if(Number.isFinite(archiveTime)&&Number.isFinite(runbookTime)&&runbookTime<archiveTime) errors.push(finding('RUNBOOK_PRECEDES_ARCHIVE','Recovery runbook predates the certified archive.'));
  if(errors.length===0 && nowMs-archiveTime>365*24*60*60*1000) warnings.push(finding('PERMANENT_ARCHIVE_AGE','Permanent archive is older than one year; its seal remains valid, but confirm operational contacts.'));
  return Object.freeze({ready:errors.length===0,status:errors.length===0?'PASS':'BLOCKED',errors:Object.freeze(errors),warnings:Object.freeze(warnings),archiveTime,runbookTime,expectedManifest});
}

export function createCertifiedMaintenanceBaseline(evaluation,certifiedArchive,recoveryRunbook,{owner='',confirmation=false,createdAt=new Date().toISOString(),notes=''}={}){
  const result=isObject(evaluation)?evaluation:{};
  if(result.ready!==true || cleanText(result.status).toUpperCase()!=='PASS') throw new TypeError('Maintenance evidence is not ready.');
  const maintenanceOwner=cleanText(owner,'',120); if(!maintenanceOwner) throw new TypeError('Maintenance owner is required.');
  if(confirmation!==true) throw new TypeError('Explicit maintenance-baseline confirmation is required.');
  const timestamp=cleanText(createdAt,'',80); if(!Number.isFinite(Date.parse(timestamp))) throw new TypeError('createdAt must be a valid timestamp.');
  if(!isSha256(certifiedArchive?.documentSha256)||!isSha256(recoveryRunbook?.documentSha256)) throw new TypeError('Sealed archive and runbook documents are required.');
  return Object.freeze({
    schema:1,milestone:'M3.95-M3.96',patch:PRODUCTION_MAINTENANCE_PATCH,createdAt:timestamp,owner:maintenanceOwner,
    decision:'CERTIFIED_MAINTENANCE_BASELINE',status:'BASELINE_LOCKED',baselineConfirmed:true,nonExecuting:true,
    sourceArchiveSha256:cleanText(certifiedArchive.documentSha256).toLowerCase(),sourceRecoveryRunbookSha256:cleanText(recoveryRunbook.documentSha256).toLowerCase(),
    operationsBaselineCommitSha:PRODUCTION_MAINTENANCE_CONSOLE_SHA,
    releaseIdentity:Object.freeze({protocol:PRODUCTION_MAINTENANCE_PROTOCOL,build:PRODUCTION_MAINTENANCE_BUILD,releasePatch:PRODUCTION_MAINTENANCE_RELEASE_PATCH,certifiedFrontendSha:PRODUCTION_MAINTENANCE_CERTIFIED_SHA,releaseStatus:PRODUCTION_MAINTENANCE_RELEASE_STATUS}),
    activeDeployment:Object.freeze({frontendOrigin:PRODUCTION_MAINTENANCE_FRONTEND_ORIGIN,archivedFrontendCommitSha:PRODUCTION_MAINTENANCE_ARCHIVED_FRONTEND_SHA,archiveConsoleCommitSha:PRODUCTION_MAINTENANCE_ARCHIVE_CONSOLE_SHA,maintenanceControlCommitSha:PRODUCTION_MAINTENANCE_CONSOLE_SHA,workerOrigin:PRODUCTION_MAINTENANCE_WORKER_ORIGIN,workerVersionId:PRODUCTION_MAINTENANCE_WORKER_VERSION_ID}),
    rollbackReference:Object.freeze({frontendCommitSha:PRODUCTION_MAINTENANCE_ROLLBACK_SHA,workerVersionId:PRODUCTION_MAINTENANCE_WORKER_VERSION_ID,retainWorkerDeployment:true}),
    changePolicy:Object.freeze({workerRedeployOnlyWhenWorkerCodeOrIdentityChanges:true,frontendDeployRequiredForFrontendChanges:true,fullCertificationRequiredForWorkerOrIdentityChanges:true,liveActionAuthorized:false}),
    notes:cleanText(notes,'',1600)||null
  });
}

function normalizeAffectedPaths(value){
  const source=Array.isArray(value)?value:String(value??'').split(/[\n,]+/);
  const paths=[]; const errors=[]; const seen=new Set();
  for(const raw of source){
    const path=String(raw??'').trim().replace(/\\/g,'/').replace(/^\.\//,'');
    if(!path) continue;
    if(path.length>240 || path.startsWith('/') || /^[A-Za-z]:\//.test(path) || path.split('/').includes('..')){ errors.push(finding('INVALID_AFFECTED_PATH','Affected path is unsafe or invalid.',{path})); continue; }
    if(!seen.has(path)){seen.add(path);paths.push(path);}
  }
  if(paths.length>100) errors.push(finding('TOO_MANY_AFFECTED_PATHS','At most 100 affected paths may be authorized.',{count:paths.length}));
  return {paths:paths.slice(0,100),errors};
}

export function classifyProductionMaintenanceChange({affectedPaths=[],workerCodeChanged=false,proposedProtocol=PRODUCTION_MAINTENANCE_PROTOCOL,proposedBuild=PRODUCTION_MAINTENANCE_BUILD,proposedReleasePatch=PRODUCTION_MAINTENANCE_RELEASE_PATCH}={}){
  const normalized=normalizeAffectedPaths(affectedPaths); const errors=[...normalized.errors]; const warnings=[];
  const paths=normalized.paths;
  const workerPaths=paths.filter(path=>path==='multiplayer-server'||path.startsWith('multiplayer-server/'));
  const frontendPaths=paths.filter(path=>!workerPaths.includes(path));
  const identity=Object.freeze({protocol:finiteInteger(proposedProtocol),build:cleanText(proposedBuild,'',160),releasePatch:cleanText(proposedReleasePatch,'',160)});
  if(identity.protocol<1) errors.push(finding('PROTOCOL_INVALID','Proposed protocol must be a positive integer.'));
  if(!identity.build) errors.push(finding('BUILD_INVALID','Proposed Worker build is required.'));
  if(!identity.releasePatch) errors.push(finding('RELEASE_PATCH_INVALID','Proposed release patch is required.'));
  const identityChanges=Object.freeze({protocol:identity.protocol!==PRODUCTION_MAINTENANCE_PROTOCOL,build:identity.build!==PRODUCTION_MAINTENANCE_BUILD,releasePatch:identity.releasePatch!==PRODUCTION_MAINTENANCE_RELEASE_PATCH});
  const identityChanged=Object.values(identityChanges).some(Boolean);
  const workerChanged=workerCodeChanged===true || workerPaths.length>0;
  let scope='NO_CHANGE';
  if(errors.length) scope='BLOCKED';
  else if(identityChanged) scope='RELEASE_IDENTITY';
  else if(workerChanged) scope='WORKER_CODE';
  else if(frontendPaths.length) scope='FRONTEND_ONLY';
  const workerDeploymentRequired=scope==='WORKER_CODE'||scope==='RELEASE_IDENTITY';
  const pagesDeploymentRequired=frontendPaths.length>0;
  const fullCertificationRequired=workerDeploymentRequired;
  if(identityChanged && workerPaths.length===0 && workerCodeChanged!==true) warnings.push(finding('IDENTITY_CHANGE_IMPLIES_WORKER_DEPLOY','Release identity changed without an explicit Worker path; Worker deployment and full recertification are still required.'));
  if(scope==='NO_CHANGE') warnings.push(finding('NO_CHANGE_DECLARED','No repository path or release identity change was declared.'));
  const requiredChecks=[];
  if(pagesDeploymentRequired) requiredChecks.push('Cloudflare Pages deployment','public deployment acceptance','production runtime audit','two-client smoke test');
  if(workerDeploymentRequired) requiredChecks.push('Worker deployment','Worker /health and /release verification','certified release manifest renewal','full go-live evidence chain');
  if(scope==='NO_CHANGE') requiredChecks.push('No deployment required');
  return Object.freeze({ready:errors.length===0&&scope!=='NO_CHANGE',status:errors.length?'BLOCKED':scope==='NO_CHANGE'?'NO_CHANGE':'READY',scope,errors:Object.freeze(errors),warnings:Object.freeze(warnings),affectedPaths:Object.freeze(paths),frontendPaths:Object.freeze(frontendPaths),workerPaths:Object.freeze(workerPaths),workerCodeChanged:workerChanged,identityChanges,proposedIdentity:identity,deploymentPlan:Object.freeze({pagesDeploymentRequired,workerDeploymentRequired,fullCertificationRequired,preserveCurrentWorkerDeployment:!workerDeploymentRequired,liveActionAuthorized:false}),requiredChecks:Object.freeze(requiredChecks)});
}

export function createMaintenanceChangeAuthorization(sealedBaseline,classification,{ticket='',approver='',summary='',confirmation=false,createdAt=new Date().toISOString()}={}){
  const baseline=isObject(sealedBaseline)?sealedBaseline:{}; const result=isObject(classification)?classification:{};
  if(!isSha256(baseline.documentSha256)) throw new TypeError('A sealed maintenance baseline is required.');
  for(const [field,expected,received] of [
    ['milestone','M3.95-M3.96',cleanText(baseline.milestone)],['patch',PRODUCTION_MAINTENANCE_PATCH,cleanText(baseline.patch)],
    ['decision','CERTIFIED_MAINTENANCE_BASELINE',cleanText(baseline.decision).toUpperCase()],['status','BASELINE_LOCKED',cleanText(baseline.status).toUpperCase()],
    ['baselineConfirmed',true,baseline.baselineConfirmed===true],['nonExecuting',true,baseline.nonExecuting===true]
  ]) if(expected!==received) throw new TypeError(`Maintenance baseline field ${field} does not match.`);
  if(result.ready!==true || cleanText(result.status).toUpperCase()!=='READY' || !['FRONTEND_ONLY','WORKER_CODE','RELEASE_IDENTITY'].includes(cleanText(result.scope).toUpperCase())) throw new TypeError('A deployable maintenance change classification is required.');
  const changeTicket=cleanText(ticket,'',120); if(!changeTicket) throw new TypeError('Change ticket is required.');
  const changeApprover=cleanText(approver,'',120); if(!changeApprover) throw new TypeError('Change approver is required.');
  const changeSummary=cleanText(summary,'',1600); if(!changeSummary) throw new TypeError('Change summary is required.');
  if(confirmation!==true) throw new TypeError('Explicit change-control confirmation is required.');
  const timestamp=cleanText(createdAt,'',80); if(!Number.isFinite(Date.parse(timestamp))) throw new TypeError('createdAt must be a valid timestamp.');
  return Object.freeze({
    schema:1,milestone:'M3.95-M3.96',patch:PRODUCTION_MAINTENANCE_PATCH,createdAt:timestamp,ticket:changeTicket,approver:changeApprover,
    decision:'MAINTENANCE_CHANGE_AUTHORIZED',mode:'CHANGE_CONTROL_ONLY_DO_NOT_DEPLOY',liveActionAuthorized:false,sourceMaintenanceBaselineSha256:cleanText(baseline.documentSha256).toLowerCase(),
    scope:result.scope,summary:changeSummary,affectedPaths:Object.freeze([...result.affectedPaths]),proposedIdentity:Object.freeze({...result.proposedIdentity}),identityChanges:Object.freeze({...result.identityChanges}),
    deploymentPlan:Object.freeze({...result.deploymentPlan}),requiredChecks:Object.freeze([...result.requiredChecks]),
    currentReleaseIdentity:Object.freeze({...baseline.releaseIdentity}),currentDeployment:Object.freeze({...baseline.activeDeployment}),rollbackReference:Object.freeze({...baseline.rollbackReference}),
    authorizationLimits:Object.freeze({expiresAfterHours:72,requiresCleanBaselineSha:true,requiresFreshPublicValidation:true,executesDeployment:false})
  });
}
