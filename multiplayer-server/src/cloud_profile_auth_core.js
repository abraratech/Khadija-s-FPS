// M4.55-M4.58 — passkey authentication helpers for cloud account upgrade and sign-in.

export const CLOUD_AUTH_PATCH = 'm4-final-player-polish-r1';
export const CLOUD_AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const CLOUD_PASSKEY_LIMIT = 8;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array();
}

export function base64UrlEncode(value) {
  const bytes = asBytes(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = text + '='.repeat((4 - text.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function cleanPasskeyLabel(value, fallback = 'Khadija’s Arena Passkey') {
  return String(value || fallback)
    .trim()
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 48) || fallback;
}

export function normalizePasskeys(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      credentialId: String(entry.credentialId || '').slice(0, 1024),
      publicKeySpki: String(entry.publicKeySpki || '').slice(0, 2048),
      algorithm: Number(entry.algorithm) || -7,
      signCount: Math.max(0, Math.floor(Number(entry.signCount) || 0)),
      name: cleanPasskeyLabel(entry.name),
      transports: Array.isArray(entry.transports)
        ? [...new Set(entry.transports.map((item) => String(item || '').slice(0, 24)).filter(Boolean))].slice(0, 8)
        : [],
      createdAt: Math.max(0, Number(entry.createdAt) || 0),
      lastUsedAt: Math.max(0, Number(entry.lastUsedAt) || 0),
      backupEligible: entry.backupEligible === true,
      backupState: entry.backupState === true
    }))
    .filter((entry) => entry.credentialId && entry.publicKeySpki && !seen.has(entry.credentialId) && seen.add(entry.credentialId))
    .slice(-CLOUD_PASSKEY_LIMIT);
}

export function publicPasskeys(value) {
  return normalizePasskeys(value).map((entry) => ({
    credentialId: entry.credentialId,
    name: entry.name,
    transports: [...entry.transports],
    createdAt: entry.createdAt,
    lastUsedAt: entry.lastUsedAt,
    backupEligible: entry.backupEligible,
    backupState: entry.backupState
  }));
}

export function createRandomChallenge(length = 32) {
  const bytes = new Uint8Array(Math.max(24, Math.min(64, Number(length) || 32)));
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function createPasskeyRegistrationOptions({
  accountId,
  accountLabel = 'Khadija’s Arena Player',
  challenge,
  rpId,
  rpName = 'Khadija’s Arena',
  passkeys = []
} = {}) {
  const userId = base64UrlEncode(encoder.encode(String(accountId || '')));
  return {
    challenge: String(challenge || ''),
    rp: { id: String(rpId || ''), name: String(rpName || 'Khadija’s Arena') },
    user: {
      id: userId,
      name: String(accountId || ''),
      displayName: cleanPasskeyLabel(accountLabel, 'Khadija’s Arena Player')
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 }
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      requireResidentKey: false,
      userVerification: 'preferred'
    },
    excludeCredentials: publicPasskeys(passkeys).map((entry) => ({
      type: 'public-key',
      id: entry.credentialId,
      transports: entry.transports
    }))
  };
}

export function createPasskeyAuthenticationOptions({ challenge, rpId, passkeys = [] } = {}) {
  return {
    challenge: String(challenge || ''),
    rpId: String(rpId || ''),
    timeout: 60000,
    userVerification: 'preferred',
    allowCredentials: publicPasskeys(passkeys).map((entry) => ({
      type: 'public-key',
      id: entry.credentialId,
      transports: entry.transports
    }))
  };
}

function readLength(bytes, offset, additional) {
  if (additional < 24) return { value: additional, offset };
  if (additional === 24) return { value: bytes[offset], offset: offset + 1 };
  if (additional === 25) return { value: (bytes[offset] << 8) | bytes[offset + 1], offset: offset + 2 };
  if (additional === 26) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
    return { value: view.getUint32(0), offset: offset + 4 };
  }
  throw new Error('CBOR_LENGTH_UNSUPPORTED');
}

