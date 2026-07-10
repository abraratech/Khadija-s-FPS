export const M3_PROGRAM_COMPLETION_PATCH = "m3-final-program-completion-r1";
export const M3_PROGRAM_COMPLETION_MILESTONE = "M3.99-M3.100";
export const M3_PROGRAM_BASELINE_SHA = "604693799eee61d7cdb8e745f62910538c95f3f6";
export const M3_AUTOMATIC_PAGES_ACCEPTED_SHA = "bb2545fad7c7589af25348b4d6f7359e0f9aa8be";
export const M3_PROGRAM_FRONTEND_ORIGIN = "https://khadija-s-fps.pages.dev";
export const M3_PROGRAM_WORKER_ORIGIN = "https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev";
export const M3_PROGRAM_WORKER_VERSION_ID = "40175919-3d62-4986-9215-edf06eeddb98";
export const M3_PROGRAM_PROTOCOL = 6;
export const M3_PROGRAM_BUILD = "m3-team-final-world-reconnect-r3";
export const M3_PROGRAM_RELEASE_PATCH = "m3-production-release-manifest-r1";
export const M3_PROGRAM_CERTIFIED_SHA = "3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b";
export const M3_PROGRAM_ROLLBACK_SHA = "9f83a7254c06995aa9a4d46e8de4e9dfa18c3250";
export const EXPECTED_AUTOMATIC_PAGES_ARTIFACT_SHA256 = Object.freeze({"automatic-pages-deployment.html":"4af7a894c246b2df3bb4f7d3c90588d0ad3b9b248970406302a711566ec99821","automatic-pages-deployment.json":"93f5040fd2833bf763f19d9436799afc61f62c12d40b2b8b498e1fbd1c414d7e","js/multiplayer/automatic_pages_deployment.js":"cd1f6938a3009fd23a232de833cae1e9c2de3fef1cb6a6f9faa497d95d582b21","js/multiplayer/automatic_pages_deployment_core.js":"12d63ba455c2a4a0d127832928e58e23cac29383cbac285285b29d942ee1fb82","js/multiplayer/automatic_pages_deployment_core.test.js":"15e6b7ed139a59a9553652ef644e355443d85a68fdf1cd1b9067ded5d2af6858"});

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
export function canonicalM3ProgramCompletionJson(value){ return JSON.stringify(canonicalValue(value)); }
export function withoutDocumentSeal(value){ if(!isObject(value)) return value; const clone={...value}; delete clone.documentSha256; return clone; }
export function createExpectedM3ProgramCompletionManifest(){ return Object.freeze({"ok":true,"service":"khadijas-arena-m3-program-completion","patch":"m3-final-program-completion-r1","milestone":"M3.99-M3.100","finalProgramBaselineCommitSha":"604693799eee61d7cdb8e745f62910538c95f3f6","automaticPagesSourceCommitSha":"604693799eee61d7cdb8e745f62910538c95f3f6","automaticPagesAcceptedMaintenanceCommitSha":"bb2545fad7c7589af25348b4d6f7359e0f9aa8be","completedMilestoneRange":"M3.79-M3.100","finalMilestone":"M3.100","rollbackFrontendSha":"9f83a7254c06995aa9a4d46e8de4e9dfa18c3250","protocol":6,"build":"m3-team-final-world-reconnect-r3","releasePatch":"m3-production-release-manifest-r1","certifiedFrontendSha":"3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b","releaseStatus":"CERTIFIED","frontendUrl":"https://khadija-s-fps.pages.dev","workerUrl":"https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev","workerVersionId":"40175919-3d62-4986-9215-edf06eeddb98","deploymentMode":"GITHUB_CONNECTED_AUTOMATIC","deploymentTrigger":"GITHUB_PUSH","manualPagesDeploymentRequired":false,"workerRedeployRequired":false,"automaticPagesManifestPath":"/automatic-pages-deployment.json","frontendReleaseManifestPath":"/multiplayer-release.json","pagePath":"/m3-program-completion.html","expectedAutomaticPagesArtifactSha256":{"automatic-pages-deployment.html":"4af7a894c246b2df3bb4f7d3c90588d0ad3b9b248970406302a711566ec99821","automatic-pages-deployment.json":"93f5040fd2833bf763f19d9436799afc61f62c12d40b2b8b498e1fbd1c414d7e","js/multiplayer/automatic_pages_deployment.js":"cd1f6938a3009fd23a232de833cae1e9c2de3fef1cb6a6f9faa497d95d582b21","js/multiplayer/automatic_pages_deployment_core.js":"12d63ba455c2a4a0d127832928e58e23cac29383cbac285285b29d942ee1fb82","js/multiplayer/automatic_pages_deployment_core.test.js":"15e6b7ed139a59a9553652ef644e355443d85a68fdf1cd1b9067ded5d2af6858"},"requiredReceiptDecision":"PAGES_DEPLOYMENT_VERIFIED","requiredReceiptStatus":"AUTO_DEPLOYMENT_ACCEPTED","requiredActivationDecision":"CERTIFIED_MAINTENANCE_ACTIVE","requiredActivationStatus":"ACTIVE_NO_WORKER_REDEPLOY","requiredCompletionDecision":"M3_PROGRAM_COMPLETE","requiredCompletionStatus":"M3_100_SEALED","requiredHandoffDecision":"M3_PRODUCTION_HANDOFF_ACCEPTED","requiredHandoffStatus":"PRODUCTION_OPERATIONAL_M3_CLOSED","lifecycleStatus":"M3_CLOSED","furtherM3MilestonesAuthorized":false,"liveActionAuthorized":false}); }

