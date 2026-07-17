// POST-FINAL.6 — administrator roles, sessions, passkeys and operations helpers.

export const POST_FINAL6_PATCH = 'post-final6-r1-production-operations-hardening';
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const ADMIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const ADMIN_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const ADMIN_MAX_PASSKEYS = 6;
export const ADMIN_MAX_INTERNAL_NOTES = 50;

export const ADMIN_ROLES = Object.freeze([
  'viewer',
  'moderator',
  'senior-moderator',
  'owner'
]);

const ROLE_RANK = Object.freeze({
  viewer: 1,
  moderator: 2,
  'senior-moderator': 3,
  owner: 4
});

const PERMISSION_MIN_ROLE = Object.freeze({
  'dashboard.read': 'viewer',
  'reports.read': 'viewer',
  'appeals.read': 'viewer',
  'restrictions.read': 'viewer',
  'audit.read': 'viewer',
  'audit.export': 'viewer',
  'platform.read': 'viewer',
  'cases.read': 'viewer',
  'reports.review': 'moderator',
  'reports.assign': 'moderator',
  'reports.note': 'moderator',
  'reports.warning': 'moderator',
  'reports.temporary-restriction': 'moderator',
  'reports.dismiss': 'moderator',
  'reports.suspension': 'senior-moderator',
  'appeals.decide': 'senior-moderator',
  'restrictions.manage': 'senior-moderator',
  'reports.ban': 'owner',
  'staff.read': 'owner',
  'staff.manage': 'owner',
  'sessions.manage-all': 'owner',
  'webhook.read': 'owner'
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function cleanAdminText(value, fallback = '', max = 120) {
  const text = String(value ?? fallback)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

export function normalizeAdminHandle(value) {
  return cleanAdminText(value, '', 32)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32);
}

export function normalizeAdminRole(value, fallback = 'viewer') {
  const role = cleanAdminText(value, fallback, 40).toLowerCase();
  return ADMIN_ROLES.includes(role) ? role : fallback;
}

export function roleRank(value) {
  return ROLE_RANK[normalizeAdminRole(value)] || 0;
}

export function roleAllows(role, permission) {
  const minimum = PERMISSION_MIN_ROLE[String(permission || '')];
  if (!minimum) return false;
  return roleRank(role) >= roleRank(minimum);
}

export function publicAdmin(value = {}) {
  return Object.freeze({
    adminId: cleanAdminText(value.adminId, '', 120),
    handle: normalizeAdminHandle(value.handle),
    displayName: cleanAdminText(value.displayName, 'Arena Staff', 48),
    role: normalizeAdminRole(value.role),
    enabled: value.enabled !== false,
    passkeys: Array.isArray(value.passkeys) ? value.passkeys.length : 0,
    createdAt: Math.max(0, finite(value.createdAt, 0)),
    updatedAt: Math.max(0, finite(value.updatedAt, 0)),
    lastAuthenticatedAt: Math.max(0, finite(value.lastAuthenticatedAt, 0))
  });
}

export function normalizeAdminRecord(value = {}, now = Date.now()) {
  const safeNow = Math.max(1, finite(now, Date.now()));
  return {
    adminId: cleanAdminText(value.adminId, '', 120),
    handle: normalizeAdminHandle(value.handle),
    displayName: cleanAdminText(value.displayName, 'Arena Staff', 48),
    role: normalizeAdminRole(value.role),
    enabled: value.enabled !== false,
    passkeys: Array.isArray(value.passkeys) ? value.passkeys.slice(-ADMIN_MAX_PASSKEYS) : [],
    createdAt: Math.max(1, finite(value.createdAt, safeNow)),
    updatedAt: Math.max(1, finite(value.updatedAt, safeNow)),
    lastAuthenticatedAt: Math.max(0, finite(value.lastAuthenticatedAt, 0))
  };
}

export function createAdminSession({
  sessionId,
  tokenHash,
  adminId,
  role,
  now = Date.now(),
  expiresAt = 0,
  userAgentHash = ''
} = {}) {
  const safeNow = Math.max(1, finite(now, Date.now()));
  const expiry = Math.max(
    safeNow + 60_000,
    finite(expiresAt, safeNow + ADMIN_SESSION_TTL_MS)
  );
  return Object.freeze({
    sessionId: cleanAdminText(sessionId, '', 120),
    tokenHash: cleanAdminText(tokenHash, '', 128),
    adminId: cleanAdminText(adminId, '', 120),
    role: normalizeAdminRole(role),
    createdAt: safeNow,
    updatedAt: safeNow,
    lastSeenAt: safeNow,
    expiresAt: expiry,
    revokedAt: 0,
    userAgentHash: cleanAdminText(userAgentHash, '', 64)
  });
}

export function sessionActive(value = {}, now = Date.now()) {
  return Boolean(
    value
    && cleanAdminText(value.sessionId, '', 120)
    && cleanAdminText(value.adminId, '', 120)
    && cleanAdminText(value.tokenHash, '', 128)
    && Number(value.revokedAt || 0) <= 0
    && Number(value.expiresAt || 0) > Number(now)
  );
}

export function normalizeAdminInvite(value = {}, now = Date.now()) {
  const safeNow = Math.max(1, finite(now, Date.now()));
  return Object.freeze({
    inviteId: cleanAdminText(value.inviteId, '', 120),
    codeHash: cleanAdminText(value.codeHash, '', 128),
    handle: normalizeAdminHandle(value.handle),
    displayName: cleanAdminText(value.displayName, 'Arena Staff', 48),
    role: normalizeAdminRole(value.role),
    createdByAdminId: cleanAdminText(value.createdByAdminId, '', 120),
    createdAt: Math.max(1, finite(value.createdAt, safeNow)),
    expiresAt: Math.max(safeNow + 60_000, finite(value.expiresAt, safeNow + ADMIN_INVITE_TTL_MS)),
    consumedAt: Math.max(0, finite(value.consumedAt, 0))
  });
}

export function inviteActive(value = {}, now = Date.now()) {
  return Boolean(
    value
    && normalizeAdminHandle(value.handle)
    && cleanAdminText(value.codeHash, '', 128)
    && Number(value.consumedAt || 0) <= 0
    && Number(value.expiresAt || 0) > Number(now)
  );
}

export function requiresDecisionConfirmation({ subjectType = 'report', action = '' } = {}) {
  const type = cleanAdminText(subjectType, 'report', 24).toLowerCase();
  const normalizedAction = cleanAdminText(action, '', 40).toLowerCase();
  return normalizedAction === 'ban' || type === 'appeal';
}

export function validateDecisionConfirmation({
  subjectType = 'report',
  action = '',
  subjectId = '',
  confirmation = ''
} = {}) {
  if (!requiresDecisionConfirmation({ subjectType, action })) return true;
  return cleanAdminText(confirmation, '', 160) === cleanAdminText(subjectId, '', 160);
}

export function moderationPriority(report = {}, now = Date.now()) {
  const category = cleanAdminText(report.category, 'other', 40).toLowerCase();
  const createdAt = Math.max(0, finite(report.createdAt, now));
  const ageHours = Math.max(0, (Number(now) - createdAt) / 3_600_000);
  const groupCount = Math.max(1, finite(report.group?.count, 1));
  const uniqueReporters = Math.max(1, finite(report.group?.uniqueReporters, 1));
  let score = 0;
  if (category === 'hate') score += 50;
  if (category === 'cheating') score += 35;
  if (category === 'harassment') score += 25;
  if (groupCount >= 3) score += 20;
  if (uniqueReporters >= 2) score += 15;
  score += Math.min(25, Math.floor(ageHours / 6) * 5);
  const priority = score >= 70 ? 'critical'
    : score >= 45 ? 'high'
      : score >= 20 ? 'normal'
        : 'low';
  return Object.freeze({ score, priority, ageHours: Math.round(ageHours * 10) / 10 });
}

export function filterModerationReports(reports = [], {
  status = '',
  category = '',
  assignedTo = '',
  query = ''
} = {}) {
  const cleanStatus = cleanAdminText(status, '', 24).toLowerCase();
  const cleanCategory = cleanAdminText(category, '', 40).toLowerCase();
  const cleanAssignee = cleanAdminText(assignedTo, '', 120);
  const search = cleanAdminText(query, '', 120).toLowerCase();
  return (Array.isArray(reports) ? reports : []).filter((report) => {
    if (cleanStatus && report?.status !== cleanStatus) return false;
    if (cleanCategory && report?.category !== cleanCategory) return false;
    if (cleanAssignee && report?.assignedToAdminId !== cleanAssignee) return false;
    if (!search) return true;
    const haystack = [
      report?.reportId,
      report?.targetHash,
      report?.reporterHash,
      report?.category,
      report?.status,
      report?.action,
      report?.assignedToAdminId,
      report?.note
    ].map((entry) => String(entry || '').toLowerCase()).join(' ');
    return haystack.includes(search);
  });
}

export function appendInternalNote(report = {}, {
  noteId,
  actorHash,
  actorAdminId,
  text,
  now = Date.now()
} = {}) {
  const noteText = cleanAdminText(text, '', 500);
  if (noteText.length < 2) throw new Error('OPS_INTERNAL_NOTE_INVALID');
  const notes = Array.isArray(report.internalNotes) ? [...report.internalNotes] : [];
  notes.push({
    noteId: cleanAdminText(noteId, '', 120),
    actorHash: cleanAdminText(actorHash, '', 64),
    actorAdminId: cleanAdminText(actorAdminId, '', 120),
    text: noteText,
    createdAt: Math.max(1, finite(now, Date.now()))
  });
  return {
    ...report,
    internalNotes: notes.slice(-ADMIN_MAX_INTERNAL_NOTES),
    updatedAt: Math.max(1, finite(now, Date.now()))
  };
}

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

export function moderationAuditCsv(entries = []) {
  const header = [
    'auditId', 'createdAt', 'subjectType', 'subjectId', 'reportId',
    'status', 'action', 'actorHash', 'actorAdminId', 'actorRole', 'note'
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const entry of Array.isArray(entries) ? entries : []) {
    lines.push(header.map((key) => csvCell(entry?.[key] ?? '')).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
