// js/weapons.js
import { camera, muzzleLight, mapMeshes, scene, addScreenShake, doors, openDoor } from './map.js';
import { player } from './player.js';
import { eMeshList, killEnemy } from './enemy.js';
import { updateAmmoHUD, showHitMarker, updateWeaponNameHUD, setInteractionPrompt, updateScoreHUD, spawnFloatingScore, updateHealthHUD } from './ui.js';
import { spawnBulletHole, spawnBloodBurst, spawnShell, spawnGunSmoke } from './particles.js'; 
import { playSound } from './audio.js';

const ray = new THREE.Raycaster();
export let muzzleT = 0;
let fireCooldown = 0;
let flashVisibleT = 0;
const activeShops = [];

// ── WEAPON DEFINITIONS (NOW WITH DAMAGE AND UPGRADED VARIANTS) ──
export const WEAPON_DEFS = {
  // BASE WEAPONS
  SMG: { key: "SMG", name: "Tactical SMG", shootSound: 'shoot_rifle', damage: 22, maxAmmo: 40, fireRate: 0.08, isAutomatic: true, reloadDuration: 1.4, recoilZ: 0.03, recoilY: 0.015, cameraKick: 0.015, basePos: new THREE.Vector3(0.18, -0.2, -0.3), adsPos: new THREE.Vector3(0.0, -0.1, -0.2), isUpgraded: false, buildMesh: () => buildRifleMesh(false) },
  PISTOL: { key: "PISTOL", name: "Plasma Pistol", shootSound: 'shoot_pistol', damage: 45, maxAmmo: 12, fireRate: 0.22, isAutomatic: false, reloadDuration: 1.2, recoilZ: 0.06, recoilY: 0.03, cameraKick: 0.04, basePos: new THREE.Vector3(0.16, -0.18, -0.28), adsPos: new THREE.Vector3(0.0, -0.105, -0.22), isUpgraded: false, buildMesh: () => buildPistolMesh(false) },
  RIFLE: { key: "RIFLE", name: "Assault Rifle", shootSound: 'shoot_rifle', damage: 35, maxAmmo: 30, fireRate: 0.11, isAutomatic: true, reloadDuration: 1.8, recoilZ: 0.04, recoilY: 0.015, cameraKick: 0.025, basePos: new THREE.Vector3(0.21, -0.21, -0.36), adsPos: new THREE.Vector3(0.0, -0.098, -0.25), isUpgraded: false, buildMesh: () => buildRifleMesh(false) },
  SHOTGUN: { key: "SHOTGUN", name: "Pump Shotgun", shootSound: 'shoot_shotgun', damage: 22, maxAmmo: 6, fireRate: 0.85, isAutomatic: false, reloadDuration: 2.5, recoilZ: 0.16, recoilY: 0.06, cameraKick: 0.09, basePos: new THREE.Vector3(0.23, -0.25, -0.4), adsPos: new THREE.Vector3(0.0, -0.12, -0.28), isUpgraded: false, buildMesh: () => buildShotgunMesh(false) },

  // UPGRADED PACK-A-PUNCH VARIANTS (Massive stat boosts, full auto, purple visuals)
  PISTOL_UPG: { key: "PISTOL_UPG", name: "Void Blaster", shootSound: 'shoot_pistol', damage: 130, maxAmmo: 24, fireRate: 0.12, isAutomatic: true, reloadDuration: 0.8, recoilZ: 0.04, recoilY: 0.02, cameraKick: 0.02, basePos: new THREE.Vector3(0.16, -0.18, -0.28), adsPos: new THREE.Vector3(0.0, -0.105, -0.22), isUpgraded: true, buildMesh: () => buildPistolMesh(true) },
  RIFLE_UPG: { key: "RIFLE_UPG", name: "Dark Matter AR", shootSound: 'shoot_rifle', damage: 85, maxAmmo: 60, fireRate: 0.07, isAutomatic: true, reloadDuration: 1.2, recoilZ: 0.02, recoilY: 0.01, cameraKick: 0.015, basePos: new THREE.Vector3(0.21, -0.21, -0.36), adsPos: new THREE.Vector3(0.0, -0.098, -0.25), isUpgraded: true, buildMesh: () => buildRifleMesh(true) },
  SMG_UPG: { key: "SMG_UPG", name: "The Shredder", shootSound: 'shoot_rifle', damage: 45, maxAmmo: 75, fireRate: 0.05, isAutomatic: true, reloadDuration: 1.0, recoilZ: 0.02, recoilY: 0.01, cameraKick: 0.01, basePos: new THREE.Vector3(0.18, -0.2, -0.3), adsPos: new THREE.Vector3(0.0, -0.1, -0.2), isUpgraded: true, buildMesh: () => buildRifleMesh(true) }, 
  SHOTGUN_UPG: { key: "SHOTGUN_UPG", name: "Oblivion Pump", shootSound: 'shoot_shotgun', damage: 65, maxAmmo: 16, fireRate: 0.35, isAutomatic: true, reloadDuration: 1.5, recoilZ: 0.10, recoilY: 0.04, cameraKick: 0.05, basePos: new THREE.Vector3(0.23, -0.25, -0.4), adsPos: new THREE.Vector3(0.0, -0.12, -0.28), isUpgraded: true, buildMesh: () => buildShotgunMesh(true) }

};

