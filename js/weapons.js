// js/weapons.js
import * as THREE from 'three';
import { camera, muzzleLight, mapMeshes, scene, addScreenShake, doors, openDoor, barricades, traps } from './map.js';
import { player } from './player.js';
import { activeEnemies, killEnemy } from './enemy.js';
import { updateAmmoHUD, showHitMarker, updateWeaponNameHUD, setInteractionPrompt, updateScoreHUD, spawnFloatingScore, updateHealthHUD } from './ui.js';
import { spawnBulletHole, spawnBloodBurst, spawnShell, spawnGunSmoke } from './particles.js'; 
import { playSound } from './audio.js';
import { ASSETS } from './main.js';

const ray = new THREE.Raycaster();
export let muzzleT = 0;
let fireCooldown = 0;
let flashVisibleT = 0;
const activeShops = [];

// ── MYSTERY BOX LOCATIONS ──
const BOX_SPAWNS = [
  new THREE.Vector3(8, 0.4, 0),
  new THREE.Vector3(-15, 0.4, 15),
  new THREE.Vector3(15, 0.4, -15),
  new THREE.Vector3(0, 0.4, 25),
  new THREE.Vector3(-10, 0.4, -20)
];
let currentBoxIndex = 0;

const WALL_SPAWNS = [
  new THREE.Vector3(-4, 0.4, -10),
  new THREE.Vector3(4, 0.4, -10),
  new THREE.Vector3(-12, 0.4, -5),
  new THREE.Vector3(12, 0.4, -5),
  new THREE.Vector3(0, 0.4, -20)
];

const AMMO_SPAWNS = [
  new THREE.Vector3(-8, 0.4, 0), new THREE.Vector3(12, 0.4, 12), 
  new THREE.Vector3(-15, 0.4, -10), new THREE.Vector3(0, 0.4, 15)
];

const HEALTH_SPAWNS = [
  new THREE.Vector3(-12, 0.4, 0), new THREE.Vector3(-12, 0.4, 15), 
  new THREE.Vector3(15, 0.4, -5), new THREE.Vector3(8, 0.4, -15)
];

const UPGRADE_SPAWNS = [
  new THREE.Vector3(0, 0.4, 8), new THREE.Vector3(15, 0.4, 15), 
  new THREE.Vector3(-15, 0.4, -15), new THREE.Vector3(-10, 0.4, 10)
];

// ── UNIVERSAL SHOP RELOCATOR ──
function relocateShop(shop, spawnList) {
  scene.remove(shop.mesh);
  const idx = activeShops.indexOf(shop);
  if (idx > -1) activeShops.splice(idx, 1);
  
  let newIdx = Math.floor(Math.random() * spawnList.length);
  // Guarantee it picks a different location than where it currently is
  while (spawnList.length > 1 && spawnList[newIdx].distanceTo(shop.pos) < 1.0) {
    newIdx = Math.floor(Math.random() * spawnList.length);
  }
  spawnShop(shop.type, spawnList[newIdx]);
}

