
import { ReviveAuthority, MULTIPLAYER_LIFE_STATES } from './payload/js/multiplayer/revive_core.js';
import { MULTIPLAYER_BUILD_ID, MULTIPLAYER_PROTOCOL_VERSION, MULTIPLAYER_MESSAGE_TYPES, createProtocolEnvelope, validateProtocolEnvelope } from './payload/js/multiplayer/protocol.js';
if (MULTIPLAYER_BUILD_ID !== 'm3-revive-r1') throw new Error('bad build');
if (MULTIPLAYER_PROTOCOL_VERSION !== 4) throw new Error('bad protocol');
const envelope = createProtocolEnvelope({type:MULTIPLAYER_MESSAGE_TYPES.REVIVE_STATE, sessionId:'s', runId:'r', playerId:'p', sequence:1, payload:{kind:'snapshot', snapshot:{players:[]}}});
const result = validateProtocolEnvelope(envelope,{expectedSessionId:'s'});
if (!result.ok) throw new Error(result.errors.join(','));
const core = new ReviveAuthority({bleedoutMs:5000, reviveHoldMs:1000, reviveRange:3.2});
core.reset({runId:'run-1',wave:1});
core.ensurePlayer('host',{position:{x:0,y:0,z:0},connected:true});
core.ensurePlayer('op',{position:{x:2,y:0,z:0},connected:true});
if (!core.downPlayer('op',{now:100,wave:1})) throw new Error('down failed');
for (const now of [300,550,800,1050,1300]) {
  core.setReviveHold('host','op',{holding:true,now,position:{x:0,y:0,z:0}});
  core.update({now,dtMs:300,wave:1});
}
let op = core.getSnapshot().players.find(p=>p.playerId==='op');
if (op.lifeState !== MULTIPLAYER_LIFE_STATES.ACTIVE) throw new Error('revive failed');
core.downPlayer('op',{now:2000,wave:1});
core.update({now:8000,dtMs:100,wave:1});
op = core.getSnapshot().players.find(p=>p.playerId==='op');
if (op.lifeState !== MULTIPLAYER_LIFE_STATES.SPECTATING) throw new Error('bleedout failed');
core.update({now:9000,dtMs:100,wave:2});
op = core.getSnapshot().players.find(p=>p.playerId==='op');
if (op.lifeState !== MULTIPLAYER_LIFE_STATES.ACTIVE || op.respawnNonce !== 1) throw new Error('respawn failed');
core.downPlayer('host',{now:10000,wave:2});
core.downPlayer('op',{now:10000,wave:2});
core.update({now:16000,dtMs:100,wave:2});
if (!core.consumeEvents().some(e=>e.type==='TEAM_ELIMINATED')) throw new Error('team elimination failed');
console.log('M3.5-M3.6 revive smoke test passed.');
