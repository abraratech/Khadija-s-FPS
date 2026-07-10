// js/multiplayer/production_release_archive.js
import {
  canonicalProductionReleaseArchiveJson,
  createCertifiedReleaseArchive,
  createProductionRecoveryRunbook,
  evaluateProductionReleaseArchive
} from './production_release_archive_core.js';

const byId=(id)=>document.getElementById(id);
const elements={
  closureFile:byId('ka-archive-closure-file'), closure:byId('ka-archive-closure'),
  handoffFile:byId('ka-archive-handoff-file'), handoff:byId('ka-archive-handoff'),
  validate:byId('ka-archive-validate'), status:byId('ka-archive-status'), summary:byId('ka-archive-summary'), findings:byId('ka-archive-findings'),
  archivist:byId('ka-archive-archivist'), notes:byId('ka-archive-notes'), confirm:byId('ka-archive-confirm'), exportArchive:byId('ka-archive-export'),
  owner:byId('ka-archive-owner'), drillNotes:byId('ka-archive-drill-notes'), drillConfirm:byId('ka-archive-drill-confirm'), exportRunbook:byId('ka-archive-runbook'),
  digest:byId('ka-archive-digest'), output:byId('ka-archive-output')
};
let evaluation=null, closureCertificate=null, operationsHandoff=null, sealedArchive=null;
async function sha256Hex(text){ const bytes=new TextEncoder().encode(text); const hash=await crypto.subtle.digest('SHA-256',bytes); return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function payloadWithout(value,field){ const payload={...value}; delete payload[field]; return payload; }
async function parseSealedJson(text){
  const value=JSON.parse(text); if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Sealed JSON must be an object.');
  const expected=String(value.documentSha256||'').toLowerCase();
  const actual=await sha256Hex(canonicalProductionReleaseArchiveJson(payloadWithout(value,'documentSha256')));
  return {value,digestValid:/^[a-f0-9]{64}$/.test(expected)&&expected===actual};
}
async function fetchJson(url){ const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}}); if(!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`); return response.json(); }
function downloadJson(filename,payload){ const blob=new Blob([`${JSON.stringify(payload,null,2)}\n`],{type:'application/json'}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
async function seal(payload){ return {...payload,documentSha256:await sha256Hex(canonicalProductionReleaseArchiveJson(payload))}; }
function showOutput(payload){ elements.digest.textContent=payload.documentSha256||'—'; elements.output.textContent=`${JSON.stringify(payload,null,2)}\n`; }
function render(){
  const ready=evaluation?.ready===true; elements.status.textContent=evaluation?.status||'BLOCKED'; elements.status.dataset.tone=ready?'success':'danger';
  elements.summary.textContent=ready?'Closure and handoff seals form a valid archive chain.':'Archive remains blocked until both sealed documents pass every gate.';
  const findings=[...(evaluation?.errors||[]),...(evaluation?.warnings||[])]; elements.findings.replaceChildren();
  if(!findings.length&&ready)findings.push({code:'CERTIFIED_ARCHIVE_READY',message:'The release closure chain is ready for permanent archival.'});
  for(const item of findings){ const li=document.createElement('li'),strong=document.createElement('strong'),span=document.createElement('span'); strong.textContent=item.code; span.textContent=item.message; li.append(strong,span); elements.findings.appendChild(li); }
  elements.exportArchive.disabled=!ready; elements.exportRunbook.disabled=!sealedArchive;
  document.documentElement.dataset.kaProductionReleaseArchive=sealedArchive?'sealed':ready?'ready':'blocked';
}
async function validateEvidence(){
  const [closureParsed,handoffParsed,manifest]=await Promise.all([parseSealedJson(elements.closure.value),parseSealedJson(elements.handoff.value),fetchJson('./production-release-archive.json')]);
  closureCertificate=closureParsed.value; operationsHandoff=handoffParsed.value;
  evaluation=evaluateProductionReleaseArchive({manifest,closureCertificate,closureDigestValid:closureParsed.digestValid,operationsHandoff,handoffDigestValid:handoffParsed.digestValid});
  sealedArchive=null; render();
}
elements.closureFile.addEventListener('change',async()=>{const file=elements.closureFile.files?.[0];if(file)elements.closure.value=await file.text();});
elements.handoffFile.addEventListener('change',async()=>{const file=elements.handoffFile.files?.[0];if(file)elements.handoff.value=await file.text();});
elements.validate.addEventListener('click',()=>validateEvidence().catch(error=>alert(error.message)));
elements.exportArchive.addEventListener('click',async()=>{try{const payload=createCertifiedReleaseArchive(evaluation,closureCertificate,operationsHandoff,{archivedBy:elements.archivist.value,confirmation:elements.confirm.checked,notes:elements.notes.value});sealedArchive=await seal(payload);showOutput(sealedArchive);downloadJson('khadijas-arena-certified-release-archive.json',sealedArchive);render();}catch(error){alert(error.message);}});
elements.exportRunbook.addEventListener('click',async()=>{try{const payload=createProductionRecoveryRunbook(sealedArchive,{owner:elements.owner.value,confirmation:elements.drillConfirm.checked,notes:elements.drillNotes.value});const sealed=await seal(payload);showOutput(sealed);downloadJson('khadijas-arena-production-recovery-runbook.json',sealed);}catch(error){alert(error.message);}});
render();