// ── WEAPON DEFINITIONS ──
export const WEAPON_DEFS = {
  PISTOL: { 
    key: "PISTOL", name: "Starting Pistol", shootSound: 'shoot_pistol', damage: 22, maxAmmo: 8, fireRate: 0.25, isAutomatic: false, reloadDuration: 1.2, recoilZ: 0.05, recoilY: 0.02, cameraKick: 0.02, basePos: new THREE.Vector3(0.2, -0.2, -0.35), adsPos: new THREE.Vector3(0.0, -0.12, -0.25), isUpgraded: false, 
    buildMesh: () => clone3DAsset(ASSETS.weapons.pistol, new THREE.Vector3(0.15, 0.15, 0.15), null, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)) 
  },
  PISTOL_UPG: { 
    key: "PISTOL_UPG", name: "Mustang & Sally", shootSound: 'shoot_pistol', damage: 55, maxAmmo: 20, fireRate: 0.15, isAutomatic: true, reloadDuration: 0.9, recoilZ: 0.04, recoilY: 0.02, cameraKick: 0.02, basePos: new THREE.Vector3(0.2, -0.2, -0.35), adsPos: new THREE.Vector3(0.0, -0.12, -0.25), isUpgraded: true, 
    buildMesh: () => clone3DAsset(ASSETS.weapons.pistol, new THREE.Vector3(0.15, 0.15, 0.15), 0xffaa00, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)) 
  },
  RIFLE: { 
    key: "RIFLE", name: "Assault Rifle", shootSound: 'shoot_rifle', damage: 40, maxAmmo: 30, fireRate: 0.12, isAutomatic: true, reloadDuration: 1.8, recoilZ: 0.06, recoilY: 0.03, cameraKick: 0.025, 
    basePos: new THREE.Vector3(0.22, -0.14, -0.32), adsPos: new THREE.Vector3(0.0, -0.11, -0.22), isUpgraded: false, 
    buildMesh: () => clone3DAsset(
      ASSETS.weapons.rifle, 
      new THREE.Vector3(0.0015, 0.0015, 0.0015), 
      null, 
      new THREE.Vector3(0, 0, 0), 
      new THREE.Vector3(0, 0, -0.15),
      { left: new THREE.Vector3(-0.04, -0.05, -0.2), right: new THREE.Vector3(0.02, -0.08, 0.05) }
    ) 
  },
  RIFLE_UPG: { 
    key: "RIFLE_UPG", name: "Khadija's Fury", shootSound: 'shoot_rifle', damage: 95, maxAmmo: 60, fireRate: 0.09, isAutomatic: true, reloadDuration: 1.3, recoilZ: 0.04, recoilY: 0.02, cameraKick: 0.015, 
    basePos: new THREE.Vector3(0.22, -0.14, -0.32), adsPos: new THREE.Vector3(0.0, -0.11, -0.22), isUpgraded: true, 
    buildMesh: () => clone3DAsset(
      ASSETS.weapons.rifle, 
      new THREE.Vector3(0.0015, 0.0015, 0.0015), 
      0xff0044, 
      new THREE.Vector3(0, 0, 0), 
      new THREE.Vector3(0, 0, -0.15),
      { left: new THREE.Vector3(-0.04, -0.05, -0.2), right: new THREE.Vector3(0.02, -0.08, 0.05) }
    ) 
  },
  SMG: { 
    key: "SMG", name: "Tactical SMG", shootSound: 'shoot_rifle', damage: 22, maxAmmo: 40, fireRate: 0.08, isAutomatic: true, reloadDuration: 1.4, recoilZ: 0.03, recoilY: 0.015, cameraKick: 0.015, 
    basePos: new THREE.Vector3(0.18, -0.15, -0.25), adsPos: new THREE.Vector3(0.0, -0.1, -0.2), isUpgraded: false, 
    buildMesh: () => clone3DAsset(
      ASSETS.weapons.smg, 
      new THREE.Vector3(0.11, 0.11, 0.11), 
      null, 
      new THREE.Vector3(0, -Math.PI / 2, 0), 
      new THREE.Vector3(0, -0.02, 0.05), 
      { left: new THREE.Vector3(-0.03, -0.02, -0.02), right: new THREE.Vector3(0.03, -0.06, 0.08) } 
    ) 
  },
  SMG_UPG: { 
    key: "SMG_UPG", name: "The Shredder", shootSound: 'shoot_rifle', damage: 45, maxAmmo: 75, fireRate: 0.05, isAutomatic: true, reloadDuration: 1.0, recoilZ: 0.02, recoilY: 0.01, cameraKick: 0.01, 
    basePos: new THREE.Vector3(0.18, -0.15, -0.25), adsPos: new THREE.Vector3(0.0, -0.1, -0.2), isUpgraded: true, 
    buildMesh: () => clone3DAsset(
      ASSETS.weapons.smg, 
      new THREE.Vector3(0.11, 0.11, 0.11), 
      0x00ffaa, 
      new THREE.Vector3(0, -Math.PI / 2, 0), 
      new THREE.Vector3(0, -0.02, 0.05),
      { left: new THREE.Vector3(-0.03, -0.02, -0.02), right: new THREE.Vector3(0.03, -0.06, 0.08) }
    ) 
  },
  SHOTGUN: { 
    key: "SHOTGUN", name: "Pump Shotgun", shootSound: 'shoot_shotgun', damage: 35, maxAmmo: 7, fireRate: 0.85, isAutomatic: false, reloadDuration: 2.2, recoilZ: 0.15, recoilY: 0.05, cameraKick: 0.05, 
    basePos: new THREE.Vector3(0.18, -0.15, -0.3), adsPos: new THREE.Vector3(0.0, -0.12, -0.25), isUpgraded: false, 
    buildMesh: () => clone3DAsset(
      ASSETS.weapons.shotgun, 
      new THREE.Vector3(0.0009, 0.0009, 0.0009), 
      null, 
      new THREE.Vector3(0, Math.PI, 0), 
      new THREE.Vector3(0, -0.05, -0.15), 
      { left: new THREE.Vector3(-0.03, -0.04, -0.15), right: new THREE.Vector3(0.02, -0.08, 0.05) }
    ) 
  },
  SHOTGUN_UPG: { 
    key: "SHOTGUN_UPG", name: "The Boomstick", shootSound: 'shoot_shotgun', damage: 70, maxAmmo: 14, fireRate: 0.50, isAutomatic: true, reloadDuration: 1.6, recoilZ: 0.12, recoilY: 0.04, cameraKick: 0.04, 
    basePos: new THREE.Vector3(0.18, -0.15, -0.3), adsPos: new THREE.Vector3(0.0, -0.12, -0.25), isUpgraded: true, 
    buildMesh: () => clone3DAsset(
      ASSETS.weapons.shotgun, 
      new THREE.Vector3(0.0009, 0.0009, 0.0009), 
      0xaa00ff, 
      new THREE.Vector3(0, Math.PI, 0), 
      new THREE.Vector3(0, -0.05, -0.15),
      { left: new THREE.Vector3(-0.03, -0.04, -0.15), right: new THREE.Vector3(0.02, -0.08, 0.05) }
    ) 
  }
};

