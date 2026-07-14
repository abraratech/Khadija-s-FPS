// js/multiplayer/network_quality_relay_core.test.js
import assert from 'node:assert/strict';
import {
  NETWORK_QUALITY_LEVELS,
  NetworkQualityTracker
} from './network_quality.js';

function addPong(tracker, id, sentAt, rtt) {
  assert.equal(tracker.startPing(id, sentAt), true);
  assert.equal(tracker.recordPong(id, sentAt + rtt), rtt);
}

{
  const tracker = new NetworkQualityTracker({
    warmupMs: 1200,
    worsenHoldMs: 600,
    improveHoldMs: 1200
  });
  tracker.reset(1000);
  addPong(tracker, 'a', 1000, 650);
  addPong(tracker, 'b', 2000, 650);
  addPong(tracker, 'c', 3000, 650);
  const snapshot = tracker.getSnapshot(4300);
  assert.equal(snapshot.level, NETWORK_QUALITY_LEVELS.POOR);
  assert.equal(snapshot.rawLevel, NETWORK_QUALITY_LEVELS.POOR);
  assert.equal(snapshot.measurementKind, 'PEER_RELAY_RTT');
  assert.equal(snapshot.warmupComplete, true);
}

{
  const tracker = new NetworkQualityTracker({
    warmupMs: 1200,
    worsenHoldMs: 600,
    improveHoldMs: 1200
  });
  tracker.reset(1000);
  addPong(tracker, 'a', 1000, 950);
  addPong(tracker, 'b', 2100, 950);
  addPong(tracker, 'c', 3200, 950);
  const snapshot = tracker.getSnapshot(4500);
  assert.equal(snapshot.level, NETWORK_QUALITY_LEVELS.UNSTABLE);
}

{
  const tracker = new NetworkQualityTracker({ timeoutMs: 3000 });
  tracker.reset(1000);
  tracker.markEnvelopeReceived(1000);
  const snapshot = tracker.getSnapshot(4501);
  assert.equal(snapshot.level, NETWORK_QUALITY_LEVELS.RECONNECTING);
}

console.log('Network quality relay classification tests: PASS');
