import {
  canonicalAutomaticPagesDeploymentJson,createExpectedAutomaticPagesDeploymentManifest,evaluateAutomaticPagesDeploymentEvidence,
  createAutomaticPagesDeploymentReceipt,createCertifiedMaintenanceActivation
} from './automatic_pages_deployment_core.js';

const byId=id=>document.getElementById(id);
const el={commit:byId('ka-auto-commit'),push:byId('ka-auto-push'),deployed:byId('ka-auto-deployed'),validate:byId('ka-auto-validate'),status:byId('ka-auto-status'),summary:byId('ka-auto-summary'),findings:byId('ka-auto-findings'),artifacts:byId('ka-auto-artifacts'),operator:byId('ka-auto-operator'),notes:byId('ka-auto-notes'),receipt:byId('ka-auto-receipt'),approver:byId('ka-auto-approver'),activateConfirm:byId('ka-auto-activate-confirm'),activate:byId('ka-auto-activate'),digest:byId('ka-auto-digest'),output:byId('ka-auto-output')};
let manifest=null,evaluation=null,sealedReceipt=null;
async function sha256(text){const bytes=new TextEncoder().encode(text);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function seal(value){const clone={...value};delete clone.documentSha256;return Object.freeze({...clone,documentSha256:await sha256(canonicalAutomaticPagesDeploymentJson(clone))});}
async function fetchText(url){const response=await fetch(url,{cache:'no-store'});const text=await response.text();if(!response.ok)throw new Error(`${url} returned HTTP ${response.status}`);return {text,status:response.status};}
async function fetchJson(url){const {text,status}=await fetchText(url);return {value:JSON.parse(text),text,status};}
function download(name,value){const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function show(value){el.output.textContent=JSON.stringify(value,null,2);el.digest.textContent=value?.documentSha256||'—';}
function render(){const ready=evaluation?.ready===true;el.status.textContent=ready?'PASS':'BLOCKED';el.status.dataset.tone=ready?'success':'danger';el.summary.textContent=ready?'GitHub-triggered Cloudflare Pages deployment is verified. The certified Worker remains unchanged.':'Deployment evidence is incomplete or mismatched.';el.findings.replaceChildren();for(const item of [...(evaluation?.errors||[]),...(evaluation?.warnings||[])]){const li=document.createElement('li');li.textContent=`${item.code}: ${item.message}`;el.findings.append(li);}el.receipt.disabled=!ready;el.activate.disabled=!sealedReceipt;}
async function validate(){
  el.validate.disabled=true;el.status.textContent='CHECKING';el.summary.textContent='Fetching deployed artifacts and certified release manifests…';
  try{
    manifest=(await fetchJson('./automatic-pages-deployment.json')).value;
    const expected=createExpectedAutomaticPagesDeploymentManifest();
    const artifactChecks=[];el.artifacts.replaceChildren();
    for(const [path,expectedSha256] of Object.entries(expected.expectedMaintenanceArtifactSha256)){
      let actualSha256='',httpStatus=0,ok=false;
      try{const result=await fetchText(new URL('/'+path.replace(/^\/+/,''),expected.frontendUrl));httpStatus=result.status;actualSha256=await sha256(result.text);ok=actualSha256===expectedSha256;}catch(error){actualSha256='';}
      artifactChecks.push({path,expectedSha256,actualSha256,httpStatus,ok});const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'} ${path}`;el.artifacts.append(li);
    }
    const maintenance=(await fetchJson(new URL(expected.maintenanceManifestPath,expected.frontendUrl))).value;
    const frontendRelease=(await fetchJson(new URL(expected.frontendReleaseManifestPath,expected.frontendUrl))).value;
    const workerRelease=(await fetchJson(new URL('/release',expected.workerUrl))).value;
    evaluation=evaluateAutomaticPagesDeploymentEvidence({manifest,productionOrigin:location.origin,submittedCommitSha:el.commit.value,githubPushConfirmed:el.push.checked,automaticDeploymentConfirmed:el.deployed.checked,maintenanceManifest:maintenance,artifactChecks,frontendRelease,workerRelease});
    sealedReceipt=null;render();show({evaluation,artifactChecks});
  }catch(error){evaluation=null;sealedReceipt=null;el.status.textContent='ERROR';el.status.dataset.tone='danger';el.summary.textContent=error.message;el.receipt.disabled=true;el.activate.disabled=true;show({error:error.message});}
  finally{el.validate.disabled=false;}
}
el.validate.addEventListener('click',validate);
el.receipt.addEventListener('click',async()=>{try{const receipt=createAutomaticPagesDeploymentReceipt({evaluation,operator:el.operator.value,notes:el.notes.value});sealedReceipt=await seal(receipt);show(sealedReceipt);el.activate.disabled=false;download('khadijas-arena-m3-97-m3-98-pages-deployment-receipt.json',sealedReceipt);}catch(error){alert(error.message);}});
el.activate.addEventListener('click',async()=>{try{const activation=createCertifiedMaintenanceActivation({deploymentReceipt:sealedReceipt,deploymentReceiptSha256:sealedReceipt?.documentSha256,approver:el.approver.value,activationConfirmed:el.activateConfirm.checked});const sealed=await seal(activation);show(sealed);download('khadijas-arena-m3-97-m3-98-maintenance-activation.json',sealed);}catch(error){alert(error.message);}});
el.commit.value=createExpectedAutomaticPagesDeploymentManifest().acceptedMaintenanceCommitSha;
render();