// ── 3D CLONING ENGINE ──
function clone3DAsset(originalScene, scaleVec, upgradeGlowColor = null, rotationOffset = null, positionOffset = null, handOffsets = null, forceCenter = false) {
  const group = new THREE.Group();
  
  if (!originalScene) {
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8), new THREE.MeshStandardMaterial({ color: upgradeGlowColor || 0x555555 }));
    group.add(fallback);
    return group;
  }

  const modelClone = originalScene.clone();

  if (forceCenter) {
    modelClone.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundingBox();
        const centerOffset = new THREE.Vector3();
        child.geometry.boundingBox.getCenter(centerOffset);
        child.geometry.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
      }
    });
  }

  modelClone.scale.copy(scaleVec);
  
  if (rotationOffset) {
    modelClone.rotation.set(rotationOffset.x, rotationOffset.y, rotationOffset.z);
  } else {
    modelClone.rotation.y = Math.PI; 
  }

  if (positionOffset) {
    modelClone.position.copy(positionOffset);
  }

  if (upgradeGlowColor !== null) {
    modelClone.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ color: upgradeGlowColor, emissive: upgradeGlowColor, emissiveIntensity: 0.6, roughness: 0.2 });
      }
    });
  } else {
    modelClone.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.metalness = 0.1; 
        child.material.roughness = 0.5;
        child.castShadow = false;       
        child.receiveShadow = false;
      }
    });
  }

  group.add(modelClone);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.8 });
  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), skinMat);
  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), skinMat);

  if (handOffsets) {
    leftHand.position.copy(handOffsets.left);
    rightHand.position.copy(handOffsets.right);
  } else {
    leftHand.position.set(0.06, -0.02, 0.1);    
    rightHand.position.set(-0.02, -0.06, 0.25); 
  }

  group.add(leftHand, rightHand);
  return group;
}

export function getActiveWeapon() { return player.inventory[player.currentWeaponIdx]; }

// ── INITIALIZE PROCEDURAL MAP SHOPS ──
export function buildGun() {
  player.inventory.forEach(w => camera.remove(w.meshGroup));
  activeShops.forEach(s => scene.remove(s.mesh));
  player.inventory = []; 
  activeShops.length = 0;

  const pistolDef = WEAPON_DEFS.PISTOL;
  player.inventory.push({ ...pistolDef, ammo: pistolDef.maxAmmo, reserve: pistolDef.maxAmmo * 3, reloading: false, reloadT: 0, meshGroup: pistolDef.buildMesh() });
  equipWeapon(0);

// ── SPAWN PROCEDURAL SHOPS (SAFE CENTRAL COORDINATES) ──
  spawnShop('AMMO', new THREE.Vector3(-8, 0.4, 0));
  spawnShop('MYSTERY_BOX', BOX_SPAWNS[currentBoxIndex]); // ◄── Dynamic Location
  
  // They are back!
  spawnShop('HEALTH', new THREE.Vector3(-12, 0.4, 0));
  spawnShop('UPGRADE', new THREE.Vector3(0, 0.4, 8));
  spawnShop('PERK_HEALTH', new THREE.Vector3(-8, 0.4, -8)); // Juggernog
  spawnShop('PERK_RELOAD', new THREE.Vector3(8, 0.4, 8));   // Speed Cola

  // ── NEW: WALL BUYS ──
  spawnShop('WALL_SMG', new THREE.Vector3(-4, 0.4, -10));
  spawnShop('WALL_SHOTGUN', new THREE.Vector3(4, 0.4, -10));
}

function spawnShop(type, position) {
  const g = new THREE.Group();
  let shopData = { type: type, mesh: g, pos: position.clone() };
  
  if (type === 'AMMO') {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x225522, roughness: 0.8 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.6), crateMat));
  } else if (type === 'MYSTERY_BOX') {
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x442211, roughness: 0.9 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.5 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.7), boxMat), new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8), glowMat));
    
    // ── MYSTERY BOX STATE RIGGING ──
    shopData.state = 'IDLE'; 
    shopData.timer = 0;
    shopData.cycleTimer = 0;
    shopData.finalWeapon = null;
    shopData.spinMesh = new THREE.Group();
    shopData.spinMesh.position.set(0, 1.2, 0); // Float above the box
    g.add(shopData.spinMesh);
  } else if (type === 'HEALTH') {
    const medMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x440000 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), medMat), new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.82, 0.1), crossMat), new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.4), crossMat));
  } else if (type === 'UPGRADE') {
    const machMat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.2 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xaa00ff, emissive: 0x6600aa, emissiveIntensity: 0.8 }); 
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.0), machMat);
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16), glowMat);
    roller.rotation.z = Math.PI / 2; roller.position.y = 0.5; g.add(base, roller);
  } else if (type === 'PERK_HEALTH' || type === 'PERK_RELOAD') {
    const machMat = new THREE.MeshStandardMaterial({ color: type === 'PERK_HEALTH' ? 0x880000 : 0x005500, roughness: 0.4 });
    const glowMat = new THREE.MeshStandardMaterial({ color: type === 'PERK_HEALTH' ? 0xff0000 : 0x00ff00, emissive: type === 'PERK_HEALTH' ? 0xaa0000 : 0x00aa00 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.8), machMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), glowMat);
    screen.position.set(0, 0.5, 0.41); base.position.y = 0.6; g.add(base, screen);
 } else if (type.startsWith('WALL_')) {
    const wKey = type.split('_')[1]; // Extracts "SMG" or "SHOTGUN"
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
    
    // Recycle the Mystery Box hologram to make a "Chalk Outline"
    const chalkMesh = getHologramMesh(wKey);
    chalkMesh.position.z = 0.15; 
    chalkMesh.position.y = 0.6;
    chalkMesh.scale.z = 0.001; // Flatten it completely against the blackboard!
    
    chalkMesh.traverse(child => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
      }
    });

    board.position.y = 0.6; 
    g.add(board, chalkMesh);
    shopData.weaponKey = wKey; // Save what weapon this wall holds
  }
  
  g.position.copy(position); scene.add(g);
  activeShops.push(shopData);
}

