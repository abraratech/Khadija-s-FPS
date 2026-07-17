import { DurableObject } from 'cloudflare:workers';
import {
  OPS1_APPEAL_RETENTION_MS,
  OPS1_EVENT_RETENTION_MS,
  OPS1_MAX_BODY_BYTES,
  OPS1_MAX_RECENT_ERRORS,
  OPS1_REPORT_RETENTION_MS,
  OPS1_SERVER_PATCH,
  OPS1_SERVER_SCHEMA,
  addEventToOpsBucket,
  applyModerationAction,
  applyModerationAppealAction,
  cleanOpsString,
  consumeOpsRate,
  normalizeModerationAppeal,
  normalizeModerationReport,
  moderationReportGroup,
  moderationReporterHistory,
  moderationRestrictionForAction,
  normalizeOpsRateState,
  normalizeOpsServerEvent,
  opsHourKey,
  redactOpsServerText,
  summarizeOpsHealth
} from './ops1_core.js';

const encoder = new TextEncoder();

export const OPS1_SERVER_INFO = Object.freeze({
  patch: OPS1_SERVER_PATCH,
  schema: OPS1_SERVER_SCHEMA,
  healthEndpoint: '/ops/health',
  privacyEndpoint: '/ops/privacy',
  eventEndpoint: '/ops/events',
  adminRoutesProtected: true,
  rawIpStored: false,
  rawEmailStored: false,
  preciseLocationStored: false,
  passkeyDetailsStored: false,
  chatTranscriptCollectedByDefault: false,
  eventRetentionDays: 14,
  reportRetentionDays: 180,
  appealRetentionDays: 365,
  moderationDashboard: true,
  duplicateReportGrouping: true,
  falseReportSignals: true,
  reportForwardRetry: true,
  reporterStatus: true,
  appeals: true,
  accountWideAuthenticatedRestriction: true,
  telemetryFailureBlocksGameplay: false
});

function responseJson(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function requestJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > OPS1_MAX_BODY_BYTES) throw new Error('OPS_REQUEST_TOO_LARGE');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > OPS1_MAX_BODY_BYTES) {
    throw new Error('OPS_REQUEST_TOO_LARGE');
  }
  if (!bytes.byteLength) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('OPS_INVALID_JSON');
  }
}

function secureEqual(left, right) {
  const a = encoder.encode(String(left || ''));
  const b = encoder.encode(String(right || ''));
  if (a.byteLength !== b.byteLength || a.byteLength === 0) return false;
  let mismatch = 0;
  for (let index = 0; index < a.byteLength; index += 1) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}

async function shortHash(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(String(value || 'unknown'))
  );
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');
}

function bucketKey(timestamp) {
  return `bucket:${opsHourKey(timestamp)}`;
}

function reportKey(reportId) {
  return `report:${reportId}`;
}

function auditKey(createdAt, auditId) {
  return `audit:${String(createdAt).padStart(16, '0')}:${auditId}`;
}

function appealKey(appealId) {
  return `appeal:${appealId}`;
}

function errorKey(receivedAt, eventId) {
  return `error:${String(receivedAt).padStart(16, '0')}:${eventId}`;
}

function dedupeKey(eventId) {
  return `dedupe:${eventId}`;
}

function rateKey(sourceHash) {
  return `rate:${sourceHash || 'unknown'}`;
}

function restrictionKey(targetHash) {
  return `restriction:${targetHash}`;
}

function normalizeAdminToken(request) {
  const header = String(request.headers.get('authorization') || '');
  return header.replace(/^Bearer\s+/i, '').trim();
}

