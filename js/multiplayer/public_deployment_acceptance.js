// js/multiplayer/public_deployment_acceptance.js
// M3.85-M3.86 — live public Pages acceptance console and proof exporter.

import {
  PUBLIC_DEPLOYMENT_ACCEPTANCE_RESTRICTED_GLOBALS,
  PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT,
  createCompactPublicDeploymentDiagnostic,
  evaluatePublicDeploymentAcceptance,
  normalizePublicDeploymentAcceptanceWorkerReleaseEndpoint
} from './public_deployment_acceptance_core.js';

const REQUEST_TIMEOUT_MS = 8000;
const GAME_FRAME_TIMEOUT_MS = 14000;
const POLL_INTERVAL_MS = 200;

const elements = {
  status: document.getElementById('ka-acceptance-status'),
  summary: document.getElementById('ka-acceptance-summary'),
  findings: document.getElementById('ka-acceptance-findings'),
  run: document.getElementById('ka-acceptance-run'),
  export: document.getElementById('ka-acceptance-export'),
  openA: document.getElementById('ka-acceptance-open-a'),
  openB: document.getElementById('ka-acceptance-open-b'),
  createJoin: document.getElementById('ka-proof-create-join'),
  shortRun: document.getElementById('ka-proof-short-run'),
  leaveRejoin: document.getElementById('ka-proof-leave-rejoin'),
  roomCode: document.getElementById('ka-proof-room-code'),
  frame: document.getElementById('ka-acceptance-frame')
};

let lastInputs = null;
let lastEvaluation = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function manualProof() {
  return {
    createJoin: elements.createJoin?.checked === true,
    shortRun: elements.shortRun?.checked === true,
    leaveRejoin: elements.leaveRejoin?.checked === true
  };
}

