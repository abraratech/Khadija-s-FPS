const CLOUD_ACCOUNT_PATTERN = /^cloud-[a-f0-9]{32}$/i;
const DEVICE_ID_PATTERN = /^device-[a-z0-9-]{8,96}$/i;
const MAX_TOKEN_LENGTH = 2048;

export const INTERNAL_SOCIAL_PROFILE_AUTH_HEADER = 'x-ka-internal-social-profile-auth';
export const INTERNAL_SOCIAL_PROFILE_AUTH_PATH = '/internal/profiles/social-auth-session';

function cleanText(value, limit = 256) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit);
}

function cleanAccountId(value) {
  const accountId = cleanText(value, 64);
  return CLOUD_ACCOUNT_PATTERN.test(accountId) ? accountId.toLowerCase() : '';
}

function cleanDeviceId(value) {
  const deviceId = cleanText(value, 128);
  return DEVICE_ID_PATTERN.test(deviceId) ? deviceId.toLowerCase() : '';
}

function readBearerToken(value) {
  const authHeader = String(value || '');
  if (!authHeader.startsWith('Bearer ')) return '';
  const token = authHeader.slice(7).trim();
  return token.length >= 32 && token.length <= MAX_TOKEN_LENGTH ? token : '';
}

export function buildSocialCredentialEnvelope(headers, {
  region = 'ZZ',
  origin = '',
  rpId = ''
} = {}) {
  const accountId = cleanAccountId(headers?.get?.('x-ka-account-id'));
  const token = readBearerToken(headers?.get?.('authorization'));
  if (!accountId || !token) {
    return { ok: false, error: 'PROFILE_AUTH_REQUIRED' };
  }
  return {
    ok: true,
    value: {
      accountId,
      token,
      deviceId: cleanDeviceId(headers?.get?.('x-ka-device-id')),
      clientTime: cleanText(headers?.get?.('x-ka-client-time'), 32),
      origin: cleanText(origin || headers?.get?.('origin'), 256),
      rpId: cleanText(rpId || headers?.get?.('x-ka-rp-id'), 160).toLowerCase(),
      region: cleanText(region || headers?.get?.('x-ka-region'), 8).toUpperCase() || 'ZZ'
    }
  };
}

export function normalizeSocialCredentialEnvelope(value) {
  const accountId = cleanAccountId(value?.accountId);
  const token = cleanText(value?.token, MAX_TOKEN_LENGTH);
  if (!accountId || token.length < 32 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, error: 'PROFILE_AUTH_REQUIRED' };
  }
  return {
    ok: true,
    value: {
      accountId,
      token,
      deviceId: cleanDeviceId(value?.deviceId),
      clientTime: cleanText(value?.clientTime, 32),
      origin: cleanText(value?.origin, 256),
      rpId: cleanText(value?.rpId, 160).toLowerCase(),
      region: cleanText(value?.region, 8).toUpperCase() || 'ZZ'
    }
  };
}
