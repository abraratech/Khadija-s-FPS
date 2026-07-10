// js/multiplayer/production_release_closure.js
import {
  canonicalProductionReleaseClosureJson,
  createProductionOperationsHandoff,
  createProductionReleaseClosureCertificate,
  evaluateProductionReleaseClosure
} from './production_release_closure_core.js';

const elements = {
  goLiveFile: document.getElementById('ka-closure-go-live-file'),
  goLive: document.getElementById('ka-closure-go-live'),
  watchFile: document.getElementById('ka-closure-watch-file'),
  watch: document.getElementById('ka-closure-watch'),
  validate: document.getElementById('ka-closure-validate'),
  status: document.getElementById('ka-closure-status'),
  summary: document.getElementById('ka-closure-summary'),
  findings: document.getElementById('ka-closure-findings'),
  closer: document.getElementById('ka-closure-closer'),
  notes: document.getElementById('ka-closure-notes'),
  confirm: document.getElementById('ka-closure-confirm'),
  exportClosure: document.getElementById('ka-closure-export'),
  owner: document.getElementById('ka-closure-owner'),
  escalation: document.getElementById('ka-closure-escalation'),
  handoffConfirm: document.getElementById('ka-closure-handoff-confirm'),
  exportHandoff: document.getElementById('ka-closure-handoff'),
  digest: document.getElementById('ka-closure-digest'),
  output: document.getElementById('ka-closure-output')
};
let goLiveCertificate = null;
let watchEvidence = null;
let evaluation = null;
let sealedClosure = null;

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
function payloadWithout(value, field) { const payload = { ...value }; delete payload[field]; return payload; }
async function parseSealedJson(text, digestField) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Sealed JSON must be an object.');
  const expected = String(value[digestField] || '').toLowerCase();
  const actual = await sha256Hex(canonicalProductionReleaseClosureJson(payloadWithout(value, digestField)));
  return { value, digestValid: /^[a-f0-9]{64}$/.test(expected) && expected === actual };
}
async function fetchJson(url) {
  const response = await fetch(url, { cache:'no-store', headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}
function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function seal(payload) {
  const documentSha256 = await sha256Hex(canonicalProductionReleaseClosureJson(payload));
  return { ...payload, documentSha256 };
}
function showOutput(payload) {
  elements.digest.textContent = payload.documentSha256 || '—';
  elements.output.textContent = `${JSON.stringify(payload, null, 2)}\n`;
}
function render() {
  const ready = evaluation?.ready === true;
  elements.status.textContent = evaluation?.status || 'BLOCKED';
  elements.status.dataset.tone = ready ? 'success' : 'danger';
  const observation = evaluation?.source?.observation;
  elements.summary.textContent = ready
    ? `${observation.samples} passing samples · ${Math.round(observation.windowMs / 1000)}s sealed window · evidence chain valid`
    : 'Closure remains blocked until both sealed evidence files pass every gate.';
  const findings = [...(evaluation?.errors || []), ...(evaluation?.warnings || [])];
  elements.findings.replaceChildren();
  if (!findings.length && ready) findings.push({ code:'RELEASE_CLOSURE_READY', message:'The sealed GREEN release evidence is ready for closure.' });
  for (const item of findings) {
    const li = document.createElement('li');
    const strong = document.createElement('strong'); strong.textContent = item.code;
    const span = document.createElement('span'); span.textContent = item.message;
    li.append(strong, span); elements.findings.appendChild(li);
  }
  elements.exportClosure.disabled = !ready;
  elements.exportHandoff.disabled = !sealedClosure;
  document.documentElement.dataset.kaProductionReleaseClosure = sealedClosure ? 'handoff-ready' : ready ? 'pass' : 'blocked';
}
async function validateEvidence() {
  const manifest = await fetchJson(`/production-release-closure.json?ka=${Date.now().toString(36)}`);
  const certificateParsed = await parseSealedJson(elements.goLive.value, 'certificateSha256');
  const watchParsed = await parseSealedJson(elements.watch.value, 'documentSha256');
  goLiveCertificate = certificateParsed.value;
  watchEvidence = watchParsed.value;
  sealedClosure = null;
  evaluation = evaluateProductionReleaseClosure({
    manifest,
    goLiveCertificate,
    goLiveDigestValid: certificateParsed.digestValid,
    watchEvidence,
    watchDigestValid: watchParsed.digestValid
  });
  render();
}

elements.goLiveFile.addEventListener('change', async () => { const file=elements.goLiveFile.files?.[0]; if (file) elements.goLive.value=await file.text(); });
elements.watchFile.addEventListener('change', async () => { const file=elements.watchFile.files?.[0]; if (file) elements.watch.value=await file.text(); });
elements.validate.addEventListener('click', () => validateEvidence().catch((error) => alert(error.message)));
elements.exportClosure.addEventListener('click', async () => {
  try {
    const payload = createProductionReleaseClosureCertificate(evaluation, goLiveCertificate, watchEvidence, {
      closedBy:elements.closer.value, confirmation:elements.confirm.checked, notes:elements.notes.value
    });
    sealedClosure = await seal(payload);
    showOutput(sealedClosure);
    downloadJson('khadijas-arena-production-release-closure.json', sealedClosure);
    render();
  } catch (error) { alert(error.message); }
});
elements.exportHandoff.addEventListener('click', async () => {
  try {
    const payload = createProductionOperationsHandoff(sealedClosure, {
      owner:elements.owner.value, confirmation:elements.handoffConfirm.checked, escalationNotes:elements.escalation.value
    });
    const sealed = await seal(payload);
    showOutput(sealed);
    downloadJson('khadijas-arena-operations-handoff.json', sealed);
  } catch (error) { alert(error.message); }
});
render();
