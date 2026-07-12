// js/multiplayer/live_voice.js
import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { VOICE_PUSH_TO_TALK_CODE, inspectVoiceEnvironment } from './voice_readiness_core.js';
import {
  LIVE_VOICE_PATCH,
  LIVE_VOICE_SIGNAL_ACTION,
  LIVE_VOICE_SIGNAL_KINDS,
  LIVE_VOICE_STUN_URL,
  liveVoiceAvailability,
  normalizeIncomingVoiceSignal,
  roomVoicePeers,
  shouldInitiateVoiceOffer,
} from './live_voice_core.js';

const ROOT_ID = 'ka-live-voice-controls';
const SYNC_INTERVAL_MS = 350;
const RETRY_DELAY_MS = 1600;

function editableTarget(target) {
  return target instanceof Element
    && target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function stopStream(stream) {
  try { stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
}

function safeDescription(description) {
  if (!description) return null;
  return { type: description.type, sdp: description.sdp };
}

function safeCandidate(candidate) {
  if (!candidate) return null;
  if (typeof candidate.toJSON === 'function') return candidate.toJSON();
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

function makeButton(label, ariaLabel = label) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.setAttribute('aria-label', ariaLabel);
  Object.assign(element.style, {
    padding: '7px 9px',
    border: '1px solid rgba(89, 232, 255, .62)',
    borderRadius: '7px',
    background: '#073044',
    color: '#effcff',
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '.04em',
    cursor: 'pointer',
  });
  return element;
}

export class MultiplayerLiveVoice {
  constructor() {
    this.chat = null;
    this.readiness = null;
    this.eventBus = null;
    this.transport = null;
    this.runtime = null;
    this.store = null;
    this.active = false;
    this.pttHeld = false;
    this.localStream = null;
    this.localTrack = null;
    this.peers = new Map();
    this.remoteSpeaking = new Map();
    this.unsubscribers = [];
    this.syncTimer = 0;
    this.retryTimers = new Map();
    this.root = null;
    this.startButton = null;
    this.status = null;
    this.playerSelect = null;
    this.playerMuteButton = null;
    this.peerStatus = null;
    this.lastRoomCode = null;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  initialize() {
    if (typeof window === 'undefined') return this.getSnapshot();
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', () => this.setPttHeld(false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPttHeld(false);
    });
    this.syncTimer = window.setInterval(() => this.sync(), SYNC_INTERVAL_MS);
    this.sync();
    try { window.KHADIJA_LIVE_VOICE = this; } catch {}
    return this.getSnapshot();
  }

  attachDependencies() {
    const chat = window.KHADIJA_TEXT_CHAT || null;
    const readiness = window.KHADIJA_VOICE_READINESS || null;
    if (!chat || !readiness) return false;

    const changed = this.chat !== chat || this.readiness !== readiness;
    this.chat = chat;
    this.readiness = readiness;
    this.eventBus = chat.eventBus || null;
    this.transport = chat.transport || null;
    this.runtime = chat.runtime || null;
    this.store = readiness.store || null;
    this.ensureUi();

    if (changed) {
      this.unsubscribers.forEach((unsubscribe) => {
        try { unsubscribe?.(); } catch {}
      });
      this.unsubscribers = [];
      this.unsubscribers.push(
        this.eventBus?.on?.(MULTIPLAYER_EVENTS.TRANSPORT_CONTROL, (event) => {
          const message = event?.payload || event;
          if (message?.action === LIVE_VOICE_SIGNAL_ACTION) {
            void this.handleSignal(message.payload?.signal);
          } else if (message?.action === 'voice-signal-rejected') {
            this.setStatus(this.rejectionText(message.payload?.reason), true);
          }
        }),
        this.eventBus?.on?.(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, () => this.sync()),
        this.eventBus?.on?.(MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED, () => this.sync())
      );
    }
    return true;
  }

  ensureUi() {
    if (this.root || !this.readiness?.panel) return;
    this.root = document.createElement('section');
    this.root.id = ROOT_ID;
    Object.assign(this.root.style, {
      marginTop: '11px',
      paddingTop: '10px',
      borderTop: '1px solid rgba(89, 232, 255, .28)',
    });

    const heading = document.createElement('div');
    heading.textContent = 'LIVE PUSH-TO-TALK';
    Object.assign(heading.style, {
      color: '#79edff',
      fontSize: '11px',
      fontWeight: '900',
      letterSpacing: '.09em',
    });

    const description = document.createElement('p');
    description.textContent = 'Peer-to-peer team audio. Hold T to transmit. The Worker relays signaling only and never receives microphone audio.';
    Object.assign(description.style, {
      margin: '6px 0 8px',
      color: '#aec6d1',
      fontSize: '10px',
      lineHeight: '1.35',
    });

    const controls = document.createElement('div');
    Object.assign(controls.style, { display: 'flex', flexWrap: 'wrap', gap: '7px' });
    this.startButton = makeButton('START LIVE VOICE', 'Start peer-to-peer live voice');
    this.startButton.addEventListener('click', () => {
      if (this.active) this.stop({ userRequested: true });
      else void this.start();
    });
    controls.appendChild(this.startButton);

    const muteRow = document.createElement('div');
    Object.assign(muteRow.style, { display: 'flex', gap: '7px', marginTop: '8px' });
    this.playerSelect = document.createElement('select');
    this.playerSelect.setAttribute('aria-label', 'Choose teammate to mute or unmute in voice');
    Object.assign(this.playerSelect.style, {
      flex: '1',
      minWidth: '0',
      padding: '7px 8px',
      borderRadius: '7px',
      border: '1px solid rgba(100, 190, 210, .55)',
      background: '#061018',
      color: '#fff',
    });
    this.playerSelect.addEventListener('change', () => this.renderMuteControls());
    this.playerMuteButton = makeButton('MUTE PLAYER', 'Mute selected teammate voice');
    this.playerMuteButton.addEventListener('click', () => {
      const playerId = this.playerSelect?.value || '';
      if (!playerId || !this.store) return;
      const muted = !this.store.isVoicePlayerMuted(playerId);
      this.store.setVoicePlayerMuted(playerId, muted);
      this.applyMutePreferences();
      this.renderMuteControls();
      const name = this.playerSelect?.selectedOptions?.[0]?.textContent || 'Player';
      this.setStatus(muted ? `${name} muted locally` : `${name} unmuted`, false);
    });
    muteRow.append(this.playerSelect, this.playerMuteButton);

    this.status = document.createElement('div');
    Object.assign(this.status.style, {
      marginTop: '8px',
      padding: '7px 8px',
      borderRadius: '7px',
      background: 'rgba(0,0,0,.25)',
      color: '#ffe27a',
      fontSize: '10px',
      fontWeight: '800',
      letterSpacing: '.03em',
    });

    this.peerStatus = document.createElement('div');
    Object.assign(this.peerStatus.style, {
      marginTop: '6px',
      color: '#9cb5c0',
      fontSize: '10px',
      lineHeight: '1.35',
    });

    this.root.append(heading, description, controls, muteRow, this.status, this.peerStatus);
    this.readiness.panel.appendChild(this.root);
    this.render();
  }

  currentRoom() {
    return this.chat?.currentRoom?.() || null;
  }

  localPlayerId() {
    return String(this.runtime?.localPlayerId || '').trim();
  }

  teammates() {
    return roomVoicePeers(this.currentRoom(), this.localPlayerId());
  }

  roomAvailable() {
    return this.chat?.getSnapshot?.().available === true;
  }

  availability() {
    return liveVoiceAvailability({
      secureContext: globalThis.isSecureContext === true,
      mediaDevices: globalThis.navigator?.mediaDevices,
      peerConnection: globalThis.RTCPeerConnection,
      roomAvailable: this.roomAvailable(),
    });
  }

  async start() {
    if (this.active) return true;
    const availability = this.availability();
    if (!availability.available) {
      this.setStatus(availability.label, true);
      return false;
    }

    const selectedDeviceId = this.store?.getSnapshot?.().selectedDeviceId || '';
    const audio = selectedDeviceId
      ? {
          deviceId: { exact: selectedDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        }
      : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      this.localTrack = this.localStream.getAudioTracks()[0] || null;
      if (!this.localTrack) throw new Error('No audio track was returned.');
      this.localTrack.enabled = false;
      try { this.localTrack.contentHint = 'speech'; } catch {}
      this.active = true;
      this.store?.setVoiceEnabled?.(true);
      this.reconcilePeers();
      this.broadcastSignal(LIVE_VOICE_SIGNAL_KINDS.READY);
      this.setStatus('LIVE VOICE READY · HOLD T TO TALK', false);
      this.render();
      return true;
    } catch (error) {
      stopStream(this.localStream);
      this.localStream = null;
      this.localTrack = null;
      this.active = false;
      this.setStatus(this.readiness?.setStatus
        ? 'LIVE VOICE COULD NOT START'
        : String(error?.message || 'LIVE VOICE COULD NOT START'), true);
      this.render();
      return false;
    }
  }

  stop({ userRequested = false, roomLost = false } = {}) {
    if (this.active) this.broadcastSignal(LIVE_VOICE_SIGNAL_KINDS.STOP);
    this.setPttHeld(false);
    this.active = false;
    this.peers.forEach((_peer, playerId) => this.removePeer(playerId));
    this.peers.clear();
    this.remoteSpeaking.clear();
    this.retryTimers.forEach((timer) => clearTimeout(timer));
    this.retryTimers.clear();
    stopStream(this.localStream);
    this.localStream = null;
    this.localTrack = null;
    if (userRequested) this.store?.setVoiceEnabled?.(false);
    this.setStatus(
      roomLost ? 'LIVE VOICE STOPPED · ROOM CONNECTION LOST'
        : userRequested ? 'LIVE VOICE STOPPED'
          : 'LIVE VOICE OFF · CLICK START',
      roomLost
    );
    this.render();
    return true;
  }

  handleDeviceChanged() {
    if (this.active) {
      this.setStatus('MICROPHONE CHANGED · STOP AND START LIVE VOICE TO APPLY', false);
    }
  }

  sync() {
    if (!this.attachDependencies()) return false;
    const roomCode = String(this.currentRoom()?.roomCode || '');
    if (this.lastRoomCode && roomCode && roomCode !== this.lastRoomCode && this.active) {
      this.stop({ roomLost: true });
    }
    this.lastRoomCode = roomCode || null;

    if (this.active && !this.availability().available) {
      this.stop({ roomLost: true });
    } else if (this.active) {
      this.reconcilePeers();
      this.applyMutePreferences();
    }
    this.render();
    return true;
  }

  reconcilePeers() {
    if (!this.active || !this.localTrack) return;
    const teammates = this.teammates();
    const desired = new Set(teammates.map((entry) => entry.playerId));
    for (const playerId of [...this.peers.keys()]) {
      if (!desired.has(playerId)) this.removePeer(playerId);
    }
    for (const teammate of teammates) {
      const peer = this.ensurePeer(teammate);
      if (peer && shouldInitiateVoiceOffer(this.localPlayerId(), teammate.playerId) && !peer.offerSent) {
        void this.makeOffer(peer);
      }
    }
  }

  ensurePeer(teammate) {
    const playerId = String(teammate?.playerId || '').trim();
    if (!playerId || !this.active || !this.localTrack) return null;
    const existing = this.peers.get(playerId);
    if (existing) {
      existing.displayName = teammate.displayName || existing.displayName;
      return existing;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: LIVE_VOICE_STUN_URL }],
      bundlePolicy: 'max-bundle',
      iceCandidatePoolSize: 1,
    });
    const peer = {
      playerId,
      displayName: teammate.displayName || 'Player',
      pc,
      audio: null,
      pendingCandidates: [],
      makingOffer: false,
      offerSent: false,
      connected: false,
    };
    this.peers.set(playerId, peer);

    pc.addTrack(this.localTrack, this.localStream);
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.sendSignal(playerId, LIVE_VOICE_SIGNAL_KINDS.ICE_CANDIDATE, {
        candidate: safeCandidate(event.candidate),
      });
    };
    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      if (!peer.audio) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.dataset.voicePlayerId = playerId;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        peer.audio = audio;
      }
      peer.audio.srcObject = stream;
      this.applyMutePreferences();
      peer.audio.play?.().catch(() => {
        this.setStatus('CLICK START LIVE VOICE AGAIN TO UNLOCK TEAMMATE AUDIO', true);
      });
    };
    pc.onconnectionstatechange = () => {
      peer.connected = pc.connectionState === 'connected';
      this.render();
      if (pc.connectionState === 'failed') this.schedulePeerRetry(playerId);
      if (pc.connectionState === 'closed') this.removePeer(playerId);
    };
    return peer;
  }

  schedulePeerRetry(playerId) {
    if (!this.active || this.retryTimers.has(playerId)) return;
    const timer = setTimeout(() => {
      this.retryTimers.delete(playerId);
      const teammate = this.teammates().find((entry) => entry.playerId === playerId);
      this.removePeer(playerId);
      if (!teammate || !this.active) return;
      const peer = this.ensurePeer(teammate);
      this.sendSignal(playerId, LIVE_VOICE_SIGNAL_KINDS.READY);
      if (peer && shouldInitiateVoiceOffer(this.localPlayerId(), playerId)) void this.makeOffer(peer, { force: true });
    }, RETRY_DELAY_MS);
    this.retryTimers.set(playerId, timer);
  }

  removePeer(playerId) {
    const peer = this.peers.get(playerId);
    if (!peer) return false;
    this.peers.delete(playerId);
    this.remoteSpeaking.delete(playerId);
    try {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.close();
    } catch {}
    try {
      if (peer.audio) {
        peer.audio.srcObject = null;
        peer.audio.remove();
      }
    } catch {}
    this.render();
    return true;
  }

  async makeOffer(peer, { force = false } = {}) {
    if (!this.active || !peer || peer.makingOffer) return false;
    if (!force && peer.offerSent) return false;
    if (peer.pc.signalingState !== 'stable') return false;
    peer.makingOffer = true;
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      peer.offerSent = true;
      return this.sendSignal(peer.playerId, LIVE_VOICE_SIGNAL_KINDS.OFFER, {
        description: safeDescription(peer.pc.localDescription),
      });
    } catch {
      this.setStatus(`VOICE NEGOTIATION FAILED WITH ${peer.displayName}`, true);
      return false;
    } finally {
      peer.makingOffer = false;
    }
  }

  async handleSignal(candidate) {
    const signal = normalizeIncomingVoiceSignal(candidate, { localPlayerId: this.localPlayerId() });
    if (!signal) return false;

    if (signal.kind === LIVE_VOICE_SIGNAL_KINDS.PTT_STATE) {
      this.remoteSpeaking.set(signal.fromPlayerId, signal.active === true);
      this.render();
      return true;
    }
    if (signal.kind === LIVE_VOICE_SIGNAL_KINDS.STOP) {
      this.removePeer(signal.fromPlayerId);
      return true;
    }
    if (!this.active) return false;

    const teammate = this.teammates().find((entry) => entry.playerId === signal.fromPlayerId) || {
      playerId: signal.fromPlayerId,
      displayName: signal.fromDisplayName,
    };
    const peer = this.ensurePeer(teammate);
    if (!peer) return false;

    try {
      if (signal.kind === LIVE_VOICE_SIGNAL_KINDS.READY) {
        if (shouldInitiateVoiceOffer(this.localPlayerId(), signal.fromPlayerId)) {
          peer.offerSent = false;
          await this.makeOffer(peer, { force: true });
        }
        return true;
      }
      if (signal.kind === LIVE_VOICE_SIGNAL_KINDS.OFFER) {
        if (peer.pc.signalingState !== 'stable') {
          try { await peer.pc.setLocalDescription({ type: 'rollback' }); } catch {}
        }
        await peer.pc.setRemoteDescription(signal.description);
        await this.flushCandidates(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSignal(signal.fromPlayerId, LIVE_VOICE_SIGNAL_KINDS.ANSWER, {
          description: safeDescription(peer.pc.localDescription),
        });
        return true;
      }
      if (signal.kind === LIVE_VOICE_SIGNAL_KINDS.ANSWER) {
        await peer.pc.setRemoteDescription(signal.description);
        await this.flushCandidates(peer);
        return true;
      }
      if (signal.kind === LIVE_VOICE_SIGNAL_KINDS.ICE_CANDIDATE) {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.candidate);
        else peer.pendingCandidates.push(signal.candidate);
        return true;
      }
    } catch {
      this.setStatus(`VOICE SIGNAL FAILED WITH ${peer.displayName}`, true);
      this.schedulePeerRetry(peer.playerId);
    }
    return false;
  }

  async flushCandidates(peer) {
    while (peer.pendingCandidates.length) {
      const candidate = peer.pendingCandidates.shift();
      await peer.pc.addIceCandidate(candidate);
    }
  }

  sendSignal(targetPlayerId, kind, details = {}) {
    if (!this.transport || !targetPlayerId) return false;
    return this.transport.sendControl(LIVE_VOICE_SIGNAL_ACTION, {
      targetPlayerId,
      kind,
      ...details,
    }) === true;
  }

  broadcastSignal(kind, details = {}) {
    let sent = 0;
    for (const teammate of this.teammates()) {
      if (this.sendSignal(teammate.playerId, kind, details)) sent += 1;
    }
    return sent;
  }

  setPttHeld(held) {
    const next = held === true && this.active === true;
    if (next === this.pttHeld) return next;
    this.pttHeld = next;
    if (this.localTrack) this.localTrack.enabled = next;
    this.broadcastSignal(LIVE_VOICE_SIGNAL_KINDS.PTT_STATE, { active: next });
    this.readiness?.setPttHeld?.(next);
    this.setStatus(next ? 'TRANSMITTING TO TEAM · RELEASE T TO MUTE' : 'LIVE VOICE READY · HOLD T TO TALK', false);
    this.render();
    return next;
  }

  onKeyDown(event) {
    if (event.code !== VOICE_PUSH_TO_TALK_CODE || event.repeat) return;
    if (!this.active || editableTarget(event.target)) return;
    event.preventDefault();
    this.setPttHeld(true);
  }

  onKeyUp(event) {
    if (event.code !== VOICE_PUSH_TO_TALK_CODE) return;
    if (!this.active) return;
    event.preventDefault();
    this.setPttHeld(false);
  }

  applyMutePreferences() {
    const snapshot = this.store?.getSnapshot?.();
    for (const [playerId, peer] of this.peers) {
      if (!peer.audio) continue;
      peer.audio.muted = snapshot?.muteAllVoice === true
        || snapshot?.mutedVoicePlayerIds?.includes?.(playerId) === true;
    }
  }

  renderMuteControls() {
    if (!this.playerSelect) return;
    const previous = this.playerSelect.value;
    const teammates = this.teammates();
    this.playerSelect.replaceChildren();
    if (!teammates.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No teammate available';
      this.playerSelect.appendChild(option);
    } else {
      teammates.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.playerId;
        option.textContent = this.store?.isVoicePlayerMuted?.(entry.playerId)
          ? `${entry.displayName} · MUTED`
          : entry.displayName;
        this.playerSelect.appendChild(option);
      });
      if (teammates.some((entry) => entry.playerId === previous)) this.playerSelect.value = previous;
    }
    const selectedId = this.playerSelect.value;
    const muted = selectedId && this.store?.isVoicePlayerMuted?.(selectedId);
    this.playerMuteButton.disabled = !selectedId;
    this.playerMuteButton.textContent = muted ? 'UNMUTE PLAYER' : 'MUTE PLAYER';
    this.playerMuteButton.style.opacity = selectedId ? '1' : '.55';
  }

  render() {
    if (!this.root) return;
    const availability = this.availability();
    this.root.style.display = this.roomAvailable() ? 'block' : 'none';
    if (this.startButton) {
      this.startButton.textContent = this.active ? 'STOP LIVE VOICE' : 'START LIVE VOICE';
      this.startButton.disabled = !availability.available && !this.active;
      this.startButton.style.opacity = this.startButton.disabled ? '.55' : '1';
    }
    this.renderMuteControls();
    this.applyMutePreferences();

    const connected = [...this.peers.values()].filter((peer) => peer.connected).length;
    const speakingNames = [...this.remoteSpeaking.entries()]
      .filter(([, active]) => active)
      .map(([playerId]) => this.peers.get(playerId)?.displayName || 'Teammate');
    if (this.peerStatus) {
      this.peerStatus.textContent = this.active
        ? `VOICE PEERS ${connected}/${this.teammates().length}${speakingNames.length ? ` · SPEAKING: ${speakingNames.join(', ')}` : ''}`
        : 'LIVE VOICE IS OFF';
    }
    if (this.status && !this.status.textContent) {
      this.setStatus(
        availability.available
          ? (this.store?.getSnapshot?.().voiceEnabled ? 'VOICE PREFERENCE SAVED · CLICK START' : availability.label)
          : availability.label,
        !availability.available && availability.reason !== 'offline'
      );
    }
  }

  setStatus(text, isError = false) {
    if (!this.status) return;
    this.status.textContent = String(text || '').slice(0, 220);
    this.status.style.color = isError ? '#ff8f8f' : '#8effb0';
  }

  rejectionText(reason) {
    const value = String(reason || '');
    if (value === 'target-unavailable') return 'VOICE PEER IS NO LONGER CONNECTED';
    if (value === 'invalid-target') return 'VOICE SIGNAL TARGET WAS REJECTED';
    if (value === 'invalid-signal') return 'VOICE SIGNAL WAS REJECTED';
    return 'VOICE SIGNALING IS NOT READY';
  }

  getSnapshot() {
    return Object.freeze({
      patch: LIVE_VOICE_PATCH,
      active: this.active,
      pttHeld: this.pttHeld,
      roomCode: this.lastRoomCode,
      localPlayerId: this.localPlayerId(),
      peerCount: this.peers.size,
      connectedPeerCount: [...this.peers.values()].filter((peer) => peer.connected).length,
      stunUrl: LIVE_VOICE_STUN_URL,
      serverReceivesAudio: false,
      availability: this.availability(),
    });
  }
}

const controller = new MultiplayerLiveVoice();
if (typeof window !== 'undefined') controller.initialize();
export { controller as multiplayerLiveVoice };
