// POST-FINAL.5 — Protected moderation operations dashboard.

import { ONLINE_LEADERBOARD_WORKER_URL } from './online_leaderboards_core.js';

const SESSION_TOKEN_KEY = 'ka_ops_admin_token_session_v1';
const state = {
  token: '',
  summary: null,
  reports: [],
  appeals: [],
  restrictions: [],
  audit: [],
  busy: false,
  activeTab: 'reports'
};

function byId(id) { return document.getElementById(id); }
function text(value, fallback = '') { return String(value ?? fallback).trim(); }
function dateTime(value) {
  const number = Number(value) || 0;
  return number ? new Date(number).toLocaleString() : '—';
}
function shortHash(value) {
  const source = text(value);
  return source ? `${source.slice(0, 10)}…${source.slice(-6)}` : '—';
}
function label(value) { return text(value, 'unknown').replaceAll('-', ' ').toUpperCase(); }
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

function setAuthStatus(message, tone = '') {
  const output = byId('mod-auth-status');
  if (!output) return;
  output.textContent = message;
  output.dataset.tone = tone;
}

async function api(path, { method = 'GET', body = null } = {}) {
  if (!state.token) throw new Error('OPS_ADMIN_AUTH_REQUIRED');
  const response = await fetch(`${ONLINE_LEADERBOARD_WORKER_URL}${path}`, {
    method,
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      authorization: `Bearer ${state.token}`,
      ...(body === null ? {} : { 'content-type': 'application/json' })
    },
    body: body === null ? undefined : JSON.stringify(body)
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok || value.ok !== true) {
    const error = new Error(text(value.error, `HTTP_${response.status}`));
    error.status = response.status;
    throw error;
  }
  return value;
}

function setUnlocked(unlocked) {
  byId('mod-console').hidden = !unlocked;
  byId('mod-lock').disabled = !unlocked;
  byId('mod-refresh').disabled = !unlocked;
  if (!unlocked) setAuthStatus('LOCKED');
}

function reportQuery() {
  const params = new URLSearchParams();
  const status = byId('mod-report-status')?.value || '';
  const category = byId('mod-report-category')?.value || '';
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  return params.toString() ? `?${params}` : '';
}

function appealQuery() {
  const status = byId('mod-appeal-status')?.value || '';
  return status ? `?status=${encodeURIComponent(status)}` : '';
}

async function refreshAll() {
  if (state.busy || !state.token) return;
  state.busy = true;
  setAuthStatus('REFRESHING…');
  try {
    const [summary, reports, appeals, restrictions, audit] = await Promise.all([
      api('/ops/admin/summary'),
      api(`/ops/admin/reports${reportQuery()}`),
      api(`/ops/admin/appeals${appealQuery()}`),
      api('/ops/admin/restrictions'),
      api('/ops/admin/audit?limit=120')
    ]);
    state.summary = summary;
    state.reports = reports.reports || [];
    state.appeals = appeals.appeals || [];
    state.restrictions = restrictions.restrictions || [];
    state.audit = audit.audit || [];
    renderAll();
    setUnlocked(true);
    setAuthStatus('AUTHENTICATED', 'good');
  } catch (error) {
    if (Number(error?.status) === 401) {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      state.token = '';
      setUnlocked(false);
      setAuthStatus('TOKEN REJECTED', 'error');
    } else {
      setAuthStatus(label(error?.message || error), 'error');
    }
  } finally {
    state.busy = false;
  }
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
  const oldest = Number(alerts.oldestPendingAt || 0);
  const messages = [];
  if (alerts.urgentReports) messages.push(`${alerts.urgentReports} urgent report${alerts.urgentReports === 1 ? '' : 's'}`);
  if (alerts.pendingAppeals) messages.push(`${alerts.pendingAppeals} pending appeal${alerts.pendingAppeals === 1 ? '' : 's'}`);
  if (oldest) messages.push(`oldest pending ${dateTime(oldest)}`);
  alert.textContent = messages.length ? messages.join(' · ').toUpperCase() : 'NO QUEUE ALERTS';
  alert.dataset.active = messages.length ? 'true' : 'false';
  byId('mod-report-count').textContent = String(alerts.pendingReports || 0);
  byId('mod-appeal-count').textContent = String(alerts.pendingAppeals || 0);
  byId('mod-restriction-count').textContent = String(summary.restrictionCount || 0);
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
    const urgent = group.coordinatedSignal === true || ['hate', 'cheating'].includes(report.category);
    const card = node('article', 'ka-mod-card');
    card.dataset.urgent = urgent ? 'true' : 'false';
    const badges = [
      { label: label(report.status), tone: ['pending', 'reviewing'].includes(report.status) ? 'warn' : '' },
      { label: label(report.category), tone: urgent ? 'warn' : '' }
    ];
    if (Number(group.count || 0) > 1) badges.push({ label: `${group.count} GROUPED`, tone: 'warn' });
    if (history.risk && history.risk !== 'normal') badges.push({ label: `REPORTER ${label(history.risk)}`, tone: 'danger' });
    card.append(cardHead(
      `REPORT ${text(report.reportId).slice(-8).toUpperCase()}`,
      `${dateTime(report.createdAt)} · UPDATED ${dateTime(report.updatedAt)}`,
      badges
    ));
    const details = node('div', 'ka-mod-details');
    details.append(
      detail('TARGET HASH', shortHash(report.targetHash)),
      detail('REPORTER HASH', shortHash(report.reporterHash)),
      detail('MAP / MODE', `${text(report.context?.mapId, '—')} / ${text(report.context?.mode, '—')}`),
      detail('WAVE / ROOM', `${Number(report.context?.wave || 0)} / ${shortHash(report.context?.roomRef)}`),
      detail('GROUP SIGNAL', `${group.count || 1} REPORTS · ${group.uniqueReporters || 1} REPORTERS`),
      detail('REPORTER HISTORY', `${history.total || 0} TOTAL · ${history.dismissed || 0} DISMISSED`),
      detail('CURRENT ACTION', label(report.action)),
      detail('REPORT ID', text(report.reportId))
    );
    card.append(details);
    if (report.note) card.append(node('p', 'ka-mod-note', report.note));
    if (['pending', 'reviewing'].includes(report.status)) {
      const actions = node('div', 'ka-mod-actions');
      if (report.status === 'pending') actions.append(actionButton('START REVIEW', 'review', 'report', report.reportId));
      actions.append(actionButton('DECIDE', 'decide', 'report', report.reportId));
      card.append(actions);
    }
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
    if (open) {
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
      detail('ADMIN HASH', shortHash(entry.actorHash)),
      detail('AUDIT ID', text(entry.auditId))
    );
    card.append(details);
    if (entry.note) card.append(node('p', 'ka-mod-note', entry.note));
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
  renderSummary();
  renderReports();
  renderAppeals();
  renderRestrictions();
  renderAudit();
  renderTabs();
}

