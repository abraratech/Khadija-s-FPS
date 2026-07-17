// POST-FINAL.6 — moderation admin passkey and role helpers.

export const POST_FINAL6_FRONTEND_PATCH = 'post-final6-r1-production-operations-hardening';
export const ADMIN_SESSION_STORAGE_KEY = 'ka_ops_admin_passkey_session_v1';

const ROLE_RANK = Object.freeze({
  viewer: 1,
  moderator: 2,
  'senior-moderator': 3,
  owner: 4
});

export function adminRoleRank(role) {
  return ROLE_RANK[String(role || '').toLowerCase()] || 0;
}

export function adminCan(role, capability) {
  const minimum = {
    read: 1,
    review: 2,
    assign: 2,
    note: 2,
    warning: 2,
    restrict: 2,
    suspend: 3,
    appeal: 3,
    restriction: 3,
    ban: 4,
    staff: 4
  }[capability] || 99;
  return adminRoleRank(role) >= minimum;
}

export function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array();
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = text + '='.repeat((4 - text.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function credentialDescriptor(value = {}) {
  return {
    ...value,
    id: base64UrlToBytes(value.id)
  };
}

export function prepareRegistrationOptions(value = {}) {
  return {
    ...value,
    challenge: base64UrlToBytes(value.challenge),
    user: {
      ...(value.user || {}),
      id: base64UrlToBytes(value.user?.id)
    },
    excludeCredentials: Array.isArray(value.excludeCredentials)
      ? value.excludeCredentials.map(credentialDescriptor)
      : []
  };
}

export function prepareAuthenticationOptions(value = {}) {
  return {
    ...value,
    challenge: base64UrlToBytes(value.challenge),
    allowCredentials: Array.isArray(value.allowCredentials)
      ? value.allowCredentials.map(credentialDescriptor)
      : []
  };
}

export function serializePublicKeyCredential(credential) {
  if (!credential || credential.type !== 'public-key') {
    throw new Error('PASSKEY_CREDENTIAL_INVALID');
  }
  const response = credential.response || {};
  const value = {
    id: String(credential.id || ''),
    rawId: bytesToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || null,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: bytesToBase64Url(response.clientDataJSON)
    }
  };
  if (response.attestationObject) {
    value.response.attestationObject = bytesToBase64Url(response.attestationObject);
    value.response.transports = response.getTransports?.() || [];
  }
  if (response.authenticatorData) {
    value.response.authenticatorData = bytesToBase64Url(response.authenticatorData);
  }
  if (response.signature) {
    value.response.signature = bytesToBase64Url(response.signature);
  }
  if (response.userHandle) {
    value.response.userHandle = bytesToBase64Url(response.userHandle);
  }
  return value;
}

export function confirmationRequired(type, action) {
  return String(action || '') === 'ban' || String(type || '') === 'appeal';
}

export function cleanSearch(value) {
  return String(value || '')
    .trim()
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .slice(0, 120);
}
