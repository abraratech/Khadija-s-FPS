// Optional CPU asset validation: npm install --no-save --package-lock=false three@0.185.0 @napi-rs/canvas
// node scripts/verify_visual1.mjs [baseline checkout path]
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { pathToFileURL } from 'node:url';

globalThis.document = { createElement(name) { assert.equal(name,'canvas'); return createCanvas(1,1); } };
globalThis.window = {};
globalThis.localStorage = { getItem() {return null;} };
const {getSurface,getBunkerEnvironment,getSoftPoolMask}=await import('../js/art/surface_library.js');
for(const kind of ['panel','floor','metal','fabric','skin','rubber']) {
 const a=getSurface(kind);assert.equal(a,getSurface(kind),'Surfaces must be cached');
 assert.equal(a.map.colorSpace,THREE.SRGBColorSpace);assert.equal(a.roughnessMap.colorSpace,THREE.NoColorSpace);
 assert.ok(a.map.image.width<=512);
}
assert.equal(getBunkerEnvironment(),getBunkerEnvironment());
assert.equal(getSoftPoolMask(),getSoftPoolMask());
const mask=getSoftPoolMask().image.getContext('2d');
assert.ok(mask.getImageData(64,64,1,1).data[0]>240);
assert.ok(mask.getImageData(0,0,1,1).data[0]<5);

function inspect(root) {
 let meshes=0,triangles=0;
 root.updateMatrixWorld(true);
 root.traverse(o=>{if(!o.isMesh)return;meshes++;
  const pos=o.geometry.getAttribute('position');assert.ok(Array.from(pos.array).every(Number.isFinite),o.name);
  triangles+=(o.geometry.index?.count||pos.count)/3;
  if(o.material.map)assert.ok(o.geometry.getAttribute('uv'),`Missing UVs: ${o.name}`);
 });
 assert.ok(meshes>0);return {meshes,triangles};
}
async function buildMap(base='../') {
 const location=base.startsWith('file:')?base:new URL(base,import.meta.url).href;
 const {buildGridBunker}=await import(location+'js/maps/grid_bunker.js');
 const {createMapBlock}=await import(location+'js/maps/map_helpers.js');
 const scene=new THREE.Scene(),mapMeshes=[],walls=[],doors=[],spawnPoints=[],playerSpawnPoints=[],lockedSpawnPoints=[];
 buildGridBunker({scene,mapMeshes,walls,doors,spawnPoints,playerSpawnPoints,lockedSpawnPoints,wallTex:null,
 spawnBlock(w,h,d,x,y,z,colorOrMap,isWall,isDoor){return createMapBlock({scene,mapMeshes,walls},{w,h,d,x,y,z,colorOrMap,isWall,isDoor});}});
 return { scene, geometry:inspect(scene), gameplay:{walls:walls.map(({mesh,pos,...w})=>w),doors:doors.map(d=>d.pos.toArray()),spawns:spawnPoints.map(p=>p.toArray()),starts:playerSpawnPoints.map(p=>p.toArray()),locked:lockedSpawnPoints.map(p=>p.toArray())} };
}
const map=await buildMap();
const results={bunker:map.geometry};
for(const [file,fn] of [['pistol','createProceduralPistolMesh'],['rifle','createProceduralRifleMesh']]) {
 const module=await import(`../js/weapons/${file}.js`);
 for(const upgraded of [false,true]) {
  const model=module[fn]({upgraded});const stats=inspect(model);
  assert.ok(stats.triangles<25000,`${file} triangle budget`);
  assert.ok(model.getObjectByName(`${file}_${file==='pistol'?'slide':'receiver'}`).geometry.getAttribute('uv'));
  results[`${file}${upgraded?'Upgraded':''}`]=stats;
 }
}
const {createHeroShamblerVisual}=await import('../js/actors/hero_shambler.js');
for(const variant of ['CIVILIAN','WORKER','RAVAGED']) {
 results[variant]=inspect(createHeroShamblerVisual({variant,motionSeed:.4}));
}
if(process.argv[2]) {
 const baseline=await buildMap(pathToFileURL(process.argv[2]+'/').href);
 assert.deepEqual(map.gameplay,baseline.gameplay,'Visual work changed navigation, starts or doors');
 assert.ok(map.geometry.meshes<=baseline.geometry.meshes,'No additional arena mesh draws permitted');
 results.baselineBunker=baseline.geometry;
}
console.log(JSON.stringify(results,null,2));
console.log('PASS: cached surfaces, UVs, finite geometry, bounded weapon triangles, and optional baseline collision/spawn parity.');
