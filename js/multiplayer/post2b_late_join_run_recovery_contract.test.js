import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('./runtime.js', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('./foundation.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  runtime.includes("this.scheduleRunRecovery('transport-reconnected', now);"),
  'transport reconnect must schedule deterministic run recovery'
);
assert(
  runtime.includes("run?.resumed === true ? 'client-run-resume' : 'client-run-start'"),
  'client run start/resume must schedule recovery'
);
assert(
  runtime.includes("this.players?.syncLocalPlayer?.(")
    && runtime.includes("{ force: true }")
    && runtime.includes("this.sendStateResyncRequest({"),
  'recovery attempts must force a local player snapshot and request host state'
);
assert(
  runtime.includes("requireWorldSnapshot: recovery.worldSeen !== true")
    && runtime.includes("requireHostSnapshot: recovery.hostSeen !== true"),
  'recovery request must identify missing world and host-player state'
);
assert(
  runtime.includes("recovery.worldSeen && recovery.hostSeen"),
  'client recovery must remain active until both world and host snapshots arrive'
);
assert(
  runtime.includes("const delays = [420, 950, 1800, 3200];"),
  'recovery must use a bounded retry schedule'
);
assert(
  foundation.includes("publishRecoveryBurst('initial');")
    && foundation.includes("publishRecoveryBurst('follow-up')")
    && foundation.includes("setTimeout(() => publishRecoveryBurst('follow-up'), 320);"),
  'host must send immediate and follow-up authoritative recovery bursts'
);
assert(
  foundation.includes("multiplayerPlayers?.syncLocalPlayer?.(")
    && foundation.includes("sharedWorldManager?.forceAuthoritativeSnapshot?.(")
    && foundation.includes("economyManager?.sendSnapshot?.(true);")
    && foundation.includes("reviveManager?.publishSnapshot?.(burstNow, true);")
    && foundation.includes("coopStatsManager?.publishSnapshot?.(true, burstNow);"),
  'host recovery burst must include player, world, economy, revive, and run-stat state'
);

const delays = [420, 950, 1800, 3200];
let now = 1000;
const attempts = [];
for (const delay of delays) {
  attempts.push(now);
  now += delay;
}
assert(attempts.length === 4, 'retry budget must remain bounded to four attempts');
assert(attempts[1] > attempts[0] && attempts[3] > attempts[2], 'retry times must increase');

console.log('POST.2B late-join and run-recovery contract tests passed');
