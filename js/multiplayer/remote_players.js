// js/multiplayer/remote_players.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';
import {
  SURVIVOR_OPERATOR_PATCH,
  createRemoteOperatorRig,
} from '../actors/survivor_operator.js';

const PLAYER_EYE_HEIGHT = 1.65;

function colorFromId(THREE, id) {
  let hash = 0;
  const text = String(id || 'player');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.68, 0.55);
}

function makeLabelTexture(THREE, label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(3, 12, 18, 0.82)';
  ctx.fillRect(4, 20, 504, 88);
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 20, 504, 88);
  ctx.font = '700 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(label || 'PLAYER').slice(0, 24), 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    } else {
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    }
  });
}

function createAvatar(THREE, player) {
  const accentColor = colorFromId(THREE, player.playerId);
  const rig = createRemoteOperatorRig(THREE, { accentColor });
  const group = rig.group;
  group.name = `remote-player-${player.playerId}`;
  group.visible = false;
  group.userData.visualPatch = SURVIVOR_OPERATOR_PATCH;

  const labelTexture = makeLabelTexture(THREE, player.displayName);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTexture,
    transparent: true,
    depthTest: false,
  }));
  label.position.set(0, 2.18, 0);
  label.scale.set(2.05, 0.50, 1);
  group.add(label);

  group.userData.remote = {
    body: rig.body,
    head: rig.parts.head,
    legs: rig.legs,
    arms: rig.arms,
    weapon: rig.weapon,
    muzzleFlash: rig.muzzleFlash,
    muzzleFlashUntil: 0,
    lastWeaponKey: null,
    label,
  };

  return group;
}

function updateWeaponShape(avatar, weaponKey) {
  const weapon = avatar.userData.remote?.weapon;
  if (!weapon || weapon.userData.weaponKey === weaponKey) return;

  weapon.userData.weaponKey = weaponKey;
  const receiver = weapon.children[0];
  if (!receiver) return;

  const key = String(weaponKey || '').toLowerCase();
  if (key.includes('sniper')) {
    receiver.scale.set(0.82, 0.82, 1.45);
  } else if (key.includes('shotgun')) {
    receiver.scale.set(1.1, 1.0, 1.25);
  } else if (key.includes('smg')) {
    receiver.scale.set(0.9, 0.9, 0.82);
  } else if (key.includes('pistol')) {
    receiver.scale.set(0.7, 0.82, 0.58);
  } else {
    receiver.scale.set(1, 1, 1);
  }
}

export class RemotePlayerManager {
  constructor({ scene, eventBus, runtime, localPlayerId } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.localPlayerId = localPlayerId;
    this.THREE = globalThis.THREE || null;
    this.avatars = new Map();
    this.roomPlayers = new Map();
    this.unsubscribe = [];
    this.active = false;

    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, (event) => {
        this.syncRoom(event?.payload?.room);
      }) || (() => {})
    );

    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ACTION_RECEIVED, (event) => {
        const envelope = event?.payload?.envelope;
        if (envelope?.payload?.action === 'FIRE') {
          this.flashMuzzle(envelope.playerId);
        }
      }) || (() => {})
    );
  }

  beginRun() {
    this.active = true;
  }

  endRun() {
    this.active = false;
    this.avatars.forEach((avatar) => {
      avatar.visible = false;
    });
  }

  syncRoom(room) {
    if (!room?.players) return;

    const nextIds = new Set();
    room.players.forEach((player) => {
      if (!player?.playerId || player.playerId === this.localPlayerId) return;
      nextIds.add(player.playerId);
      this.roomPlayers.set(player.playerId, { ...player });

      if (!this.avatars.has(player.playerId)) {
        this.addPlayer(player);
      }
    });

    Array.from(this.avatars.keys()).forEach((playerId) => {
      if (!nextIds.has(playerId)) {
        this.removePlayer(playerId);
      }
    });
  }

  addPlayer(player) {
    if (!this.THREE || !this.scene || this.avatars.has(player.playerId)) return;
    const avatar = createAvatar(this.THREE, player);
    this.avatars.set(player.playerId, avatar);
    this.scene.add(avatar);
  }

  removePlayer(playerId) {
    const avatar = this.avatars.get(playerId);
    if (avatar) {
      avatar.parent?.remove(avatar);
      disposeObject(avatar);
    }
    this.avatars.delete(playerId);
    this.roomPlayers.delete(playerId);
    this.runtime?.removeRemotePlayer?.(playerId);
  }

  flashMuzzle(playerId) {
    const avatar = this.avatars.get(playerId);
    const remote = avatar?.userData?.remote;
    if (!remote) return;
    remote.muzzleFlashUntil = performance.now() + 72;
    remote.muzzleFlash.visible = true;
  }

  update(now = performance.now()) {
    if (!this.active) return;

    this.avatars.forEach((avatar, playerId) => {
      const playerRecord = this.roomPlayers.get(playerId);
      const sampled = this.runtime?.sampleRemotePlayer?.(playerId, now);
      if (!sampled?.state || playerRecord?.connected === false) {
        avatar.visible = false;
        return;
      }

      const state = sampled.state;
            const lifeState = String(
                state.lifeState
                || (state.alive === false ? 'DOWNED' : 'ACTIVE')
            );
            const isDowned = lifeState === 'DOWNED';
            const isSpectating = lifeState === 'SPECTATING';
            avatar.visible = !isSpectating;
      avatar.position.set(
        Number(state.position?.x || 0),
        Number(state.position?.y || PLAYER_EYE_HEIGHT) - PLAYER_EYE_HEIGHT,
        Number(state.position?.z || 0)
      );
      avatar.rotation.y = Number(state.yaw || 0);
            avatar.rotation.z = isDowned ? Math.PI * 0.5 : 0;
            const remote = avatar.userData.remote;
      if (remote) {
        remote.arms.rotation.x = Number(state.pitch || 0) * 0.72;
        remote.weapon.rotation.x = Number(state.pitch || 0) * 0.72;
        remote.weapon.position.y = state.isADS ? 1.34 : 1.25;
        remote.weapon.position.x = state.isADS ? 0.02 : 0.12;
        remote.body.scale.y = state.isSprinting ? 0.97 : 1;
        remote.arms.visible = !isDowned;
                remote.weapon.visible = !isDowned;
                remote.muzzleFlash.visible = (
                    !isDowned && now < remote.muzzleFlashUntil
                );
                updateWeaponShape(avatar, state.weaponKey);
      }
    });
  }

  getSnapshot() {
    return {
      active: this.active,
      remotePlayers: Array.from(this.avatars.keys())
    };
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    Array.from(this.avatars.keys()).forEach((playerId) => {
      this.removePlayer(playerId);
    });
  }
}