function compareManifest(errors,manifest){
  const expected=createExpectedM3ProgramCompletionManifest(); const actual=isObject(manifest)?manifest:{};
  for(const [field,expectedValue] of Object.entries(expected)){ const received=actual[field]; if(canonicalM3ProgramCompletionJson(received)!==canonicalM3ProgramCompletionJson(expectedValue)) errors.push(finding('PROGRAM_MANIFEST_MISMATCH',`Final program manifest field ${field} does not match.`,{field,expected:expectedValue,received})); }
}
function checkReleaseIdentity(errors,source,prefix){
  const value=isObject(source)?source:{};
  for(const [field,expected,received] of [
    ['protocol',M3_PROGRAM_PROTOCOL,finiteInteger(value.protocol)],['build',M3_PROGRAM_BUILD,cleanText(value.build)],
    ['patch',M3_PROGRAM_RELEASE_PATCH,cleanText(value.patch ?? value.releasePatch)],['certifiedFrontendSha',M3_PROGRAM_CERTIFIED_SHA,cleanText(prefix==='FRONTEND' ? (value.certifiedBaselineSha ?? value.certifiedFrontendSha) : value.certifiedFrontendSha)],
    ['releaseStatus','CERTIFIED',cleanText(value.releaseStatus).toUpperCase()]
  ]) if(expected!==received) errors.push(finding(`${prefix}_IDENTITY_MISMATCH`,`${prefix.toLowerCase()} release identity field ${field} does not match.`,{field,expected,received}));
}
function checkReceipt(errors,receipt,sealValid){
  const value=isObject(receipt)?receipt:{};
  if(sealValid!==true || !isSha256(value.documentSha256)) errors.push(finding('DEPLOYMENT_RECEIPT_SEAL_INVALID','The imported Pages deployment receipt seal is invalid.'));
  for(const [field,expected,received] of [
    ['milestone','M3.97-M3.98',cleanText(value.milestone)],['patch','m3-automatic-pages-deployment-r1',cleanText(value.patch)],
    ['decision','PAGES_DEPLOYMENT_VERIFIED',cleanText(value.decision)],['status','AUTO_DEPLOYMENT_ACCEPTED',cleanText(value.status)],
    ['sourceCommitSha',M3_AUTOMATIC_PAGES_ACCEPTED_SHA,cleanText(value.sourceCommitSha)],
    ['deployment.frontendOrigin',M3_PROGRAM_FRONTEND_ORIGIN,normalizedOrigin(value.deployment?.frontendOrigin)],
    ['deployment.mode','GITHUB_CONNECTED_AUTOMATIC',cleanText(value.deployment?.mode)],['deployment.trigger','GITHUB_PUSH',cleanText(value.deployment?.trigger)],
    ['deployment.manualPagesDeploymentRequired',false,value.deployment?.manualPagesDeploymentRequired===true],
    ['worker.versionId',M3_PROGRAM_WORKER_VERSION_ID,cleanText(value.worker?.versionId)],['worker.redeployRequired',false,value.worker?.redeployRequired===true],
    ['rollbackReference.frontendCommitSha',M3_PROGRAM_ROLLBACK_SHA,cleanText(value.rollbackReference?.frontendCommitSha)]
  ]) if(expected!==received) errors.push(finding('DEPLOYMENT_RECEIPT_MISMATCH',`Deployment receipt field ${field} does not match.`,{field,expected,received}));
  checkReleaseIdentity(errors,value.releaseIdentity,'RECEIPT');
}
function checkActivation(errors,activation,sealValid,receipt){
  const value=isObject(activation)?activation:{};
  if(sealValid!==true || !isSha256(value.documentSha256)) errors.push(finding('MAINTENANCE_ACTIVATION_SEAL_INVALID','The imported maintenance activation seal is invalid.'));
  for(const [field,expected,received] of [
    ['milestone','M3.97-M3.98',cleanText(value.milestone)],['patch','m3-automatic-pages-deployment-r1',cleanText(value.patch)],
    ['decision','CERTIFIED_MAINTENANCE_ACTIVE',cleanText(value.decision)],['status','ACTIVE_NO_WORKER_REDEPLOY',cleanText(value.status)],
    ['deploymentReceiptSha256',cleanText(receipt?.documentSha256).toLowerCase(),cleanText(value.deploymentReceiptSha256).toLowerCase()],
    ['activeDeployment.frontendOrigin',M3_PROGRAM_FRONTEND_ORIGIN,normalizedOrigin(value.activeDeployment?.frontendOrigin)],
    ['activeDeployment.acceptedCommitSha',M3_AUTOMATIC_PAGES_ACCEPTED_SHA,cleanText(value.activeDeployment?.acceptedCommitSha)],
    ['activeDeployment.deploymentMode','GITHUB_CONNECTED_AUTOMATIC',cleanText(value.activeDeployment?.deploymentMode)],
    ['worker.versionId',M3_PROGRAM_WORKER_VERSION_ID,cleanText(value.worker?.versionId)],['worker.redeployRequired',false,value.worker?.redeployRequired===true],
    ['rollbackReference.frontendCommitSha',M3_PROGRAM_ROLLBACK_SHA,cleanText(value.rollbackReference?.frontendCommitSha)],
    ['nextMilestone','M3.99-M3.100',cleanText(value.nextMilestone)],['liveActionAuthorized',false,value.liveActionAuthorized===true]
  ]) if(expected!==received) errors.push(finding('MAINTENANCE_ACTIVATION_MISMATCH',`Maintenance activation field ${field} does not match.`,{field,expected,received}));
  checkReleaseIdentity(errors,value.releaseIdentity,'ACTIVATION');
}
function checkTimes(errors,receipt,activation,nowMs){
  const receiptMs=Date.parse(receipt?.createdAt); const activationMs=Date.parse(activation?.createdAt); const now=Number.isFinite(Number(nowMs))?Number(nowMs):Date.now();
  if(!Number.isFinite(receiptMs)) errors.push(finding('RECEIPT_TIME_INVALID','Deployment receipt createdAt is invalid.'));
  if(!Number.isFinite(activationMs)) errors.push(finding('ACTIVATION_TIME_INVALID','Maintenance activation createdAt is invalid.'));
  if(Number.isFinite(receiptMs) && receiptMs>now+300000) errors.push(finding('RECEIPT_TIME_FUTURE','Deployment receipt is dated in the future.'));
  if(Number.isFinite(activationMs) && activationMs>now+300000) errors.push(finding('ACTIVATION_TIME_FUTURE','Maintenance activation is dated in the future.'));
  if(Number.isFinite(receiptMs) && Number.isFinite(activationMs) && activationMs<receiptMs) errors.push(finding('ACTIVATION_PRECEDES_RECEIPT','Maintenance activation predates its deployment receipt.'));
  const maxAge=30*24*60*60*1000;
  if(Number.isFinite(receiptMs) && now-receiptMs>maxAge) errors.push(finding('RECEIPT_TOO_OLD','Deployment receipt is older than 30 days.'));
  if(Number.isFinite(activationMs) && now-activationMs>maxAge) errors.push(finding('ACTIVATION_TOO_OLD','Maintenance activation is older than 30 days.'));
}

