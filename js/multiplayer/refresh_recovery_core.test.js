// js/multiplayer/refresh_recovery_core.test.js
import assert from 'node:assert/strict';
import {
  createMultiplayerRefreshRecoveryIdentity,
  createMultiplayerRefreshRecoveryRecord,
  normalizeMultiplayerRefreshRecoveryRecord,
  transitionMultiplayerRefreshRecovery,
  MULTIPLAYER_REFRESH_RECOVERY_MAX_RETRIES,
  MULTIPLAYER_REFRESH_RECOVERY_PATCH,
  MULTIPLAYER_REFRESH_RECOVERY_PROTOCOL
} from './refresh_recovery_core.js';

assert.equal(
  MULTIPLAYER_REFRESH_RECOVERY_PATCH,
  'm3-refresh-recovery-seal-r1'
);
assert.equal(MULTIPLAYER_REFRESH_RECOVERY_PROTOCOL, 6);
assert.equal(MULTIPLAYER_REFRESH_RECOVERY_MAX_RETRIES, 1);

const readiness = {
  roomCode: 'ABCD23',
  runId: 'run-51',
  authorityEpoch: 9,
  status: 'TIMED_OUT',
  health: 'FAIL',
  reason: 'refresh-gameplay-readiness-timeout',
  blocking: true,
  final: true
};

const identity = createMultiplayerRefreshRecoveryIdentity(readiness);
assert.equal(identity, 'ABCD23|run-51|9');

const record = createMultiplayerRefreshRecoveryRecord({
  readiness,
  retryCount: 0,
  now: 1000,
  ttlMs: 5000
});
assert.ok(record);
assert.equal(record.status, 'PROMPT');
assert.equal(record.canRetry, true);
assert.equal(record.retryCount, 0);

const retrying = transitionMultiplayerRefreshRecovery({
  record,
  action: 'RETRY',
  now: 1100
});
assert.equal(retrying.status, 'RETRYING');
assert.equal(retrying.retryCount, 1);
assert.equal(retrying.canRetry, false);

const exhausted = transitionMultiplayerRefreshRecovery({
  record: retrying,
  action: 'RETRY',
  now: 1200
});
assert.equal(exhausted.status, 'RETRY_EXHAUSTED');
assert.equal(exhausted.canRetry, false);

const escaped = transitionMultiplayerRefreshRecovery({
  record: retrying,
  action: 'ESCAPE',
  now: 1300
});
assert.equal(escaped.status, 'ESCAPED');
assert.equal(escaped.final, true);

const recovered = transitionMultiplayerRefreshRecovery({
  record: retrying,
  action: 'RECOVER',
  now: 1400
});
assert.equal(recovered.status, 'RECOVERED');
assert.equal(recovered.final, true);

assert.equal(
  createMultiplayerRefreshRecoveryRecord({
    readiness: {
      ...readiness,
      status: 'READY',
      health: 'PASS',
      final: true
    }
  }),
  null
);

assert.equal(
  normalizeMultiplayerRefreshRecoveryRecord(record, 7001),
  null
);

assert.equal(
  createMultiplayerRefreshRecoveryIdentity({
    roomCode: 'bad',
    runId: 'run-51'
  }),
  null
);

console.log('refresh_recovery_core tests passed');