function equipWeapon(idx) {
  player.inventory.forEach(w => { if(w.meshGroup.parent) camera.remove(w.meshGroup); w.meshGroup.visible = false; });
  player.currentWeaponIdx = idx;
  const active = getActiveWeapon();
  active.meshGroup.visible = true;
  camera.add(active.meshGroup);
  updateAmmoHUD(active.ammo, active.reserve);
  updateWeaponNameHUD(active.name);
}

export function cycleWeapon() {
  if (player.inventory.length <= 1) return; 
  equipWeapon((player.currentWeaponIdx + 1) % player.inventory.length);
}

export function checkWorldInteractions(checkInteractionPressed = false) {
  if (!player.alive) return;

// ── REPAIRABLE BARRICADE INTERACTION TRACKER (PASTE HERE) ──
  let closestBarricade = null;
  let minBarricadeDist = 3.0;

  barricades.forEach(b => {
    const d = player.pos.distanceTo(b.pos);
    if (d < minBarricadeDist) {
      minBarricadeDist = d;
      closestBarricade = b;
    }
  });

  if (closestBarricade) {
    if (closestBarricade.currentPlanks < closestBarricade.maxPlanks) {
      setInteractionPrompt(true, `Hold [E] to repair barricade (+10 PTS)`);
      
      if (checkInteractionPressed) {
        closestBarricade.cooldown -= 0.016; 
        
        if (closestBarricade.cooldown <= 0) {
          closestBarricade.cooldown = 0.4; // Build speed timer limit
          
          // Add plank back physically
          const targetPlank = closestBarricade.planks[closestBarricade.currentPlanks];
          closestBarricade.plankGroup.add(targetPlank);
          closestBarricade.currentPlanks++;
          
          // Reward score progression
          player.score += 10;
          updateScoreHUD(player.score);
          spawnFloatingScore(10, false);
          playSound('reload', 0.5, true); 

          // Re-engage mathematical collision wall if it was previously wide open
          if (closestBarricade.currentPlanks === 1 && !walls.includes(closestBarricade.wallTracker)) {
            walls.push(closestBarricade.wallTracker);
          }
        }
      }
    } else {
      setInteractionPrompt(true, `BARRICADE IS FULLY REPAIRED`);
    }
return; // Halt other checks so shop prompts don't overlap
  }

  // ── TRAP INTERACTION TRACKER ──
  let closestTrap = null;
  let minTrapDist = 2.5;

  traps.forEach(t => {
    if (player.pos.distanceTo(t.pos) < minTrapDist) {
      minTrapDist = player.pos.distanceTo(t.pos);
      closestTrap = t;
    }
  });

  if (closestTrap) {
    if (closestTrap.state === 'READY') {
      setInteractionPrompt(true, `Press [E] to activate Electric Trap [1000 PTS]`);
      if (checkInteractionPressed) {
        if (player.score >= 1000) {
          player.score -= 1000; updateScoreHUD(player.score);
          closestTrap.state = 'ACTIVE'; closestTrap.timer = 15.0; // 15 sec duration
          closestTrap.field.visible = true; closestTrap.switchMesh.material.color.setHex(0x00ff00);
          playSound('hit', 1.0, false); 
        } else {
          setInteractionPrompt(true, `NOT ENOUGH POINTS!`);
        }
      }
    } else if (closestTrap.state === 'COOLDOWN') {
      setInteractionPrompt(true, `TRAP RECHARGING...`);
    }
    return; 
  }
  // ──────────────────────────────────────────────────────────

  let closestInteractable = null;
  let minShopDist = 2.5; 
  let minDoorDist = 7.0; 

  activeShops.forEach(s => { 
    const d = player.pos.distanceTo(s.pos); 
    if (d < minShopDist) { minShopDist = d; closestInteractable = { type: 'SHOP', data: s }; } 
  });
  
  if (!closestInteractable) {
    doors.forEach(d => { 
      const dist = player.pos.distanceTo(d.pos); 
      if (dist < minDoorDist) { minDoorDist = dist; closestInteractable = { type: 'DOOR', data: d }; } 
    });
  }

  if (closestInteractable) {
    if (closestInteractable.type === 'DOOR') {
      const doorCost = 750;
      const distToDoor = player.pos.distanceTo(closestInteractable.data.pos);
      
      if (distToDoor > 5.5) {
        setInteractionPrompt(true, `Energy Gate Locked [Cost: ${doorCost} PTS]`);
      } else {
        setInteractionPrompt(true, `Press [E] to open energy gate [${doorCost} PTS]`);
        
        if (checkInteractionPressed) {
          if (player.score >= doorCost) {
            player.score -= doorCost; updateScoreHUD(player.score);
            openDoor(closestInteractable.data);
            playSound('hit', 1.0, false); 
          } else {
            setInteractionPrompt(true, `NOT ENOUGH POINTS!`);
          }
        }
      }
    } 
    else if (closestInteractable.type === 'SHOP') {
      const closestShop = closestInteractable.data;
      const activeW = getActiveWeapon();

      // ── MYSTERY BOX LOGIC (FULLY ISOLATED) ──
      if (closestShop.type === 'MYSTERY_BOX') {
        if (closestShop.state === 'IDLE') {
          setInteractionPrompt(true, `Press [E] to buy Mystery Box [950 PTS]`);
          if (checkInteractionPressed) {
            if (player.score >= 950) {
              player.score -= 950; updateScoreHUD(player.score);
              closestShop.state = 'SPINNING';
              closestShop.timer = 4.0; // Spin duration
              playSound('hit', 0.8, false);
            } else {
              setInteractionPrompt(true, `NOT ENOUGH POINTS!`);
            }
          }
        } 
        else if (closestShop.state === 'READY') {
          setInteractionPrompt(true, `Press [E] to take ${closestShop.finalWeapon.name}`);
          if (checkInteractionPressed) {
            const rolledDef = closestShop.finalWeapon;
            const existingGunIdx = player.inventory.findIndex(w => w.key === rolledDef.key || w.key === rolledDef.key + "_UPG");
            
            if (existingGunIdx !== -1) {
              player.inventory[existingGunIdx].ammo = player.inventory[existingGunIdx].maxAmmo;
              player.inventory[existingGunIdx].reserve = player.inventory[existingGunIdx].maxAmmo * 3;
              equipWeapon(existingGunIdx);
            } else {
              player.inventory.push({ ...rolledDef, ammo: rolledDef.maxAmmo, reserve: rolledDef.maxAmmo * 3, reloading: false, reloadT: 0, meshGroup: rolledDef.buildMesh() });
              equipWeapon(player.inventory.length - 1);
            }
            
			closestShop.spinMesh.clear();
            closestShop.state = 'IDLE';
            playSound('reload', 0.8, false);
            
            // NEW: Instantly relocate the box after the player grabs the gun!
            relocateShop(closestShop, BOX_SPAWNS);
          }
        } 
        else {
          // Currently SPINNING - disable prompts
          setInteractionPrompt(false);
        }
        
        return; 
      }

      // ── STANDARD SHOP LOGIC (AMMO, PERKS, ETC) ──
// ── STANDARD SHOP LOGIC (AMMO, PERKS, WALL BUYS) ──
      let cost = 0; let shopName = "";
      const isWallBuy = closestShop.type.startsWith('WALL_');
      let hasWallWeapon = false;

      // Dynamically check if they already own the Wall-Buy weapon
      if (isWallBuy) {
        hasWallWeapon = player.inventory.some(w => w.key === closestShop.weaponKey || w.key === closestShop.weaponKey + "_UPG");
        cost = hasWallWeapon ? 500 : 1000;
        shopName = hasWallWeapon ? `${closestShop.weaponKey} Ammo` : `Wall ${closestShop.weaponKey}`;
      }
      else if (closestShop.type === 'AMMO') { cost = 500; shopName = "Max Ammo"; }
      else if (closestShop.type === 'HEALTH') { cost = 300; shopName = "Medkit"; }
      else if (closestShop.type === 'UPGRADE') { cost = 5000; shopName = "Pack-a-Punch"; }
      else if (closestShop.type === 'PERK_HEALTH') { cost = 2500; shopName = "Juggernog"; }
      else if (closestShop.type === 'PERK_RELOAD') { cost = 3000; shopName = "Speed Cola"; }

      if (closestShop.type === 'HEALTH' && player.health >= player.maxHealth) { setInteractionPrompt(true, `HEALTH IS ALREADY FULL!`); } 
      else if (closestShop.type === 'UPGRADE' && activeW.isUpgraded) { setInteractionPrompt(true, `WEAPON ALREADY UPGRADED!`); } 
      else if (closestShop.type === 'PERK_HEALTH' && player.maxHealth >= 250) { setInteractionPrompt(true, `ALREADY HAVE JUGGERNOG!`); } 
      else if (closestShop.type === 'PERK_RELOAD' && player.reloadMult <= 0.5) { setInteractionPrompt(true, `ALREADY HAVE SPEED COLA!`); } 
      else {
        setInteractionPrompt(true, `Press [E] to buy ${shopName} [${cost} PTS]`);
        
        if (checkInteractionPressed) {
          if (player.score >= cost) {
            player.score -= cost; updateScoreHUD(player.score);
            playSound('hit', 0.8, false); 
            
            if (isWallBuy) {
              if (hasWallWeapon) {
                const wIdx = player.inventory.findIndex(w => w.key === closestShop.weaponKey || w.key === closestShop.weaponKey + "_UPG");
                player.inventory[wIdx].ammo = player.inventory[wIdx].maxAmmo;
                player.inventory[wIdx].reserve = player.inventory[wIdx].maxAmmo * 3;
                equipWeapon(wIdx);
              } else {
                const def = WEAPON_DEFS[closestShop.weaponKey];
                player.inventory.push({ ...def, ammo: def.maxAmmo, reserve: def.maxAmmo * 3, reloading: false, reloadT: 0, meshGroup: def.buildMesh() });
                equipWeapon(player.inventory.length - 1);
              }
            }
            else if (closestShop.type === 'AMMO') {
              activeW.ammo = activeW.maxAmmo; activeW.reserve = activeW.maxAmmo * 3;
              updateAmmoHUD(activeW.ammo, activeW.reserve); 
            } 
            else if (closestShop.type === 'HEALTH') {
              player.health = player.maxHealth; updateHealthHUD(player.health, player.maxHealth); 
            }
            else if (closestShop.type === 'PERK_HEALTH') {
              player.maxHealth = 250; player.health = 250; updateHealthHUD(player.health, player.maxHealth); 
            }
            else if (closestShop.type === 'PERK_RELOAD') {
              player.reloadMult = 0.5;
            }
			else if (closestShop.type === 'UPGRADE') {
              const upgKey = activeW.key + "_UPG";
              const upgDef = WEAPON_DEFS[upgKey];
              camera.remove(activeW.meshGroup);
              player.inventory[player.currentWeaponIdx] = { 
                ...upgDef, ammo: upgDef.maxAmmo, reserve: upgDef.maxAmmo * 3, reloading: false, reloadT: 0, meshGroup: upgDef.buildMesh() 
              };
              equipWeapon(player.currentWeaponIdx);
            }
            
// ── INSTANTLY RELOCATE SHOPS AFTER USE ──
            if (isWallBuy) relocateShop(closestShop, WALL_SPAWNS);
            else if (closestShop.type === 'AMMO') relocateShop(closestShop, AMMO_SPAWNS);
            else if (closestShop.type === 'HEALTH') relocateShop(closestShop, HEALTH_SPAWNS);
            else if (closestShop.type === 'UPGRADE') relocateShop(closestShop, UPGRADE_SPAWNS);
            
          } else {
            setInteractionPrompt(true, `NOT ENOUGH POINTS!`);
          }
        }
      }
    }
  } else { setInteractionPrompt(false); }
}

