// js/online_leaderboards_core.js
export const ONLINE_LEADERBOARD_SCHEMA = 1;
export const ONLINE_LEADERBOARD_PATCH = 'm4-online-leaderboards-r1';
export const ONLINE_LEADERBOARD_WORKER_URL = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const ONLINE_LEADERBOARD_MAPS = Object.freeze([
  Object.freeze({ id: 'grid_bunker', label: 'Grid Bunker' }),
  Object.freeze({ id: 'industrial_yard', label: 'Industrial Yard' }),
  Object.freeze({ id: 'neon_depot', label: 'Neon Depot' }),
  Object.freeze({ id: 'parking_garage', label: 'Parking Garage' }),
  Object.freeze({ id: 'hospital_wing', label: 'Hospital Wing' }),
  Object.freeze({ id: 'reactor_courtyard', label: 'Reactor Courtyard' }),
  Object.freeze({ id: 'stormbreak_canal', label: 'Stormbreak Canal' })
]);
export const ONLINE_LEADERBOARD_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: 'easy', label: 'Easy' }),
  Object.freeze({ id: 'normal', label: 'Normal' }),
  Object.freeze({ id: 'hard', label: 'Hard' })
]);
const MAP_ALIASES = Object.freeze({
  bunker: 'grid_bunker', grid: 'grid_bunker', gridbunker: 'grid_bunker',
  yard: 'industrial_yard', industrial: 'industrial_yard', industrialyard: 'industrial_yard',
  depot: 'neon_depot', neon: 'neon_depot', neondepot: 'neon_depot',
  garage: 'parking_garage', parking: 'parking_garage', parkinggarage: 'parking_garage',
  hospital: 'hospital_wing', hospitalwing: 'hospital_wing',
  reactor: 'reactor_courtyard', courtyard: 'reactor_courtyard', reactorcourtyard: 'reactor_courtyard',
  stormbreak: 'stormbreak_canal', canal: 'stormbreak_canal', stormbreakcanal: 'stormbreak_canal'
});
function token(value) { return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function integer(value, min, max, fallback = min) { return Math.min(max, Math.max(min, Math.round(finite(value, fallback)))); }
function decimal(value, min, max, fallback = min) { return Math.round(Math.min(max, Math.max(min, finite(value, fallback))) * 10) / 10; }
export function normalizeOnlineMap(value) { const clean = token(value); if (ONLINE_LEADERBOARD_MAPS.some((item) => item.id === clean)) return clean; return MAP_ALIASES[clean] || MAP_ALIASES[clean.replace(/_/g, '')] || 'grid_bunker'; }
export function normalizeOnlineDifficulty(value) { const clean = token(value); if (['easy','normal','hard'].includes(clean)) return clean; const numeric=Number(value); if (Number.isFinite(numeric)) return numeric < .9 ? 'easy' : numeric > 1.15 ? 'hard' : 'normal'; return 'normal'; }
export function cleanOnlineDisplayName(value) { return String(value ?? 'Survivor').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0,24) || 'Survivor'; }
export function createOnlineRunId(now = Date.now(), random = Math.random()) { return `run-${Math.floor(now).toString(36)}-${Math.floor(random * 0xFFFFFFFF).toString(36).padStart(6,'0')}`; }
export function buildOnlineChallenge({ playerId, runId, mapId, difficulty } = {}) { return Object.freeze({ schema: ONLINE_LEADERBOARD_SCHEMA, playerId: String(playerId || '').slice(0,120), runId: String(runId || '').slice(0,120), mapId: normalizeOnlineMap(mapId), difficulty: normalizeOnlineDifficulty(difficulty) }); }
export function buildOnlineSubmission({ challengeToken, playerId, runId, displayName, mapId, difficulty, score=0, wave=1, kills=0, survivalSeconds=0, accuracy=0, headshots=0 } = {}) { return Object.freeze({ schema: ONLINE_LEADERBOARD_SCHEMA, challengeToken: String(challengeToken || '').slice(0,80), playerId: String(playerId || '').slice(0,120), runId: String(runId || '').slice(0,120), displayName: cleanOnlineDisplayName(displayName), mapId: normalizeOnlineMap(mapId), difficulty: normalizeOnlineDifficulty(difficulty), score: integer(score,0,25_000_000,0), wave: integer(wave,1,1000,1), kills: integer(kills,0,250_000,0), survivalSeconds: decimal(survivalSeconds,0,172_800,0), accuracy: decimal(accuracy,0,100,0), headshots: integer(headshots,0,250_000,0) }); }
export function normalizeOnlineLeaderboardResponse(value = {}) { const source=value&&typeof value==='object'?value:{}; const entries=Array.isArray(source.entries)?source.entries:[]; return Object.freeze({ ok: source.ok===true, scope: source.scope==='region'?'region':'global', region: String(source.region||'').slice(0,2).toUpperCase()||null, mapId: normalizeOnlineMap(source.mapId), difficulty: normalizeOnlineDifficulty(source.difficulty), entries:Object.freeze(entries.map((entry,index)=>Object.freeze({ rank:integer(entry?.rank,index+1,1000,index+1), id:String(entry?.id||'').slice(0,96), displayName:cleanOnlineDisplayName(entry?.displayName), region:String(entry?.region||'ZZ').slice(0,2).toUpperCase(), score:integer(entry?.score,0,25_000_000,0), wave:integer(entry?.wave,1,1000,1), kills:integer(entry?.kills,0,250_000,0), survivalSeconds:decimal(entry?.survivalSeconds,0,172_800,0), accuracy:decimal(entry?.accuracy,0,100,0), headshots:integer(entry?.headshots,0,250_000,0), createdAt:Number.isFinite(Date.parse(entry?.createdAt))?new Date(entry.createdAt).toISOString():null }))) }); }
export function normalizePendingOnlineSubmissions(value) { const source=Array.isArray(value)?value:[]; const seen=new Set(); return Object.freeze(source.filter((item)=>item&&typeof item==='object').map((item)=>Object.freeze({...item,runId:String(item.runId||'').slice(0,120)})).filter((item)=>item.runId&&!seen.has(item.runId)&&seen.add(item.runId)).slice(-10)); }