export function evaluateM3ProgramCompletionEvidence({
  manifest=null,productionOrigin='',submittedCommitSha='',githubPushConfirmed=false,automaticDeploymentConfirmed=false,
  artifactChecks=[],frontendRelease=null,workerRelease=null,deploymentReceipt=null,deploymentReceiptSealValid=false,
  maintenanceActivation=null,maintenanceActivationSealValid=false,nowMs=Date.now()
}={}){
  const errors=[]; const warnings=[]; compareManifest(errors,manifest);
  const origin=normalizedOrigin(productionOrigin);
  if(origin!==M3_PROGRAM_FRONTEND_ORIGIN) errors.push(finding('PRODUCTION_ORIGIN_REQUIRED','Open the final completion console from the production Cloudflare Pages origin.',{expected:M3_PROGRAM_FRONTEND_ORIGIN,received:origin}));
  const commit=cleanText(submittedCommitSha).toLowerCase();
  if(!isSha(commit) || commit!==M3_PROGRAM_BASELINE_SHA) errors.push(finding('FINAL_BASELINE_COMMIT_MISMATCH','The confirmed GitHub commit does not match the accepted M3.97-M3.98 baseline.',{expected:M3_PROGRAM_BASELINE_SHA,received:commit}));
  if(githubPushConfirmed!==true) errors.push(finding('GITHUB_PUSH_UNCONFIRMED','Confirm that the accepted commit was pushed to GitHub.'));
  if(automaticDeploymentConfirmed!==true) errors.push(finding('AUTOMATIC_DEPLOYMENT_UNCONFIRMED','Confirm that Cloudflare Pages completed the automatic deployment.'));
  const expectedPaths=Object.keys(EXPECTED_AUTOMATIC_PAGES_ARTIFACT_SHA256).sort(); const checks=Array.isArray(artifactChecks)?artifactChecks:[]; const byPath=new Map(checks.filter(isObject).map(item=>[cleanText(item.path),item]));
  for(const path of expectedPaths){ const check=byPath.get(path); const expected=EXPECTED_AUTOMATIC_PAGES_ARTIFACT_SHA256[path]; if(!check){ errors.push(finding('ARTIFACT_CHECK_MISSING','A required M3.97-M3.98 artifact was not checked.',{path})); continue; } const actual=cleanText(check.actualSha256).toLowerCase(); if(check.ok!==true || !isSha256(actual) || actual!==expected) errors.push(finding('ARTIFACT_HASH_MISMATCH','A deployed M3.97-M3.98 artifact does not match the accepted SHA-256.',{path,expected,received:actual,httpStatus:check.httpStatus??null})); }
  for(const path of byPath.keys()) if(!Object.prototype.hasOwnProperty.call(EXPECTED_AUTOMATIC_PAGES_ARTIFACT_SHA256,path)) warnings.push(finding('UNEXPECTED_ARTIFACT_CHECK','An extra artifact check was ignored.',{path}));
  checkReleaseIdentity(errors,frontendRelease,'FRONTEND'); checkReleaseIdentity(errors,workerRelease,'WORKER');
  if(normalizedOrigin(workerRelease?.workerUrl ?? M3_PROGRAM_WORKER_ORIGIN)!==M3_PROGRAM_WORKER_ORIGIN) errors.push(finding('WORKER_ORIGIN_MISMATCH','Worker release origin does not match the certified Worker.'));
  checkReceipt(errors,deploymentReceipt,deploymentReceiptSealValid); checkActivation(errors,maintenanceActivation,maintenanceActivationSealValid,deploymentReceipt); checkTimes(errors,deploymentReceipt,maintenanceActivation,nowMs);
  const ready=errors.length===0;
  return Object.freeze({ready,decision:ready?'M3_PROGRAM_COMPLETION_READY':'M3_PROGRAM_COMPLETION_BLOCKED',status:ready?'FINAL_EVIDENCE_ACCEPTED':'BLOCKED',errors:Object.freeze(errors),warnings:Object.freeze(warnings),baselineCommitSha:M3_PROGRAM_BASELINE_SHA,productionOrigin:origin,verifiedArtifactCount:ready?expectedPaths.length:checks.filter(item=>item?.ok===true).length,expectedArtifactCount:expectedPaths.length,releaseIdentity:Object.freeze({protocol:M3_PROGRAM_PROTOCOL,build:M3_PROGRAM_BUILD,releasePatch:M3_PROGRAM_RELEASE_PATCH,certifiedFrontendSha:M3_PROGRAM_CERTIFIED_SHA,releaseStatus:'CERTIFIED'}),deploymentPolicy:Object.freeze({mode:'GITHUB_CONNECTED_AUTOMATIC',trigger:'GITHUB_PUSH',manualPagesDeploymentRequired:false,workerRedeployRequired:false})});
}