export function giveMaxAmmo() {
  player.inventory.forEach(w => { w.ammo = w.maxAmmo; w.reserve = w.maxAmmo * 3; });
  const active = getActiveWeapon();
  updateAmmoHUD(active.ammo, active.reserve);
}

export function resetGunState() { fireCooldown = 0; buildGun(); document.getElementById('reload-wrap').style.display = 'none'; }

// ── SHOOTING SYSTEM ──
export function shoot() {
  const w = getActiveWeapon();
  if (!player.alive || w.reloading || fireCooldown > 0) return;
  if (w.ammo <= 0) { startReload(); return; }
  
  w.ammo--; updateAmmoHUD(w.ammo, w.reserve); fireCooldown = w.fireRate;
  playSound(w.shootSound, w.name.includes("Pump") ? 1.0 : 0.6, true); 
  const shake = w.name.includes("Pump") ? 0.20 : (w.isUpgraded ? 0.12 : 0.05);
  addScreenShake(shake);
  
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); spawnShell(player.pos, dir);

  muzzleT = 0.09; muzzleLight.intensity = w.name.includes("Pump") ? 7.0 : 4.5;
  muzzleLight.color.setHex(w.isUpgraded ? 0xdd00ff : 0xffaa00); 

  flashVisibleT = 0.04; 
  const flashMesh = w.meshGroup.getObjectByName("muzzleFlashMesh");
  if (flashMesh) {
    flashMesh.visible = true;
    const worldTipPos = new THREE.Vector3(); flashMesh.getWorldPosition(worldTipPos); spawnGunSmoke(worldTipPos, dir);
  }
  
  _recoilZ += w.recoilZ; _recoilY += w.recoilY; player.pitch += w.cameraKick; player.yaw += (Math.random() - 0.5) * w.cameraKick * 0.5;

