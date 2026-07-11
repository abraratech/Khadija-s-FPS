// js/cloud_profile_session_core.js
export const CLOUD_SESSION_RECOVERY_PATCH = 'm4-expired-cloud-session-recovery-r1';
export const CLOUD_SESSION_EXPIRED_MESSAGE = 'CLOUD SESSION EXPIRED · LOCAL PROFILE KEPT';

export const PERMANENT_CLOUD_SESSION_CODES = Object.freeze([
  'PROFILE_TOKEN_REJECTED',
  'PROFILE_AUTH_REQUIRED',
  'CLOUD_SESSION_EXPIRED'
]);

const PERMANENT_CODES = new Set(PERMANENT_CLOUD_SESSION_CODES);

export function getCloudSessionErrorCode(error) {
  return String(
    error?.code
    || error?.payload?.error
    || error?.message
    || error
    || ''
  ).trim().toUpperCase();
}

export function isPermanentCloudSessionError(error) {
  const code = getCloudSessionErrorCode(error);
  if (PERMANENT_CODES.has(code)) return true;
  const status = Number(error?.status || error?.payload?.status || 0);
  return status === 401 && (code === 'HTTP_401' || code === 'UNAUTHORIZED');
}

export function createCloudSessionExpiryResult(error, { accountHint = '' } = {}) {
  const originalCode = getCloudSessionErrorCode(error) || 'CLOUD_SESSION_EXPIRED';
  return Object.freeze({
    accepted: false,
    expired: true,
    retryable: false,
    reason: originalCode,
    message: CLOUD_SESSION_EXPIRED_MESSAGE,
    accountHint: String(accountHint || '')
  });
}