export function getActiveWeapon() { return player.inventory[player.currentWeaponIdx]; }

// ── INITIALIZE MAP SHOPS ──
export function buildGun() {
  player.inventory.forEach(w => camera.remove(w.meshGroup));
  activeShops.forEach(s => scene.remove(s.mesh));
  player.inventory = []; activeShops.length = 0;

  const pistolDef = WEAPON_DEFS.PISTOL;
  player.inventory.push({ ...pistolDef, ammo: pistolDef.maxAmmo, reserve: pistolDef.maxAmmo * 3, reloading: false, reloadT: 0, meshGroup: pistolDef.buildMesh() });
  equipWeapon(0);

 // Inside buildGun() in js/weapons.js:
  spawnShop('AMMO', new THREE.Vector3(-20, 0.4, 20));        
  spawnShop('HEALTH', new THREE.Vector3(20, 0.4, 20)); 
  
  // ── NEW: PERKS & WALL BUYS ──
  spawnShop('WALL_SMG', new THREE.Vector3(0, 1.0, 20)); // Spawned flat against a wall in the outer ring!
  spawnShop('PERK_HEALTH', new THREE.Vector3(-20, 0.4, -20)); // Juggernog
  spawnShop('PERK_RELOAD', new THREE.Vector3(20, 0.4, -20));  // Speed Cola
  
  // Vault
  spawnShop('MYSTERY_BOX', new THREE.Vector3(4, 0.4, 0)); 
  spawnShop('UPGRADE', new THREE.Vector3(-4, 0.4, 0));
}

function spawnShop(type, position) {
  const g = new THREE.Group();
  
  if (type === 'AMMO') {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x225522, roughness: 0.8 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.6), crateMat));
  } else if (type === 'MYSTERY_BOX') {
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x442211, roughness: 0.9 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.5 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.7), boxMat), new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8), glowMat));
  } else if (type === 'HEALTH') {
    const medMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x440000 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), medMat), new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.82, 0.1), crossMat), new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.4), crossMat));
  } else if (type === 'UPGRADE') {
    // ── UPGRADE MACHINE VISUALS ──
    const machMat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.2 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xaa00ff, emissive: 0x6600aa, emissiveIntensity: 0.8 }); // Purple Core
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.0), machMat);
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16), glowMat);
    roller.rotation.z = Math.PI / 2;
    roller.position.y = 0.5;
    g.add(base, roller);
  }
