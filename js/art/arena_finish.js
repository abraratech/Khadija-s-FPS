import { applySurface, getSurface, getSoftPoolMask } from './surface_library.js';

// Finish only objects owned by the map builder, never actors or shared scene UI.
// Cached materials carry a marker so repeated map loads do not compound changes.
export function finishArenaSurfaces(mapMeshes) {
  for (const root of mapMeshes) root.traverse(object => {
    if (!object.isMesh || !object.geometry?.getAttribute('uv')) return;
    const name = `${object.name} ${object.userData.supportTag || ''}`.toLowerCase();
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!mat || mat.userData.arenaFinish) continue;
      if (mat.isMeshBasicMaterial) {
        if (mat.transparent && !mat.map && !mat.alphaMap && /pool|mist|puddle/.test(name)) {
          mat.alphaMap = getSoftPoolMask();
          mat.userData.arenaFinish = 'soft-overlay';
          mat.needsUpdate = true;
        }
        continue;
      }
      if (!mat.isMeshStandardMaterial && !mat.isMeshLambertMaterial) continue;
      if (mat.transparent || /glass|water|glow|neon|sign|stripe|marking|hazard|light|screen|gate/.test(name)) continue;
      const floor = /floor/.test(name);
      if (!floor && mat.emissive?.getHex() && mat.emissiveIntensity > .3) continue;
      if (mat.map) {
        // Legacy floors multiply an already-dark texture by an almost-black tint.
        // Preserve the authored pattern while allowing its detail to be visible.
        if (floor) {
          mat.color.setHex(0xb9c3c6);
          if (mat.isMeshStandardMaterial) {
            const detail = getSurface('floor', 10);
            mat.roughnessMap = detail.roughnessMap;
            mat.bumpMap = detail.bumpMap;
            mat.bumpScale = .012;
          }
          mat.userData.arenaFinish = 'authored-floor';
          mat.needsUpdate = true;
        }
        continue;
      }
      const kind = floor ? 'floor'
        : /wood|bench|sleeper|pallet/.test(name) ? 'wood'
        : /fabric|mattress|curtain|cushion/.test(name) ? 'fabric'
        : /wall|pillar|boundary|concrete|platform/.test(name) ? 'concrete'
        : /car|train|cabinet|crate|cover|pump|tank/.test(name) ? 'paint'
        : mat.metalness > .4 ? 'metal' : 'concrete';
      const repeat = floor ? 12 : 1;
      if (mat.isMeshStandardMaterial) applySurface(mat, kind, {repeat, bumpScale: floor ? .018 : .008});
      else { mat.map = getSurface(kind, repeat).map; mat.needsUpdate = true; }
      mat.userData.arenaFinish = kind;
    }
  });
}
