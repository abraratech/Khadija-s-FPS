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
async function build(base,file,fn){
 const builder=(await import(base+'js/maps/'+file+'.js'))[fn];
 const {createMapBlock}=await import(base+'js/maps/map_helpers.js');
 const scene=new THREE.Scene(),mapMeshes=[],walls=[],doors=[],spawnPoints=[],playerSpawnPoints=[],lockedSpawnPoints=[],barricades=[],traps=[];
 const context={scene,mapMeshes,walls,doors,spawnPoints,playerSpawnPoints,lockedSpawnPoints,
 spawnBarricade(...a){barricades.push(a);},spawnTrap(...a){traps.push(a);},
 spawnBlock(w,h,d,x,y,z,colorOrMap,isWall,isDoor){return createMapBlock({scene,mapMeshes,walls},{w,h,d,x,y,z,colorOrMap,isWall,isDoor});}};
 const result=builder(context);
 const clean=a=>a.map(({mesh,pos,...rest})=>rest);
 let finished=0;scene.traverse(o=>{if(o.isMesh && o.material?.userData.arenaFinish)finished++;});
 return {stats:inspect(scene),finished,gameplay:{walls:clean(walls),doors:clean(doors),spawnPoints,playerSpawnPoints,lockedSpawnPoints,barricades,traps,width:result.width,depth:result.depth,navigationCellSize:result.navigationCellSize}};
}
const maps=[["neon_depot", "buildNeonDepot"], ["parking_garage", "buildParkingGarage"], ["hospital_wing", "buildHospitalWing"], ["reactor_courtyard", "buildReactorCourtyard"], ["stormbreak_canal", "buildStormbreakCanal"], ["pvp_competitive_arenas", "buildCrossfireTerminal"], ["pvp_competitive_arenas", "buildFoundryRing"], ["pvp_competitive_arenas", "buildSkylineRelay"]];
for(const quality of ['medium','low']){
 localStorage.getItem=()=>quality;navigator.deviceMemory=quality==='low'?4:8;
 for(const [file,fn] of maps){
  const now=await build(current,file,fn);assert.ok(now.finished>0,fn+' has no finish');
  if(baseline){const old=await build(baseline,file,fn);assert.deepEqual(now.gameplay,old.gameplay,fn+' gameplay changed');assert.deepEqual(now.stats,old.stats,fn+' geometry changed');}
  const again=await build(current,file,fn);assert.deepEqual(again.stats,now.stats);
  report[fn+' '+quality]={...now.stats,finished:now.finished};
 }
}
console.log(JSON.stringify(report,null,2));console.log('PASS: all eight arenas retain geometry, collision, doors, spawns and interactables on Low and Medium.');