// Inside spawnShop() in js/weapons.js, add these before the final g.position.copy(position):
  else if (type === 'PERK_HEALTH') {
    const machMat = new THREE.MeshStandardMaterial({ color: 0x880000, roughness: 0.4 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.8), machMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), glowMat);
    screen.position.set(0, 0.5, 0.41); base.position.y = 0.6;
    g.add(base, screen);
  } 
  else if (type === 'PERK_RELOAD') {
    const machMat = new THREE.MeshStandardMaterial({ color: 0x005500, roughness: 0.4 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00aa00 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.8), machMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), glowMat);
    screen.position.set(0, 0.5, 0.41); base.position.y = 0.6;
    g.add(base, screen);
  }
  else if (type === 'WALL_SMG') {
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
    chalk.position.z = 0.06; board.position.y = 0.5;
    g.add(board, chalk);
  }
  g.position.copy(position); scene.add(g);
  activeShops.push({ type: type, mesh: g, pos: position.clone() });
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

// ── THE ECONOMY: SHOP INTERACTION SYSTEM ──
// Replace this entire function in js/weapons.js:

export function checkWorldInteractions(checkInteractionPressed = false) {
  if (!player.alive) return;

  let closestInteractable = null; 
  let minShopDist = 2.5; 
  let minDoorDist = 7.0; 

  // 1. Check proximity to shops (Must be close)
  activeShops.forEach(s => { 
    const d = player.pos.distanceTo(s.pos); 
    if (d < minShopDist) { minShopDist = d; closestInteractable = { type: 'SHOP', data: s }; } 
  });
  
  // 2. Check proximity to doors (Visible from across the room)
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
      
      // ── NEW: Check if player already owns the SMG ──
      const hasSMG = player.inventory.some(w => w.key === "SMG" || w.key === "SMG_UPG");

      // ── NEW: Pricing & Names for Perks and Wall Buys ──
      let cost = 0; let shopName = "";
      if (closestShop.type === 'AMMO') { cost = 500; shopName = "Max Ammo"; }
      else if (closestShop.type === 'MYSTERY_BOX') { cost = 950; shopName = "Mystery Box"; }
      else if (closestShop.type === 'HEALTH') { cost = 300; shopName = "Medkit"; }
      else if (closestShop.type === 'UPGRADE') { cost = 5000; shopName = "Pack-a-Punch"; }
      else if (closestShop.type === 'PERK_HEALTH') { cost = 2500; shopName = "Juggernog (Max Health)"; }
      else if (closestShop.type === 'PERK_RELOAD') { cost = 3000; shopName = "Speed Cola (Fast Reload)"; }
      else if (closestShop.type === 'WALL_SMG') { cost = hasSMG ? 500 : 1000; shopName = hasSMG ? "SMG Ammo" : "Wall SMG"; }

      // ── NEW: Safeguards preventing double-purchasing ──
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
            
            // ── NEW: Execution Logic for Perks & Buys ──
            if (closestShop.type === 'AMMO') {
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
              player.reloadMult = 0.5; // Cuts reload times in half!
            }
            else if (closestShop.type === 'WALL_SMG') {
              if (hasSMG) {
                const smgIdx = player.inventory.findIndex(w => w.key === "SMG" || w.key === "SMG_UPG");
                player.inventory[smgIdx].ammo = player.inventory[smgIdx].maxAmmo;
                player.inventory[smgIdx].reserve = player.inventory[smgIdx].maxAmmo * 3;
                equipWeapon(smgIdx);
              } else {
                const def = WEAPON_DEFS.SMG;
                player.inventory.push({ ...def, ammo: def.maxAmmo, reserve: def.maxAmmo * 3, reloading: false, reloadT: 0, meshGroup: def.buildMesh() });
                equipWeapon(player.inventory.length - 1);
              }
            }
            else if (closestShop.type === 'MYSTERY_BOX') {
              const isRifle = Math.random() > 0.5;
              const rolledDef = isRifle ? WEAPON_DEFS.RIFLE : WEAPON_DEFS.SHOTGUN;
              const existingGunIdx = player.inventory.findIndex(w => w.key === rolledDef.key || w.key === rolledDef.key + "_UPG");
              
              if (existingGunIdx !== -1) {
                player.inventory[existingGunIdx].ammo = player.inventory[existingGunIdx].maxAmmo;
                player.inventory[existingGunIdx].reserve = player.inventory[existingGunIdx].maxAmmo * 3;
                equipWeapon(existingGunIdx);
              } else {
                player.inventory.push({ ...rolledDef, ammo: rolledDef.maxAmmo, reserve: rolledDef.maxAmmo * 3, reloading: false, reloadT: 0, meshGroup: rolledDef.buildMesh() });
                equipWeapon(player.inventory.length - 1);
              }
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

// ── PROCEDURAL 3D MESH BUILDERS (NOW SUPPORTING PURPLE UPGRADES) ──
function buildRifleMesh(isUpgraded) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: isUpgraded ? 0x110022 : 0x1a1a26, metalness: 0.9, roughness: 0.2 });
  const neon = new THREE.MeshStandardMaterial({ color: isUpgraded ? 0xdd00ff : 0x00d4ff, emissive: isUpgraded ? 0x6600aa : 0x003850 });
  const flashMat = new THREE.MeshBasicMaterial({ color: isUpgraded ? 0xdd00ff : 0xffaa00 }); 

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.088, 0.36), metal); body.position.z = -0.04; g.add(body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.26), metal); barrel.position.set(0, 0.024, -0.32); g.add(barrel);
  const acc = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.28), neon); acc.position.set(0, 0.048, -0.04); g.add(acc);
  
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), flashMat);
  flash.position.set(0, 0.024, -0.46); flash.name = "muzzleFlashMesh"; flash.visible = false; g.add(flash);
  g.position.copy(isUpgraded ? WEAPON_DEFS.RIFLE_UPG.basePos : WEAPON_DEFS.RIFLE.basePos); g.visible = false; return g;
}

