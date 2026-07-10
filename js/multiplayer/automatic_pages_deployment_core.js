export const AUTOMATIC_PAGES_DEPLOYMENT_PATCH = "m3-automatic-pages-deployment-r1";
export const AUTOMATIC_PAGES_DEPLOYMENT_MILESTONE = "M3.97-M3.98";
export const AUTOMATIC_PAGES_ACCEPTED_COMMIT_SHA = "bb2545fad7c7589af25348b4d6f7359e0f9aa8be";
export const AUTOMATIC_PAGES_FRONTEND_ORIGIN = "https://khadija-s-fps.pages.dev";
export const AUTOMATIC_PAGES_WORKER_ORIGIN = "https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev";
export const AUTOMATIC_PAGES_WORKER_VERSION_ID = "40175919-3d62-4986-9215-edf06eeddb98";
export const AUTOMATIC_PAGES_PROTOCOL = 6;
export const AUTOMATIC_PAGES_BUILD = "m3-team-final-world-reconnect-r3";
export const AUTOMATIC_PAGES_RELEASE_PATCH = "m3-production-release-manifest-r1";
export const AUTOMATIC_PAGES_CERTIFIED_SHA = "3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b";
export const AUTOMATIC_PAGES_ROLLBACK_SHA = "9f83a7254c06995aa9a4d46e8de4e9dfa18c3250";
export const EXPECTED_MAINTENANCE_ARTIFACT_SHA256 = Object.freeze({"js/multiplayer/production_maintenance_control.js":"cba918591af8a790386958fffc1000eb4b791c2850c8fa4df588d9fbda8d1b5e","js/multiplayer/production_maintenance_control_core.js":"0953995d375d1b60899f33c0022873063413e912cca4b70230b55528d1be5faa","js/multiplayer/production_maintenance_control_core.test.js":"a298e52187a8d96f094d9604c3a3cf18dd0329cfa14e1aee18fdb48550f744be","production-maintenance-control.html":"6a8d686bc0c2d3ddd6cd4f54ebbded9809f737c465489857942a2d21b650f063","production-maintenance-control.json":"f628bb498fe414c9d1d18ebdbb3930051e74a9cc3ed7a65067edb23e34ef224d"});

function isObject(value){ return value!==null && typeof value==='object' && !Array.isArray(value); }
function cleanText(value){ return typeof value==='string' ? value.trim() : ''; }
function finiteInteger(value){ const number=Number(value); return Number.isInteger(number)?number:NaN; }
function isSha(value){ return /^[a-f0-9]{40}$/i.test(cleanText(value)); }
function isSha256(value){ return /^[a-f0-9]{64}$/i.test(cleanText(value)); }
function normalizedOrigin(value){ try{ return new URL(cleanText(value)).origin; }catch{ return ''; } }
function finding(code,message,details={}){ return Object.freeze({code,message,...details}); }
function canonicalValue(value){
  if(value===null || typeof value==='string' || typeof value==='boolean') return value;
  if(typeof value==='number'){ if(!Number.isFinite(value)) throw new TypeError('Canonical JSON requires finite numbers.'); return value; }
  if(Array.isArray(value)) return value.map(canonicalValue);
  if(isObject(value)){ const output={}; for(const key of Object.keys(value).sort()){ const item=value[key]; if(item===undefined || typeof item==='function' || typeof item==='symbol') throw new TypeError(`Canonical JSON contains unsupported value at ${key}.`); output[key]=canonicalValue(item); } return output; }
  throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
}
export function canonicalAutomaticPagesDeploymentJson(value){ return JSON.stringify(canonicalValue(value)); }

