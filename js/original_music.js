import { calculateOriginalMusicLevel, selectOriginalMusicTrack, selectOriginalStinger } from './original_music_core.js';

const LOOP_TRACKS = Object.freeze(['menu','combat','ambient_grid_bunker','ambient_industrial_yard','ambient_neon_depot','ambient_parking_garage','ambient_hospital_wing','ambient_reactor_courtyard']);
const STINGERS = Object.freeze(['wave_start','wave_clear']);
let controller = null;

function urlFor(name){ return new URL(`../assets/music/${name}.mp3`, import.meta.url).href; }
function makeAudio(name, loop){
  const audio = new Audio(urlFor(name));
  audio.preload = 'auto';
  audio.loop = loop;
  audio.volume = 0;
  audio.dataset.kaMusicTrack = name;
  return { name, audio, ready: false, failed: false, target: 0 };
}
function safePlay(track){
  if(!track || track.failed || !controller?.unlocked)return;
  try{const promise=track.audio.play();promise?.catch?.(()=>{});}catch{}
}
function bindTrack(track){
  const ready=()=>{track.ready=true;track.failed=false;if(track.name===controller?.desiredTrack)safePlay(track);};
  track.audio.addEventListener('loadeddata',ready);
  track.audio.addEventListener('canplay',ready);
  track.audio.addEventListener('error',()=>{track.failed=true;track.ready=false;});
}
function setTargets(desired,level){
  for(const track of controller.loops.values()){
    track.target=track.name===desired?level:0;
    if(track.target>0)safePlay(track);
  }
}
function fadeTick(){
  if(!controller)return;
  for(const track of controller.loops.values()){
    const current=Number(track.audio.volume)||0;
    const next=current+(track.target-current)*.16;
    track.audio.volume=Math.min(1,Math.max(0,next));
    if(track.target===0 && track.audio.volume<.004 && !track.audio.paused){track.audio.pause();track.audio.volume=0;}
  }
}
function playStinger(name,level){
  const base=controller.stingers.get(name);
  if(!base?.ready || base.failed || !controller.unlocked || level<=0)return false;
  const audio=new Audio(base.audio.src);audio.preload='auto';audio.volume=Math.min(1,Math.max(0,level*.9));
  try{const promise=audio.play();promise?.catch?.(()=>{});return true;}catch{return false;}
}
export function initOriginalMusic(){
  if(controller)return controller;
  const loops=new Map(LOOP_TRACKS.map(name=>[name,makeAudio(name,true)]));
  const stingers=new Map(STINGERS.map(name=>[name,makeAudio(name,false)]));
  controller={loops,stingers,unlocked:false,desiredTrack:'',level:0,fadeTimer:setInterval(fadeTick,50)};
  for(const track of [...loops.values(),...stingers.values()])bindTrack(track);
  const unlock=()=>{void unlockOriginalMusic();};
  window.addEventListener('pointerdown',unlock,{passive:true});
  window.addEventListener('touchstart',unlock,{passive:true});
  window.addEventListener('keydown',unlock);
  document.documentElement.dataset.kaOriginalMusic='loading';
  return controller;
}
export async function unlockOriginalMusic(){
  if(!controller)initOriginalMusic();
  controller.unlocked=true;
  const desired=controller.loops.get(controller.desiredTrack);
  if(desired?.ready)safePlay(desired);
  document.documentElement.dataset.kaOriginalMusic=desired?.ready?'ready':'loading';
  return desired?.ready===true;
}
export function updateOriginalMusic({state='silence',mapId='grid_bunker',events=[],masterVolume=1,musicVolume=60,documentHidden=false}={}){
  if(!controller)initOriginalMusic();
  const desired=selectOriginalMusicTrack({state,mapId});
  const level=calculateOriginalMusicLevel({masterVolume,musicVolume,state,documentHidden});
  controller.desiredTrack=desired;controller.level=level;
  setTargets(desired,level);
  const track=controller.loops.get(desired);
  const active=Boolean(desired && controller.unlocked && track?.ready && !track.failed);
  if(active){for(const event of events||[]){const stinger=selectOriginalStinger(event);if(stinger)playStinger(stinger,Math.max(level,.18));}}
  document.documentElement.dataset.kaOriginalMusic=active?'playing':(track?.failed?'fallback':controller.unlocked?'loading':'locked');
  document.documentElement.dataset.kaOriginalMusicTrack=desired||'silence';
  return active;
}
export function destroyOriginalMusic(){
  if(!controller)return;
  clearInterval(controller.fadeTimer);
  for(const track of [...controller.loops.values(),...controller.stingers.values()]){track.audio.pause();track.audio.src='';}
  controller=null;
  document.documentElement.dataset.kaOriginalMusic='stopped';
}