async function fetchJson(url) {
  const controller = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  const timer = window.setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller?.signal
    });
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}.`);
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
      throw new Error(`${url} did not return JSON.`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadGameFrame() {
  const frame = elements.frame;
  if (!frame) throw new Error('Acceptance game frame is missing.');

  const cacheKey = Date.now().toString(36);
  const target = new URL('/', window.location.href);
  target.searchParams.set('kaDeploymentAcceptance', cacheKey);

  const loaded = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('Public game frame timed out.')),
      GAME_FRAME_TIMEOUT_MS
    );
    frame.addEventListener('load', () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });

  frame.src = target.toString();
  await loaded;
  await delay(1200);

  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) {
    throw new Error('Public game frame is not same-origin.');
  }

  frameDocument.getElementById('ka-coop-open')?.click();
  await delay(150);
  frameDocument.getElementById('ka-coop-release-retry')?.click();

  const startedAt = performance.now();
  let uiStatusText = '';
  while (performance.now() - startedAt < REQUEST_TIMEOUT_MS) {
    uiStatusText = String(
      frameDocument.getElementById('ka-coop-status')?.textContent || ''
    ).trim().toUpperCase();
    if (
      uiStatusText === PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT
      || uiStatusText.includes('FAILED')
      || uiStatusText.includes('MISMATCH')
    ) {
      break;
    }
    await delay(POLL_INTERVAL_MS);
  }

  const activeRestrictedGlobals = PUBLIC_DEPLOYMENT_ACCEPTANCE_RESTRICTED_GLOBALS
    .filter((name) => {
      try {
        return frameWindow[name] !== undefined && frameWindow[name] !== null;
      } catch {
        return true;
      }
    });

  return {
    runtimeAudit: String(
      frameDocument.documentElement.dataset.kaMultiplayerReleaseAudit || ''
    ).trim().toLowerCase(),
    activeRestrictedGlobals,
    uiStatusText,
    gameBuild: String(frameWindow.KHADIJA_MULTIPLAYER_BUILD || '').trim(),
    gamePatch: String(frameWindow.KHADIJA_MULTIPLAYER_PATCH || '').trim()
  };
}

function setRunning(running) {
  elements.run.disabled = running;
  elements.run.textContent = running ? 'RUNNING LIVE ACCEPTANCE…' : 'RUN LIVE ACCEPTANCE';
}

function statusTone(status) {
  if (status === 'PASS' || status === 'WARN') return 'success';
  if (status === 'PENDING') return 'warning';
  return 'danger';
}

function renderEvaluation(evaluation) {
  lastEvaluation = evaluation;
  const tone = statusTone(evaluation.status);
  elements.status.textContent = evaluation.status;
  elements.status.dataset.tone = tone;
  elements.summary.textContent = evaluation.ready
    ? 'PUBLIC DEPLOYMENT ACCEPTED — AUTOMATED AND TWO-CLIENT PROOF COMPLETE.'
    : evaluation.automatedReady
      ? 'AUTOMATED RELEASE CHECKS PASS. COMPLETE THE TWO-CLIENT PROOF BELOW.'
      : 'PUBLIC DEPLOYMENT ACCEPTANCE FAILED. REVIEW THE FINDINGS.';

  const rows = [];
  const append = (kind, item) => {
    rows.push({
      kind,
      code: item.code,
      message: item.message
    });
  };
  evaluation.errors.forEach((item) => append('FAIL', item));
  evaluation.warnings.forEach((item) => append('WARN', item));
  evaluation.pending.forEach((item) => append('PENDING', item));
  if (rows.length === 0) {
    rows.push({
      kind: 'PASS',
      code: 'ALL_ACCEPTANCE_GATES_PASSED',
      message: 'All automated and manual public deployment acceptance gates passed.'
    });
  }

  elements.findings.replaceChildren();
  rows.forEach((row) => {
    const item = document.createElement('li');
    item.dataset.kind = row.kind.toLowerCase();
    const code = document.createElement('strong');
    code.textContent = row.code;
    const message = document.createElement('span');
    message.textContent = row.message;
    item.append(code, message);
    elements.findings.appendChild(item);
  });

  elements.export.disabled = false;
  document.documentElement.dataset.kaPublicDeploymentAcceptance =
    evaluation.ready ? 'pass' : evaluation.automatedReady ? 'pending' : 'fail';
}

async function runAcceptance() {
  setRunning(true);
  elements.export.disabled = true;
  elements.status.textContent = 'CHECKING';
  elements.status.dataset.tone = 'warning';
  elements.summary.textContent = 'Fetching deployed manifests and inspecting the public game runtime…';
  elements.findings.replaceChildren();

  try {
    const cacheKey = Date.now().toString(36);
    const [acceptanceManifest, frontendManifest] = await Promise.all([
      fetchJson(`/public-deployment-acceptance.json?ka=${cacheKey}`),
      fetchJson(`/multiplayer-release.json?ka=${cacheKey}`)
    ]);
    const workerEndpoint = normalizePublicDeploymentAcceptanceWorkerReleaseEndpoint(
      frontendManifest.workerUrl
    );
    const [workerManifest, runtime] = await Promise.all([
      fetchJson(`${workerEndpoint}?ka=${cacheKey}`),
      loadGameFrame()
    ]);

    lastInputs = {
      acceptanceManifest,
      frontendManifest,
      workerManifest,
      pageUrl: window.location.href,
      ...runtime
    };
    renderEvaluation(evaluatePublicDeploymentAcceptance({
      ...lastInputs,
      manualProof: manualProof()
    }));
  } catch (error) {
    lastInputs = null;
    renderEvaluation({
      status: 'FAIL',
      automatedReady: false,
      ready: false,
      errors: [{
        code: 'LIVE_ACCEPTANCE_REQUEST_FAILED',
        message: String(
          error?.name === 'AbortError'
            ? 'A live acceptance request timed out.'
            : error?.message || error
        ).slice(0, 500)
      }],
      warnings: [],
      pending: [],
      evidence: {
        pageUrl: window.location.href,
        runtimeAudit: 'missing',
        activeRestrictedGlobals: [],
        uiStatusText: '',
        gameBuild: '',
        gamePatch: '',
        manualProof: manualProof()
      }
    });
  } finally {
    setRunning(false);
  }
}

function refreshManualProof() {
  if (!lastInputs) return;
  renderEvaluation(evaluatePublicDeploymentAcceptance({
    ...lastInputs,
    manualProof: manualProof()
  }));
}

function openClient(label) {
  const url = new URL('/', window.location.href);
  url.searchParams.set('kaAcceptanceClient', label);
  window.open(
    url.toString(),
    `khadijaAcceptanceClient${label}`,
    'noopener,noreferrer'
  );
}

function exportDiagnostic() {
  if (!lastEvaluation) return;
  const diagnostic = createCompactPublicDeploymentDiagnostic(lastEvaluation, {
    checkedAt: new Date().toISOString(),
    roomCode: elements.roomCode?.value || ''
  });
  const blob = new Blob(
    [`${JSON.stringify(diagnostic, null, 2)}\n`],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `khadija-public-deployment-acceptance-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

elements.run?.addEventListener('click', () => {
  void runAcceptance();
});
elements.export?.addEventListener('click', exportDiagnostic);
elements.openA?.addEventListener('click', () => openClient('A'));
elements.openB?.addEventListener('click', () => openClient('B'));
[elements.createJoin, elements.shortRun, elements.leaveRejoin]
  .forEach((input) => input?.addEventListener('change', refreshManualProof));
elements.roomCode?.addEventListener('input', () => {
  elements.roomCode.value = elements.roomCode.value
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
});

void runAcceptance();