export function createExpectedAutomaticPagesDeploymentManifest(){
  return Object.freeze({"ok":true,"service":"khadijas-arena-automatic-pages-deployment","patch":"m3-automatic-pages-deployment-r1","deploymentReceiptSourceCommitSha":"bb2545fad7c7589af25348b4d6f7359e0f9aa8be","acceptedMaintenanceCommitSha":"bb2545fad7c7589af25348b4d6f7359e0f9aa8be","maintenanceControlSourceCommitSha":"ff3fd2e86bea3505015359a8293e99d6baad7ab4","archivedFrontendCommitSha":"93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8","rollbackFrontendSha":"9f83a7254c06995aa9a4d46e8de4e9dfa18c3250","protocol":6,"build":"m3-team-final-world-reconnect-r3","releasePatch":"m3-production-release-manifest-r1","certifiedFrontendSha":"3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b","releaseStatus":"CERTIFIED","frontendUrl":"https://khadija-s-fps.pages.dev","workerUrl":"https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev","workerVersionId":"40175919-3d62-4986-9215-edf06eeddb98","deploymentMode":"GITHUB_CONNECTED_AUTOMATIC","deploymentTrigger":"GITHUB_PUSH","manualPagesDeploymentRequired":false,"workerRedeployRequired":false,"maintenanceManifestPath":"/production-maintenance-control.json","frontendReleaseManifestPath":"/multiplayer-release.json","pagePath":"/automatic-pages-deployment.html","expectedMaintenanceArtifactSha256":{"js/multiplayer/production_maintenance_control.js":"cba918591af8a790386958fffc1000eb4b791c2850c8fa4df588d9fbda8d1b5e","js/multiplayer/production_maintenance_control_core.js":"0953995d375d1b60899f33c0022873063413e912cca4b70230b55528d1be5faa","js/multiplayer/production_maintenance_control_core.test.js":"a298e52187a8d96f094d9604c3a3cf18dd0329cfa14e1aee18fdb48550f744be","production-maintenance-control.html":"6a8d686bc0c2d3ddd6cd4f54ebbded9809f737c465489857942a2d21b650f063","production-maintenance-control.json":"f628bb498fe414c9d1d18ebdbb3930051e74a9cc3ed7a65067edb23e34ef224d"},"requiredReceiptDecision":"PAGES_DEPLOYMENT_VERIFIED","requiredReceiptStatus":"AUTO_DEPLOYMENT_ACCEPTED","requiredActivationDecision":"CERTIFIED_MAINTENANCE_ACTIVE","requiredActivationStatus":"ACTIVE_NO_WORKER_REDEPLOY","liveActionAuthorized":false});
}

function compareManifest(errors,manifest){
  const expected=createExpectedAutomaticPagesDeploymentManifest();
  const actual=isObject(manifest)?manifest:{};
  for(const [field,expectedValue] of Object.entries(expected)){
    const received=actual[field];
    if(canonicalAutomaticPagesDeploymentJson(received)!==canonicalAutomaticPagesDeploymentJson(expectedValue))
      errors.push(finding('DEPLOYMENT_MANIFEST_MISMATCH',`Automatic deployment manifest field ${field} does not match.`,{field,expected:expectedValue,received}));
  }
}

function checkReleaseIdentity(errors,source,prefix){
  const value=isObject(source)?source:{};
  for(const [field,expected,received] of [
    ['protocol',AUTOMATIC_PAGES_PROTOCOL,finiteInteger(value.protocol)],
    ['build',AUTOMATIC_PAGES_BUILD,cleanText(value.build)],
    ['patch',AUTOMATIC_PAGES_RELEASE_PATCH,cleanText(value.patch ?? value.releasePatch)],
    ['certifiedFrontendSha',AUTOMATIC_PAGES_CERTIFIED_SHA,cleanText(value.certifiedFrontendSha)],
    ['releaseStatus','CERTIFIED',cleanText(value.releaseStatus).toUpperCase()]
  ]) if(expected!==received) errors.push(finding(`${prefix}_IDENTITY_MISMATCH`,`${prefix.toLowerCase()} release identity field ${field} does not match.`,{field,expected,received}));
}

