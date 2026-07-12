// multiplayer-server/src/voice_turn_core.test.js
import assert from 'node:assert/strict';
import {
  VOICE_TURN_PATCH,
  consumeVoiceIceRequestRate,
  generateVoiceIceConfig,
  hasTurnRelay,
  sanitizeGeneratedIceServers,
  stunOnlyVoiceIceConfig,
  voiceIceConfigFresh,
  voiceTurnSecretsConfigured
} from './voice_turn_core.js';

assert.equal(VOICE_TURN_PATCH, 'm5-coop-turn-fallback-r1');
assert.equal(voiceTurnSecretsConfigured({}), false);
assert.equal(stunOnlyVoiceIceConfig({ now: 10 }).turnRelayConfigured, false);
assert.equal(consumeVoiceIceRequestRate({}, 100).allowed, true);
assert.equal(consumeVoiceIceRequestRate({ voiceIceLastRequestAt: 100 }, 101).allowed, false);
const servers = sanitizeGeneratedIceServers([
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
  { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }
]);
assert.equal(hasTurnRelay(servers), true);
assert.equal(servers.some((entry) => entry.urls.some((url) => url.includes(':53'))), false);
let request = null;
const generated = await generateVoiceIceConfig(
  { TURN_KEY_ID: 'key-id', TURN_KEY_API_TOKEN: 'api-token' },
  {
    now: 1000,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ iceServers: servers }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
  }
);
assert.equal(generated.turnRelayConfigured, true);
assert.equal(voiceIceConfigFresh(generated, 1000), true);
assert.match(request.url, /key-id\/credentials\/generate-ice-servers/);
assert.equal(request.init.headers.authorization, 'Bearer api-token');
assert.equal(JSON.stringify(generated).includes('api-token'), false);
const fallback = await generateVoiceIceConfig({}, { now: 2000, fetchImpl: async () => { throw new Error('must not call'); } });
assert.equal(fallback.turnRelayConfigured, false);
console.log('voice_turn_core tests passed');