export function createM3ProgramCompletionCertificate({evaluation,deploymentReceipt=null,maintenanceActivation=null,approver='',notes='',completionConfirmed=false,createdAt=new Date().toISOString()}={}){
  if(!evaluation?.ready) throw new Error('Passing final M3 evidence is required.'); const cleanApprover=cleanText(approver); if(!cleanApprover) throw new Error('Final release approver is required.'); if(completionConfirmed!==true) throw new Error('M3 completion confirmation is required.');
  return Object.freeze({schema:1,milestone:M3_PROGRAM_COMPLETION_MILESTONE,patch:M3_PROGRAM_COMPLETION_PATCH,decision:'M3_PROGRAM_COMPLETE',status:'M3_100_SEALED',createdAt,approver:cleanApprover,notes:cleanText(notes),completedMilestoneRange:'M3.79-M3.100',finalMilestone:'M3.100',baselineCommitSha:M3_PROGRAM_BASELINE_SHA,evidence:Object.freeze({deploymentReceiptSha256:cleanText(deploymentReceipt?.documentSha256).toLowerCase(),maintenanceActivationSha256:cleanText(maintenanceActivation?.documentSha256).toLowerCase(),publicArtifactSha256:EXPECTED_AUTOMATIC_PAGES_ARTIFACT_SHA256,verifiedArtifactCount:evaluation.expectedArtifactCount}),releaseIdentity:evaluation.releaseIdentity,deployment:Object.freeze({frontendOrigin:M3_PROGRAM_FRONTEND_ORIGIN,mode:'GITHUB_CONNECTED_AUTOMATIC',trigger:'GITHUB_PUSH',manualPagesDeploymentRequired:false}),worker:Object.freeze({origin:M3_PROGRAM_WORKER_ORIGIN,versionId:M3_PROGRAM_WORKER_VERSION_ID,redeployRequired:false}),rollbackReference:Object.freeze({frontendCommitSha:M3_PROGRAM_ROLLBACK_SHA}),lifecycle:Object.freeze({program:'M3',state:'CLOSED',finalMilestone:'M3.100',furtherM3MilestonesAuthorized:false}),nextProgramPhase:'UNASSIGNED',liveActionAuthorized:false});
}
export function createM3ProductionHandoff({completionCertificate=null,completionCertificateSha256='',productionOwner='',handoffConfirmed=false,createdAt=new Date().toISOString()}={}){
  if(!isObject(completionCertificate) || cleanText(completionCertificate.decision)!=='M3_PROGRAM_COMPLETE' || cleanText(completionCertificate.status)!=='M3_100_SEALED') throw new Error('A valid M3 completion certificate is required.');
  const digest=cleanText(completionCertificateSha256).toLowerCase(); if(!isSha256(digest)) throw new Error('The sealed M3 completion certificate SHA-256 is required.'); const owner=cleanText(productionOwner); if(!owner) throw new Error('Production owner is required.'); if(handoffConfirmed!==true) throw new Error('Production handoff confirmation is required.');
  return Object.freeze({schema:1,milestone:M3_PROGRAM_COMPLETION_MILESTONE,patch:M3_PROGRAM_COMPLETION_PATCH,decision:'M3_PRODUCTION_HANDOFF_ACCEPTED',status:'PRODUCTION_OPERATIONAL_M3_CLOSED',createdAt,productionOwner:owner,completionCertificateSha256:digest,completedMilestoneRange:'M3.79-M3.100',finalMilestone:'M3.100',releaseIdentity:completionCertificate.releaseIdentity,deployment:completionCertificate.deployment,worker:completionCertificate.worker,rollbackReference:completionCertificate.rollbackReference,operationsPolicy:Object.freeze({automaticPagesDeployment:true,manualPagesDeploymentRequired:false,workerRedeployRequired:false,futureChangesRequireCertifiedChangeControl:true,m4Authorized:false}),closure:Object.freeze({program:'M3',state:'CLOSED',noFurtherM3Milestones:true}),liveActionAuthorized:false});
}
