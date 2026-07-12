// js/multiplayer/voice_readiness.js
import {
  VOICE_PUSH_TO_TALK_CODE,
  VOICE_READINESS_PATCH,
  VoiceReadinessStore,
  inspectVoiceEnvironment,
  voicePermissionErrorLabel,
} from './voice_readiness_core.js';

const PANEL_ID = 'ka-voice-readiness-panel';
const BUTTON_ID = 'ka-voice-readiness-button';
const LEVEL_TEST_MS = 5000;

function button(label, ariaLabel = label) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.setAttribute('aria-label', ariaLabel);
  Object.assign(element.style, {
    padding: '7px 9px', border: '1px solid rgba(89, 232, 255, .62)',
    borderRadius: '7px', background: '#073044', color: '#effcff',
    fontSize: '10px', fontWeight: '800', letterSpacing: '.04em', cursor: 'pointer',
  });
  return element;
}

function stopStream(stream) {
  try { stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
}

class VoiceReadinessController {
  constructor() {
    this.store = new VoiceReadinessStore();
    this.chat = null;
    this.button = null;
    this.panel = null;
    this.status = null;
    this.deviceSelect = null;
    this.enableButton = null;
    this.muteAllButton = null;
    this.levelFill = null;
    this.stream = null;
    this.audioContext = null;
    this.animationFrame = 0;
    this.testTimer = 0;
    this.opened = false;
    this.pttHeld = false;
    this.syncTimer = 0;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  initialize() {
    if (typeof document === 'undefined') return this.getSnapshot();
    this.ensurePanel();
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', () => this.setPttHeld(false));
    this.syncTimer = setInterval(() => this.attachToChat(), 300);
    this.attachToChat();
    this.render();
    try { window.KHADIJA_VOICE_READINESS = this; } catch {}
    return this.getSnapshot();
  }

  attachToChat() {
    const chat = window.KHADIJA_TEXT_CHAT || null;
    if (!chat?.root) return false;
    this.chat = chat;
    if (!this.button) {
      this.button = button('VOICE', 'Open co-op voice readiness');
      this.button.id = BUTTON_ID;
      Object.assign(this.button.style, {
        width: '68px', height: '42px', marginLeft: '6px',
        boxShadow: '0 0 15px rgba(0, 212, 255, .22)', pointerEvents: 'auto',
      });
      this.button.addEventListener('click', () => this.toggle());
      chat.root.appendChild(this.button);
    }
    const available = chat.getSnapshot?.().available === true;
    this.button.style.display = available ? 'inline-block' : 'none';
    if (!available && this.opened) this.close();
    return available;
  }

  ensurePanel() {
    if (this.panel) return;
    this.panel = document.createElement('section');
    this.panel.id = PANEL_ID;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Co-op voice readiness');
    Object.assign(this.panel.style, {
      position: 'fixed', left: '18px', bottom: '70px', zIndex: '78',
      width: 'min(430px, calc(100vw - 36px))', display: 'none', padding: '12px',
      border: '1px solid rgba(89, 232, 255, .72)', borderRadius: '12px',
      background: 'rgba(2, 10, 16, .97)', boxShadow: '0 0 24px rgba(0, 212, 255, .25)',
      color: '#effcff', fontFamily: 'system-ui, sans-serif', pointerEvents: 'auto',
    });

    const titleRow = document.createElement('div');
    Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', gap: '8px' });
    const title = document.createElement('strong');
    title.textContent = 'CO-OP VOICE READINESS';
    Object.assign(title.style, { flex: '1', color: '#74eaff', fontSize: '12px', letterSpacing: '.1em' });
    const closeButton = button('CLOSE');
    closeButton.addEventListener('click', () => this.close());
    titleRow.append(title, closeButton);

    const notice = document.createElement('p');
    notice.textContent = 'Setup only: live teammate audio is added in the next voice phase. No audio is recorded or sent by this screen.';
    Object.assign(notice.style, { margin: '9px 0', color: '#b8ced8', fontSize: '11px', lineHeight: '1.35' });

    this.status = document.createElement('div');
    Object.assign(this.status.style, {
      padding: '8px', borderRadius: '8px', background: 'rgba(0, 0, 0, .28)',
      color: '#ffe27a', fontSize: '11px', fontWeight: '800', letterSpacing: '.03em',
    });

    const deviceLabel = document.createElement('label');
    deviceLabel.textContent = 'MICROPHONE DEVICE';
    Object.assign(deviceLabel.style, { display: 'block', marginTop: '10px', color: '#8feeff', fontSize: '10px', fontWeight: '800' });
    this.deviceSelect = document.createElement('select');
    Object.assign(this.deviceSelect.style, {
      width: '100%', marginTop: '4px', padding: '8px', borderRadius: '8px',
      border: '1px solid rgba(89, 232, 255, .45)', background: '#061923', color: '#effcff',
    });
    this.deviceSelect.addEventListener('change', () => this.store.setSelectedDeviceId(this.deviceSelect.value));

    const controls = document.createElement('div');
    Object.assign(controls.style, { display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '10px' });
    const checkButton = button('CHECK / TEST MIC', 'Check microphone permission and test input level');
    checkButton.addEventListener('click', () => void this.checkMicrophone());
    this.enableButton = button('ENABLE VOICE LATER');
    this.enableButton.addEventListener('click', () => {
      const enabled = this.store.getSnapshot().voiceEnabled !== true;
      this.store.setVoiceEnabled(enabled);
      this.render();
    });
    this.muteAllButton = button('MUTE ALL VOICE');
    this.muteAllButton.addEventListener('click', () => {
      const muted = this.store.getSnapshot().muteAllVoice !== true;
      this.store.setMuteAllVoice(muted);
      this.render();
    });
    controls.append(checkButton, this.enableButton, this.muteAllButton);

    const level = document.createElement('div');
    Object.assign(level.style, {
      height: '8px', marginTop: '10px', borderRadius: '999px', overflow: 'hidden',
      background: 'rgba(255,255,255,.12)',
    });
    this.levelFill = document.createElement('div');
    Object.assign(this.levelFill.style, {
      width: '0%', height: '100%', background: 'linear-gradient(90deg, #52e5ff, #7dff9b)',
      transition: 'width 80ms linear',
    });
    level.appendChild(this.levelFill);

    const ptt = document.createElement('div');
    ptt.id = 'ka-voice-ptt-status';
    ptt.textContent = 'PTT INPUT TEST · HOLD T';
    Object.assign(ptt.style, {
      marginTop: '10px', padding: '8px', border: '1px solid rgba(255,255,255,.16)',
      borderRadius: '8px', textAlign: 'center', fontSize: '11px', fontWeight: '900', letterSpacing: '.08em',
    });

    this.panel.append(titleRow, notice, this.status, deviceLabel, this.deviceSelect, controls, level, ptt);
    document.body.appendChild(this.panel);
  }

  async enumerateMicrophones() {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return [];
    const devices = (await mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
    const previous = this.store.getSnapshot().selectedDeviceId;
    this.deviceSelect.replaceChildren();
    if (!devices.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No microphone found';
      this.deviceSelect.appendChild(option);
      return [];
    }
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      this.deviceSelect.appendChild(option);
    });
    if (devices.some((device) => device.deviceId === previous)) this.deviceSelect.value = previous;
    else this.store.setSelectedDeviceId(this.deviceSelect.value);
    return devices;
  }

  async checkMicrophone() {
    const environment = inspectVoiceEnvironment();
    if (!environment.canRequestMicrophone) {
      this.setStatus(environment.label, true);
      return false;
    }
    this.stopLevelTest();
    const selectedDeviceId = this.store.getSnapshot().selectedDeviceId;
    const audio = selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      await this.enumerateMicrophones();
      this.store.setVoiceEnabled(true);
      this.setStatus('MICROPHONE READY · LEVEL TEST RUNNING', false);
      this.startLevelTest(this.stream);
      this.testTimer = window.setTimeout(() => {
        this.stopLevelTest();
        this.setStatus('MICROPHONE READY · HOLD T TO TEST PTT INPUT', false);
      }, LEVEL_TEST_MS);
      this.render();
      return true;
    } catch (error) {
      this.setStatus(voicePermissionErrorLabel(error), true);
      this.stopLevelTest();
      return false;
    }
  }

  startLevelTest(stream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(values);
        const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
        if (this.levelFill) this.levelFill.style.width = `${Math.min(100, average * 1.8)}%`;
        this.animationFrame = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      if (this.levelFill) this.levelFill.style.width = '35%';
    }
  }

  stopLevelTest() {
    if (this.testTimer) clearTimeout(this.testTimer);
    this.testTimer = 0;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    stopStream(this.stream);
    this.stream = null;
    try { this.audioContext?.close?.(); } catch {}
    this.audioContext = null;
    if (this.levelFill) this.levelFill.style.width = '0%';
  }

  setStatus(text, isError = false) {
    if (!this.status) return;
    this.status.textContent = String(text || '');
    this.status.style.color = isError ? '#ff8f8f' : '#8effb0';
  }

  setPttHeld(held) {
    this.pttHeld = held === true;
    const element = document.getElementById('ka-voice-ptt-status');
    if (element) {
      element.textContent = this.pttHeld ? 'PTT INPUT ACTIVE · NOT TRANSMITTING YET' : 'PTT INPUT TEST · HOLD T';
      element.style.color = this.pttHeld ? '#8effb0' : '#effcff';
      element.style.borderColor = this.pttHeld ? '#6dff9f' : 'rgba(255,255,255,.16)';
    }
  }

  onKeyDown(event) {
    if (event.code !== VOICE_PUSH_TO_TALK_CODE || event.repeat) return;
    if (event.target instanceof Element && event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (!this.opened) return;
    event.preventDefault();
    this.setPttHeld(true);
  }

  onKeyUp(event) {
    if (event.code !== VOICE_PUSH_TO_TALK_CODE) return;
    if (!this.opened) return;
    event.preventDefault();
    this.setPttHeld(false);
  }

  open() {
    if (!this.attachToChat()) return false;
    this.opened = true;
    this.panel.style.display = 'block';
    this.render();
    void this.enumerateMicrophones().catch(() => {});
    try { document.exitPointerLock?.(); } catch {}
    return true;
  }

  close() {
    this.opened = false;
    this.panel.style.display = 'none';
    this.setPttHeld(false);
    this.stopLevelTest();
    return true;
  }

  toggle() { return this.opened ? (this.close(), false) : this.open(); }

  render() {
    const environment = inspectVoiceEnvironment();
    const snapshot = this.store.getSnapshot();
    if (this.enableButton) this.enableButton.textContent = snapshot.voiceEnabled ? 'VOICE ENABLED LATER' : 'ENABLE VOICE LATER';
    if (this.muteAllButton) this.muteAllButton.textContent = snapshot.muteAllVoice ? 'UNMUTE ALL VOICE' : 'MUTE ALL VOICE';
    if (this.status && !this.stream) this.setStatus(environment.label, !environment.supported);
  }

  getSnapshot() {
    return Object.freeze({
      patch: VOICE_READINESS_PATCH,
      opened: this.opened,
      pttHeld: this.pttHeld,
      environment: inspectVoiceEnvironment(),
      preferences: this.store.getSnapshot(),
      liveAudioTransport: false,
    });
  }
}

const controller = new VoiceReadinessController();
if (typeof window !== 'undefined') controller.initialize();
export { controller as multiplayerVoiceReadiness };
