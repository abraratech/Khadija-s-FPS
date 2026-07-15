import { readFileSync } from 'node:fs';

const lobby = readFileSync(new URL('./lobby.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./lobby_ui.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('./matchmaking.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../css/multiplayer.css', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  lobby.includes("quickMatch: (options) => this.startQuickMatch(options)")
    && lobby.includes("cancelQuickMatch: () => this.cancelQuickMatch()"),
  'lobby must expose Quick Match actions'
);
assert(
  lobby.includes('new PublicMatchmakingClient')
    && lobby.includes('this.handleQuickMatchFound(assignment)'),
  'lobby must initialize matchmaking client and consume assignments'
);
assert(
  lobby.includes('this.matchmaking.acknowledgeConnected()'),
  'lobby must acknowledge a successful matched-room welcome'
);
assert(
  ui.includes('id="ka-coop-quick-match"')
    && ui.includes('id="ka-matchmaking-status"')
    && ui.includes('id="ka-matchmaking-cancel"'),
  'lobby UI must include Quick Match, status, and cancellation controls'
);
assert(
  ui.includes('matchmakingStatusPresentation'),
  'lobby UI must use deterministic queue presentation'
);
assert(
  client.includes('DUPLICATE_TAB_QUEUE')
    && client.includes('PLAYER_ALREADY_QUEUED'),
  'duplicate queue protection must exist in browser and server paths'
);
assert(
  client.includes('PUBLIC_MATCHMAKING_QUEUE_TIMEOUT_MS')
    && client.includes("'/matchmaking/cancel'"),
  'queue expiry and cancellation must be wired'
);
assert(
  css.includes('.ka-matchmaking-panel')
    && css.includes('.ka-matchmaking-status'),
  'MATCH.1 UI styles must be present'
);

console.log('MATCH.1 frontend contract tests passed');
