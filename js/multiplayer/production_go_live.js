// js/multiplayer/production_go_live.js
// M3.87-M3.88 — browser evidence importer, go-live approval, and certificate exporter.

import {
  PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA,
  PRODUCTION_GO_LIVE_ROLLBACK_FRONTEND_SHA,
  canonicalProductionGoLiveJson,
  createProductionGoLiveCertificate,
  evaluateProductionGoLiveEvidence
} from './production_go_live_core.js';

const elements = {
  manifest: document.getElementById('ka-go-live-manifest'),
  file: document.getElementById('ka-go-live-file'),
  source: document.getElementById('ka-go-live-source'),
  validate: document.getElementById('ka-go-live-validate'),
  status: document.getElementById('ka-go-live-status'),
  summary: document.getElementById('ka-go-live-summary'),
  findings: document.getElementById('ka-go-live-findings'),
  approvedBy: document.getElementById('ka-go-live-approved-by'),
  approval: document.getElementById('ka-go-live-approval'),
  notes: document.getElementById('ka-go-live-notes'),
  seal: document.getElementById('ka-go-live-seal'),
  exportJson: document.getElementById('ka-go-live-export-json'),
  exportText: document.getElementById('ka-go-live-export-text'),
  digest: document.getElementById('ka-go-live-digest'),
  certificate: document.getElementById('ka-go-live-certificate')
};

let goLiveManifest = null;
let sourceDiagnostic = null;
let lastEvaluation = null;
let sealedCertificate = null;

