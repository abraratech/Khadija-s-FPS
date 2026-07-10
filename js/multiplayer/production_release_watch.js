// js/multiplayer/production_release_watch.js
import {
  canonicalProductionReleaseWatchJson,
  createProductionReleaseWatchEvidence,
  createProductionRollbackDecision,
  evaluateProductionGoLiveCertificate,
  evaluateProductionReleaseWatchSample,
  evaluateProductionReleaseWatchWindow,
  PRODUCTION_RELEASE_WATCH_RESTRICTED_GLOBALS,
  PRODUCTION_RELEASE_WATCH_SAMPLE_INTERVAL_MS,
  PRODUCTION_RELEASE_WATCH_UI_READY_TEXT,
  PRODUCTION_RELEASE_WATCH_WORKER_ORIGIN
} from './production_release_watch_core.js';

const REQUEST_TIMEOUT_MS = 12000;
const FRAME_TIMEOUT_MS = 20000;
const elements = {
  file: document.getElementById('ka-watch-file'),
  certificate: document.getElementById('ka-watch-certificate'),
  validate: document.getElementById('ka-watch-validate'),
  sample: document.getElementById('ka-watch-sample'),
  start: document.getElementById('ka-watch-start'),
  stop: document.getElementById('ka-watch-stop'),
  status: document.getElementById('ka-watch-status'),
  summary: document.getElementById('ka-watch-summary'),
  findings: document.getElementById('ka-watch-findings'),
  samples: document.getElementById('ka-watch-samples'),
  operator: document.getElementById('ka-watch-operator'),
  notes: document.getElementById('ka-watch-notes'),
  exportEvidence: document.getElementById('ka-watch-export-evidence'),
  approver: document.getElementById('ka-watch-approver'),
  rollbackConfirm: document.getElementById('ka-watch-rollback-confirm'),
  liveRollback: document.getElementById('ka-watch-live-rollback'),
  exportRollback: document.getElementById('ka-watch-export-rollback'),
  digest: document.getElementById('ka-watch-digest'),
  output: document.getElementById('ka-watch-output'),
  frame: document.getElementById('ka-watch-frame')
};

let sourceCertificate = null;
let certificateEvaluation = null;
let watchEvaluation = null;
let samples = [];
let timer = null;
let sampling = false;

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
    const payload = await response.json();
    return { payload, elapsedMs: performance.now() - started };
  } finally { window.clearTimeout(timeout); }
}

function certificatePayloadForDigest(certificate) {
  const payload = { ...(certificate || {}) };
  delete payload.certificateSha256;
  return payload;
}

async function parseCertificateText(text) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Certificate JSON must be an object.');
  const expected = String(value.certificateSha256 || '').toLowerCase();
  const actual = await sha256Hex(canonicalProductionReleaseWatchJson(certificatePayloadForDigest(value)));
  return { certificate: value, digestValid: /^[a-f0-9]{64}$/.test(expected) && expected === actual };
}

async function loadRuntime() {
  const started = performance.now();
  const frame = elements.frame;
  const target = new URL('/', window.location.href);
  target.searchParams.set('kaProductionWatch', Date.now().toString(36));
  const loaded = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Runtime frame timed out.')), FRAME_TIMEOUT_MS);
    frame.addEventListener('load', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
  });
  frame.src = target.toString();
  await loaded;
  await delay(1200);
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) throw new Error('Runtime frame is not same-origin.');
  frameDocument.getElementById('ka-coop-open')?.click();
  await delay(150);
  frameDocument.getElementById('ka-coop-release-retry')?.click();
  const deadline = performance.now() + REQUEST_TIMEOUT_MS;
  let uiStatusText = '';
  while (performance.now() < deadline) {
    uiStatusText = String(frameDocument.getElementById('ka-coop-status')?.textContent || '').trim().toUpperCase();
    if (uiStatusText === PRODUCTION_RELEASE_WATCH_UI_READY_TEXT || uiStatusText.includes('FAILED') || uiStatusText.includes('MISMATCH')) break;
    await delay(200);
  }
  const activeRestrictedGlobals = PRODUCTION_RELEASE_WATCH_RESTRICTED_GLOBALS.filter((name) => {
    try { return frameWindow[name] !== undefined && frameWindow[name] !== null; } catch { return true; }
  });
  return {
    runtimeAudit: String(frameDocument.documentElement.dataset.kaMultiplayerReleaseAudit || '').trim().toLowerCase(),
    activeRestrictedGlobals,
    uiStatusText,
    gameBuild: String(frameWindow.KHADIJA_MULTIPLAYER_BUILD || '').trim(),
    gamePatch: String(frameWindow.KHADIJA_MULTIPLAYER_PATCH || '').trim(),
    elapsedMs: performance.now() - started
  };
}

