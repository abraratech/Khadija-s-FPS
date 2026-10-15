// CPU validation only: same optional dependencies as verify_visual1.mjs.
// node scripts/verify_visual2.mjs /path/to/baseline-checkout
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import * as THREE from 'three';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';

globalThis.document={createElement(name){assert.equal(name,'canvas');return createCanvas(1,1);}};
globalThis.window={innerWidth:1280,innerHeight:900};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{deviceMemory:8,hardwareConcurrency:8}});
globalThis.localStorage={getItem(){return 'medium';}};
const current=new URL('../',import.meta.url).href;
const baseline=process.argv[2]?pathToFileURL(process.argv[2]+'/').href:null;
const report={};
function inspect(root){
 let meshes=0,triangles=0;root.updateMatrixWorld(true);
 root.traverse(o=>{if(!o.isMesh)return;meshes++;const p=o.geometry.getAttribute('position');
 assert.ok(Array.from(p.array).every(Number.isFinite),o.name);triangles+=(o.geometry.index?.count||p.count)/3;
 for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat.map)assert.ok(o.geometry.getAttribute('uv'),o.name);
 });return {meshes,triangles};
}
async function yard(base){
 const {buildIndustrialYard}=await import(base+'js/maps/industrial_yard.js');
 const {createMapBlock}=await import(base+'js/maps/map_helpers.js');
 const scene=new THREE.Scene(),mapMeshes=[],walls=[],spawns=[],starts=[],locked=[],barricades=[],traps=[];
 buildIndustrialYard({scene,mapMeshes,walls,spawnPoints:spawns,playerSpawnPoints:starts,lockedSpawnPoints:locked,
 spawnBarricade(...args){barricades.push(args);},spawnTrap(...args){traps.push(args);},
 spawnBlock(w,h,d,x,y,z,colorOrMap,isWall,isDoor){return createMapBlock({scene,mapMeshes,walls},{w,h,d,x,y,z,colorOrMap,isWall,isDoor});}});
 return {geometry:inspect(scene),gameplay:{walls:walls.map(({mesh,pos,...w})=>w),spawns:spawns.map(v=>v.toArray()),starts:starts.map(v=>v.toArray()),locked:locked.map(v=>v.toArray()),barricades,traps}};
}
for(const low of [false,true]){
 navigator.deviceMemory=low?4:8;localStorage.getItem=()=>low?'low':'medium';
 const updated=await yard(current);report[low?'yardLow':'yard']=updated.geometry;
 if(baseline){const original=await yard(baseline);assert.deepEqual(updated.gameplay,original.gameplay);assert.equal(updated.geometry.meshes,original.geometry.meshes);assert.ok(updated.geometry.triangles<=original.geometry.triangles);report[low?'baselineYardLow':'baselineYard']=original.geometry;}
}
for(const [file,fn] of [['smg','createProceduralSMGMesh'],['shotgun','createProceduralShotgunMesh'],['sniper','createProceduralSniperMesh']]){
 const module=await import(current+`js/weapons/${file}.js`);
 for(const upgraded of [false,true]){
  const model=module[fn]({upgraded}),stats=inspect(model);assert.ok(stats.triangles<25000);
  report[file+(upgraded?'Upgraded':'')]=stats;
  if(baseline){
   const old=(await import(baseline+`js/weapons/${file}.js`))[fn]({upgraded});
   assert.equal(stats.meshes,inspect(old).meshes);
   assert.deepEqual(model.userData.thirdPersonMuzzle,old.userData.thirdPersonMuzzle);
   assert.equal(model.userData.thirdPersonMuzzleSize,old.userData.thirdPersonMuzzleSize);
   const a=new THREE.Box3().setFromObject(model),b=new THREE.Box3().setFromObject(old);
   assert.ok(a.min.distanceTo(b.min)<.002 && a.max.distanceTo(b.max)<.002,`${file}: outer bounds changed`);
   if(file==='sniper')assert.deepEqual(model.userData.adsClearanceRemovedParts,old.userData.adsClearanceRemovedParts);
   const nowText=readFileSync(new URL(current+`js/weapons/${file}.js`),'utf8');
   const oldText=readFileSync(new URL(baseline+`js/weapons/${file}.js`),'utf8');
   assert.equal(nowText.slice(nowText.indexOf('export function update')),oldText.slice(oldText.indexOf('export function update')),'Animation logic changed');
  }
 }
}
const {getSurface,getYardEnvironment,getBunkerEnvironment}=await import(current+'js/art/surface_library.js');
for(const kind of ['wood','paint','asphalt','concrete']){assert.equal(getSurface(kind),getSurface(kind));assert.equal(getSurface(kind).map.colorSpace,THREE.SRGBColorSpace);}
assert.equal(getYardEnvironment(),getYardEnvironment());assert.notEqual(getYardEnvironment(),getBunkerEnvironment());
console.log(JSON.stringify(report,null,2));console.log('PASS: yard collision/spawn/interactable parity, mesh budgets, textured UVs, weapon bounds/muzzles, sniper ADS clearance and animation logic.');