function buildShotgunMesh(isUpgraded) {
  const g = new THREE.Group();
  const darkMetal = new THREE.MeshStandardMaterial({ color: isUpgraded ? 0x110022 : 0x0f0f14, metalness: 0.8, roughness: 0.4 });
  const neon = new THREE.MeshStandardMaterial({ color: isUpgraded ? 0xdd00ff : 0xff2200, emissive: isUpgraded ? 0x6600aa : 0x440000 });
  const flashMat = new THREE.MeshBasicMaterial({ color: isUpgraded ? 0xdd00ff : 0xffaa00 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.45), darkMetal); g.add(body);
  const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), darkMetal); barrel1.rotation.x = Math.PI/2; barrel1.position.set(-0.02, 0.03, -0.4); g.add(barrel1);
  const barrel2 = barrel1.clone(); barrel2.position.x = 0.02; g.add(barrel2); 
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.25), neon); pump.position.set(0, -0.04, -0.2); g.add(pump);

  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), flashMat); flash.position.set(0, 0.03, -0.62); flash.name = "muzzleFlashMesh"; flash.visible = false; g.add(flash);
  g.position.copy(isUpgraded ? WEAPON_DEFS.SHOTGUN_UPG.basePos : WEAPON_DEFS.SHOTGUN.basePos); g.visible = false; return g;
}

