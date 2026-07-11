import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');

const auth = await import('./cloud_profile_auth_core.js');
const encoder = new TextEncoder();

function bytes(...parts) {
  const arrays = parts.map((part) => part instanceof Uint8Array ? part : new Uint8Array(part));
  const output = new Uint8Array(arrays.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of arrays) { output.set(part, offset); offset += part.length; }
  return output;
}
function uint32(value) {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value);
  return output;
}
function cborLength(major, length) {
  if (length < 24) return Uint8Array.of((major << 5) | length);
  if (length < 256) return Uint8Array.of((major << 5) | 24, length);
  if (length < 65536) return Uint8Array.of((major << 5) | 25, length >> 8, length & 255);
  throw new Error('test cbor length too large');
}
function cbor(value) {
  if (typeof value === 'number') {
    if (value >= 0) return cborLength(0, value);
    return cborLength(1, -1 - value);
  }
  if (typeof value === 'string') {
    const encoded = encoder.encode(value);
    return bytes(cborLength(3, encoded.length), encoded);
  }
  if (value instanceof Uint8Array) return bytes(cborLength(2, value.length), value);
  if (value instanceof Map) {
    const entries = [...value.entries()];
    return bytes(cborLength(5, entries.length), ...entries.flatMap(([key, item]) => [cbor(key), cbor(item)]));
  }
  throw new Error('unsupported cbor test value');
}
function rawToDer(raw) {
  const half = raw.length / 2;
  const integer = (input) => {
    let value = input;
    while (value.length > 1 && value[0] === 0) value = value.slice(1);
    if (value[0] & 0x80) value = bytes(Uint8Array.of(0), value);
    return bytes(Uint8Array.of(0x02, value.length), value);
  };
  const r = integer(raw.slice(0, half));
  const s = integer(raw.slice(half));
  return bytes(Uint8Array.of(0x30, r.length + s.length), r, s);
}

assert.equal(auth.cleanPasskeyLabel('<My   Key>'), 'My Key');
assert.equal(auth.normalizePasskeys([{ credentialId: 'a', publicKeySpki: 'b', name: 'One' }, { credentialId: 'a', publicKeySpki: 'c' }]).length, 1);
const challenge = auth.createRandomChallenge();
assert.equal(auth.base64UrlEncode(auth.base64UrlDecode(challenge)), challenge);

const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);
const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
const x = rawPublic.slice(1, 33);
const y = rawPublic.slice(33, 65);
const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]);
const accountId = 'cloud-0123456789abcdef0123456789abcdef';
const rpId = 'example.com';
const origin = 'https://example.com';
const credentialIdBytes = crypto.getRandomValues(new Uint8Array(32));
const credentialId = auth.base64UrlEncode(credentialIdBytes);
const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(rpId)));
const registrationAuthData = bytes(
  rpHash,
  Uint8Array.of(0x41),
  uint32(0),
  new Uint8Array(16),
  Uint8Array.of(0, credentialIdBytes.length),
  credentialIdBytes,
  cbor(cose)
);
const attestationObject = cbor(new Map([
  ['fmt', 'none'],
  ['authData', registrationAuthData],
  ['attStmt', new Map()]
]));
const createClient = encoder.encode(JSON.stringify({
  type: 'webauthn.create',
  challenge,
  origin,
  crossOrigin: false
}));
const registration = await auth.verifyPasskeyRegistration({
  response: {
    rawId: credentialId,
    response: {
      clientDataJSON: auth.base64UrlEncode(createClient),
      attestationObject: auth.base64UrlEncode(attestationObject),
      transports: ['internal']
    }
  },
  challenge,
  origin,
  rpId,
  name: 'Primary Passkey',
  now: 1000
});
assert.equal(registration.credentialId, credentialId);
assert.equal(registration.algorithm, -7);
assert.equal(registration.name, 'Primary Passkey');

const loginChallenge = auth.createRandomChallenge();
const getClient = encoder.encode(JSON.stringify({
  type: 'webauthn.get',
  challenge: loginChallenge,
  origin,
  crossOrigin: false
}));
const assertionAuthData = bytes(rpHash, Uint8Array.of(0x05), uint32(1));
const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', getClient));
const signed = bytes(assertionAuthData, clientHash);
const rawSignature = new Uint8Array(await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  keyPair.privateKey,
  signed
));
const verified = await auth.verifyPasskeyAuthentication({
  response: {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: auth.base64UrlEncode(getClient),
      authenticatorData: auth.base64UrlEncode(assertionAuthData),
      signature: auth.base64UrlEncode(rawToDer(rawSignature)),
      userHandle: auth.base64UrlEncode(encoder.encode(accountId))
    }
  },
  credential: registration,
  challenge: loginChallenge,
  origin,
  rpId,
  accountId,
  now: 2000
});
assert.equal(verified.signCount, 1);
assert.equal(verified.lastUsedAt, 2000);
assert.equal(verified.userVerified, true);

await assert.rejects(
  auth.verifyPasskeyAuthentication({
    response: {
      id: credentialId,
      response: {
        clientDataJSON: auth.base64UrlEncode(getClient),
        authenticatorData: auth.base64UrlEncode(assertionAuthData),
        signature: auth.base64UrlEncode(rawToDer(rawSignature))
      }
    },
    credential: { ...registration, signCount: 2 },
    challenge: loginChallenge,
    origin,
    rpId,
    accountId
  }),
  /PASSKEY_COUNTER_REPLAY/
);

console.log('Cloud profile passkey authentication core tests: PASS');
