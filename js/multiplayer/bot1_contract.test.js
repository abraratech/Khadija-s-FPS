import { readFileSync } from 'node:fs';

function read(relative) {
  return readFileSync(new URL(`./${relative}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const matchmaking = read('matchmaking.js');
const core = read('matchmaking_core.js');
const lobby = read('lobby.js');
const ui = read('lobby_ui.js');
const foundation = read('foundation.js');
const room = read('room.js');
const runtime = read('runtime.js');
const remotePlayers = read('remote_players.js');
const bot = read('bot.js');
const enemy = read('../enemy.js');
const main = read('../main.js');
const summary = read('../run_summary.js');
const css = read('../../css/multiplayer.css');

assert(
  matchmaking.includes('Reflect.apply(providedFetch, globalThis, args)')
    && matchmaking.includes('globalThis.fetch(...args)'),
  'Quick Match must preserve the native fetch receiver'
);
assert(
  core.includes('PUBLIC_MATCHMAKING_BOT_FILL_DELAY_MS = 25_000')
    && matchmaking.includes('botAvailable'),
  'Quick Match must expose AI fill after a bounded wait'
);
assert(
  ui.includes('DEPLOY AI WINGMATE')
    && lobby.includes('deployBotFill')
    && lobby.includes("reason: 'bot-fill-selected'"),
  'lobby must expose and handle AI wingmate deployment'
);
assert(
  foundation.includes("import { MultiplayerBotManager } from './bot.js';")
    && foundation.includes('botManager = new MultiplayerBotManager')
    && foundation.includes('botManager?.beginRun()')
    && foundation.includes('botManager?.update(dt, now)')
    && foundation.includes('botManager?.endRun(reason)'),
  'foundation must own the host-authoritative bot lifecycle'
);
assert(
  room.includes('virtualPlayers = new Map()')
    && room.includes('upsertVirtualPlayer(player)')
    && room.includes('removeVirtualPlayer(playerId)'),
  'room state must represent a virtual bot player'
);
assert(
  runtime.includes('sendVirtualPlayerSnapshot')
    && runtime.includes('sendVirtualGameplayAction'),
  'runtime must relay bot snapshots and actions'
);
assert(
  remotePlayers.includes('state?.isBot === true')
    && remotePlayers.includes("`${player.displayName || 'ARENA WINGMATE'} · AI`"),
  'remote presentation must recognize AI snapshots and labels'
);
assert(
  bot.includes('resolveDownedHuman')
    && bot.includes('selectBotRescueThreat')
    && bot.includes('selectBotEnemyTarget')
    && !bot.includes("removeForHuman('human-replaced-between-waves')")
    && bot.includes('setReviveHold')
    && bot.includes('buildBotAuthoritySyncDetails')
    && bot.includes('computeBotShotAccuracy'),
  'bot must fight fairly, preserve damage, prioritize rescue, revive, and remain as a companion with human allies'
);
assert(
  enemy.includes('export function damageEnemyForBot')
    && main.includes('damageEnemy: damageEnemyForBot'),
  'bot damage must use an explicit host-side enemy adapter'
);
assert(
  summary.includes('export function markRunBotAssisted')
    && summary.includes('leaderboardEligible = false')
    && main.includes('markRunBotAssisted'),
  'bot-assisted runs must be marked for leaderboard policy'
);
assert(
  css.includes('.ka-matchmaking-bot')
    && css.includes('.ka-coop-player[data-bot="true"]'),
  'BOT.1 UI styling must be present'
);

console.log('BOT.1 integration contract tests passed');