function render() {
  watchEvaluation = evaluateProductionReleaseWatchWindow({ certificateEvaluation, samples });
  elements.status.textContent = watchEvaluation.status;
  elements.status.dataset.tone = watchEvaluation.status === 'GREEN' ? 'success' : watchEvaluation.status === 'ROLLBACK_AUTHORIZED' ? 'danger' : 'warning';
  elements.summary.textContent = `${watchEvaluation.summary.samples} samples · ${watchEvaluation.summary.passCount} pass · ${watchEvaluation.summary.warnCount} warn · ${watchEvaluation.summary.failCount} fail · ${Math.round(watchEvaluation.summary.windowMs / 1000)}s window`;
  const findings = [...(certificateEvaluation?.errors || []), ...(certificateEvaluation?.warnings || []), ...watchEvaluation.errors, ...watchEvaluation.warnings];
  elements.findings.replaceChildren();
  if (!findings.length) findings.push({ code: 'OBSERVATION_HEALTHY', message: 'All current observation gates are healthy.' });
  for (const item of findings) {
    const li = document.createElement('li');
    const strong = document.createElement('strong'); strong.textContent = item.code;
    const span = document.createElement('span'); span.textContent = item.message;
    li.append(strong, span); elements.findings.appendChild(li);
  }
  elements.samples.replaceChildren();
  samples.forEach((sample, index) => {
    const tr = document.createElement('tr');
    for (const value of [index + 1, sample.sampledAt, sample.status, sample.errors.length, sample.warnings.length]) {
      const td = document.createElement('td'); td.textContent = String(value); tr.appendChild(td);
    }
    elements.samples.appendChild(tr);
  });
  elements.exportEvidence.disabled = !['GREEN', 'DEGRADED', 'ROLLBACK_AUTHORIZED'].includes(watchEvaluation.status);
  elements.exportRollback.disabled = !certificateEvaluation?.ready;
  elements.liveRollback.disabled = !watchEvaluation.rollbackAuthorized;
  if (!watchEvaluation.rollbackAuthorized) elements.liveRollback.checked = false;
  document.documentElement.dataset.kaProductionReleaseWatch = watchEvaluation.status.toLowerCase();
}

async function validateCertificate() {
  const manifestResult = await fetchJson(`/production-release-watch.json?ka=${Date.now().toString(36)}`);
  const parsed = await parseCertificateText(elements.certificate.value);
  sourceCertificate = parsed.certificate;
  certificateEvaluation = evaluateProductionGoLiveCertificate({
    manifest: manifestResult.payload,
    certificate: sourceCertificate,
    certificateDigestValid: parsed.digestValid
  });
  samples = [];
  render();
}

