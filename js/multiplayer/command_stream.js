// js/multiplayer/command_stream.js

const DEFAULT_SEND_INTERVAL_MS = 1000 / 30;

const ACTION_EDGE_MAP = Object.freeze([
  ['fire', 'MousedownLeft', 'FIRE'],
  ['reload', 'KeyR', 'RELOAD'],
  ['interact', 'KeyE', 'INTERACT'],
  ['switchWeapon', 'KeyQ', 'SWITCH_WEAPON'],
  ['melee', 'KeyV', 'MELEE'],
  ['jump', 'Space', 'JUMP']
]);

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function active(frameKeys, code) {
  return frameKeys?.[code] === true;
}

function normalizedAxis(positive, negative) {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

function captureInputState(frameKeys, player) {
  return {
    moveX: normalizedAxis(active(frameKeys, 'KeyD'), active(frameKeys, 'KeyA')),
    moveZ: normalizedAxis(active(frameKeys, 'KeyW'), active(frameKeys, 'KeyS')),
    jump: active(frameKeys, 'Space'),
    sprint: active(frameKeys, 'ShiftLeft') || player?.isSprinting === true,
    aim: active(frameKeys, 'MousedownRight') || player?.isADS === true,
    fire: active(frameKeys, 'MousedownLeft'),
    reload: active(frameKeys, 'KeyR'),
    interact: active(frameKeys, 'KeyE'),
    switchWeapon: active(frameKeys, 'KeyQ'),
    melee: active(frameKeys, 'KeyV')
  };
}

function inputStatesEqual(a, b) {
  if (!a || !b) return false;
  return Object.keys(a).every((key) => a[key] === b[key]);
}

function captureView(player) {
  return {
    yaw: Number(player?.yaw || 0),
    pitch: Number(player?.pitch || 0)
  };
}

export class MultiplayerCommandStream {
  constructor({ sendIntervalMs = DEFAULT_SEND_INTERVAL_MS } = {}) {
    this.sendIntervalMs = Math.max(16, Number(sendIntervalMs) || DEFAULT_SEND_INTERVAL_MS);
    this.activeRunId = null;
    this.commandSequence = 0;
    this.actionSequence = 0;
    this.lastSentAt = -Infinity;
    this.previousInput = null;
  }

  beginRun(runId) {
    this.activeRunId = runId || null;
    this.commandSequence = 0;
    this.actionSequence = 0;
    this.lastSentAt = -Infinity;
    this.previousInput = null;
  }

  endRun() {
    this.activeRunId = null;
    this.previousInput = null;
  }

  capture({
    frameKeys = {},
    player = null,
    dt = 0,
    lookDeltaX = 0,
    lookDeltaY = 0,
    now = nowMs()
  } = {}) {
    if (!this.activeRunId) {
      return { command: null, actions: [] };
    }

    const input = captureInputState(frameKeys, player);
    const previous = this.previousInput;
    const actions = [];

    ACTION_EDGE_MAP.forEach(([field, _code, action]) => {
      if (input[field] && !previous?.[field]) {
        this.actionSequence += 1;
        actions.push({
          sequence: this.actionSequence,
          action,
          phase: 'pressed',
          clientTime: now
        });
      }
    });

    if (previous && input.aim !== previous.aim) {
      this.actionSequence += 1;
      actions.push({
        sequence: this.actionSequence,
        action: 'AIM',
        phase: input.aim ? 'started' : 'ended',
        clientTime: now
      });
    }

    if (previous && input.sprint !== previous.sprint) {
      this.actionSequence += 1;
      actions.push({
        sequence: this.actionSequence,
        action: 'SPRINT',
        phase: input.sprint ? 'started' : 'ended',
        clientTime: now
      });
    }

    const lookChanged = Math.abs(Number(lookDeltaX) || 0) > 0.001
      || Math.abs(Number(lookDeltaY) || 0) > 0.001;
    const stateChanged = !inputStatesEqual(previous, input);
    const intervalElapsed = now - this.lastSentAt >= this.sendIntervalMs;

    let command = null;
    if (stateChanged || lookChanged || intervalElapsed) {
      this.commandSequence += 1;
      this.lastSentAt = now;
      command = {
        sequence: this.commandSequence,
        clientTime: now,
        dt: Math.max(0, Math.min(0.1, Number(dt) || 0)),
        input,
        look: {
          deltaX: Number(lookDeltaX) || 0,
          deltaY: Number(lookDeltaY) || 0
        },
        view: captureView(player)
      };
    }

    this.previousInput = input;
    return { command, actions };
  }

  getSnapshot() {
    return {
      activeRunId: this.activeRunId,
      commandSequence: this.commandSequence,
      actionSequence: this.actionSequence,
      sendIntervalMs: this.sendIntervalMs,
      previousInput: this.previousInput ? { ...this.previousInput } : null
    };
  }
}