export function evaluateAutomaticPagesDeploymentEvidence({
  manifest=null,productionOrigin='',submittedCommitSha='',githubPushConfirmed=false,automaticDeploymentConfirmed=false,
  maintenanceManifest=null,artifactChecks=[],frontendRelease=null,workerRelease=null
}={}){
  const errors=[]; const warnings=[];
  compareManifest(errors,manifest);
  const origin=normalizedOrigin(productionOrigin);
  if(origin!==AUTOMATIC_PAGES_FRONTEND_ORIGIN) errors.push(finding('PRODUCTION_ORIGIN_REQUIRED','Open the receipt console from the production Cloudflare Pages origin.',{expected:AUTOMATIC_PAGES_FRONTEND_ORIGIN,received:origin}));
  const commit=cleanText(submittedCommitSha).toLowerCase();
  if(!isSha(commit) || commit!==AUTOMATIC_PAGES_ACCEPTED_COMMIT_SHA) errors.push(finding('GITHUB_COMMIT_MISMATCH','The confirmed GitHub commit does not match the accepted M3.95-M3.96 commit.',{expected:AUTOMATIC_PAGES_ACCEPTED_COMMIT_SHA,received:commit}));
  if(githubPushConfirmed!==true) errors.push(finding('GITHUB_PUSH_UNCONFIRMED','Confirm that the accepted commit was pushed to GitHub.'));
  if(automaticDeploymentConfirmed!==true) errors.push(finding('AUTOMATIC_DEPLOYMENT_UNCONFIRMED','Confirm that Cloudflare Pages completed the GitHub-triggered deployment.'));

  const maintenance=isObject(maintenanceManifest)?maintenanceManifest:{};
  for(const [field,expected,received] of [
    ['service','khadijas-arena-production-maintenance-control',cleanText(maintenance.service)],
    ['patch','m3-production-maintenance-control-r1',cleanText(maintenance.patch)],
    ['maintenanceControlCommitSha',"ff3fd2e86bea3505015359a8293e99d6baad7ab4",cleanText(maintenance.maintenanceControlCommitSha)],
    ['protocol',AUTOMATIC_PAGES_PROTOCOL,finiteInteger(maintenance.protocol)],
    ['build',AUTOMATIC_PAGES_BUILD,cleanText(maintenance.build)],
    ['releasePatch',AUTOMATIC_PAGES_RELEASE_PATCH,cleanText(maintenance.releasePatch)],
    ['certifiedFrontendSha',AUTOMATIC_PAGES_CERTIFIED_SHA,cleanText(maintenance.certifiedFrontendSha)],
    ['releaseStatus','CERTIFIED',cleanText(maintenance.releaseStatus).toUpperCase()],
    ['workerVersionId',AUTOMATIC_PAGES_WORKER_VERSION_ID,cleanText(maintenance.workerVersionId)],
    ['workerRedeployRequired',false,maintenance.workerRedeployRequired===true]
  ]) if(expected!==received) errors.push(finding('MAINTENANCE_MANIFEST_MISMATCH',`Deployed maintenance manifest field ${field} does not match.`,{field,expected,received}));

  const expectedPaths=Object.keys(EXPECTED_MAINTENANCE_ARTIFACT_SHA256).sort();
  const checks=Array.isArray(artifactChecks)?artifactChecks:[];
  const byPath=new Map(checks.filter(isObject).map(item=>[cleanText(item.path),item]));
  for(const path of expectedPaths){
    const check=byPath.get(path); const expected=EXPECTED_MAINTENANCE_ARTIFACT_SHA256[path];
    if(!check){ errors.push(finding('ARTIFACT_CHECK_MISSING','A required maintenance artifact was not checked.',{path})); continue; }
    const actual=cleanText(check.actualSha256).toLowerCase();
    if(check.ok!==true || !isSha256(actual) || actual!==expected) errors.push(finding('ARTIFACT_HASH_MISMATCH','A deployed maintenance artifact does not match the accepted SHA-256.',{path,expected,received:actual,httpStatus:check.httpStatus??null}));
  }
  for(const path of byPath.keys()) if(!Object.prototype.hasOwnProperty.call(EXPECTED_MAINTENANCE_ARTIFACT_SHA256,path)) warnings.push(finding('UNEXPECTED_ARTIFACT_CHECK','An extra artifact check was ignored.',{path}));

  checkReleaseIdentity(errors,frontendRelease,'FRONTEND');
  checkReleaseIdentity(errors,workerRelease,'WORKER');
  if(normalizedOrigin(workerRelease?.workerUrl ?? AUTOMATIC_PAGES_WORKER_ORIGIN)!==AUTOMATIC_PAGES_WORKER_ORIGIN)
    errors.push(finding('WORKER_ORIGIN_MISMATCH','Worker release origin does not match the certified Worker.'));

  const ready=errors.length===0;
  return Object.freeze({
    ready,
    decision:ready?'PAGES_DEPLOYMENT_VERIFIED':'DEPLOYMENT_EVIDENCE_BLOCKED',
    status:ready?'AUTO_DEPLOYMENT_ACCEPTED':'BLOCKED',
    errors:Object.freeze(errors),warnings:Object.freeze(warnings),
    acceptedCommitSha:AUTOMATIC_PAGES_ACCEPTED_COMMIT_SHA,
    productionOrigin:origin,
    verifiedArtifactCount:ready?expectedPaths.length:checks.filter(item=>item?.ok===true).length,
    expectedArtifactCount:expectedPaths.length,
    releaseIdentity:Object.freeze({protocol:AUTOMATIC_PAGES_PROTOCOL,build:AUTOMATIC_PAGES_BUILD,releasePatch:AUTOMATIC_PAGES_RELEASE_PATCH,certifiedFrontendSha:AUTOMATIC_PAGES_CERTIFIED_SHA,releaseStatus:'CERTIFIED'}),
    deploymentPolicy:Object.freeze({mode:'GITHUB_CONNECTED_AUTOMATIC',trigger:'GITHUB_PUSH',manualPagesDeploymentRequired:false,workerRedeployRequired:false})
  });
}

