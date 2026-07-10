// js/multiplayer/certification_pairing.js
// M3.75-M3.76 — localhost host/client evidence exchange and pairing panel.

import {
  createMultiplayerCertificationClientEvidence,
  evaluateMultiplayerCertificationPairing
} from './certification_pairing_core.js';

const PANEL_ID = 'mp-certification-pairing';
const STYLE_ID = 'mp-certification-pairing-style';
const CLIENT_ID_KEY = 'khadija:mp-certification-client-id:v1';
const SETTINGS_KEY = 'khadija:mp-certification-pairing:v1';

let visible = false;
let panel = null;
let peerEvidence = null;
let localEvidence = null;
let result = evaluateMultiplayerCertificationPairing();
let settings = loadSettings();

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

function createToken() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(
      bytes,
      (value) => value.toString(16).padStart(2, '0')
    ).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getClientId() {
  try {
    const stored = String(
      window.sessionStorage?.getItem(CLIENT_ID_KEY) || ''
    ).trim();
    if (stored) return stored;
    const created = createToken();
    window.sessionStorage?.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return createToken();
  }
}

function loadSettings() {
  if (typeof window === 'undefined') {
    return { sessionCode: '', role: 'client' };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage?.getItem(SETTINGS_KEY) || '{}'
    );
    return {
      sessionCode: String(parsed.sessionCode || ''),
      role: parsed.role === 'host' ? 'host' : 'client'
    };
  } catch {
    return { sessionCode: '', role: 'client' };
  }
}