export function decodeCbor(value, startOffset = 0) {
  const bytes = asBytes(value);
  let offset = startOffset;
  if (offset >= bytes.length) throw new Error('CBOR_TRUNCATED');
  const first = bytes[offset++];
  const major = first >> 5;
  const additional = first & 31;
  if (additional === 31) throw new Error('CBOR_INDEFINITE_UNSUPPORTED');
  const length = readLength(bytes, offset, additional);
  offset = length.offset;
  if (major === 0) return { value: length.value, offset };
  if (major === 1) return { value: -1 - length.value, offset };
  if (major === 2) {
    const end = offset + length.value;
    if (end > bytes.length) throw new Error('CBOR_TRUNCATED');
    return { value: bytes.slice(offset, end), offset: end };
  }
  if (major === 3) {
    const end = offset + length.value;
    if (end > bytes.length) throw new Error('CBOR_TRUNCATED');
    return { value: decoder.decode(bytes.slice(offset, end)), offset: end };
  }
  if (major === 4) {
    const array = [];
    for (let index = 0; index < length.value; index += 1) {
      const item = decodeCbor(bytes, offset);
      array.push(item.value);
      offset = item.offset;
    }
    return { value: array, offset };
  }
  if (major === 5) {
    const map = new Map();
    for (let index = 0; index < length.value; index += 1) {
      const key = decodeCbor(bytes, offset);
      offset = key.offset;
      const item = decodeCbor(bytes, offset);
      offset = item.offset;
      map.set(key.value, item.value);
    }
    return { value: map, offset };
  }
  if (major === 7) {
    if (additional === 20) return { value: false, offset };
    if (additional === 21) return { value: true, offset };
    if (additional === 22) return { value: null, offset };
  }
  throw new Error('CBOR_TYPE_UNSUPPORTED');
}

async function sha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', asBytes(value)));
}

function timingSafeEqual(left, right) {
  const a = asBytes(left);
  const b = asBytes(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function parseClientData(encoded) {
  const bytes = base64UrlDecode(encoded);
  let data;
  try {
    data = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error('PASSKEY_CLIENT_DATA_INVALID');
  }
  return { bytes, data };
}

export function readPasskeyChallenge(response) {
  const encoded = response?.response?.clientDataJSON;
  return String(parseClientData(encoded).data?.challenge || '');
}

function parseAuthenticatorData(value) {
  const bytes = asBytes(value);
  if (bytes.length < 37) throw new Error('PASSKEY_AUTH_DATA_INVALID');
  const flags = bytes[32];
  const signCount = new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0);
  return {
    bytes,
    rpIdHash: bytes.slice(0, 32),
    flags,
    userPresent: Boolean(flags & 0x01),
    userVerified: Boolean(flags & 0x04),
    backupEligible: Boolean(flags & 0x08),
    backupState: Boolean(flags & 0x10),
    attestedCredentialData: Boolean(flags & 0x40),
    signCount
  };
}

function parseAttestedCredentialData(authData) {
  if (!authData.attestedCredentialData || authData.bytes.length < 55) throw new Error('PASSKEY_ATTESTED_DATA_MISSING');
  let offset = 53;
  const credentialLength = (authData.bytes[offset] << 8) | authData.bytes[offset + 1];
  offset += 2;
  const end = offset + credentialLength;
  if (!credentialLength || end > authData.bytes.length) throw new Error('PASSKEY_CREDENTIAL_ID_INVALID');
  const credentialId = authData.bytes.slice(offset, end);
  const cose = decodeCbor(authData.bytes, end);
  if (!(cose.value instanceof Map)) throw new Error('PASSKEY_PUBLIC_KEY_INVALID');
  return { credentialId, coseKey: cose.value };
}

async function cosePublicKeyToSpki(coseKey) {
  const kty = Number(coseKey.get(1));
  const alg = Number(coseKey.get(3));

  if (kty === 2 && alg === -7) {
    const curve = Number(coseKey.get(-1));
    const x = asBytes(coseKey.get(-2));
    const y = asBytes(coseKey.get(-3));
    if (curve !== 1 || x.length !== 32 || y.length !== 32) {
      throw new Error('PASSKEY_ALGORITHM_UNSUPPORTED');
    }
    const raw = new Uint8Array(65);
    raw[0] = 4;
    raw.set(x, 1);
    raw.set(y, 33);
    const key = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key));
    return { publicKeySpki: base64UrlEncode(spki), algorithm: -7 };
  }

  if (kty === 3 && alg === -257) {
    const modulus = asBytes(coseKey.get(-1));
    const exponent = asBytes(coseKey.get(-2));
    if (modulus.length < 128 || exponent.length < 1) {
      throw new Error('PASSKEY_ALGORITHM_UNSUPPORTED');
    }
    const key = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'RSA',
        n: base64UrlEncode(modulus),
        e: base64UrlEncode(exponent),
        alg: 'RS256',
        ext: true,
        key_ops: ['verify']
      },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['verify']
    );
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key));
    return { publicKeySpki: base64UrlEncode(spki), algorithm: -257 };
  }

  throw new Error('PASSKEY_ALGORITHM_UNSUPPORTED');
}