async function takeSample() {
  if (sampling) return;
  if (!certificateEvaluation?.ready) throw new Error('Validate a sealed go-live certificate first.');
  sampling = true;
  elements.sample.disabled = true;
  try {
    const cacheKey = Date.now().toString(36);
    const [frontend, workerHealth, workerRelease, runtime] = await Promise.all([
      fetchJson(`/multiplayer-release.json?ka=${cacheKey}`),
      fetchJson(`${PRODUCTION_RELEASE_WATCH_WORKER_ORIGIN}/health?ka=${cacheKey}`),
      fetchJson(`${PRODUCTION_RELEASE_WATCH_WORKER_ORIGIN}/release?ka=${cacheKey}`),
      loadRuntime()
    ]);
    samples.push(evaluateProductionReleaseWatchSample({
      sampledAt: new Date().toISOString(),
      pageUrl: window.location.href,
      frontendManifest: frontend.payload,
      workerHealth: workerHealth.payload,
      workerRelease: workerRelease.payload,
      runtimeAudit: runtime.runtimeAudit,
      activeRestrictedGlobals: runtime.activeRestrictedGlobals,
      uiStatusText: runtime.uiStatusText,
      gameBuild: runtime.gameBuild,
      gamePatch: runtime.gamePatch,
      responseTimesMs: {
        frontend: frontend.elapsedMs,
        workerHealth: workerHealth.elapsedMs,
        workerRelease: workerRelease.elapsedMs,
        runtime: runtime.elapsedMs
      }
    }));
  } catch (error) {
    samples.push({
      sampledAt: new Date().toISOString(), status: 'FAIL', critical: true,
      errors: [{ code: 'LIVE_SAMPLE_REQUEST_FAILED', message: String(error?.name === 'AbortError' ? 'A live observation request timed out.' : error?.message || error).slice(0, 500) }],
      warnings: [], timings: {}
    });
  } finally {
    sampling = false;
    elements.sample.disabled = false;
    render();
  }
}

function startWatch() {
  if (!certificateEvaluation?.ready) throw new Error('Validate a sealed go-live certificate first.');
  if (timer) return;
  takeSample();
  timer = window.setInterval(takeSample, PRODUCTION_RELEASE_WATCH_SAMPLE_INTERVAL_MS);
  elements.start.disabled = true;
  elements.stop.disabled = false;
}

function stopWatch() {
  if (timer) window.clearInterval(timer);
  timer = null;
  elements.start.disabled = false;
  elements.stop.disabled = true;
}

function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function sealAndExport(filename, payload) {
  const digest = await sha256Hex(canonicalProductionReleaseWatchJson(payload));
  const sealed = { ...payload, documentSha256: digest };
  elements.digest.textContent = digest;
  elements.output.textContent = `${JSON.stringify(sealed, null, 2)}\n`;
  downloadJson(filename, sealed);
}

elements.file.addEventListener('change', async () => {
  const file = elements.file.files?.[0];
  if (file) elements.certificate.value = await file.text();
});
elements.validate.addEventListener('click', () => validateCertificate().catch((error) => alert(error.message)));
elements.sample.addEventListener('click', () => takeSample().catch((error) => alert(error.message)));
elements.start.addEventListener('click', () => { try { startWatch(); } catch (error) { alert(error.message); } });
elements.stop.addEventListener('click', stopWatch);
elements.exportEvidence.addEventListener('click', async () => {
  try {
    const payload = createProductionReleaseWatchEvidence(watchEvaluation, samples, sourceCertificate, {
      operator: elements.operator.value, notes: elements.notes.value
    });
    await sealAndExport('khadijas-arena-production-watch-evidence.json', payload);
  } catch (error) { alert(error.message); }
});
elements.exportRollback.addEventListener('click', async () => {
  try {
    const rehearsalOnly = elements.liveRollback.checked !== true;
    const payload = createProductionRollbackDecision(watchEvaluation, sourceCertificate, {
      approvedBy: elements.approver.value,
      confirmation: elements.rollbackConfirm.checked,
      rehearsalOnly,
      reason: elements.notes.value
    });
    await sealAndExport(rehearsalOnly ? 'khadijas-arena-rollback-drill.json' : 'khadijas-arena-emergency-rollback-authorization.json', payload);
  } catch (error) { alert(error.message); }
});
render();