// We map the active enemies and check recursively (true) to bypass the laggy array rebuilding!
  const enemyGroups = activeEnemies.map(e => e.mesh);
  const hitTargets = [...enemyGroups, ...mapMeshes];
  
  // ── SHOTGUN BUG FIX: Check by key instead of name! ──
  if (w.key.includes("SHOTGUN")) {
    const pelletCount = w.isUpgraded ? 12 : 8; 
    for (let i = 0; i < pelletCount; i++) {
      const spread = new THREE.Vector2((Math.random() - 0.5) * 0.045, (Math.random() - 0.5) * 0.045);
      ray.setFromCamera(spread, camera);
      // The 'true' flag tells the engine to check inside the models automatically!
      const hits = ray.intersectObjects(hitTargets, true);
      if (hits.length) processHit(hits[0]);
    }
  } else {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = ray.intersectObjects(hitTargets, true);
    if (hits.length) processHit(hits[0]);
  }
  
  if (w.ammo <= 0) startReload();
}

function processHit(hit) {
  const e = hit.object.userData.eRef;
  
  if (e && e.alive) {
    let hs = hit.object.userData.isHead;
    
    // GLTF HEIGHT-BASED HEADSHOT DETECTION
    if (!hs) {
      const hitHeight = hit.point.y - e.mesh.position.y;
      const headThreshold = e.type === "GOLIATH" ? 3.8 : 2.00;
      if (hitHeight > headThreshold) {
        hs = true;
      }
    }

    const w = getActiveWeapon();
    const baseDamage = w.damage; 
    const isInstaKill = player.instaKillTimer > 0;
    
const finalDamage = isInstaKill ? 9999 : (hs ? baseDamage * 3 : baseDamage);
    e.health -= finalDamage; 
    
    // ── ECONOMY FIX: 10 points for hits, bonus points only on KILL ──
    let pointsAwarded = 10; // Standard non-lethal hit
    if (e.health <= 0) {
      pointsAwarded = hs ? 100 : 50; // 100 for Headshot Kill, 50 for Body Kill
    }
    
    if (player.doublePointsTimer > 0) pointsAwarded *= 2; 
    
    player.score = (player.score || 0) + pointsAwarded; 
    spawnFloatingScore(pointsAwarded, e.health <= 0 && hs); // Only show gold text on Headshot Kill
    updateScoreHUD(player.score);

    showHitMarker(); playSound('hit', 0.4, true); spawnBloodBurst(hit.point);
    
    if (e.health <= 0) {
      if (e.type === "GOLIATH") {
        let bossBounty = 1000;
        if (player.doublePointsTimer > 0) bossBounty *= 2; 
        player.score += bossBounty; updateScoreHUD(player.score); spawnFloatingScore(bossBounty, false);
      }
      killEnemy(e);
    }
  } else if (!e) {
    spawnBulletHole(hit.point, hit.face.normal);
  }
}

