export const ORIGINAL_MUSIC_PATCH = 'm4-original-music-pack-r1';
export const ORIGINAL_MUSIC_TRACKS = Object.freeze({
  menu: 'menu',
  combat: 'combat',
  ambient_grid_bunker: 'ambient_grid_bunker',
  ambient_industrial_yard: 'ambient_industrial_yard',
  ambient_neon_depot: 'ambient_neon_depot',
  ambient_parking_garage: 'ambient_parking_garage',
  ambient_hospital_wing: 'ambient_hospital_wing',
  ambient_reactor_courtyard: 'ambient_reactor_courtyard',
  ambient_stormbreak_canal: 'ambient_reactor_courtyard'
});
const MAPS = Object.freeze(['grid_bunker','industrial_yard','neon_depot','parking_garage','hospital_wing','reactor_courtyard','stormbreak_canal']);
function token(value){return String(value??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
export function normalizeOriginalMusicMap(value){const t=token(value);return MAPS.includes(t)?t:'grid_bunker';}
export function selectOriginalMusicTrack({state='silence',mapId='grid_bunker'}={}){
  const s=token(state);
  if(s==='menu')return ORIGINAL_MUSIC_TRACKS.menu;
  if(s==='combat')return ORIGINAL_MUSIC_TRACKS.combat;
  if(s==='ambient')return `ambient_${normalizeOriginalMusicMap(mapId)}`;
  return '';
}
export function calculateOriginalMusicLevel({masterVolume=1,musicVolume=60,state='silence',documentHidden=false}={}){
  const master=Math.min(1,Math.max(0,Number(masterVolume)||0));
  const music=Math.min(100,Math.max(0,Number(musicVolume)||0))/100;
  const multiplier=state==='combat'?.50:state==='ambient'?.40:state==='menu'?.46:0;
  return documentHidden?0:master*music*multiplier;
}
export function selectOriginalStinger(event){return event==='wave-start'?'wave_start':event==='wave-clear'?'wave_clear':'';}