function buildPistolMesh(isUpgraded) {
  const g = new THREE.Group();
  const greyMetal = new THREE.MeshStandardMaterial({ color: isUpgraded ? 0x110022 : 0x333344, metalness: 0.8, roughness: 0.3 });
  const neon = new THREE.MeshStandardMaterial({ color: isUpgraded ? 0xdd00ff : 0x00ff66, emissive: isUpgraded ? 0x6600aa : 0x004411 });
  const flashMat = new THREE.MeshBasicMaterial({ color: isUpgraded ? 0xdd00ff : 0x00ffaa }); 

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.18), greyMetal); slide.position.set(0, 0, -0.05); g.add(slide);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.04, 0.12), greyMetal); frame.position.set(0, -0.03, -0.02); g.add(frame);
  const glowCore = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.1), neon); glowCore.position.set(0, 0.01, -0.06); g.add(glowCore);

  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), flashMat); flash.position.set(0, 0, -0.16); flash.name = "muzzleFlashMesh"; flash.visible = false; g.add(flash);
  g.position.copy(isUpgraded ? WEAPON_DEFS.PISTOL_UPG.basePos : WEAPON_DEFS.PISTOL.basePos); g.visible = false; return g;
}

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
  muzzleLight.color.setHex(w.isUpgraded ? 0xdd00ff : 0xffaa00); // ◄── Purple dynamic lighting!

  flashVisibleT = 0.04; 
  const flashMesh = w.meshGroup.getObjectByName("muzzleFlashMesh");
  if (flashMesh) {
    flashMesh.visible = true;
    const worldTipPos = new THREE.Vector3(); flashMesh.getWorldPosition(worldTipPos); spawnGunSmoke(worldTipPos, dir);
  }
  
  _recoilZ += w.recoilZ; _recoilY += w.recoilY; player.pitch += w.cameraKick; player.yaw += (Math.random() - 0.5) * w.cameraKick * 0.5;

  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hitTargets = [...eMeshList, ...mapMeshes];
  
  if (w.name.includes("Pump")) {
    const pelletCount = w.isUpgraded ? 12 : 8; // Upgraded shotgun shoots way more pellets!
    for (let i = 0; i < pelletCount; i++) {
      const spread = new THREE.Vector2((Math.random() - 0.5) * 0.045, (Math.random() - 0.5) * 0.045);
      ray.setFromCamera(spread, camera);
      const hits = ray.intersectObjects(hitTargets, false);
      if (hits.length) processHit(hits[0]);
    }
  } else {
    const hits = ray.intersectObjects(hitTargets, false);
    if (hits.length) processHit(hits[0]);
  }
  
  if (w.ammo <= 0) startReload();
}

// Inside processHit(hit) in js/weapons.js:

function processHit(hit) {
  const e = hit.object.userData.eRef;
  
  if (e && e.alive) {
    const hs = hit.object.userData.isHead;
    const w = getActiveWeapon();
    
    const baseDamage = w.damage; 
    const isInstaKill = player.instaKillTimer > 0;
    
    // ── FIX: PROPER CRITICAL MULTIPLIERS ──
    // Insta-kill deletes them. Otherwise, headshots deal 3x damage!
    const finalDamage = isInstaKill ? 9999 : (hs ? baseDamage * 3 : baseDamage);
    e.health -= finalDamage; 
    // ──────────────────────────────────────
    
    let pointsAwarded = hs ? 100 : 10;
    if (player.doublePointsTimer > 0) pointsAwarded *= 2; 
    
    player.score = (player.score || 0) + pointsAwarded; 
    spawnFloatingScore(pointsAwarded, hs);
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

// Inside startReload() in js/weapons.js:
export function startReload() {
  const w = getActiveWeapon();
  if (w.reloading || w.ammo === w.maxAmmo || w.reserve <= 0) return;
  playSound('reload', 0.8, false); 
  w.reloading = true; 
  
  // ── FIX: APPLY SPEED COLA MULTIPLIER ──
  w.reloadT = w.reloadDuration * player.reloadMult; 
  // ──────────────────────────────────────
  
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

let _recoilZ = 0, _recoilY = 0, bobT = 0; const _currentGunTarget = new THREE.Vector3();

export function updateGun(dt, keys, isMoving) {
  if (player.instaKillTimer > 0) player.instaKillTimer -= dt;
  if (player.doublePointsTimer > 0) player.doublePointsTimer -= dt;

  const w = getActiveWeapon(); if (!w) return;
  if (fireCooldown > 0) fireCooldown -= dt;

  const targetPos = player.isADS ? w.adsPos.clone() : w.basePos.clone();
  if (isMoving && !player.isADS) { 
    const bobSpeed = player.isSprinting ? 11 : 7; const bobAmount = player.isSprinting ? 0.025 : 0.013;
    bobT += dt * bobSpeed; targetPos.y += Math.sin(bobT) * bobAmount; targetPos.x += Math.cos(bobT * 0.5) * (bobAmount * 0.5); 
  } else { bobT = 0; }

  _currentGunTarget.lerp(targetPos, dt * 12);
  _recoilZ += (0 - _recoilZ) * 12 * dt; _recoilY += (0 - _recoilY) * 12 * dt;
  w.meshGroup.position.set(_currentGunTarget.x, _currentGunTarget.y + _recoilY, _currentGunTarget.z + _recoilZ);

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