export function startReload() {
  const w = getActiveWeapon();
  if (w.reloading || w.ammo === w.maxAmmo || w.reserve <= 0) return;
  playSound('reload', 0.8, false); 
  w.reloading = true; 
  w.reloadT = w.reloadDuration * player.reloadMult; 
  document.getElementById('reload-wrap').style.display = 'block';
}

export function processReloadTick(dt) {
  const w = getActiveWeapon();
  if (!w || !w.reloading) return;
  w.reloadT -= dt;
  document.getElementById('reload-bar').style.width = Math.min(100, (1 - w.reloadT / w.reloadDuration) * 100) + '%';
  if (w.reloadT <= 0) {
    const need = w.maxAmmo - w.ammo; const give = Math.min(need, w.reserve);
    w.ammo += give; w.reserve -= give; w.reloading = false; 
    document.getElementById('reload-wrap').style.display = 'none'; updateAmmoHUD(w.ammo, w.reserve);
  }
}

let _recoilZ = 0, _recoilY = 0, bobT = 0; 
const _currentGunTarget = new THREE.Vector3();

export function updateGun(dt, keys, isMoving) {
  if (player.instaKillTimer > 0) player.instaKillTimer -= dt;
  if (player.doublePointsTimer > 0) player.doublePointsTimer -= dt;

  const w = getActiveWeapon(); if (!w) return;
  if (fireCooldown > 0) fireCooldown -= dt;

  const targetPos = player.isADS ? w.adsPos.clone() : w.basePos.clone();
  const targetRot = new THREE.Vector3(0, 0, 0);

  if (w.reloading) {
    const totalTime = w.reloadDuration * player.reloadMult;
    const progress = 1.0 - (w.reloadT / totalTime);
    
    const dip = Math.sin(progress * Math.PI); 
    const twist = Math.sin(progress * Math.PI * 2); 

    targetPos.y -= dip * 0.15;
    targetPos.x += dip * 0.1;
    targetPos.z += dip * 0.05;

    targetRot.z = dip * (Math.PI / 4); 
    targetRot.x = dip * (Math.PI / 6); 
    targetRot.y = twist * 0.08;        
  } 
  else if (isMoving && !player.isADS) { 
    const bobSpeed = player.isSprinting ? 11 : 7; 
    const bobAmount = player.isSprinting ? 0.025 : 0.013;
    bobT += dt * bobSpeed; 
    targetPos.y += Math.sin(bobT) * bobAmount; 
    targetPos.x += Math.cos(bobT * 0.5) * (bobAmount * 0.5); 
  } else { 
    bobT = 0; 
  }

  _currentGunTarget.lerp(targetPos, dt * 12);
  _recoilZ += (0 - _recoilZ) * 12 * dt; 
  _recoilY += (0 - _recoilY) * 12 * dt;
  w.meshGroup.position.set(_currentGunTarget.x, _currentGunTarget.y + _recoilY, _currentGunTarget.z + _recoilZ);

  w.meshGroup.rotation.x += (targetRot.x - w.meshGroup.rotation.x) * 15 * dt;
  w.meshGroup.rotation.y += (targetRot.y - w.meshGroup.rotation.y) * 15 * dt;
  w.meshGroup.rotation.z += (targetRot.z - w.meshGroup.rotation.z) * 15 * dt;

  if (muzzleT > 0) { 
    muzzleT -= dt; muzzleLight.intensity = Math.max(0, (muzzleT / 0.09) * 4.5);
    if (muzzleT <= 0) muzzleLight.intensity = 0; 
  }
  if (flashVisibleT > 0) {
    flashVisibleT -= dt;
    if (flashVisibleT <= 0) {
      const flashMesh = w.meshGroup.getObjectByName("muzzleFlashMesh");
      if (flashMesh) flashMesh.visible = false; 
    }
  }

  if (w.isAutomatic && keys['MousedownLeft'] && player.alive && !w.reloading) { shoot(); }
  updateCrosshair(dt, isMoving);
}