function openDecision(type, id) {
  const dialog = byId('mod-action-dialog');
  const choice = byId('mod-action-choice');
  clear(choice);
  const options = type === 'appeal'
    ? [
        ['uphold', 'UPHOLD RESTRICTION'],
        ['reduce', 'REDUCE TO 24 HOURS'],
        ['lift', 'LIFT RESTRICTION']
      ]
    : [
        ['warning', 'ISSUE WARNING'],
        ['temporary-restriction', 'RESTRICT 24 HOURS'],
        ['suspension', 'SUSPEND 7 DAYS'],
        ['ban', 'BAN INDEFINITELY'],
        ['dismissed', 'DISMISS REPORT']
      ];
  options.forEach(([value, name]) => {
    const option = node('option', '', name);
    option.value = value;
    choice.append(option);
  });
  byId('mod-action-id').value = id;
  byId('mod-action-type').value = type;
  byId('mod-action-kind').textContent = `${type.toUpperCase()} ACTION`;
  byId('mod-action-title').textContent = id.slice(-12).toUpperCase();
  byId('mod-action-note').value = '';
  dialog.showModal();
}

async function markReviewing(type, id) {
  const path = type === 'appeal' ? '/ops/admin/appeals/action' : '/ops/admin/reports/action';
  const idKey = type === 'appeal' ? 'appealId' : 'reportId';
  setAuthStatus('APPLYING REVIEW STATE…');
  try {
    await api(path, {
      method: 'POST',
      body: { [idKey]: id, status: 'reviewing', action: 'none', note: 'Review started' }
    });
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
  if (!id || !action) return;
  if (!['dismissed', 'lift'].includes(action) && note.length < 6) {
    byId('mod-action-note').setCustomValidity('Add a short administrator reason.');
    byId('mod-action-note').reportValidity();
    byId('mod-action-note').setCustomValidity('');
    return;
  }
  const path = type === 'appeal' ? '/ops/admin/appeals/action' : '/ops/admin/reports/action';
  const idKey = type === 'appeal' ? 'appealId' : 'reportId';
  setAuthStatus('APPLYING DECISION…');
  try {
    await api(path, { method: 'POST', body: { [idKey]: id, action, note } });
    byId('mod-action-dialog').close();
    await refreshAll();
  } catch (error) {
    setAuthStatus(label(error?.message || error), 'error');
  }
}

function lock() {
  state.token = '';
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  byId('mod-token').value = '';
  setUnlocked(false);
}

async function connect() {
  const token = byId('mod-token').value.trim();
  if (token.length < 32) {
    setAuthStatus('TOKEN MUST BE AT LEAST 32 CHARACTERS', 'error');
    return;
  }
  state.token = token;
  if (byId('mod-remember').checked) sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  else sessionStorage.removeItem(SESSION_TOKEN_KEY);
  await refreshAll();
}

function bind() {
  byId('mod-connect').addEventListener('click', () => void connect());
  byId('mod-refresh').addEventListener('click', () => void refreshAll());
  byId('mod-lock').addEventListener('click', lock);
  byId('mod-report-status').addEventListener('change', () => void refreshAll());
  byId('mod-report-category').addEventListener('change', () => void refreshAll());
  byId('mod-appeal-status').addEventListener('change', () => void refreshAll());
  byId('mod-action-form').addEventListener('submit', (event) => void submitDecision(event));
  byId('mod-action-cancel').addEventListener('click', () => byId('mod-action-dialog').close());
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
    if (action.dataset.action === 'review') void markReviewing(type, id);
    if (action.dataset.action === 'decide') openDecision(type, id);
  });
}

bind();
setUnlocked(false);
const saved = sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
if (saved) {
  state.token = saved;
  byId('mod-token').value = saved;
  void refreshAll();
}
