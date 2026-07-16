// js/multiplayer/coop_audio_core.test.js

import assert from 'node:assert/strict';
import {
  COOP_AUDIO_KINDS,
  CoopAudioArbiter,
  buildCoopAudioCaption,
  tacticalPingTypeToAudioKind
} from './coop_audio_core.js';

{
  assert.equal(
    tacticalPingTypeToAudioKind('ENEMY'),
    COOP_AUDIO_KINDS.ENEMY_MARK
  );
  assert.equal(
    tacticalPingTypeToAudioKind('REVIVE_ME'),
    COOP_AUDIO_KINDS.NEED_HELP
  );
  assert.equal(tacticalPingTypeToAudioKind('UNKNOWN'), null);
}

{
  const caption = buildCoopAudioCaption({
    kind: COOP_AUDIO_KINDS.ALLY_DOWN,
    actorName: 'Arena Wingmate',
    distanceMeters: 17.6
  });
  assert.equal(caption, 'ARENA WINGMATE DOWN · REVIVE NEEDED · 18M');
}

{
  const arbiter = new CoopAudioArbiter();
  const first = arbiter.accept({
    kind: COOP_AUDIO_KINDS.ENEMY_MARK,
    actorId: 'ally-a',
    eventId: 'ping-1',
    now: 1000
  });
  assert.equal(first.accepted, true);

  const duplicate = arbiter.accept({
    kind: COOP_AUDIO_KINDS.ENEMY_MARK,
    actorId: 'ally-a',
    eventId: 'ping-1',
    now: 5000
  });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, 'duplicate');
}

{
  const arbiter = new CoopAudioArbiter();
  assert.equal(arbiter.accept({
    kind: COOP_AUDIO_KINDS.ALLY_DOWN,
    actorId: 'ally-a',
    eventId: 'down-1',
    now: 1000
  }).accepted, true);

  const lowPriority = arbiter.accept({
    kind: COOP_AUDIO_KINDS.MOVE_MARK,
    actorId: 'ally-b',
    eventId: 'move-1',
    now: 1100
  });
  assert.equal(lowPriority.accepted, false);
  assert.equal(lowPriority.reason, 'priority-lock');

  const secondUrgent = arbiter.accept({
    kind: COOP_AUDIO_KINDS.ALLY_DOWN,
    actorId: 'ally-b',
    eventId: 'down-2',
    now: 1300,
    force: true
  });
  assert.equal(secondUrgent.accepted, true);
}

{
  const arbiter = new CoopAudioArbiter();
  assert.equal(arbiter.accept({
    kind: COOP_AUDIO_KINDS.NEED_HELP,
    actorId: 'ally-a',
    eventId: 'help-1',
    now: 1000
  }).accepted, true);

  const actorCooldown = arbiter.accept({
    kind: COOP_AUDIO_KINDS.NEED_HELP,
    actorId: 'ally-a',
    eventId: 'help-2',
    now: 2000
  });
  assert.equal(actorCooldown.accepted, false);
  assert.ok([
    'kind-cooldown',
    'actor-cooldown'
  ].includes(actorCooldown.reason));

  assert.equal(arbiter.accept({
    kind: COOP_AUDIO_KINDS.NEED_HELP,
    actorId: 'ally-a',
    eventId: 'help-3',
    now: 5000
  }).accepted, true);
}

console.log('coop_audio_core tests passed');
