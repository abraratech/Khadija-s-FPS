import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const hub = readFileSync(new URL('./matchmaking_hub.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  index.includes("url.pathname.startsWith('/matchmaking/')"),
  'Worker must proxy matchmaking endpoints'
);
assert(
  index.includes("env.MATCHMAKING.idFromName('public-v1')"),
  'Worker must use one deterministic matchmaking hub'
);
assert(
  index.includes("url.pathname === '/matchmaking-reserve'"),
  'ArenaRoom must support internal room reservation'
);
assert(
  index.includes("privacy: 'public'"),
  'reserved matchmaking rooms must be public'
);
assert(
  index.includes('matchmaking: {')
    && index.includes("patch: MATCHMAKING_PATCH"),
  'health/release manifests must advertise matchmaking capability'
);
assert(
  hub.includes("PLAYER_ALREADY_QUEUED"),
  'server must reject duplicate queue attempts'
);
assert(
  hub.includes("peer-cancelled"),
  'matched peer must be requeued when the other player cancels'
);
assert(
  hub.includes("setAlarm(now + 15_000)"),
  'stale queue cleanup must be alarm-backed'
);
assert(
  config.includes('"name": "MATCHMAKING"')
    && config.includes('"class_name": "MatchmakingHub"'),
  'Wrangler config must bind MatchmakingHub'
);
assert(
  pkg.scripts.check.includes('matchmaking_core.test.js')
    && pkg.scripts.check.includes('matchmaking_contract.test.js'),
  'Worker check script must include MATCH.1 tests'
);

console.log('MATCH.1 Worker contract tests passed');
