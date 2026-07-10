// js/multiplayer/final_certification.js
// M3.77-M3.78 — localhost final certification verdict and bundle export.

import {
  buildMultiplayerFinalCertificationBundle,
  evaluateMultiplayerFinalCertification
} from './final_certification_core.js';

const PANEL_ID = 'mp-final-certification';
const STYLE_ID = 'mp-final-certification-style';

let visible = false;
let panel = null;
let verdict = evaluateMultiplayerFinalCertification();
let tester = '';
let notes = '';

function isDebugAllowed() {
  if (typeof window === 'undefined') return false;
  const hostname = String(window.location?.hostname || '').toLowerCase();
  const loopback = (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
  return loopback && new URLSearchParams(
    window.location?.search || ''
  ).get('mpDebug') === '1';
}

function readGlobal(name) {
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

function collectSnapshots() {
  return {
    session: readGlobal(
      'KHADIJA_MULTIPLAYER_CERTIFICATION_SESSION'
    ),
    pairing: readGlobal(
      'KHADIJA_MULTIPLAYER_CERTIFICATION_PAIRING'
    ),
    releaseCandidate: readGlobal(
      'KHADIJA_MULTIPLAYER_RELEASE_CANDIDATE'
    ),
    soak: readGlobal(
      'KHADIJA_MULTIPLAYER_SOAK_CERTIFICATION'
    ),
    recovery: readGlobal(
      'KHADIJA_MULTIPLAYER_RECOVERY_CERTIFICATION'
    ),
    tabRecovery: readGlobal(
      'KHADIJA_MULTIPLAYER_TAB_RECOVERY_SEAL'
    ),
    epochFence: readGlobal(
      'KHADIJA_MULTIPLAYER_TAB_EPOCH_FENCE'
    )
  };
}

function refreshVerdict() {
  const snapshots = collectSnapshots();
  verdict = evaluateMultiplayerFinalCertification({
    ...snapshots,
    final: true
  });
  publish(snapshots);
  return verdict;
}

function publish(snapshots = collectSnapshots()) {
  const bundle = buildMultiplayerFinalCertificationBundle({
    verdict,
    ...snapshots,
    metadata: {
      tester,
      notes
    }
  });
  const snapshot = Object.freeze({
    milestone: 'M3.77-M3.78',
    status: verdict.status,
    releaseReady: verdict.releaseReady,
    verdict,
    bundle,
    exportBundle
  });
  try {
    window.KHADIJA_MULTIPLAYER_FINAL_CERTIFICATION = snapshot;
  } catch {
    // Debug evidence publication must never interrupt gameplay.
  }
  return snapshot;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function downloadJson(name, value) {
  if (!value || typeof document === 'undefined') return false;
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

function exportBundle() {
  const snapshots = collectSnapshots();
  refreshVerdict();
  const bundle = buildMultiplayerFinalCertificationBundle({
    verdict,
    ...snapshots,
    metadata: {
      tester,
      notes
    }
  });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return downloadJson(
    `khadijas-arena-final-certification-${stamp}.json`,
    bundle
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
      inset: auto 18px 18px auto;
      z-index: 10074;
      width: min(680px, calc(100vw - 36px));
      max-height: calc(100vh - 36px);
      overflow: auto;
      padding: 16px;
      border: 1px solid rgba(52, 211, 153, .78);
      border-radius: 12px;
      background: rgba(2, 20, 17, .97);
      color: #ecfdf5;
      font: 13px/1.45 system-ui, sans-serif;
      box-shadow: 0 20px 65px rgba(0,0,0,.62);
    }
    #${PANEL_ID}[hidden] { display: none !important; }
    #${PANEL_ID} input,
    #${PANEL_ID} textarea,
    #${PANEL_ID} button {
      margin: 4px;
      padding: 8px 10px;
      border-radius: 7px;
      border: 1px solid rgba(255,255,255,.22);
      background: #064e3b;
      color: #ecfdf5;
    }
    #${PANEL_ID} input,
    #${PANEL_ID} textarea {
      width: calc(100% - 12px);
      box-sizing: border-box;
    }
    #${PANEL_ID} textarea { min-height: 62px; }
    #${PANEL_ID} button { cursor: pointer; }
    #${PANEL_ID} .final-row {
      margin: 10px 0;
      padding: 9px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 8px;
    }
    #${PANEL_ID} .final-status {
      font-size: 1.25rem;
      font-weight: 900;
      letter-spacing: .06em;
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
    <h2 style="margin:0 0 8px">Final Multiplayer Certification · F5</h2>
    <p style="margin:0 0 10px;color:#a7f3d0">
      This is the final evidence gate. PASS requires the F7 ledger and F6 paired
      host/client evidence to pass with no blocking recovery findings.
    </p>
    <input data-tester maxlength="120" placeholder="Tester name">
    <textarea data-notes maxlength="1000" placeholder="Final certification notes"></textarea>
    <div>
      <button data-action="refresh">Refresh Verdict</button>
      <button data-action="export">Export Final Bundle</button>
      <button data-action="close">Close</button>
    </div>
    <div data-summary class="final-row"></div>
    <div data-components class="final-row"></div>
    <div data-findings class="final-row"></div>
  `;

  panel.addEventListener('input', (event) => {
    if (event.target.matches('[data-tester]')) {
      tester = event.target.value;
    } else if (event.target.matches('[data-notes]')) {
      notes = event.target.value;
    }
    publish();
  });

  panel.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'refresh') {
      refreshVerdict();
      render();
    } else if (action === 'export') {
      exportBundle();
      render();
    } else if (action === 'close') {
      visible = false;
      panel.hidden = true;
    }
  });

  document.body.appendChild(panel);
  refreshVerdict();
  render();
  return panel;
}

function render() {
  if (!panel) return;
  const summary = panel.querySelector('[data-summary]');
  const components = panel.querySelector('[data-components]');
  const findings = panel.querySelector('[data-findings]');

  if (summary) {
    summary.innerHTML = `
      <div class="final-status">Verdict: ${escapeHtml(verdict.status)}</div>
      <div>
        Release ready:
        ${verdict.releaseReady ? 'YES' : 'NO'}
      </div>
    `;
  }

  if (components) {
    components.innerHTML = Object.values(
      verdict.components || {}
    ).map(
      (entry) => `
        <div>
          <strong>${escapeHtml(entry.name)}</strong> ·
          ${escapeHtml(entry.status)}
          ${
            entry.continuity !== 'UNKNOWN'
              ? ` · ${escapeHtml(entry.continuity)}`
              : ''
          }
        </div>
      `
    ).join('');
  }

  if (findings) {
    const rows = [
      ...(verdict.errors || []).map(
        (entry) => ({ ...entry, severity: 'FAIL' })
      ),
      ...(verdict.warnings || []).map(
        (entry) => ({ ...entry, severity: 'WARN' })
      )
    ];
    findings.innerHTML = rows.length
      ? rows.map(
          (entry) => `
            <div>
              ${escapeHtml(entry.severity)} ·
              ${escapeHtml(entry.code)} ·
              ${escapeHtml(entry.message)}
            </div>
          `
        ).join('')
      : '<div>No certification findings.</div>';
  }
}

function toggle() {
  if (!isDebugAllowed()) return false;
  createPanel();
  if (!panel) return false;
  visible = !visible;
  panel.hidden = !visible;
  if (visible) {
    refreshVerdict();
    render();
  }
  return visible;
}

function initialize() {
  if (!isDebugAllowed()) return;
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F5') return;
    event.preventDefault();
    toggle();
  });
  createPanel();
  publish();
  setInterval(() => {
    if (visible) {
      refreshVerdict();
      render();
    }
  }, 1000);
}

initialize();

export {
  exportBundle,
  toggle as toggleMultiplayerFinalCertification
};
