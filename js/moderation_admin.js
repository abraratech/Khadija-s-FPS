// POST-FINAL.6 — passkey-protected moderation, staff roles and production operations.

import { ONLINE_LEADERBOARD_WORKER_URL } from './online_leaderboards_core.js';
import {
  ADMIN_SESSION_STORAGE_KEY,
  POST_FINAL6_FRONTEND_PATCH,
  adminCan,
  cleanSearch,
  confirmationRequired,
  prepareAuthenticationOptions,
  prepareRegistrationOptions,
  serializePublicKeyCredential
} from './moderation_admin_core.js';

const state = {
  token: sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || '',
  admin: null,
  session: null,
  permissions: {},
  passkeys: [],
  bootstrap: null,
  summary: null,
  reports: [],
  appeals: [],
  restrictions: [],
  audit: [],
  platform: null,
  staff: [],
  sessions: [],
  busy: false,
  activeTab: 'reports',
  compatibility: null
};

function byId(id) { return document.getElementById(id); }
function text(value, fallback = '') { return String(value ?? fallback).trim(); }
function dateTime(value) {
  const number = Number(value) || 0;
  return number ? new Date(number).toLocaleString() : '—';
}
function durationFromNow(value) {
  const ms = Number(value || 0) - Date.now();
  if (ms <= 0) return 'EXPIRED';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} MIN`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours} HR`;
  return `${Math.ceil(hours / 24)} DAYS`;
}
function shortHash(value) {
  const source = text(value);
  return source ? `${source.slice(0, 10)}…${source.slice(-6)}` : '—';
}
function label(value) {
  return text(value, 'unknown').replaceAll('-', ' ').replaceAll('_', ' ').toUpperCase();
}
function clear(root) { root?.replaceChildren(); }
function node(tag, className = '', content = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== '') element.textContent = content;
  return element;
}
function badge(value, tone = '') {
  const element = node('span', 'ka-mod-badge', value);
  if (tone) element.dataset.tone = tone;
  return element;
}
function detail(title, value) {
  const root = node('div', 'ka-mod-detail');
  root.append(node('span', '', title), node('strong', '', value));
  return root;
}
function cardHead(title, subtitle, badges = []) {
  const head = node('div', 'ka-mod-card-head');
  const copy = node('div');
  copy.append(node('strong', '', title), node('small', '', subtitle));
  const badgeRoot = node('div', 'ka-mod-badges');
  badges.forEach((entry) => badgeRoot.append(badge(entry.label, entry.tone)));
  head.append(copy, badgeRoot);
  return head;
}
function actionButton(labelText, action, type, id) {
  const button = node('button', '', labelText);
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.type = type;
  button.dataset.id = id;
  return button;
}
function setAuthStatus(message, tone = '') {
  const output = byId('mod-auth-status');
  if (!output) return;
  output.textContent = message;
  output.dataset.tone = tone;
}
function browserPasskeysAvailable() {
  return typeof PublicKeyCredential !== 'undefined'
    && Boolean(navigator.credentials)
    && window.isSecureContext;
}

async function request(path, {
  method = 'GET',
  body = null,
  token = state.token,
  parse = 'json'
} = {}) {
  const response = await fetch(`${ONLINE_LEADERBOARD_WORKER_URL}${path}`, {
    method,
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === null ? {} : { 'content-type': 'application/json' })
    },
    body: body === null ? undefined : JSON.stringify(body)
  });
  if (parse === 'blob') {
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      const error = new Error(text(value.error, `HTTP_${response.status}`));
      error.status = response.status;
      throw error;
    }
    return {
      blob: await response.blob(),
      filename: response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'moderation-export'
    };
  }
  const value = await response.json().catch(() => ({}));
  if (!response.ok || value.ok !== true) {
    const error = new Error(text(value.error, `HTTP_${response.status}`));
    error.status = response.status;
    throw error;
  }
  return value;
}

function saveSession(value) {
  state.token = text(value.token);
  state.admin = value.admin || null;
  state.session = value.session || null;
  if (state.token) sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, state.token);
}

function lock({ message = 'LOCKED' } = {}) {
  state.token = '';
  state.admin = null;
  state.session = null;
  state.permissions = {};
  state.passkeys = [];
  sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  byId('mod-console').hidden = true;
  byId('mod-auth-panel').hidden = false;
  byId('mod-refresh').disabled = true;
  byId('mod-lock').disabled = true;
  setAuthStatus(message);
}

function unlockUi() {
  byId('mod-console').hidden = false;
  byId('mod-auth-panel').hidden = true;
  byId('mod-refresh').disabled = false;
  byId('mod-lock').disabled = false;
}