function derIntegerToFixed(bytes, size = 32) {
  let value = asBytes(bytes);
  while (value.length > 1 && value[0] === 0) value = value.slice(1);
  if (value.length > size) throw new Error('PASSKEY_SIGNATURE_INVALID');
  const output = new Uint8Array(size);
  output.set(value, size - value.length);
  return output;
}

export function derEcdsaToRaw(value, size = 32) {
  const bytes = asBytes(value);
  if (bytes.length < 8 || bytes[0] !== 0x30) throw new Error('PASSKEY_SIGNATURE_INVALID');
  let offset = 1;
  let sequenceLength = bytes[offset++];
  if (sequenceLength & 0x80) {
    const count = sequenceLength & 0x7f;
    sequenceLength = 0;
    for (let index = 0; index < count; index += 1) sequenceLength = (sequenceLength << 8) | bytes[offset++];
  }
  if (offset + sequenceLength > bytes.length || bytes[offset++] !== 0x02) throw new Error('PASSKEY_SIGNATURE_INVALID');
  const rLength = bytes[offset++];
  const r = bytes.slice(offset, offset + rLength);
  offset += rLength;
  if (bytes[offset++] !== 0x02) throw new Error('PASSKEY_SIGNATURE_INVALID');
  const sLength = bytes[offset++];
  const s = bytes.slice(offset, offset + sLength);
  const output = new Uint8Array(size * 2);
  output.set(derIntegerToFixed(r, size), 0);
  output.set(derIntegerToFixed(s, size), size);
  return output;
}

async function validateClientAndRp({ response, expectedType, challenge, origin, rpId }) {
  const client = parseClientData(response?.response?.clientDataJSON);
  if (client.data?.type !== expectedType) throw new Error('PASSKEY_TYPE_MISMATCH');
  if (String(client.data?.challenge || '') !== String(challenge || '')) throw new Error('PASSKEY_CHALLENGE_MISMATCH');
  if (String(client.data?.origin || '') !== String(origin || '')) throw new Error('PASSKEY_ORIGIN_MISMATCH');
  if (client.data?.crossOrigin === true) throw new Error('PASSKEY_CROSS_ORIGIN_REJECTED');
  const authData = parseAuthenticatorData(base64UrlDecode(response?.response?.authenticatorData || ''));
  const expectedRpHash = await sha256Bytes(encoder.encode(String(rpId || '')));
  if (!timingSafeEqual(authData.rpIdHash, expectedRpHash)) throw new Error('PASSKEY_RP_ID_MISMATCH');
  if (!authData.userPresent) throw new Error('PASSKEY_USER_PRESENCE_REQUIRED');
  return { client, authData };
}

