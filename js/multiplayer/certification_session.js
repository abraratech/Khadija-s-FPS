// js/multiplayer/certification_session.js
// M3.73-M3.74 — localhost-only two-client certification ledger and export.

import {
  MULTIPLAYER_CERTIFICATION_DEFAULT_TARGET_MS,
  MULTIPLAYER_CERTIFICATION_SAMPLE_INTERVAL_MS,
  MULTIPLAYER_CERTIFICATION_SCENARIOS,
  buildMultiplayerCertificationEvidence,
  createMultiplayerCertificationSession,
  evaluateMultiplayerCertificationSession,
  normalizeMultiplayerCertificationTargetMs,
  recordMultiplayerCertificationSample,
  recordMultiplayerCertificationScenario,
  setMultiplayerCertificationRunState
} from './certification_session_core.js';

const PANEL_ID = 'mp-certification-session';
const STYLE_ID = 'mp-certification-session-style';
const STORAGE_KEY = 'khadija:mp-certification-session:v1';
const RENDER_INTERVAL_MS = 250;

let state = loadState();
let result = evaluateMultiplayerCertificationSession(state);
let visible = false;
let panel = null;
let lastSampleAt = performanceNow();
let lastRenderedAt = -Infinity;

function performanceNow() {
  return typeof performance !== 'undefined'
    && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function isDebugAllowed() {
  if (typeof window === 'undefined') return false;
  const hostname = String(window.location?.hostname || '').toLowerCase();
  const loopback = (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
  const debug = new URLSearchParams(
    window.location?.search || ''
  ).get('mpDebug') === '1';
  return loopback && debug;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusOf(value, fallback = 'UNKNOWN') {
  if (typeof value === 'string') {
    return String(value || fallback).trim().toUpperCase();
  }
  return String(
    value?.status
    || value?.result?.status
    || fallback
  ).trim().toUpperCase();
}

function readGlobal(name) {
  if (typeof window === 'undefined') return null;
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

function captureSample(now = performanceNow()) {
  const tabRecovery = readGlobal(
    'KHADIJA_MULTIPLAYER_TAB_RECOVERY_SEAL'
  ) || {};
  const epochFence = readGlobal(
    'KHADIJA_MULTIPLAYER_TAB_EPOCH_FENCE'
  ) || {};

  return {
    at: now,
    deltaMs: Math.max(0, now - lastSampleAt),
    releaseCandidateStatus: statusOf(
      readGlobal('KHADIJA_MULTIPLAYER_RELEASE_CANDIDATE')
    ),
    soakStatus: statusOf(
      readGlobal('KHADIJA_MULTIPLAYER_SOAK_CERTIFICATION')
    ),
    recoveryStatus: statusOf(
      readGlobal('KHADIJA_MULTIPLAYER_RECOVERY_CERTIFICATION')
    ),
    tabRecoveryStatus: statusOf(tabRecovery),
    tabRecoveryContinuity: String(
      tabRecovery?.continuity || 'UNKNOWN'
    ),
    tabRecoveryReason: String(tabRecovery?.reason || ''),
    epochFenceStatus: statusOf(epochFence)
  };
}

function saveState() {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );
    return true;
  } catch {
    return false;
  }
}

function loadState() {
  if (typeof window === 'undefined') {
    return createMultiplayerCertificationSession();
  }
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return createMultiplayerCertificationSession();
    const parsed = JSON.parse(raw);
    const fresh = createMultiplayerCertificationSession({
      targetMs: parsed.targetMs,
      startedAt: parsed.startedAt,
      running: parsed.running === true
    });
    return Object.freeze({
      ...fresh,
      ...parsed,
      scenarios: Object.freeze({
        ...fresh.scenarios,
        ...(parsed.scenarios || {})
      }),
      events: Object.freeze(
        Array.isArray(parsed.events) ? parsed.events : []
      )
    });
  } catch {
    return createMultiplayerCertificationSession();
  }
}

function publish() {
  if (typeof window === 'undefined') return;
  const snapshot = Object.freeze({
    milestone: 'M3.73-M3.74',
    status: result.status,
    result,
    state: Object.freeze({
      running: state.running,
      paused: state.paused,
      complete: state.complete,
      elapsedMs: state.elapsedMs,
      targetMs: state.targetMs,
      sampleCount: state.sampleCount,
      scenarios: Object.freeze({ ...state.scenarios })
    }),
    exportEvidence
  });
  try {
    window.KHADIJA_MULTIPLAYER_CERTIFICATION_SESSION = snapshot;
  } catch {
    // Debug evidence publication must never interrupt gameplay.
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(
    0,
    Math.floor(Number(milliseconds) / 1000)
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function downloadJson(name, value) {
  if (typeof document === 'undefined') return false;
  const blob = new Blob(
    [JSON.stringify(value, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  return true;
}

function exportEvidence() {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return downloadJson(
    `khadijas-arena-certification-${stamp}.json`,
    buildMultiplayerCertificationEvidence(state, result)
  );
}

function ensureStyle() {
  if (
    typeof document === 'undefined'
    || document.getElementById(STYLE_ID)
  ) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID} {
      position: fixed;
      inset: 18px auto auto 18px;
      z-index: 10070;
      width: min(760px, calc(100vw - 36px));
      max-height: calc(100vh - 36px);
      overflow: auto;
      padding: 16px;
      border: 1px solid rgba(96, 165, 250, .72);
      border-radius: 12px;
      background: rgba(3, 10, 24, .97);
      color: #eff6ff;
      font: 13px/1.45 system-ui, sans-serif;
      box-shadow: 0 20px 65px rgba(0, 0, 0, .62);
    }
    #${PANEL_ID}[hidden] { display: none !important; }
    #${PANEL_ID} button,
    #${PANEL_ID} select {
      margin: 3px;
      padding: 7px 10px;
      border-radius: 7px;
      border: 1px solid rgba(255,255,255,.2);
      background: #172554;
      color: #eff6ff;
      cursor: pointer;
    }
    #${PANEL_ID} .cert-scenario {
      margin: 8px 0;
      padding: 9px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 8px;
    }
    #${PANEL_ID} .cert-status {
      font-weight: 800;
      letter-spacing: .04em;
    }
    #${PANEL_ID} textarea {
      width: 100%;
      min-height: 46px;
      margin-top: 6px;
      padding: 7px;
      box-sizing: border-box;
      border-radius: 6px;
      background: #020617;
      color: #e2e8f0;
      border: 1px solid rgba(255,255,255,.18);
    }
  `;
  document.head?.appendChild(style);
}

function createPanel() {
  if (
    !isDebugAllowed()
    || typeof document === 'undefined'
    || !document.body
    || panel
  ) {
    return panel;
  }
  ensureStyle();
  panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.innerHTML = `
    <h2 style="margin:0 0 8px">Multiplayer Certification Session · F7</h2>
    <p style="margin:0 0 10px;color:#bfdbfe">
      Run this on the host tab during the real two-client regression session.
      Mark each scenario only after checking both clients.
    </p>
    <div>
      <select data-target>
        <option value="120000">2 minutes</option>
        <option value="600000" selected>10 minutes</option>
        <option value="900000">15 minutes</option>
        <option value="1800000">30 minutes</option>
      </select>
      <button data-action="start">Start</button>
      <button data-action="pause">Pause / Resume</button>
      <button data-action="finalize">Finalize</button>
      <button data-action="reset">Reset</button>
      <button data-action="export">Export JSON</button>
      <button data-action="close">Close</button>
    </div>
    <div data-summary style="margin:12px 0"></div>
    <div data-scenarios></div>
    <div data-findings></div>
  `;
  panel.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'start') {
      const target = Number(
        panel.querySelector('[data-target]')?.value
      ) || MULTIPLAYER_CERTIFICATION_DEFAULT_TARGET_MS;
      state = createMultiplayerCertificationSession({
        targetMs: normalizeMultiplayerCertificationTargetMs(target),
        startedAt: performanceNow(),
        running: true
      });
      state = setMultiplayerCertificationRunState(state, {
        running: true,
        at: performanceNow(),
        reason: 'manual-start'
      });
      lastSampleAt = performanceNow();
    } else if (action === 'pause') {
      state = setMultiplayerCertificationRunState(state, {
        running: true,
        paused: !state.paused,
        at: performanceNow(),
        reason: state.paused ? 'manual-resume' : 'manual-pause'
      });
      lastSampleAt = performanceNow();
    } else if (action === 'finalize') {
      state = setMultiplayerCertificationRunState(state, {
        running: false,
        paused: false,
        complete: true,
        at: performanceNow(),
        reason: 'manual-finalize'
      });
    } else if (action === 'reset') {
      state = createMultiplayerCertificationSession();
      try {
        window.localStorage?.removeItem(STORAGE_KEY);
      } catch {
        // Restricted storage is non-fatal.
      }
    } else if (action === 'export') {
      exportEvidence();
    } else if (action === 'close') {
      visible = false;
      panel.hidden = true;
    } else if (action === 'scenario-pass' || action === 'scenario-fail') {
      const key = String(button.dataset.key || '');
      const note = panel.querySelector(
        `textarea[data-note="${CSS.escape(key)}"]`
      )?.value || '';
      state = recordMultiplayerCertificationScenario(state, {
        key,
        status: action === 'scenario-pass' ? 'PASS' : 'FAIL',
        note,
        at: performanceNow()
      });
    }
    result = evaluateMultiplayerCertificationSession(
      state,
      { final: state.complete === true }
    );
    saveState();
    publish();
    render();
  });
  document.body.appendChild(panel);
  render();
  return panel;
}

function render() {
  if (!panel) return;
  const summary = panel.querySelector('[data-summary]');
  const scenarios = panel.querySelector('[data-scenarios]');
  const findings = panel.querySelector('[data-findings]');

  if (summary) {
    summary.innerHTML = `
      <div class="cert-status">Status: ${escapeHtml(result.status)}</div>
      <div>
        ${formatDuration(result.elapsedMs)} /
        ${formatDuration(result.targetMs)} ·
        ${result.sampleCount} samples
      </div>
      <div>
        Scenarios:
        ${result.scenarioSummary.passed} pass ·
        ${result.scenarioSummary.failed} fail ·
        ${result.scenarioSummary.pending} pending
      </div>
      <div>
        Automatic samples:
        ${result.sampleSummary.pass} pass ·
        ${result.sampleSummary.warn} warn ·
        ${result.sampleSummary.fail} fail
      </div>
    `;
  }

  if (scenarios) {
    scenarios.innerHTML = MULTIPLAYER_CERTIFICATION_SCENARIOS.map(
      ({ key, label }) => {
        const item = state.scenarios?.[key] || {};
        return `
          <div class="cert-scenario">
            <strong>${escapeHtml(label)}</strong>
            <span class="cert-status">
              · ${escapeHtml(item.status || 'PENDING')}
            </span>
            <div>
              <button data-action="scenario-pass" data-key="${escapeHtml(key)}">
                PASS
              </button>
              <button data-action="scenario-fail" data-key="${escapeHtml(key)}">
                FAIL
              </button>
            </div>
            <textarea
              data-note="${escapeHtml(key)}"
              placeholder="Optional evidence or issue note"
            >${escapeHtml(item.note || '')}</textarea>
          </div>
        `;
      }
    ).join('');
  }

  if (findings) {
    const rows = [
      ...(result.errors || []).map(
        (entry) => ({ ...entry, severity: 'FAIL' })
      ),
      ...(result.warnings || []).map(
        (entry) => ({ ...entry, severity: 'WARN' })
      )
    ];
    findings.innerHTML = `
      <h3>Findings</h3>
      ${
        rows.length
          ? rows.map(
              (entry) => `
                <div>
                  ${escapeHtml(entry.severity)} ·
                  ${escapeHtml(entry.code)} ·
                  ${escapeHtml(entry.message)}
                </div>
              `
            ).join('')
          : '<div>No findings.</div>'
      }
    `;
  }
}

function toggle() {
  if (!isDebugAllowed()) return false;
  createPanel();
  if (!panel) return false;
  visible = !visible;
  panel.hidden = !visible;
  if (visible) render();
  return visible;
}

function update(now = performanceNow()) {
  if (!isDebugAllowed()) return;
  if (
    state.running
    && !state.paused
    && !state.complete
    && now - lastSampleAt >= MULTIPLAYER_CERTIFICATION_SAMPLE_INTERVAL_MS
  ) {
    state = recordMultiplayerCertificationSample(
      state,
      captureSample(now)
    );
    lastSampleAt = now;
    if (state.elapsedMs >= state.targetMs) {
      state = setMultiplayerCertificationRunState(state, {
        running: false,
        complete: true,
        at: now,
        reason: 'target-reached'
      });
    }
    result = evaluateMultiplayerCertificationSession(
      state,
      { final: state.complete === true }
    );
    saveState();
    publish();
  }
  if (visible && now - lastRenderedAt >= RENDER_INTERVAL_MS) {
    lastRenderedAt = now;
    render();
  }
  requestAnimationFrame(update);
}

function initialize() {
  if (!isDebugAllowed()) return;
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F7') return;
    event.preventDefault();
    toggle();
  });
  createPanel();
  result = evaluateMultiplayerCertificationSession(
    state,
    { final: state.complete === true }
  );
  publish();
  requestAnimationFrame(update);
}

initialize();

export {
  exportEvidence,
  toggle as toggleMultiplayerCertificationSession
};
