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
    improveHoldMs: 1200,
    minCompletedSamples: 3
  });
  tracker.reset(1000);
  addPong(tracker, 'a', 1000, 650);
  addPong(tracker, 'b', 2000, 650);
  addPong(tracker, 'c', 3000, 650);
  const initial = tracker.getSnapshot(4300);
  assert.equal(initial.level, NETWORK_QUALITY_LEVELS.WAITING);
  assert.equal(initial.rawLevel, NETWORK_QUALITY_LEVELS.POOR);
  const sustained = tracker.getSnapshot(5000);
  assert.equal(sustained.level, NETWORK_QUALITY_LEVELS.POOR);
  assert.equal(sustained.measurementKind, 'PEER_RELAY_RTT');
  assert.equal(sustained.warmupComplete, true);
}

{
  const tracker = new NetworkQualityTracker({
    warmupMs: 1200,
    worsenHoldMs: 600,
    minCompletedSamples: 3
  });
  tracker.reset(1000);
  addPong(tracker, 'a', 1000, 950);
  addPong(tracker, 'b', 2100, 950);
  addPong(tracker, 'c', 3200, 950);
  assert.equal(tracker.getSnapshot(4500).level, NETWORK_QUALITY_LEVELS.WAITING);
  assert.equal(tracker.getSnapshot(5200).level, NETWORK_QUALITY_LEVELS.UNSTABLE);
}

{
  const tracker = new NetworkQualityTracker({ timeoutMs: 3000 });
  tracker.reset(1000);
  tracker.markEnvelopeReceived(1000);
  const snapshot = tracker.getSnapshot(4501);
  assert.equal(snapshot.level, NETWORK_QUALITY_LEVELS.RECONNECTING);
}

{
  const tracker = new NetworkQualityTracker({
    warmupMs: 1200,
    minCompletedSamples: 3,
    sampleWindowMs: 10000
  });
  tracker.reset(1000);
  tracker.startPing('lost', 1000);
  tracker.prune(8000);
  addPong(tracker, 'a', 9000, 80);
  addPong(tracker, 'b', 10000, 82);
  addPong(tracker, 'c', 11000, 78);
  tracker.getSnapshot(12000);
  addPong(tracker, 'd', 18000, 80);
  const recovered = tracker.getSnapshot(19000);
  assert.equal(recovered.packetLossPct, 0, 'old loss must age out of rolling window');
}

console.log('Network quality relay classification tests: PASS');