function saveSettings() {
  try {
    window.localStorage?.setItem(
      SETTINGS_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // Restricted storage is non-fatal.
  }
}

function readGlobal(name) {
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

function buildLocalEvidence() {
  const certification = readGlobal(
    'KHADIJA_MULTIPLAYER_CERTIFICATION_SESSION'
  );
  localEvidence = createMultiplayerCertificationClientEvidence({
    sessionCode: settings.sessionCode,
    clientId: getClientId(),
    role: settings.role,
    capturedAt: Date.now(),
    certification,
    tabRecovery: readGlobal(
      'KHADIJA_MULTIPLAYER_TAB_RECOVERY_SEAL'
    ),
    epochFence: readGlobal(
      'KHADIJA_MULTIPLAYER_TAB_EPOCH_FENCE'
    ),
    metadata: {
      playerName: '',
      roomCode: '',
      userAgent: navigator.userAgent
    }
  });
  result = evaluateMultiplayerCertificationPairing({
    localEvidence,
    peerEvidence,
    final: Boolean(
      certification?.state?.complete
      && peerEvidence?.certification?.complete
    )
  });
  publish();
  return localEvidence;
}

function publish() {
  const snapshot = Object.freeze({
    milestone: 'M3.75-M3.76',
    status: result.status,
    result,
    settings: Object.freeze({ ...settings }),
    localEvidence,
    peerEvidence,
    exportLocalEvidence,
    importPeerEvidence
  });
  try {
    window.KHADIJA_MULTIPLAYER_CERTIFICATION_PAIRING = snapshot;
  } catch {
    // Debug evidence publication must never interrupt gameplay.
  }
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

function exportLocalEvidence() {
  const evidence = buildLocalEvidence();
  if (!evidence) return false;
  const role = settings.role === 'host' ? 'host' : 'client';
  return downloadJson(
    `khadijas-arena-${settings.sessionCode || 'session'}-${role}-evidence.json`,
    evidence
  );
}

async function importPeerEvidence(value) {
  let parsed = value;
  if (value instanceof File) {
    parsed = JSON.parse(await value.text());
  } else if (typeof value === 'string') {
    parsed = JSON.parse(value);
  }
  peerEvidence = parsed && typeof parsed === 'object'
    ? Object.freeze({ ...parsed })
    : null;
  buildLocalEvidence();
  render();
  return result;
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
      inset: 18px 18px auto auto;
      z-index: 10072;
      width: min(620px, calc(100vw - 36px));
      max-height: calc(100vh - 36px);
      overflow: auto;
      padding: 16px;
      border: 1px solid rgba(167, 139, 250, .78);
      border-radius: 12px;
      background: rgba(12, 7, 31, .97);
      color: #f5f3ff;
      font: 13px/1.45 system-ui, sans-serif;
      box-shadow: 0 20px 65px rgba(0,0,0,.62);
    }
    #${PANEL_ID}[hidden] { display: none !important; }
    #${PANEL_ID} input,
    #${PANEL_ID} select,
    #${PANEL_ID} button {
      margin: 4px;
      padding: 8px 10px;
      border-radius: 7px;
      border: 1px solid rgba(255,255,255,.22);
      background: #2e1065;
      color: #f5f3ff;
    }
    #${PANEL_ID} button { cursor: pointer; }
    #${PANEL_ID} .pair-row {
      margin: 10px 0;
      padding: 9px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 8px;
    }
    #${PANEL_ID} .pair-status {
      font-weight: 850;
      letter-spacing: .05em;
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
    <h2 style="margin:0 0 8px">Certification Evidence Pairing · F6</h2>
    <p style="margin:0 0 10px;color:#ddd6fe">
      Enter the same session code on both browsers. Export one JSON from each,
      then import the other browser's JSON on the host.
    </p>
    <div>
      <input data-session-code maxlength="64" placeholder="Shared session code">
      <select data-role>
        <option value="host">Host evidence</option>
        <option value="client">Client evidence</option>
      </select>
    </div>
    <div>
      <button data-action="refresh">Refresh Local Evidence</button>
      <button data-action="export">Export Local JSON</button>
      <button data-action="import">Import Peer JSON</button>
      <button data-action="clear">Clear Peer</button>
      <button data-action="close">Close</button>
      <input data-file type="file" accept="application/json,.json" hidden>
    </div>
    <div data-summary class="pair-row"></div>
    <div data-findings class="pair-row"></div>
  `;
  panel.querySelector('[data-session-code]').value = settings.sessionCode;
  panel.querySelector('[data-role]').value = settings.role;

  panel.addEventListener('change', (event) => {
    if (event.target.matches('[data-session-code]')) {
      settings = {
        ...settings,
        sessionCode: event.target.value
      };
      saveSettings();
      buildLocalEvidence();
      render();
    } else if (event.target.matches('[data-role]')) {
      settings = {
        ...settings,
        role: event.target.value === 'host' ? 'host' : 'client'
      };
      saveSettings();
      buildLocalEvidence();
      render();
    } else if (event.target.matches('[data-file]')) {
      const file = event.target.files?.[0];
      if (file) {
        importPeerEvidence(file).catch((error) => {
          result = Object.freeze({
            status: 'FAIL',
            paired: false,
            errors: Object.freeze([{
              code: 'PEER_IMPORT_FAILED',
              message: String(error?.message || error)
            }]),
            warnings: Object.freeze([])
          });
          publish();
          render();
        });
      }
      event.target.value = '';
    }
  });

  panel.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'refresh') {
      buildLocalEvidence();
      render();
    } else if (action === 'export') {
      exportLocalEvidence();
      render();
    } else if (action === 'import') {
      panel.querySelector('[data-file]')?.click();
    } else if (action === 'clear') {
      peerEvidence = null;
      buildLocalEvidence();
      render();
    } else if (action === 'close') {
      visible = false;
      panel.hidden = true;
    }
  });

  document.body.appendChild(panel);
  buildLocalEvidence();
  render();
  return panel;
}

function render() {
  if (!panel) return;
  const summary = panel.querySelector('[data-summary]');
  const findings = panel.querySelector('[data-findings]');
  const localSamples = Number(
    localEvidence?.certification?.sampleCount || 0
  );
  const peerSamples = Number(
    peerEvidence?.certification?.sampleCount || 0
  );

  if (summary) {
    summary.innerHTML = `
      <div class="pair-status">Status: ${escapeHtml(result.status)}</div>
      <div>Session: ${escapeHtml(settings.sessionCode || 'not set')}</div>
      <div>
        Local: ${escapeHtml(settings.role)} ·
        ${localSamples} samples ·
        ${escapeHtml(localEvidence?.digest || 'no evidence')}
      </div>
      <div>
        Peer: ${escapeHtml(peerEvidence?.role || 'not imported')} ·
        ${peerSamples} samples ·
        ${escapeHtml(peerEvidence?.digest || 'no evidence')}
      </div>
      <div>
        Overlap:
        ${Math.floor(Number(result.overlapMs || 0) / 1000)} seconds
      </div>
    `;
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
      : '<div>No pairing findings.</div>';
  }
}

function toggle() {
  if (!isDebugAllowed()) return false;
  createPanel();
  if (!panel) return false;
  visible = !visible;
  panel.hidden = !visible;
  if (visible) {
    buildLocalEvidence();
    render();
  }
  return visible;
}

function initialize() {
  if (!isDebugAllowed()) return;
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F6') return;
    event.preventDefault();
    toggle();
  });
  createPanel();
  publish();
  setInterval(() => {
    if (visible) {
      buildLocalEvidence();
      render();
    }
  }, 1000);
}

initialize();

export {
  exportLocalEvidence,
  importPeerEvidence,
  toggle as toggleMultiplayerCertificationPairing
};