export function createAutomaticPagesDeploymentReceipt({evaluation,operator='',notes='',createdAt=new Date().toISOString()}={}){
  if(!evaluation?.ready) throw new Error('Passing automatic deployment evidence is required.');
  const cleanOperator=cleanText(operator); if(!cleanOperator) throw new Error('Receipt operator is required.');
  return Object.freeze({
    schema:1,milestone:AUTOMATIC_PAGES_DEPLOYMENT_MILESTONE,patch:AUTOMATIC_PAGES_DEPLOYMENT_PATCH,
    decision:'PAGES_DEPLOYMENT_VERIFIED',status:'AUTO_DEPLOYMENT_ACCEPTED',createdAt,
    operator:cleanOperator,notes:cleanText(notes),
    sourceCommitSha:AUTOMATIC_PAGES_ACCEPTED_COMMIT_SHA,
    deployment:Object.freeze({frontendOrigin:AUTOMATIC_PAGES_FRONTEND_ORIGIN,mode:'GITHUB_CONNECTED_AUTOMATIC',trigger:'GITHUB_PUSH',verifiedArtifactCount:evaluation.expectedArtifactCount,manualPagesDeploymentRequired:false}),
    releaseIdentity:evaluation.releaseIdentity,
    worker:Object.freeze({origin:AUTOMATIC_PAGES_WORKER_ORIGIN,versionId:AUTOMATIC_PAGES_WORKER_VERSION_ID,redeployRequired:false}),
    rollbackReference:Object.freeze({frontendCommitSha:AUTOMATIC_PAGES_ROLLBACK_SHA}),
    evidence:Object.freeze({artifactSha256:EXPECTED_MAINTENANCE_ARTIFACT_SHA256,warnings:evaluation.warnings})
  });
}

export function createCertifiedMaintenanceActivation({deploymentReceipt=null,deploymentReceiptSha256='',approver='',activationConfirmed=false,createdAt=new Date().toISOString()}={}){
  if(!isObject(deploymentReceipt) || cleanText(deploymentReceipt.decision)!=='PAGES_DEPLOYMENT_VERIFIED' || cleanText(deploymentReceipt.status)!=='AUTO_DEPLOYMENT_ACCEPTED') throw new Error('A valid deployment receipt is required.');
  const digest=cleanText(deploymentReceiptSha256).toLowerCase(); if(!isSha256(digest)) throw new Error('The sealed deployment receipt SHA-256 is required.');
  const cleanApprover=cleanText(approver); if(!cleanApprover) throw new Error('Activation approver is required.');
  if(activationConfirmed!==true) throw new Error('Maintenance activation confirmation is required.');
  return Object.freeze({
    schema:1,milestone:AUTOMATIC_PAGES_DEPLOYMENT_MILESTONE,patch:AUTOMATIC_PAGES_DEPLOYMENT_PATCH,
    decision:'CERTIFIED_MAINTENANCE_ACTIVE',status:'ACTIVE_NO_WORKER_REDEPLOY',createdAt,
    approver:cleanApprover,deploymentReceiptSha256:digest,
    activeDeployment:Object.freeze({frontendOrigin:AUTOMATIC_PAGES_FRONTEND_ORIGIN,acceptedCommitSha:AUTOMATIC_PAGES_ACCEPTED_COMMIT_SHA,deploymentMode:'GITHUB_CONNECTED_AUTOMATIC'}),
    releaseIdentity:deploymentReceipt.releaseIdentity,
    worker:Object.freeze({origin:AUTOMATIC_PAGES_WORKER_ORIGIN,versionId:AUTOMATIC_PAGES_WORKER_VERSION_ID,redeployRequired:false}),
    rollbackReference:Object.freeze({frontendCommitSha:AUTOMATIC_PAGES_ROLLBACK_SHA}),
    nextMilestone:'M3.99-M3.100',liveActionAuthorized:false
  });
}