function updateCrosshair(dt, isMoving) {
  const chUI = document.getElementById('crosshair');
  if (player.isADS) { chUI.style.opacity = '0'; return; }
  chUI.style.opacity = '1';
  let targetGap = getActiveWeapon()?.name.includes("Pump") ? 28 : 15; 
  if (player.isSprinting && isMoving) targetGap += 15; else if (isMoving) targetGap += 7;
  if (muzzleT > 0) targetGap += 18; 
  let currentGap = parseFloat(getComputedStyle(chUI).getPropertyValue('--gap')) || 15;
  currentGap += (targetGap - currentGap) * dt * 15; chUI.style.setProperty('--gap', currentGap + 'px');
}

// ── MYSTERY BOX ANIMATION SYSTEM ──
export function updateShops(dt) {
  activeShops.forEach(shop => {
    if (shop.type === 'MYSTERY_BOX') {
      if (shop.state === 'SPINNING') {
        shop.timer -= dt;
        shop.cycleTimer -= dt;
        
        // Spin the hologram
        shop.spinMesh.rotation.y += dt * 8.0; 
        shop.spinMesh.position.y = 1.2 + Math.sin(Date.now() * 0.01) * 0.15; 
        
        // Cycle the random weapons every 0.12 seconds
        if (shop.cycleTimer <= 0) {
          shop.cycleTimer = 0.12;
          shop.spinMesh.clear();
          
          const wKeys = ["RIFLE", "SMG", "SHOTGUN"];
          const randKey = wKeys[Math.floor(Math.random() * wKeys.length)];
          shop.spinMesh.add(getHologramMesh(randKey));
          playSound('shoot_pistol', 0.05, false); 
        }
        
        // When the 4 second spin ends, roll for a gun or a Teddy Bear
        if (shop.timer <= 0) {
          // 15% Chance to roll the Teddy Bear!
          if (Math.random() < 0.15) {
            shop.state = 'TEDDY';
            shop.timer = 3.5; 
            shop.spinMesh.clear();
            shop.spinMesh.add(getTeddyMesh());
            playSound('hurt', 0.5, false); // Proxy for a sinister laugh
          } else {
            // Roll a final weapon
            shop.state = 'READY';
            shop.timer = 12.0; 
            shop.spinMesh.clear();
            
            const wKeys = ["RIFLE", "SMG", "SHOTGUN"];
            const finalKey = wKeys[Math.floor(Math.random() * wKeys.length)];
            shop.finalWeapon = WEAPON_DEFS[finalKey];
            
            const finalMesh = getHologramMesh(finalKey);
            finalMesh.traverse((child) => {
              if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.5 });
            });
            shop.spinMesh.add(finalMesh);
            playSound('reload', 1.0, false); 
          }
        }
      } 
      // ── TEDDY BEAR TELEPORT SEQUENCE ──
      else if (shop.state === 'TEDDY') {
        shop.timer -= dt;
        shop.spinMesh.position.y += dt * 0.5; // Float up into the air
        shop.spinMesh.rotation.y += dt * 6.0; // Spin violently
        
        if (shop.timer <= 0) {
          import('./player.js').then(({ player }) => {
            player.score += 950; // Refund the player
            import('./ui.js').then(({ updateScoreHUD, spawnFloatingScore }) => {
              updateScoreHUD(player.score);
              spawnFloatingScore(950, false);
            });
          });
          
          // Delete old box
          scene.remove(shop.mesh);
          activeShops.splice(activeShops.indexOf(shop), 1);
          
          // Move to a new valid location
          let newIdx = currentBoxIndex;
          while (newIdx === currentBoxIndex) { newIdx = Math.floor(Math.random() * BOX_SPAWNS.length); }
          currentBoxIndex = newIdx;
          spawnShop('MYSTERY_BOX', BOX_SPAWNS[currentBoxIndex]);
        }
      }
      else if (shop.state === 'READY') {
        shop.timer -= dt;
        shop.spinMesh.rotation.y += dt * 1.5; 
        shop.spinMesh.position.y = 1.2 + Math.sin(Date.now() * 0.003) * 0.1;
        
        if (shop.timer <= 0) {
          shop.state = 'IDLE'; 
          shop.spinMesh.clear();
        }
      }
    }
  });
}

function getHologramMesh(key) {
  let clone = null;
  if (key === 'RIFLE' && ASSETS.weapons.rifle) {
    clone = ASSETS.weapons.rifle.clone();
    clone.scale.set(0.0015, 0.0015, 0.0015);
  } else if (key === 'SMG' && ASSETS.weapons.smg) {
    clone = ASSETS.weapons.smg.clone();
    clone.scale.set(0.11, 0.11, 0.11);
  } else if (key === 'SHOTGUN' && ASSETS.weapons.shotgun) {
    clone = ASSETS.weapons.shotgun.clone();
    clone.scale.set(0.0009, 0.0009, 0.0009);
  }
  
  if (!clone) return new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.6));
  
clone.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaee, emissiveIntensity: 0.8, wireframe: true });
    }
  });
  return clone;
}

// ── PROCEDURAL TEDDY BEAR ──
function getTeddyMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 1.0 });
  
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.2), mat);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat);
  head.position.y = 0.25;
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat);
  earL.position.set(-0.12, 0.35, 0);
  const earR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat);
  earR.position.set(0.12, 0.35, 0);
  
  g.add(body, head, earL, earR);
  return g;
}