export async function verifyPasskeyRegistration({
  response,
  challenge,
  origin,
  rpId,
  name = 'Khadija’s Arena Passkey',
  now = Date.now()
} = {}) {
  const client = parseClientData(response?.response?.clientDataJSON);
  if (client.data?.type !== 'webauthn.create') throw new Error('PASSKEY_TYPE_MISMATCH');
  if (String(client.data?.challenge || '') !== String(challenge || '')) throw new Error('PASSKEY_CHALLENGE_MISMATCH');
  if (String(client.data?.origin || '') !== String(origin || '')) throw new Error('PASSKEY_ORIGIN_MISMATCH');
  if (client.data?.crossOrigin === true) throw new Error('PASSKEY_CROSS_ORIGIN_REJECTED');

  const attestation = decodeCbor(base64UrlDecode(response?.response?.attestationObject || '')).value;
  if (!(attestation instanceof Map)) throw new Error('PASSKEY_ATTESTATION_INVALID');
  const fmt = String(attestation.get('fmt') || '');
  if (fmt !== 'none') throw new Error('PASSKEY_ATTESTATION_FORMAT_UNSUPPORTED');
  const authData = parseAuthenticatorData(asBytes(attestation.get('authData')));
  const expectedRpHash = await sha256Bytes(encoder.encode(String(rpId || '')));
  if (!timingSafeEqual(authData.rpIdHash, expectedRpHash)) throw new Error('PASSKEY_RP_ID_MISMATCH');
  if (!authData.userPresent) throw new Error('PASSKEY_USER_PRESENCE_REQUIRED');
  const attested = parseAttestedCredentialData(authData);
  const credentialId = base64UrlEncode(attested.credentialId);
  if (response?.rawId && String(response.rawId) !== credentialId) throw new Error('PASSKEY_CREDENTIAL_ID_MISMATCH');
  const key = await cosePublicKeyToSpki(attested.coseKey);
  return {
    credentialId,
    ...key,
    signCount: authData.signCount,
    name: cleanPasskeyLabel(name),
    transports: Array.isArray(response?.response?.transports) ? response.response.transports : [],
    createdAt: Math.max(1, Number(now) || Date.now()),
    lastUsedAt: 0,
    backupEligible: authData.backupEligible,
    backupState: authData.backupState,
    userVerified: authData.userVerified
  };
}

export async function verifyPasskeyAuthentication({
  response,
  credential,
  challenge,
  origin,
  rpId,
  accountId = '',
  now = Date.now()
} = {}) {
  const current = normalizePasskeys([credential])[0];
  if (!current || String(response?.id || response?.rawId || '') !== current.credentialId) {
    throw new Error('PASSKEY_CREDENTIAL_NOT_FOUND');
  }
  const { client, authData } = await validateClientAndRp({
    response,
    expectedType: 'webauthn.get',
    challenge,
    origin,
    rpId
  });
  const userHandle = String(response?.response?.userHandle || '');
  if (userHandle && accountId) {
    const decoded = decoder.decode(base64UrlDecode(userHandle));
    if (decoded !== String(accountId)) throw new Error('PASSKEY_USER_HANDLE_MISMATCH');
  }
  if (current.signCount > 0 && authData.signCount > 0 && authData.signCount <= current.signCount) {
    throw new Error('PASSKEY_COUNTER_REPLAY');
  }
  const clientHash = await sha256Bytes(client.bytes);
  const signed = new Uint8Array(authData.bytes.length + clientHash.length);
  signed.set(authData.bytes, 0);
  signed.set(clientHash, authData.bytes.length);
  const encodedSignature = base64UrlDecode(response?.response?.signature || '');
  let key;
  let signature;
  let verificationAlgorithm;
  if (current.algorithm === -257) {
    key = await crypto.subtle.importKey(
      'spki',
      base64UrlDecode(current.publicKeySpki),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    signature = encodedSignature;
    verificationAlgorithm = { name: 'RSASSA-PKCS1-v1_5' };
  } else if (current.algorithm === -7) {
    key = await crypto.subtle.importKey(
      'spki',
      base64UrlDecode(current.publicKeySpki),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    signature = derEcdsaToRaw(encodedSignature);
    verificationAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
  } else {
    throw new Error('PASSKEY_ALGORITHM_UNSUPPORTED');
  }
  const verified = await crypto.subtle.verify(verificationAlgorithm, key, signature, signed);
  if (!verified) throw new Error('PASSKEY_SIGNATURE_REJECTED');
  return {
    ...current,
    signCount: authData.signCount,
    lastUsedAt: Math.max(1, Number(now) || Date.now()),
    backupEligible: authData.backupEligible,
    backupState: authData.backupState,
    userVerified: authData.userVerified
  };
}
