// js/multiplayer/coop_audio_contract.test.js

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../css/postfinal2.css', import.meta.url), 'utf8');
const audio = readFileSync(new URL('../audio.js', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('./foundation.js', import.meta.url), 'utf8');
const tactical = readFileSync(new URL('./tactical_ping.js', import.meta.url), 'utf8');
const bot = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
const builder = readFileSync(
  new URL('../../scripts/build_production.py', import.meta.url),
  'utf8'
);
const release = JSON.parse(
  readFileSync(new URL('../../multiplayer-release.json', import.meta.url), 'utf8')
);

for (const token of [
  'css/postfinal2.css',
  'team-alerts-volume-slider',
  'pause-team-alerts-volume-slider',
  'team-alert-captions-select',
  'pause-team-alert-captions-select'
]) {
  assert.ok(index.includes(token), `Missing POST-FINAL.2 UI token: ${token}`);
}

for (const token of [
  '#ka-coop-audio-caption',
  'body.ka-mobile-device #ka-coop-audio-caption',
  'ALLY_DOWN',
  'ENEMY_MARK'
]) {
  assert.ok(css.includes(token), `Missing co-op caption token: ${token}`);
}

for (const token of [
  'playTeamAlertCue',
  'setTeamAlertsVolume',
  'getTeamAlertsVolumePercent',
  'setTeamAlertCaptionsEnabled',
  'TEAM_ALERT_TONE_SHAPES'
]) {
  assert.ok(audio.includes(token), `Missing team-audio token: ${token}`);
}

assert.ok(foundation.includes("import { MultiplayerCoopAudioManager } from './coop_audio.js'"));
assert.ok(foundation.includes('coopAudioManager?.handleReviveEvent?.(event)'));
assert.ok(foundation.includes('coopAudioManager?.handleTacticalPing?.(ping'));
assert.ok(foundation.includes('coopAudioManager?.update(now)'));
assert.ok(tactical.includes('this.onRemotePing?.(result.ping'));
assert.ok(bot.includes("this.state.teamAlertKind = 'ENEMY_MARK'"));
assert.ok(bot.includes('teamAlertAtEpochMs'));
assert.ok(builder.includes(
  'POST_FINAL2_PATCH = "post-final2-r1-coop-audio-awareness"'
));
assert.ok(builder.includes('"post_final2"'));

assert.equal(
  release.coopAudioAwareness.patch,
  'post-final2-r1-coop-audio-awareness'
);
assert.equal(release.coopAudioAwareness.voiceChat, false);
assert.equal(release.coopAudioAwareness.aiWingmanEnemyMarks, true);
assert.equal(release.coopAudioAwareness.allyDownReminders, true);

assert.ok(!audio.includes('getUserMedia'));
assert.ok(!foundation.includes('voice_signal'));
console.log('POST-FINAL.2 co-op audio awareness contract: PASS');