function cleanText(value) {
  return String(value ?? '').trim();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit'
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function sha256Hex(text) {
  if (!window.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable.');
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function setStatus(status, summary) {
  const normalized = cleanText(status).toUpperCase() || 'WAITING';
  elements.status.textContent = normalized;
  elements.status.dataset.tone = normalized === 'APPROVED' || normalized === 'SEALED'
    ? 'success'
    : normalized === 'WAITING'
      ? 'neutral'
      : 'danger';
  elements.summary.textContent = summary;
}

function renderFindings(evaluation) {
  elements.findings.replaceChildren();
  const entries = [
    ...(evaluation.errors || []).map((item) => ({ ...item, tone: 'error' })),
    ...(evaluation.warnings || []).map((item) => ({ ...item, tone: 'warning' }))
  ];
  if (entries.length === 0) {
    const item = document.createElement('li');
    item.className = 'success';
    item.textContent = 'All automated, runtime, identity, and two-client evidence gates passed.';
    elements.findings.append(item);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = entry.tone;
    const code = document.createElement('code');
    code.textContent = entry.code;
    item.append(code, document.createTextNode(` — ${entry.message}`));
    elements.findings.append(item);
  }
}

function resetSeal() {
  sealedCertificate = null;
  elements.exportJson.disabled = true;
  elements.exportText.disabled = true;
  elements.digest.textContent = 'Not sealed';
  elements.certificate.textContent = '';
}

function parseSource() {
  const text = elements.source.value.trim();
  if (!text) throw new Error('Paste or import the M3.85-M3.86 acceptance diagnostic first.');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Acceptance diagnostic must be a JSON object.');
  }
  return parsed;
}

function validateSource() {
  resetSeal();
  try {
    sourceDiagnostic = parseSource();
    lastEvaluation = evaluateProductionGoLiveEvidence({
      manifest: goLiveManifest,
      diagnostic: sourceDiagnostic
    });
    renderFindings(lastEvaluation);
    elements.seal.disabled = !lastEvaluation.ready;
    if (lastEvaluation.ready) {
      setStatus('APPROVED', `Evidence accepted. Frontend ${PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA.slice(0, 12)} is eligible for go-live sealing.`);
    } else {
      setStatus('BLOCKED', `${lastEvaluation.errors.length} blocking release gate(s) failed.`);
    }
  } catch (error) {
    sourceDiagnostic = null;
    lastEvaluation = null;
    elements.seal.disabled = true;
    elements.findings.replaceChildren();
    const item = document.createElement('li');
    item.className = 'error';
    item.textContent = error instanceof Error ? error.message : String(error);
    elements.findings.append(item);
    setStatus('BLOCKED', 'The imported acceptance diagnostic could not be validated.');
  }
}

async function sealCertificate() {
  resetSeal();
  try {
    if (!lastEvaluation?.ready || !sourceDiagnostic) {
      throw new Error('Validate passing acceptance evidence before sealing.');
    }
    const sourceCanonical = canonicalProductionGoLiveJson(sourceDiagnostic);
    const sourceDigest = await sha256Hex(sourceCanonical);
    const payload = createProductionGoLiveCertificate(lastEvaluation, sourceDiagnostic, {
      approvedBy: elements.approvedBy.value,
      approvalConfirmed: elements.approval.checked,
      createdAt: new Date().toISOString(),
      sourceDiagnosticSha256: sourceDigest,
      notes: elements.notes.value
    });
    const certificateDigest = await sha256Hex(canonicalProductionGoLiveJson(payload));
    sealedCertificate = Object.freeze({
      ...payload,
      certificateSha256: certificateDigest
    });
    elements.digest.textContent = certificateDigest;
    elements.certificate.textContent = `${JSON.stringify(sealedCertificate, null, 2)}\n`;
    elements.exportJson.disabled = false;
    elements.exportText.disabled = false;
    setStatus('SEALED', `GO_LIVE_APPROVED sealed. Rollback frontend: ${PRODUCTION_GO_LIVE_ROLLBACK_FRONTEND_SHA.slice(0, 12)}.`);
  } catch (error) {
    setStatus('BLOCKED', error instanceof Error ? error.message : String(error));
  }
}

function safeTimestamp(value) {
  return cleanText(value).replace(/[:.]/g, '-').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
}

function download(name, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  if (!sealedCertificate) return;
  const stamp = safeTimestamp(sealedCertificate.createdAt);
  download(
    `khadijas-arena-go-live-${PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA.slice(0, 12)}-${stamp}.json`,
    'application/json',
    `${JSON.stringify(sealedCertificate, null, 2)}\n`
  );
}

function exportText() {
  if (!sealedCertificate) return;
  const text = [
    "KHADIJA'S ARENA — PRODUCTION GO-LIVE CERTIFICATE",
    `Decision: ${sealedCertificate.decision}`,
    `Created: ${sealedCertificate.createdAt}`,
    `Approved by: ${sealedCertificate.approvedBy}`,
    `Frontend commit: ${sealedCertificate.deployment.frontendCommitSha}`,
    `Worker version: ${sealedCertificate.deployment.workerVersionId}`,
    `Protocol: ${sealedCertificate.releaseIdentity.protocol}`,
    `Build: ${sealedCertificate.releaseIdentity.build}`,
    `Release patch: ${sealedCertificate.releaseIdentity.releasePatch}`,
    `Certified frontend SHA: ${sealedCertificate.releaseIdentity.certifiedFrontendSha}`,
    `Acceptance room: ${sealedCertificate.sourceEvidence.roomCode}`,
    `Acceptance evidence SHA-256: ${sealedCertificate.sourceDiagnosticSha256}`,
    `Certificate SHA-256: ${sealedCertificate.certificateSha256}`,
    `Rollback frontend: ${sealedCertificate.rollbackAuthorization.frontendCommitSha}`,
    `Rollback instruction: ${sealedCertificate.rollbackAuthorization.instruction}`,
    sealedCertificate.notes ? `Notes: ${sealedCertificate.notes}` : null
  ].filter(Boolean).join('\n');
  const stamp = safeTimestamp(sealedCertificate.createdAt);
  download(
    `khadijas-arena-go-live-${PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA.slice(0, 12)}-${stamp}.txt`,
    'text/plain',
    `${text}\n`
  );
}

async function loadFile() {
  const file = elements.file.files?.[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {
    setStatus('BLOCKED', 'Diagnostic file exceeds the 1 MB safety limit.');
    return;
  }
  elements.source.value = await file.text();
  validateSource();
}

async function initialize() {
  elements.seal.disabled = true;
  elements.exportJson.disabled = true;
  elements.exportText.disabled = true;
  try {
    goLiveManifest = await fetchJson('/production-go-live.json');
    elements.manifest.textContent = `${goLiveManifest.patch} · ${goLiveManifest.acceptanceCommitSha.slice(0, 12)}`;
    setStatus('WAITING', 'Import the compact diagnostic exported by the public deployment acceptance console.');
  } catch (error) {
    goLiveManifest = null;
    setStatus('BLOCKED', error instanceof Error ? error.message : String(error));
  }
}

elements.file?.addEventListener('change', loadFile);
elements.validate?.addEventListener('click', validateSource);
elements.seal?.addEventListener('click', sealCertificate);
elements.exportJson?.addEventListener('click', exportJson);
elements.exportText?.addEventListener('click', exportText);
for (const element of [elements.approvedBy, elements.approval, elements.notes]) {
  element?.addEventListener('input', resetSeal);
  element?.addEventListener('change', resetSeal);
}

initialize();