export class OpsHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (
        request.headers.get('x-ka-internal-ops') === '1'
        && request.method === 'POST'
      ) {
        if (url.pathname === '/internal/ops/route') {
          return this.ingestRoute(request);
        }
        if (url.pathname === '/internal/ops/moderation/report') {
          return this.ingestModerationReport(request);
        }
        if (url.pathname === '/internal/ops/moderation/check') {
          return this.checkModerationRestriction(request);
        }
        if (url.pathname === '/internal/ops/moderation/status') {
          return this.moderationStatus(request);
        }
        if (url.pathname === '/internal/ops/moderation/appeal') {
          return this.ingestModerationAppeal(request);
        }
        return responseJson(
          { ok: false, error: 'OPS_INTERNAL_ENDPOINT_NOT_FOUND' },
          { status: 404 }
        );
      }

      if (request.method === 'POST' && url.pathname === '/ops/events') {
        return this.ingestClientEvent(request);
      }
      if (request.method === 'GET' && url.pathname === '/ops/health') {
        return this.publicHealth();
      }
      if (request.method === 'GET' && url.pathname === '/ops/privacy') {
        return responseJson({
          ok: true,
          patch: OPS1_SERVER_PATCH,
          policy: OPS1_SERVER_INFO
        });
      }

      if (url.pathname.startsWith('/ops/admin/')) {
        await this.requireAdmin(request);
        if (
          request.method === 'GET'
          && url.pathname === '/ops/admin/summary'
        ) {
          return this.adminSummary();
        }
        if (
          request.method === 'GET'
          && url.pathname === '/ops/admin/reports'
        ) {
          return this.adminReports(url);
        }
        if (
          request.method === 'POST'
          && url.pathname === '/ops/admin/reports/action'
        ) {
          return this.adminReportAction(request);
        }
        if (
          request.method === 'GET'
          && url.pathname === '/ops/admin/appeals'
        ) {
          return this.adminAppeals(url);
        }
        if (
          request.method === 'POST'
          && url.pathname === '/ops/admin/appeals/action'
        ) {
          return this.adminAppealAction(request);
        }
        if (
          request.method === 'GET'
          && url.pathname === '/ops/admin/restrictions'
        ) {
          return this.adminRestrictions();
        }
        if (
          request.method === 'GET'
          && url.pathname === '/ops/admin/audit'
        ) {
          return this.adminAudit(url);
        }
        return responseJson(
          { ok: false, error: 'OPS_ADMIN_ENDPOINT_NOT_FOUND' },
          { status: 404 }
        );
      }

      return responseJson(
        { ok: false, error: 'OPS_ENDPOINT_NOT_FOUND' },
        { status: 404 }
      );
    } catch (error) {
      const code = cleanOpsString(
        error?.message || error || 'OPS_ERROR',
        'OPS_ERROR',
        160
      );
      const status = code.includes('AUTH') ? 401
        : code.includes('FORBIDDEN') ? 403
          : code.includes('NOT_FOUND') ? 404
            : code.includes('RATE') ? 429
              : code.includes('INVALID') || code.includes('TOO_LARGE') ? 400
                : 500;
      return responseJson({ ok: false, error: code }, { status });
    }
  }

  async requireAdmin(request) {
    const configured = String(this.env.OPS_ADMIN_TOKEN || '').trim();
    if (configured.length < 32) {
      throw new Error('OPS_ADMIN_NOT_CONFIGURED');
    }
    if (!secureEqual(normalizeAdminToken(request), configured)) {
      throw new Error('OPS_ADMIN_AUTH_REQUIRED');
    }
    return true;
  }

  async consumeSourceRate(sourceHash, {
    limit = 60,
    windowMs = 60_000,
    blockMs = 5 * 60_000
  } = {}) {
    const key = rateKey(sourceHash);
    const current = normalizeOpsRateState(
      await this.ctx.storage.get(key) || {},
      Date.now()
    );
    const result = consumeOpsRate(current, {
      now: Date.now(),
      limit,
      windowMs,
      blockMs
    });
    await this.ctx.storage.put(key, result.state);
    return result;
  }

  async storeEvent(event) {
    const duplicate = await this.ctx.storage.get(dedupeKey(event.eventId));
    if (duplicate) return { duplicate: true };

    const key = bucketKey(event.receivedAt);
    const bucket = addEventToOpsBucket(
      await this.ctx.storage.get(key) || null,
      event
    );

    const writes = [
      this.ctx.storage.put(key, bucket),
      this.ctx.storage.put(dedupeKey(event.eventId), {
        receivedAt: event.receivedAt
      })
    ];

    if (event.severity === 'error' || event.severity === 'critical') {
      const errorRecord = {
        eventId: event.eventId,
        fingerprint: event.fingerprint,
        type: event.type,
        severity: event.severity,
        message: event.message,
        stack: event.stack,
        context: event.context,
        source: event.source,
        releasePatch: event.releasePatch,
        region: event.region,
        receivedAt: event.receivedAt
      };
      writes.push(
        this.ctx.storage.put(
          errorKey(event.receivedAt, event.eventId),
          errorRecord
        )
      );
    }

    await Promise.all(writes);
    await this.trimRecentErrors();
    if (bucket.events % 50 === 0) await this.cleanup();
    return { duplicate: false, bucket };
  }

  async ingestClientEvent(request) {
    const sourceHash = cleanOpsString(
      request.headers.get('x-ka-ops-key'),
      '',
      64
    );
    if (!sourceHash) throw new Error('OPS_SOURCE_INVALID');

    const rate = await this.consumeSourceRate(sourceHash, {
      limit: 40,
      windowMs: 60_000,
      blockMs: 10 * 60_000
    });
    if (!rate.allowed) {
      return responseJson({
        ok: false,
        error: rate.reason,
        retryAfterMs: rate.retryAfterMs
      }, {
        status: 429,
        headers: {
          'retry-after': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000)))
        }
      });
    }

    const payload = await requestJson(request);
    const event = normalizeOpsServerEvent(payload.event || payload, {
      now: Date.now(),
      sourceHash,
      region: request.headers.get('x-ka-region') || 'ZZ'
    });
    if (!event) throw new Error('OPS_EVENT_INVALID');

    const result = await this.storeEvent(event);
    return responseJson({
      ok: true,
      patch: OPS1_SERVER_PATCH,
      accepted: !result.duplicate,
      duplicate: result.duplicate === true
    });
  }

  async ingestRoute(request) {
    const payload = await requestJson(request);
    const event = normalizeOpsServerEvent({
      eventId: payload.eventId,
      fingerprint: payload.fingerprint,
      type: 'worker-route',
      severity: Number(payload.status) >= 500 ? 'error' : 'info',
      message: Number(payload.status) >= 500
        ? `Worker route failure ${payload.routeGroup || 'unknown'}`
        : 'Worker route observation',
      context: {
        routeGroup: payload.routeGroup,
        status: payload.status,
        method: payload.method,
        durationBucket: payload.durationBucket,
        reason: payload.reason,
        source: 'worker-edge'
      },
      source: 'worker-edge',
      releasePatch: payload.releasePatch,
      timestamp: payload.timestamp
    }, {
      now: Date.now(),
      sourceHash: cleanOpsString(payload.sourceHash, 'worker', 64),
      region: cleanOpsString(payload.region, 'ZZ', 16)
    });
    if (!event) throw new Error('OPS_ROUTE_EVENT_INVALID');
    const result = await this.storeEvent(event);
    return responseJson({
      ok: true,
      accepted: !result.duplicate,
      duplicate: result.duplicate === true
    });
  }

  async ingestModerationReport(request) {
    const payload = await requestJson(request);
    const reporterHash = await shortHash(
      `reporter:${payload.reporterAccountId || ''}`
    );
    const targetHash = await shortHash(
      `target:${payload.targetAccountId || ''}`
    );
    const roomRef = payload.context?.roomId
      ? await shortHash(`room:${payload.context.roomId}`)
      : '';

    const report = normalizeModerationReport({
      reportId: payload.reportId,
      category: payload.category,
      note: payload.note,
      context: {
        mapId: payload.context?.mapId,
        mode: payload.context?.mode,
        wave: payload.context?.wave,
        roomRef
      },
      createdAt: payload.createdAt,
      expiresAt: Math.min(
        Number(payload.expiresAt) || Date.now() + OPS1_REPORT_RETENTION_MS,
        Date.now() + OPS1_REPORT_RETENTION_MS
      )
    }, {
      now: Date.now(),
      reporterHash,
      targetHash
    });

    const existing = await this.ctx.storage.get(reportKey(report.reportId));
    if (!existing) {
      await this.ctx.storage.put(reportKey(report.reportId), report);
    }
    await this.cleanup();
    return responseJson({
      ok: true,
      reportId: report.reportId,
      duplicate: Boolean(existing)
    });
  }

  async checkModerationRestriction(request) {
    const payload = await requestJson(request);
    const accountId = cleanOpsString(payload.accountId, '', 140);
    if (!accountId) {
      return responseJson({ ok: true, allowed: true, anonymous: true });
    }
    const targetHash = await shortHash(`target:${accountId}`);
    const key = restrictionKey(targetHash);
    const restriction = await this.ctx.storage.get(key);
    if (!restriction) {
      return responseJson({ ok: true, allowed: true });
    }
    if (
      Number(restriction.expiresAt || 0) > 0
      && Number(restriction.expiresAt) <= Date.now()
    ) {
      await this.ctx.storage.delete(key);
      return responseJson({ ok: true, allowed: true, expired: true });
    }
    return responseJson({
      ok: true,
      allowed: false,
      action: cleanOpsString(restriction.action, 'restricted', 40),
      reason: 'OPS_MODERATION_RESTRICTED',
      expiresAt: Math.max(0, Number(restriction.expiresAt) || 0)
    });
  }


  async moderationStatus(request) {
    const payload = await requestJson(request);
    const accountId = cleanOpsString(payload.accountId, '', 140);
    if (!accountId) throw new Error('OPS_ACCOUNT_ID_INVALID');
    const [reporterHash, targetHash] = await Promise.all([
      shortHash(`reporter:${accountId}`),
      shortHash(`target:${accountId}`)
    ]);
    const [reportsListed, appealsListed, restriction] = await Promise.all([
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'appeal:' }),
      this.ctx.storage.get(restrictionKey(targetHash))
    ]);
    const now = Date.now();
    let activeRestriction = restriction || null;
    if (
      activeRestriction
      && Number(activeRestriction.expiresAt || 0) > 0
      && Number(activeRestriction.expiresAt) <= now
    ) {
      await this.ctx.storage.delete(restrictionKey(targetHash));
      activeRestriction = null;
    }
    const reports = [...reportsListed.values()]
      .filter((report) => report?.reporterHash === reporterHash)
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 24)
      .map((report) => ({
        reportId: report.reportId,
        category: report.category,
        status: ['actioned', 'dismissed'].includes(report.status)
          ? 'review-complete'
          : 'received',
        createdAt: report.createdAt,
        updatedAt: report.updatedAt
      }));
    const appeals = [...appealsListed.values()]
      .filter((appeal) => appeal?.targetHash === targetHash)
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 12)
      .map((appeal) => ({
        appealId: appeal.appealId,
        reportId: appeal.reportId,
        status: appeal.status,
        createdAt: appeal.createdAt,
        updatedAt: appeal.updatedAt
      }));
    return responseJson({
      ok: true,
      patch: OPS1_SERVER_PATCH,
      reports,
      appeals,
      restriction: activeRestriction
        ? {
            active: true,
            action: activeRestriction.action,
            expiresAt: Math.max(0, Number(activeRestriction.expiresAt) || 0),
            reportId: cleanOpsString(activeRestriction.reportId, '', 120),
            appealEligible: true
          }
        : { active: false, action: '', expiresAt: 0, reportId: '', appealEligible: false }
    });
  }

  async ingestModerationAppeal(request) {
    const payload = await requestJson(request);
    const accountId = cleanOpsString(payload.accountId, '', 140);
    if (!accountId) throw new Error('OPS_ACCOUNT_ID_INVALID');
    const targetHash = await shortHash(`target:${accountId}`);
    const restriction = await this.ctx.storage.get(restrictionKey(targetHash));
    if (!restriction) throw new Error('OPS_APPEAL_NOT_ELIGIBLE');
    if (
      Number(restriction.expiresAt || 0) > 0
      && Number(restriction.expiresAt) <= Date.now()
    ) {
      await this.ctx.storage.delete(restrictionKey(targetHash));
      throw new Error('OPS_APPEAL_NOT_ELIGIBLE');
    }
    const listed = await this.ctx.storage.list({ prefix: 'appeal:' });
    const existing = [...listed.values()].find((appeal) => (
      appeal?.targetHash === targetHash
      && appeal?.reportId === restriction.reportId
      && ['pending', 'reviewing'].includes(appeal?.status)
    ));
    if (existing) {
      return responseJson({
        ok: true,
        duplicate: true,
        appeal: {
          appealId: existing.appealId,
          reportId: existing.reportId,
          status: existing.status,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt
        }
      });
    }
    const now = Date.now();
    const appeal = normalizeModerationAppeal({
      appealId: `appeal-${crypto.randomUUID()}`,
      reportId: restriction.reportId,
      note: payload.note,
      status: 'pending',
      action: 'none',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + OPS1_APPEAL_RETENTION_MS
    }, { now, targetHash });
    await this.ctx.storage.put(appealKey(appeal.appealId), appeal);
    return responseJson({
      ok: true,
      duplicate: false,
      appeal: {
        appealId: appeal.appealId,
        reportId: appeal.reportId,
        status: appeal.status,
        createdAt: appeal.createdAt,
        updatedAt: appeal.updatedAt
      }
    });
  }

  async listBuckets() {
    const listed = await this.ctx.storage.list({ prefix: 'bucket:' });
    return [...listed.values()];
  }

  async pendingReportCount() {
    const listed = await this.ctx.storage.list({ prefix: 'report:' });
    let pending = 0;
    for (const report of listed.values()) {
      if (report?.status === 'pending' || report?.status === 'reviewing') {
        pending += 1;
      }
    }
    return pending;
  }

  async publicHealth() {
    const [buckets, pendingReports] = await Promise.all([
      this.listBuckets(),
      this.pendingReportCount()
    ]);
    return responseJson(
      summarizeOpsHealth({
        buckets,
        pendingReports,
        now: Date.now(),
        releasePatch: OPS1_SERVER_PATCH
      })
    );
  }

  async adminSummary() {
    const [buckets, pendingReports, errors, reportsListed, appealsListed, restrictionsListed] = await Promise.all([
      this.listBuckets(),
      this.pendingReportCount(),
      this.ctx.storage.list({ prefix: 'error:' }),
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'appeal:' }),
      this.ctx.storage.list({ prefix: 'restriction:' })
    ]);
    const reports = [...reportsListed.values()];
    const appeals = [...appealsListed.values()];
    const openReports = reports.filter((report) => ['pending', 'reviewing'].includes(report?.status));
    const urgentReports = openReports.filter((report) => (
      ['hate', 'cheating'].includes(report?.category)
      || moderationReportGroup(reports, report).coordinatedSignal
    ));
    const oldestPendingAt = openReports.length
      ? Math.min(...openReports.map((report) => Number(report?.createdAt || Date.now())))
      : 0;
    const pendingAppeals = appeals.filter((appeal) => ['pending', 'reviewing'].includes(appeal?.status));
    return responseJson({
      ...summarizeOpsHealth({
        buckets,
        pendingReports,
        now: Date.now(),
        releasePatch: OPS1_SERVER_PATCH
      }),
      buckets: buckets
        .sort((left, right) => Number(right.startedAt) - Number(left.startedAt))
        .slice(0, 48),
      recentErrors: [...errors.values()]
        .sort((left, right) => Number(right.receivedAt) - Number(left.receivedAt))
        .slice(0, OPS1_MAX_RECENT_ERRORS),
      reportCounts: reports.reduce((output, report) => {
        const status = cleanOpsString(report?.status, 'pending', 24);
        output[status] = (output[status] || 0) + 1;
        return output;
      }, {}),
      appealCounts: appeals.reduce((output, appeal) => {
        const status = cleanOpsString(appeal?.status, 'pending', 24);
        output[status] = (output[status] || 0) + 1;
        return output;
      }, {}),
      restrictionCount: [...restrictionsListed.values()].filter((restriction) => (
        Number(restriction?.expiresAt || 0) === 0
        || Number(restriction?.expiresAt) > Date.now()
      )).length,
      moderationAlerts: {
        pendingReports: openReports.length,
        urgentReports: urgentReports.length,
        pendingAppeals: pendingAppeals.length,
        oldestPendingAt,
        attentionRequired: openReports.length > 0 || pendingAppeals.length > 0
      }
    });
  }

  async adminReports(url) {
    const statusFilter = cleanOpsString(url.searchParams.get('status'), '', 24);
    const categoryFilter = cleanOpsString(url.searchParams.get('category'), '', 40);
    const listed = await this.ctx.storage.list({ prefix: 'report:' });
    const allReports = [...listed.values()];
    const reports = allReports
      .filter((report) => !statusFilter || report.status === statusFilter)
      .filter((report) => !categoryFilter || report.category === categoryFilter)
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 200)
      .map((report) => ({
        ...report,
        group: moderationReportGroup(allReports, report),
        reporterHistory: moderationReporterHistory(allReports, report.reporterHash)
      }));
    return responseJson({
      ok: true,
      patch: OPS1_SERVER_PATCH,
      reports
    });
  }

  async adminReportAction(request) {
    const payload = await requestJson(request);
    const reportId = cleanOpsString(payload.reportId, '', 120);
    if (!reportId) throw new Error('OPS_REPORT_ID_INVALID');
    const current = await this.ctx.storage.get(reportKey(reportId));
    if (!current) throw new Error('OPS_REPORT_NOT_FOUND');

    const actorHash = await shortHash(
      `admin:${normalizeAdminToken(request)}`
    );
    const result = applyModerationAction(current, {
      auditId: `audit-${crypto.randomUUID()}`,
      status: payload.status,
      action: payload.action,
      note: payload.note
    }, {
      now: Date.now(),
      actorHash
    });

    const restriction = moderationRestrictionForAction({
      action: result.report.action,
      note: payload.note
    }, {
      now: result.audit.createdAt,
      reportId,
      targetHash: result.report.targetHash
    });
    const restrictionStorageKey = restrictionKey(result.report.targetHash);
    const writes = [
      this.ctx.storage.put(reportKey(reportId), result.report),
      this.ctx.storage.put(
        auditKey(result.audit.createdAt, result.audit.auditId),
        result.audit
      )
    ];
    if (restriction) {
      writes.push(this.ctx.storage.put(restrictionStorageKey, restriction));
    } else if (result.report.action === 'dismissed') {
      const currentRestriction = await this.ctx.storage.get(
        restrictionStorageKey
      );
      if (currentRestriction?.reportId === reportId) {
        writes.push(this.ctx.storage.delete(restrictionStorageKey));
      }
    }
    await Promise.all(writes);
    return responseJson({
      ok: true,
      report: result.report,
      restriction
    });
  }

  async adminAppeals(url) {
    const statusFilter = cleanOpsString(url.searchParams.get('status'), '', 24);
    const listed = await this.ctx.storage.list({ prefix: 'appeal:' });
    const appeals = [...listed.values()]
      .filter((appeal) => !statusFilter || appeal.status === statusFilter)
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 200);
    return responseJson({
      ok: true,
      patch: OPS1_SERVER_PATCH,
      appeals
    });
  }

  async adminAppealAction(request) {
    const payload = await requestJson(request);
    const appealId = cleanOpsString(payload.appealId, '', 120);
    if (!appealId) throw new Error('OPS_APPEAL_ID_INVALID');
    const current = await this.ctx.storage.get(appealKey(appealId));
    if (!current) throw new Error('OPS_APPEAL_NOT_FOUND');

    const actorHash = await shortHash(`admin:${normalizeAdminToken(request)}`);
    const result = applyModerationAppealAction(current, {
      auditId: `audit-${crypto.randomUUID()}`,
      status: payload.status,
      action: payload.action,
      note: payload.note
    }, {
      now: Date.now(),
      actorHash
    });
    const restrictionStorageKey = restrictionKey(result.appeal.targetHash);
    const currentRestriction = await this.ctx.storage.get(restrictionStorageKey);
    const writes = [
      this.ctx.storage.put(appealKey(appealId), result.appeal),
      this.ctx.storage.put(
        auditKey(result.audit.createdAt, result.audit.auditId),
        result.audit
      )
    ];
    let restriction = currentRestriction || null;
    if (result.appeal.action === 'lift') {
      writes.push(this.ctx.storage.delete(restrictionStorageKey));
      restriction = null;
    } else if (result.appeal.action === 'reduce' && currentRestriction) {
      restriction = {
        ...currentRestriction,
        action: 'temporary-restriction',
        reason: redactOpsServerText(payload.note || currentRestriction.reason, 160),
        appealId,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };
      writes.push(this.ctx.storage.put(restrictionStorageKey, restriction));
    }
    await Promise.all(writes);
    return responseJson({
      ok: true,
      appeal: result.appeal,
      restriction
    });
  }

  async adminRestrictions() {
    const listed = await this.ctx.storage.list({ prefix: 'restriction:' });
    const now = Date.now();
    const restrictions = [...listed.values()]
      .filter((restriction) => (
        Number(restriction?.expiresAt || 0) === 0
        || Number(restriction?.expiresAt) > now
      ))
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 200);
    return responseJson({
      ok: true,
      patch: OPS1_SERVER_PATCH,
      restrictions
    });
  }

  async adminAudit(url) {
    const limit = Math.max(
      1,
      Math.min(200, Math.floor(Number(url.searchParams.get('limit')) || 100))
    );
    const listed = await this.ctx.storage.list({ prefix: 'audit:' });
    const audit = [...listed.values()]
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, limit);
    return responseJson({
      ok: true,
      patch: OPS1_SERVER_PATCH,
      audit
    });
  }

  async trimRecentErrors() {
    const listed = await this.ctx.storage.list({ prefix: 'error:' });
    const entries = [...listed.entries()].sort(
      (left, right) => Number(right[1]?.receivedAt) - Number(left[1]?.receivedAt)
    );
    const removals = entries
      .slice(OPS1_MAX_RECENT_ERRORS)
      .map(([key]) => key);
    if (removals.length) await this.ctx.storage.delete(removals);
  }

  async cleanup() {
    const now = Date.now();
    const [
      buckets,
      errors,
      dedupe,
      reports,
      appeals,
      audit,
      rates,
      restrictions
    ] = await Promise.all([
      this.ctx.storage.list({ prefix: 'bucket:' }),
      this.ctx.storage.list({ prefix: 'error:' }),
      this.ctx.storage.list({ prefix: 'dedupe:' }),
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'appeal:' }),
      this.ctx.storage.list({ prefix: 'audit:' }),
      this.ctx.storage.list({ prefix: 'rate:' }),
      this.ctx.storage.list({ prefix: 'restriction:' })
    ]);

    const removals = [];
    for (const [key, value] of buckets) {
      if (Number(value?.startedAt || 0) < now - OPS1_EVENT_RETENTION_MS) {
        removals.push(key);
      }
    }
    for (const [key, value] of errors) {
      if (Number(value?.receivedAt || 0) < now - OPS1_EVENT_RETENTION_MS) {
        removals.push(key);
      }
    }
    for (const [key, value] of dedupe) {
      if (Number(value?.receivedAt || 0) < now - OPS1_EVENT_RETENTION_MS) {
        removals.push(key);
      }
    }
    for (const [key, value] of reports) {
      if (Number(value?.expiresAt || 0) < now) removals.push(key);
    }
    for (const [key, value] of appeals) {
      if (Number(value?.expiresAt || 0) < now) removals.push(key);
    }
    for (const [key, value] of audit) {
      if (Number(value?.expiresAt || 0) < now) removals.push(key);
    }
    for (const [key, value] of rates) {
      const state = normalizeOpsRateState(value, now);
      if (
        state.blockedUntil < now
        && state.startedAt < now - 24 * 60 * 60 * 1000
      ) {
        removals.push(key);
      }
    }
    for (const [key, value] of restrictions) {
      if (
        Number(value?.expiresAt || 0) > 0
        && Number(value.expiresAt) < now
      ) {
        removals.push(key);
      }
    }
    if (removals.length) await this.ctx.storage.delete(removals);
  }
}
