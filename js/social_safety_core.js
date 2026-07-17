// POST-FINAL.5 — Player-facing report status, restrictions and appeals.

export const POST_FINAL5_PATCH = 'post-final5-r1-moderation-player-safety-operations';

function cleanText(value, fallback = '', max = 160) {
  return String(value ?? fallback)
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || fallback;
}

function finiteTime(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function normalizeSafetyReport(value = {}) {
  const reportId = cleanText(value.reportId, '', 120);
  if (!reportId) return null;
  const status = value.status === 'review-complete' ? 'review-complete' : 'received';
  return Object.freeze({
    reportId,
    category: cleanText(value.category, 'other', 40),
    status,
    createdAt: finiteTime(value.createdAt),
    updatedAt: finiteTime(value.updatedAt)
  });
}

export function normalizeSafetyAppeal(value = {}) {
  const appealId = cleanText(value.appealId, '', 120);
  if (!appealId) return null;
  const allowed = new Set(['pending', 'reviewing', 'upheld', 'reduced', 'lifted']);
  return Object.freeze({
    appealId,
    reportId: cleanText(value.reportId, '', 120),
    status: allowed.has(value.status) ? value.status : 'pending',
    createdAt: finiteTime(value.createdAt),
    updatedAt: finiteTime(value.updatedAt)
  });
}

export function normalizeSocialSafety(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const restrictionSource = source.restriction && typeof source.restriction === 'object'
    ? source.restriction
    : null;
  const expiresAt = finiteTime(restrictionSource?.expiresAt);
  const active = Boolean(
    restrictionSource?.active === true
    && (expiresAt === 0 || expiresAt > now)
  );
  const reports = (Array.isArray(source.reports) ? source.reports : [])
    .map(normalizeSafetyReport)
    .filter(Boolean)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 24);
  const appeals = (Array.isArray(source.appeals) ? source.appeals : [])
    .map(normalizeSafetyAppeal)
    .filter(Boolean)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 12);
  return Object.freeze({
    available: source.available !== false,
    retryingReports: Math.max(0, Math.min(99, Math.floor(Number(source.retryingReports) || 0))),
    reports: Object.freeze(reports),
    appeals: Object.freeze(appeals),
    restriction: Object.freeze({
      active,
      action: active ? cleanText(restrictionSource?.action, 'restricted', 40) : '',
      expiresAt: active ? expiresAt : 0,
      appealEligible: active && restrictionSource?.appealEligible !== false,
      reportId: active ? cleanText(restrictionSource?.reportId, '', 120) : ''
    })
  });
}

export function safetyReportStatusLabel(status) {
  return status === 'review-complete' ? 'REVIEW COMPLETE' : 'RECEIVED';
}

export function safetyAppealStatusLabel(status) {
  const labels = {
    pending: 'APPEAL RECEIVED',
    reviewing: 'UNDER REVIEW',
    upheld: 'DECISION UPHELD',
    reduced: 'RESTRICTION REDUCED',
    lifted: 'RESTRICTION LIFTED'
  };
  return labels[status] || 'APPEAL RECEIVED';
}

export function restrictionLabel(restriction = {}, now = Date.now()) {
  if (restriction.active !== true) return 'NO ACTIVE RESTRICTION';
  const action = cleanText(restriction.action, 'restricted', 40)
    .replaceAll('-', ' ')
    .toUpperCase();
  const expiresAt = finiteTime(restriction.expiresAt);
  if (!expiresAt) return `${action} · INDEFINITE`;
  const remaining = Math.max(0, expiresAt - now);
  const hours = Math.ceil(remaining / 3_600_000);
  return `${action} · ${hours}H REMAINING`;
}
