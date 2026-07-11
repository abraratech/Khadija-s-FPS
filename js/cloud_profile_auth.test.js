import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return Array.from(this.map.keys())[index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

globalThis.sessionStorage = new MemoryStorage();
globalThis.localStorage = new MemoryStorage({
  ka_progression_v1: JSON.stringify({ version: 1, xp: 125, bestScore: 500 }),
  ka_challenges_v1: JSON.stringify({ version: 1, unlocked: {}, totalUnlocked: 0 }),
  fps_hi_score: '500',
  fps_hi_wave: '4'
});
Object.defineProperty(globalThis, 'PublicKeyCredential', { value: class PublicKeyCredential {}, configurable: true });

const credentialId = new Uint8Array([1, 2, 3, 4]).buffer;
let creationAlgorithms = [];
const clientData = new TextEncoder().encode('{"type":"webauthn.create"}').buffer;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'Node Test Browser',
    credentials: {
    async create(options = {}) {
      creationAlgorithms = Array.isArray(options?.publicKey?.pubKeyCredParams)
        ? options.publicKey.pubKeyCredParams.map((entry) => Number(entry.alg))
        : [];
      return {
        id: 'AQIDBA',
        rawId: credentialId,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        getClientExtensionResults: () => ({}),
        response: {
          clientDataJSON: clientData,
          attestationObject: new Uint8Array([5, 6, 7]).buffer,
          getTransports: () => ['internal']
        }
      };
    },
    async get() {
      return {
        id: 'AQIDBA',
        rawId: credentialId,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        getClientExtensionResults: () => ({}),
        response: {
          clientDataJSON: new TextEncoder().encode('{"type":"webauthn.get"}').buffer,
          authenticatorData: new Uint8Array([8, 9]).buffer,
          signature: new Uint8Array([10, 11]).buffer,
          userHandle: new TextEncoder().encode('cloud-0123456789abcdef0123456789abcdef').buffer
        }
      };
    }
    }
  }
});

const core = await import('./cloud_profile_core.js');
const accountId = 'cloud-0123456789abcdef0123456789abcdef';
let token = 'kat_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
let storedProfile = null;
let passkeys = [];
let accountType = 'guest';

function account() {
  return {
    accountId,
    cloudRevision: 1,
    accountType,
    accountLabel: 'Primary Player',
    passkeys: passkeys.length,
    authVersion: accountType === 'passkey' ? 1 : 0,
    lastAuthenticatedAt: accountType === 'passkey' ? 2000 : 0,
    profileChecksum: storedProfile ? core.profileChecksum(storedProfile) : ''
  };
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
function profileResponse(extra = {}) {
  return {
    ok: true,
    ...extra,
    account: account(),
    profile: storedProfile,
    profileChecksum: storedProfile ? core.profileChecksum(storedProfile) : '',
    checksumVerified: true,
    reliability: { serverTime: Date.now(), checksumVerified: true, uploadComplete: true }
  };
}

globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  const body = options.body ? JSON.parse(options.body) : {};
  if (path === '/profiles/register') {
    storedProfile = body.profile;
    return json(profileResponse({ token, devices: [] }), 201);
  }
  if (path === '/profiles/sync') return json(profileResponse({ conflict: false, changed: false }));
  if (path === '/profiles/auth/passkey/register/options') {
    return json({
      ok: true,
      options: {
        challenge: 'AQIDBA',
        rp: { id: 'example.com', name: 'Khadija’s Arena' },
        user: { id: 'Y2xvdWQtdGVzdA', name: accountId, displayName: 'Primary Player' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        excludeCredentials: []
      }
    });
  }
  if (path === '/profiles/auth/passkey/register/verify') {
    accountType = 'passkey';
    passkeys = [{ credentialId: body.credential.id, name: body.name, transports: ['internal'], createdAt: 1000, lastUsedAt: 0 }];
    return json({ ok: true, upgraded: true, account: account(), passkeys });
  }
  if (path === '/profiles/auth/signout') return json({ ok: true, account: account() });
  if (path === '/profiles/auth/passkey/login/options') {
    return json({
      ok: true,
      account: account(),
      options: {
        challenge: 'BQYHCA',
        rpId: 'example.com',
        allowCredentials: [{ type: 'public-key', id: 'AQIDBA', transports: ['internal'] }]
      }
    });
  }
  if (path === '/profiles/auth/passkey/login/verify') {
    token = 'kat_signed_in_0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    passkeys = [{ credentialId: body.credential.id, name: 'Primary Player', transports: ['internal'], createdAt: 1000, lastUsedAt: 2000 }];
    return json(profileResponse({ token, passkeys, devices: [] }));
  }
  if (path === '/profiles/auth/session') return json(profileResponse({ passkeys, devices: [] }));
  if (path === '/profiles/auth/passkeys') return json({ ok: true, account: account(), passkeys });
  return json({ ok: false, error: `UNEXPECTED_ROUTE:${path}` }, 404);
};

const runtime = await import('./cloud_profile.js');
assert.equal((await runtime.registerCloudGuestAccount()).accepted, true);
const upgraded = await runtime.upgradeCloudAccountToPasskey('Primary Player');
assert.equal(upgraded.accepted, true);
assert.equal(upgraded.upgraded, true);
assert.deepEqual(creationAlgorithms, [-7, -257]);
assert.equal(
  runtime.getCloudProfileErrorMessage({ code: 'PASSKEY_ACCOUNT_NOT_ENABLED' }, 'login'),
  'NO PASSKEY IS REGISTERED FOR THIS ACCOUNT'
);
assert.equal(runtime.getCloudProfileDiagnostics().remote.auth.accountType, 'passkey');
assert.equal(runtime.getCloudProfileDiagnostics().remote.auth.passkeys.length, 1);

assert.equal((await runtime.signOutCloudAccount()).accepted, true);
assert.equal(localStorage.getItem('ka_cloud_profile_token_v1'), null);

const signedIn = await runtime.signInCloudAccountWithPasskey(accountId, { reload: false });
assert.equal(signedIn.accepted, true);
assert.equal(localStorage.getItem('ka_cloud_profile_account_v1'), accountId);
assert.equal(runtime.getCloudProfileDiagnostics().authentication, 'passkey-session');
assert.equal((await runtime.refreshCloudAuthenticatedSession()).accepted, true);

console.log('Cloud profile passkey frontend runtime tests: PASS');