async function bootstrapStatus() {
  try {
    state.bootstrap = await request('/ops/admin/auth/bootstrap/status', { token: '' });
    byId('mod-bootstrap-form').hidden = !state.bootstrap.bootstrapRequired;
    setAuthStatus(
      state.bootstrap.bootstrapRequired
        ? 'FIRST OWNER PASSKEY REQUIRED'
        : 'SIGN IN WITH A STAFF PASSKEY',
      state.bootstrap.bootstrapRequired ? 'warn' : ''
    );
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function createPasskey(options) {
  if (!browserPasskeysAvailable()) throw new Error('PASSKEY_SECURE_CONTEXT_REQUIRED');
  return navigator.credentials.create({
    publicKey: prepareRegistrationOptions(options)
  });
}

async function getPasskey(options) {
  if (!browserPasskeysAvailable()) throw new Error('PASSKEY_SECURE_CONTEXT_REQUIRED');
  return navigator.credentials.get({
    publicKey: prepareAuthenticationOptions(options)
  });
}

async function bootstrapOwner(event) {
  event.preventDefault();
  const token = byId('mod-bootstrap-token').value.trim();
  const handle = byId('mod-bootstrap-handle').value.trim();
  const displayName = byId('mod-bootstrap-display-name').value.trim();
  const passkeyName = byId('mod-bootstrap-passkey-name').value.trim();
  if (token.length < 32) {
    setAuthStatus('ENTER THE BREAK-GLASS OPS TOKEN', 'error');
    return;
  }
  setAuthStatus('PREPARING OWNER PASSKEY…');
  try {
    const prepared = await request('/ops/admin/auth/bootstrap/options', {
      method: 'POST',
      token,
      body: { handle, displayName }
    });
    const credential = await createPasskey(prepared.options);
    const verified = await request('/ops/admin/auth/bootstrap/verify', {
      method: 'POST',
      token,
      body: {
        challengeId: prepared.challengeId,
        passkeyName,
        credential: serializePublicKeyCredential(credential)
      }
    });
    byId('mod-bootstrap-token').value = '';
    saveSession(verified);
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function signIn(event) {
  event.preventDefault();
  const handle = byId('mod-signin-handle').value.trim();
  setAuthStatus('REQUESTING PASSKEY…');
  try {
    const prepared = await request('/ops/admin/auth/login/options', {
      method: 'POST',
      token: '',
      body: { handle }
    });
    const credential = await getPasskey(prepared.options);
    const verified = await request('/ops/admin/auth/login/verify', {
      method: 'POST',
      token: '',
      body: {
        challengeId: prepared.challengeId,
        credential: serializePublicKeyCredential(credential)
      }
    });
    saveSession(verified);
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.name === 'NotAllowedError' ? 'PASSKEY CANCELLED' : error?.message || error), 'error');
  }
}

async function enrollStaff(event) {
  event.preventDefault();
  const code = byId('mod-enroll-code').value.trim();
  const passkeyName = byId('mod-enroll-passkey-name').value.trim();
  setAuthStatus('VALIDATING STAFF INVITATION…');
  try {
    const prepared = await request('/ops/admin/auth/enroll/options', {
      method: 'POST',
      token: '',
      body: { code }
    });
    const credential = await createPasskey(prepared.options);
    const verified = await request('/ops/admin/auth/enroll/verify', {
      method: 'POST',
      token: '',
      body: {
        code,
        challengeId: prepared.challengeId,
        passkeyName,
        credential: serializePublicKeyCredential(credential)
      }
    });
    byId('mod-enroll-code').value = '';
    saveSession(verified);
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

function reportQuery() {
  const params = new URLSearchParams();
  const search = cleanSearch(byId('mod-report-search')?.value);
  const status = byId('mod-report-status')?.value || '';
  const category = byId('mod-report-category')?.value || '';
  const assigned = byId('mod-report-assigned')?.value || '';
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  if (assigned && assigned !== '__unassigned') params.set('assignedTo', assigned);
  return params.toString() ? `?${params}` : '';
}

function appealQuery() {
  const status = byId('mod-appeal-status')?.value || '';
  return status ? `?status=${encodeURIComponent(status)}` : '';
}

async function refreshCompatibility() {
  try {
    const [frontendResponse, worker] = await Promise.all([
      fetch('multiplayer-release.json', { cache: 'no-store' }),
      request('/release', { token: '' })
    ]);
    const frontend = await frontendResponse.json();
    const frontendPatch = frontend.postFinal6?.patch || '';
    const workerPatch = worker.productionOperationsHardening?.patch || '';
    state.compatibility = {
      ok: frontend.protocol === worker.protocol
        && frontendPatch === POST_FINAL6_FRONTEND_PATCH
        && workerPatch === POST_FINAL6_FRONTEND_PATCH,
      frontend,
      worker
    };
  } catch {
    state.compatibility = { ok: false };
  }
}

async function refreshAll() {
  if (!state.token || state.busy) return;
  state.busy = true;
  setAuthStatus('REFRESHING OPERATIONS…');
  try {
    const session = await request('/ops/admin/auth/session');
    state.admin = session.admin;
    state.session = session.session;
    state.permissions = session.permissions || {};
    state.passkeys = session.passkeys || [];

    const baseCalls = [
      request('/ops/admin/summary'),
      request(`/ops/admin/reports${reportQuery()}`),
      request(`/ops/admin/appeals${appealQuery()}`),
      request('/ops/admin/restrictions'),
      request('/ops/admin/audit?limit=160'),
      request('/ops/admin/platform'),
      request('/ops/admin/sessions')
    ];
    const [summary, reports, appeals, restrictions, audit, platform, sessions] = await Promise.all(baseCalls);
    state.summary = summary;
    state.staff = summary.assignees || [];
    state.reports = reports.reports || [];
    const assigned = byId('mod-report-assigned')?.value || '';
    if (assigned === '__unassigned') {
      state.reports = state.reports.filter((report) => !report.assignedToAdminId);
    }
    state.appeals = appeals.appeals || [];
    state.restrictions = restrictions.restrictions || [];
    state.audit = audit.audit || [];
    state.platform = platform;
    state.sessions = sessions.sessions || [];
    if (adminCan(state.admin?.role, 'staff')) {
      const staff = await request('/ops/admin/staff');
      state.staff = staff.staff || [];
    }
    await refreshCompatibility();
    populateAssignees();
    renderAll();
    unlockUi();
    setAuthStatus('PASSKEY SESSION ACTIVE', 'good');
  } catch (error) {
    if ([401, 403].includes(Number(error?.status))) {
      lock({ message: label(error?.message || 'SESSION EXPIRED') });
      await bootstrapStatus();
    } else {
      setAuthStatus(label(error?.message || error), 'error');
    }
  } finally {
    state.busy = false;
  }
}

function populateAssignees() {
  const select = byId('mod-report-assigned');
  if (!select) return;
  const selected = select.value;
  const base = [
    ['', 'All staff'],
    ['__unassigned', 'Unassigned']
  ];
  clear(select);
  for (const [value, name] of base) {
    const option = node('option', '', name);
    option.value = value;
    select.append(option);
  }
  state.staff
    .filter((entry) => entry.enabled)
    .forEach((entry) => {
      const option = node('option', '', `${entry.displayName} · ${label(entry.role)}`);
      option.value = entry.adminId;
      select.append(option);
    });
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function renderSessionBar() {
  byId('mod-session-name').textContent = state.admin?.displayName || state.admin?.handle || 'STAFF';
  byId('mod-session-role').textContent = label(state.admin?.role);
  byId('mod-session-expiry').textContent = `${dateTime(state.session?.expiresAt)} · ${durationFromNow(state.session?.expiresAt)}`;
  const compatibility = byId('mod-compatibility');
  compatibility.textContent = state.compatibility?.ok ? 'COMPATIBLE' : 'MISMATCH / UNVERIFIED';
  compatibility.dataset.tone = state.compatibility?.ok ? 'good' : 'error';
}

function renderSummary() {
  const root = byId('mod-summary');
  clear(root);
  const summary = state.summary || {};
  const alerts = summary.moderationAlerts || {};
  const cards = [
    ['PENDING REPORTS', alerts.pendingReports || 0, alerts.pendingReports ? 'alert' : ''],
    ['URGENT REPORTS', alerts.urgentReports || 0, alerts.urgentReports ? 'alert' : ''],
    ['PENDING APPEALS', alerts.pendingAppeals || 0, alerts.pendingAppeals ? 'alert' : ''],
    ['ACTIVE RESTRICTIONS', summary.restrictionCount || 0, ''],
    ['1H EVENTS', summary.events || 0, ''],
    ['1H ERRORS', summary.errors || 0, summary.errors ? 'alert' : '']
  ];
  cards.forEach(([name, value, tone]) => {
    const card = node('article', 'ka-mod-stat');
    if (tone) card.dataset.tone = tone;
    card.append(node('span', '', name), node('strong', '', String(value)));
    root.append(card);
  });
  const alert = byId('mod-alert');
  const messages = [];
  if (alerts.urgentReports) messages.push(`${alerts.urgentReports} urgent reports`);
  if (alerts.pendingAppeals) messages.push(`${alerts.pendingAppeals} pending appeals`);
  if (alerts.oldestPendingAt) messages.push(`oldest ${dateTime(alerts.oldestPendingAt)}`);
  alert.textContent = messages.length ? messages.join(' · ').toUpperCase() : 'NO QUEUE ALERTS';
  alert.dataset.active = messages.length ? 'true' : 'false';
  byId('mod-report-count').textContent = String(alerts.pendingReports || 0);
  byId('mod-appeal-count').textContent = String(alerts.pendingAppeals || 0);
  byId('mod-restriction-count').textContent = String(summary.restrictionCount || 0);
}

function staffName(adminId) {
  return state.staff.find((entry) => entry.adminId === adminId)?.displayName || (adminId ? shortHash(adminId) : 'UNASSIGNED');
}

function renderInternalNotes(report, card) {
  const notes = Array.isArray(report.internalNotes) ? report.internalNotes : [];
  if (!notes.length) return;
  const root = node('div', 'ka-mod-internal-notes');
  root.append(node('strong', '', `INTERNAL NOTES · ${notes.length}`));
  notes.slice(-5).forEach((entry) => {
    root.append(node('p', '', `${dateTime(entry.createdAt)} · ${shortHash(entry.actorAdminId)} · ${entry.text}`));
  });
  card.append(root);
}

function renderReports() {
  const root = byId('mod-reports');
  clear(root);
  if (!state.reports.length) {
    root.append(node('div', 'ka-mod-empty', 'No reports match the current filter.'));
    return;
  }
  state.reports.forEach((report) => {
    const group = report.group || {};
    const history = report.reporterHistory || {};
    const priority = report.priority || {};
    const urgent = ['critical', 'high'].includes(priority.priority);
    const card = node('article', 'ka-mod-card');
    card.dataset.urgent = urgent ? 'true' : 'false';
    const badges = [
      { label: label(report.status), tone: ['pending', 'reviewing'].includes(report.status) ? 'warn' : '' },
      { label: label(report.category), tone: urgent ? 'warn' : '' },
      { label: `${label(priority.priority)} · ${priority.score || 0}`, tone: urgent ? 'danger' : '' }
    ];
    if (Number(group.count || 0) > 1) badges.push({ label: `${group.count} GROUPED`, tone: 'warn' });
    if (history.risk && history.risk !== 'normal') badges.push({ label: `REPORTER ${label(history.risk)}`, tone: 'danger' });
    card.append(cardHead(
      `REPORT ${text(report.reportId).slice(-8).toUpperCase()}`,
      `${dateTime(report.createdAt)} · AGE ${priority.ageHours || 0}H`,
      badges
    ));
    const details = node('div', 'ka-mod-details');
    details.append(
      detail('TARGET HASH', shortHash(report.targetHash)),
      detail('REPORTER HASH', shortHash(report.reporterHash)),
      detail('ASSIGNED', staffName(report.assignedToAdminId)),
      detail('MAP / MODE', `${text(report.context?.mapId, '—')} / ${text(report.context?.mode, '—')}`),
      detail('GROUP SIGNAL', `${group.count || 1} REPORTS · ${group.uniqueReporters || 1} REPORTERS`),
      detail('REPORTER HISTORY', `${history.total || 0} TOTAL · ${history.dismissed || 0} DISMISSED`),
      detail('CURRENT ACTION', label(report.action)),
      detail('REPORT ID', text(report.reportId))
    );
    card.append(details);
    if (report.note) card.append(node('p', 'ka-mod-note', report.note));
    renderInternalNotes(report, card);
    const actions = node('div', 'ka-mod-actions');
    actions.append(actionButton('CASE TIMELINE', 'case', 'report', report.targetHash));
    if (adminCan(state.admin?.role, 'assign')) actions.append(actionButton('ASSIGN', 'assign', 'report', report.reportId));
    if (adminCan(state.admin?.role, 'note')) actions.append(actionButton('ADD NOTE', 'note', 'report', report.reportId));
    if (['pending', 'reviewing'].includes(report.status) && adminCan(state.admin?.role, 'review')) {
      if (report.status === 'pending') actions.append(actionButton('START REVIEW', 'review', 'report', report.reportId));
      actions.append(actionButton('DECIDE', 'decide', 'report', report.reportId));
    }
    card.append(actions);
    root.append(card);
  });
}

function renderAppeals() {
  const root = byId('mod-appeals');
  clear(root);
  if (!state.appeals.length) {
    root.append(node('div', 'ka-mod-empty', 'No appeals match the current filter.'));
    return;
  }
  state.appeals.forEach((appeal) => {
    const open = ['pending', 'reviewing'].includes(appeal.status);
    const card = node('article', 'ka-mod-card');
    card.dataset.urgent = open ? 'true' : 'false';
    card.append(cardHead(
      `APPEAL ${text(appeal.appealId).slice(-8).toUpperCase()}`,
      `${dateTime(appeal.createdAt)} · UPDATED ${dateTime(appeal.updatedAt)}`,
      [{ label: label(appeal.status), tone: open ? 'warn' : '' }]
    ));
    const details = node('div', 'ka-mod-details');
    details.append(
      detail('TARGET HASH', shortHash(appeal.targetHash)),
      detail('SOURCE REPORT', text(appeal.reportId, '—')),
      detail('ACTION', label(appeal.action)),
      detail('APPEAL ID', text(appeal.appealId))
    );
    card.append(details);
    if (appeal.note) card.append(node('p', 'ka-mod-note', appeal.note));
    if (open && adminCan(state.admin?.role, 'appeal')) {
      const actions = node('div', 'ka-mod-actions');
      if (appeal.status === 'pending') actions.append(actionButton('START REVIEW', 'review', 'appeal', appeal.appealId));
      actions.append(actionButton('DECIDE', 'decide', 'appeal', appeal.appealId));
      card.append(actions);
    }
    root.append(card);
  });
}

function renderRestrictions() {
  const root = byId('mod-restrictions');
  clear(root);
  if (!state.restrictions.length) {
    root.append(node('div', 'ka-mod-empty', 'No active authenticated-account restrictions.'));
    return;
  }
  state.restrictions.forEach((restriction) => {
    const card = node('article', 'ka-mod-card');
    card.append(cardHead(
      label(restriction.action),
      Number(restriction.expiresAt || 0) ? `EXPIRES ${dateTime(restriction.expiresAt)}` : 'INDEFINITE',
      [{ label: 'ACTIVE', tone: 'danger' }]
    ));
    const details = node('div', 'ka-mod-details');
    details.append(
      detail('TARGET HASH', shortHash(restriction.targetHash)),
      detail('SOURCE REPORT', text(restriction.reportId, '—')),
      detail('CREATED', dateTime(restriction.createdAt)),
      detail('APPEAL', text(restriction.appealId, '—'))
    );
    card.append(details);
    if (restriction.reason) card.append(node('p', 'ka-mod-note', restriction.reason));
    if (adminCan(state.admin?.role, 'restriction')) {
      const actions = node('div', 'ka-mod-actions');
      actions.append(actionButton('EXTEND 24H', 'extend-24-hours', 'restriction', restriction.targetHash));
      actions.append(actionButton('EXTEND 7D', 'extend-7-days', 'restriction', restriction.targetHash));
      actions.append(actionButton('LIFT', 'lift', 'restriction', restriction.targetHash));
      card.append(actions);
    }
    root.append(card);
  });
}

function renderAudit() {
  const root = byId('mod-audit');
  clear(root);
  if (!state.audit.length) {
    root.append(node('div', 'ka-mod-empty', 'No moderation audit entries.'));
    return;
  }
  state.audit.forEach((entry) => {
    const card = node('article', 'ka-mod-card');
    card.append(cardHead(
      `${label(entry.subjectType || 'report')} · ${label(entry.action)}`,
      dateTime(entry.createdAt),
      [{ label: label(entry.status) }]
    ));
    const details = node('div', 'ka-mod-details');
    details.append(
      detail('SUBJECT', text(entry.subjectId || entry.reportId || entry.appealId, '—')),
      detail('REPORT', text(entry.reportId, '—')),
      detail('STAFF', `${shortHash(entry.actorAdminId)} · ${label(entry.actorRole)}`),
      detail('AUDIT ID', text(entry.auditId))
    );
    card.append(details);
    if (entry.note) card.append(node('p', 'ka-mod-note', entry.note));
    root.append(card);
  });
}

function renderPlatform() {
  const root = byId('mod-platform');
  clear(root);
  const platform = state.platform || {};
  const services = platform.services || {};
  const security = platform.administratorSecurity || {};
  const social = platform.social || {};
  const card = node('article', 'ka-mod-card');
  card.append(cardHead('PRODUCTION SERVICE STATUS', dateTime(platform.generatedAt), [
    { label: services.worker ? 'WORKER UP' : 'WORKER UNKNOWN', tone: services.worker ? '' : 'danger' },
    { label: services.webhookConfigured ? 'WEBHOOK CONFIGURED' : 'WEBHOOK NOT SET', tone: services.webhookConfigured ? '' : 'warn' }
  ]));
  const details = node('div', 'ka-mod-details');
  details.append(
    detail('SOCIAL BINDING', services.socialBinding ? 'AVAILABLE' : 'MISSING'),
    detail('MATCHMAKING BINDING', services.matchmakingBinding ? 'AVAILABLE' : 'MISSING'),
    detail('REPORT RETRIES', String(social.retryingReports ?? '—')),
    detail('FORWARD FAILURES', String(social.reportForwardFailures ?? '—')),
    detail('ACTIVE STAFF SESSIONS', String(security.activeSessions || 0)),
    detail('FAILED STAFF ACCESS 24H', String(security.failedAccessAttempts24h || 0)),
    detail('BREAK-GLASS SECRET', services.breakGlassConfigured ? 'PRESENT' : 'MISSING'),
    detail('RELEASE PATCH', POST_FINAL6_FRONTEND_PATCH)
  );
  card.append(details);
  root.append(card);
  const errors = platform.telemetry?.recentErrors || [];
  if (errors.length) {
    const errorCard = node('article', 'ka-mod-card');
    errorCard.append(cardHead('RECENT PRIVACY-SAFE ERRORS', `${errors.length} SHOWN`));
    errors.slice(0, 20).forEach((entry) => {
      errorCard.append(node('p', 'ka-mod-note', `${dateTime(entry.receivedAt)} · ${label(entry.type)} · ${entry.message || 'No message'}`));
    });
    root.append(errorCard);
  }
}

function renderStaff() {
  const root = byId('mod-staff');
  clear(root);
  const owner = adminCan(state.admin?.role, 'staff');
  byId('mod-invite-form').hidden = !owner;
  if (!owner) {
    root.append(node('div', 'ka-mod-empty', 'Staff management requires the Owner role.'));
  } else {
    state.staff.forEach((entry) => {
      const card = node('article', 'ka-mod-card');
      card.append(cardHead(entry.displayName, `@${entry.handle}`, [
        { label: label(entry.role) },
        { label: entry.enabled ? 'ENABLED' : 'DISABLED', tone: entry.enabled ? '' : 'danger' },
        { label: `${entry.activeSessions || 0} SESSIONS` }
      ]));
      const details = node('div', 'ka-mod-details');
      details.append(
        detail('ADMIN ID', entry.adminId),
        detail('PASSKEYS', String(entry.passkeys || 0)),
        detail('LAST AUTH', dateTime(entry.lastAuthenticatedAt)),
        detail('CREATED', dateTime(entry.createdAt))
      );
      card.append(details);
      if (entry.adminId !== state.admin?.adminId) {
        const actions = node('div', 'ka-mod-actions');
        actions.append(actionButton('CHANGE ROLE', 'role', 'staff', entry.adminId));
        actions.append(actionButton(entry.enabled ? 'DISABLE' : 'ENABLE', 'status', 'staff', entry.adminId));
        card.append(actions);
      }
      root.append(card);
    });
  }
  const passkeyCard = node('article', 'ka-mod-card');
  passkeyCard.append(cardHead('MY STAFF PASSKEYS', `${state.passkeys.length} REGISTERED`));
  state.passkeys.forEach((entry) => {
    const row = node('div', 'ka-mod-row');
    row.append(node('span', '', `${entry.name || 'Passkey'} · last used ${dateTime(entry.lastUsedAt)}`));
    if (state.passkeys.length > 1) row.append(actionButton('REVOKE', 'revoke-passkey', 'passkey', entry.credentialId));
    passkeyCard.append(row);
  });
  root.append(passkeyCard);
}

function renderSessions() {
  const root = byId('mod-sessions');
  clear(root);
  state.sessions.forEach((entry) => {
    const card = node('article', 'ka-mod-card');
    card.append(cardHead(
      entry.current ? 'CURRENT SESSION' : 'STAFF SESSION',
      `${dateTime(entry.createdAt)} · EXPIRES ${dateTime(entry.expiresAt)}`,
      [{ label: entry.active ? 'ACTIVE' : 'EXPIRED', tone: entry.active ? '' : 'danger' }]
    ));
    const details = node('div', 'ka-mod-details');
    details.append(
      detail('SESSION ID', entry.sessionId),
      detail('LAST SEEN', dateTime(entry.lastSeenAt)),
      detail('ROLE AT ISSUE', label(entry.role)),
      detail('DEVICE HASH', shortHash(entry.userAgentHash))
    );
    card.append(details);
    if (!entry.current && entry.active) {
      const actions = node('div', 'ka-mod-actions');
      actions.append(actionButton('REVOKE SESSION', 'revoke-session', 'session', entry.sessionId));
      card.append(actions);
    }
    root.append(card);
  });
}

function renderTabs() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.dataset.active = button.dataset.tab === state.activeTab ? 'true' : 'false';
  });
  document.querySelectorAll('[data-view]').forEach((view) => {
    view.hidden = view.dataset.view !== state.activeTab;
  });
}

function renderAll() {
  renderSessionBar();
  renderSummary();
  renderReports();
  renderAppeals();
  renderRestrictions();
  renderAudit();
  renderPlatform();
  renderStaff();
  renderSessions();
  renderTabs();
}

function decisionOptions(type) {
  if (type === 'appeal') {
    return [
      ['uphold', 'UPHOLD RESTRICTION'],
      ['reduce', 'REDUCE TO 24 HOURS'],
      ['lift', 'LIFT RESTRICTION']
    ];
  }
  const options = [];
  if (adminCan(state.admin?.role, 'warning')) options.push(['warning', 'ISSUE WARNING']);
  if (adminCan(state.admin?.role, 'restrict')) options.push(['temporary-restriction', 'RESTRICT 24 HOURS']);
  if (adminCan(state.admin?.role, 'suspend')) options.push(['suspension', 'SUSPEND 7 DAYS']);
  if (adminCan(state.admin?.role, 'ban')) options.push(['ban', 'BAN INDEFINITELY']);
  if (adminCan(state.admin?.role, 'review')) options.push(['dismissed', 'DISMISS REPORT']);
  return options;
}

function updateConfirmationVisibility() {
  const type = byId('mod-action-type').value;
  const action = byId('mod-action-choice').value;
  const required = confirmationRequired(type, action);
  byId('mod-action-confirm-wrap').hidden = !required;
  byId('mod-action-confirm').required = required;
  if (!required) byId('mod-action-confirm').value = '';
}

function openDecision(type, id) {
  const choice = byId('mod-action-choice');
  clear(choice);
  decisionOptions(type).forEach(([value, name]) => {
    const option = node('option', '', name);
    option.value = value;
    choice.append(option);
  });
  byId('mod-action-id').value = id;
  byId('mod-action-type').value = type;
  byId('mod-action-kind').textContent = `${type.toUpperCase()} ACTION`;
  byId('mod-action-title').textContent = id;
  byId('mod-action-note').value = '';
  byId('mod-action-confirm').value = '';
  updateConfirmationVisibility();
  byId('mod-action-dialog').showModal();
}

async function markReviewing(type, id) {
  const path = type === 'appeal' ? '/ops/admin/appeals/action' : '/ops/admin/reports/action';
  const idKey = type === 'appeal' ? 'appealId' : 'reportId';
  const body = {
    [idKey]: id,
    status: 'reviewing',
    action: 'none',
    note: 'Review started',
    ...(type === 'appeal' ? { confirmation: id } : {})
  };
  setAuthStatus('APPLYING REVIEW STATE…');
  try {
    await request(path, { method: 'POST', body });
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function submitDecision(event) {
  event.preventDefault();
  const type = byId('mod-action-type').value;
  const id = byId('mod-action-id').value;
  const action = byId('mod-action-choice').value;
  const note = byId('mod-action-note').value.trim();
  const confirmation = byId('mod-action-confirm').value.trim();
  if (!id || !action) return;
  if (!['dismissed', 'lift'].includes(action) && note.length < 6) {
    byId('mod-action-note').setCustomValidity('Add a short administrator reason.');
    byId('mod-action-note').reportValidity();
    byId('mod-action-note').setCustomValidity('');
    return;
  }
  if (confirmationRequired(type, action) && confirmation !== id) {
    byId('mod-action-confirm').setCustomValidity('Type the exact subject ID.');
    byId('mod-action-confirm').reportValidity();
    byId('mod-action-confirm').setCustomValidity('');
    return;
  }
  const path = type === 'appeal' ? '/ops/admin/appeals/action' : '/ops/admin/reports/action';
  const idKey = type === 'appeal' ? 'appealId' : 'reportId';
  setAuthStatus('APPLYING DECISION…');
  try {
    await request(path, { method: 'POST', body: { [idKey]: id, action, note, confirmation } });
    byId('mod-action-dialog').close();
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function assignReport(reportId) {
  const options = state.staff
    .filter((entry) => entry.enabled)
    .map((entry) => `${entry.adminId} · ${entry.displayName} · ${entry.role}`)
    .join('\n');
  const assignedToAdminId = window.prompt(`Paste an ADMIN ID or leave blank to unassign:\n\n${options}`, '');
  if (assignedToAdminId === null) return;
  try {
    await request('/ops/admin/reports/assign', {
      method: 'POST',
      body: { reportId, assignedToAdminId: assignedToAdminId.trim() }
    });
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

function openNote(reportId) {
  byId('mod-note-report-id').value = reportId;
  byId('mod-note-title').textContent = reportId;
  byId('mod-note-text').value = '';
  byId('mod-note-dialog').showModal();
}

async function submitNote(event) {
  event.preventDefault();
  const reportId = byId('mod-note-report-id').value;
  const note = byId('mod-note-text').value.trim();
  try {
    await request('/ops/admin/reports/note', {
      method: 'POST',
      body: { reportId, note }
    });
    byId('mod-note-dialog').close();
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function openCase(targetHash) {
  try {
    const value = await request(`/ops/admin/cases?targetHash=${encodeURIComponent(targetHash)}`);
    byId('mod-case-title').textContent = shortHash(targetHash);
    const root = byId('mod-case-content');
    clear(root);
    [
      ['REPORTS', value.reports || []],
      ['APPEALS', value.appeals || []],
      ['RESTRICTIONS', value.restrictions || []],
      ['AUDIT', value.audit || []]
    ].forEach(([title, entries]) => {
      const section = node('article', 'ka-mod-card');
      section.append(cardHead(title, `${entries.length} ENTRIES`));
      entries.slice(0, 40).forEach((entry) => {
        section.append(node('p', 'ka-mod-note', `${dateTime(entry.createdAt)} · ${label(entry.status || entry.action)} · ${entry.reportId || entry.appealId || entry.auditId || '—'}`));
      });
      root.append(section);
    });
    byId('mod-case-dialog').showModal();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function restrictionAction(action, targetHash) {
  const note = window.prompt(`Reason for ${label(action)}:`, '');
  if (note === null) return;
  const confirmation = window.prompt(`Type the exact target hash to confirm:\n${targetHash}`, '');
  if (confirmation !== targetHash) {
    setAuthStatus('CONFIRMATION DID NOT MATCH', 'error');
    return;
  }
  try {
    await request('/ops/admin/restrictions/action', {
      method: 'POST',
      body: { targetHash, action, note, confirmation }
    });
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function inviteStaff(event) {
  event.preventDefault();
  try {
    const value = await request('/ops/admin/staff/invite', {
      method: 'POST',
      body: {
        handle: byId('mod-invite-handle').value.trim(),
        displayName: byId('mod-invite-name').value.trim(),
        role: byId('mod-invite-role').value
      }
    });
    byId('mod-invite-output').textContent =
      `ONE-TIME CODE · ${value.invite.code} · EXPIRES ${dateTime(value.invite.expiresAt)}`;
    await refreshAll();
  } catch (error) {
    byId('mod-invite-output').textContent = label(error?.message || error);
  }
}

async function changeStaffRole(adminId) {
  const role = window.prompt('Enter role: viewer, moderator, senior-moderator, or owner', 'moderator');
  if (!role) return;
  const confirmation = window.prompt(`Type the exact admin ID to confirm:\n${adminId}`, '');
  if (confirmation !== adminId) return;
  try {
    await request('/ops/admin/staff/role', {
      method: 'POST',
      body: { adminId, role, confirmation }
    });
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function changeStaffStatus(adminId) {
  const entry = state.staff.find((item) => item.adminId === adminId);
  if (!entry) return;
  const enabled = !entry.enabled;
  const confirmation = window.prompt(`Type the exact admin ID to ${enabled ? 'enable' : 'disable'}:\n${adminId}`, '');
  if (confirmation !== adminId) return;
  try {
    await request('/ops/admin/staff/status', {
      method: 'POST',
      body: { adminId, enabled, confirmation }
    });
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function revokeSession(sessionId) {
  if (!window.confirm('Revoke this staff session now?')) return;
  try {
    await request('/ops/admin/sessions/revoke', {
      method: 'POST',
      body: { sessionId }
    });
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function addPasskey() {
  const name = window.prompt('Passkey name', 'Additional Staff Passkey');
  if (!name) return;
  try {
    const prepared = await request('/ops/admin/passkeys/register/options', {
      method: 'POST',
      body: { name }
    });
    const credential = await createPasskey(prepared.options);
    await request('/ops/admin/passkeys/register/verify', {
      method: 'POST',
      body: {
        challengeId: prepared.challengeId,
        credential: serializePublicKeyCredential(credential)
      }
    });
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function revokePasskey(credentialId) {
  const confirmation = window.prompt('Type REVOKE to remove this passkey. Other sessions for this staff account will be revoked.', '');
  if (confirmation !== 'REVOKE') return;
  try {
    await request('/ops/admin/passkeys/revoke', {
      method: 'POST',
      body: { credentialId, confirmation }
    });
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function exportAudit(format) {
  try {
    const value = await request(`/ops/admin/audit/export?format=${format}`, { parse: 'blob' });
    const url = URL.createObjectURL(value.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = value.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

async function logout() {
  try {
    if (state.token) await request('/ops/admin/auth/logout', { method: 'POST', body: {} });
  } catch {}
  lock();
  await bootstrapStatus();
}

let searchTimer = 0;
function scheduleReportRefresh() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void refreshAll(), 300);
}

function bind() {
  byId('mod-signin-form').addEventListener('submit', (event) => void signIn(event));
  byId('mod-enroll-form').addEventListener('submit', (event) => void enrollStaff(event));
  byId('mod-bootstrap-form').addEventListener('submit', (event) => void bootstrapOwner(event));
  byId('mod-refresh').addEventListener('click', () => void refreshAll());
  byId('mod-lock').addEventListener('click', () => void logout());
  byId('mod-report-search').addEventListener('input', scheduleReportRefresh);
  byId('mod-report-status').addEventListener('change', () => void refreshAll());
  byId('mod-report-category').addEventListener('change', () => void refreshAll());
  byId('mod-report-assigned').addEventListener('change', () => void refreshAll());
  byId('mod-appeal-status').addEventListener('change', () => void refreshAll());
  byId('mod-action-choice').addEventListener('change', updateConfirmationVisibility);
  byId('mod-action-form').addEventListener('submit', (event) => void submitDecision(event));
  byId('mod-action-cancel').addEventListener('click', () => byId('mod-action-dialog').close());
  byId('mod-note-form').addEventListener('submit', (event) => void submitNote(event));
  byId('mod-note-cancel').addEventListener('click', () => byId('mod-note-dialog').close());
  byId('mod-invite-form').addEventListener('submit', (event) => void inviteStaff(event));
  byId('mod-add-passkey').addEventListener('click', () => void addPasskey());
  byId('mod-export-json').addEventListener('click', () => void exportAudit('json'));
  byId('mod-export-csv').addEventListener('click', () => void exportAudit('csv'));

  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-tab]');
    if (tab) {
      state.activeTab = tab.dataset.tab;
      renderTabs();
      return;
    }
    const action = event.target.closest?.('[data-action][data-type][data-id]');
    if (!action) return;
    const type = action.dataset.type;
    const id = action.dataset.id;
    const name = action.dataset.action;
    if (name === 'review') void markReviewing(type, id);
    else if (name === 'decide') openDecision(type, id);
    else if (name === 'assign') void assignReport(id);
    else if (name === 'note') openNote(id);
    else if (name === 'case') void openCase(id);
    else if (type === 'restriction') void restrictionAction(name, id);
    else if (name === 'role') void changeStaffRole(id);
    else if (name === 'status') void changeStaffStatus(id);
    else if (name === 'revoke-session') void revokeSession(id);
    else if (name === 'revoke-passkey') void revokePasskey(id);
  });
}

const savedSessionToken = state.token;
bind();
lock({ message: 'CHECKING SECURITY STATUS…' });
state.token = savedSessionToken;
if (savedSessionToken) sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, savedSessionToken);
await bootstrapStatus();
if (state.token) {
  await refreshAll();
}
