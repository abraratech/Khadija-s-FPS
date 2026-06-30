// js/utils.js
import { walls } from './map.js';

// ════════════ COLLISION ════════════
export function pushOut(pos, r) {
  for (const w of walls) {
    // Find the closest point on the AABB wall to the player's position
    const cx = Math.max(w.minX, Math.min(pos.x, w.maxX));
    const cz = Math.max(w.minZ, Math.min(pos.z, w.maxZ));
    
    // Calculate distance between player and closest point
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    
    // If the distance is less than the player's radius, push them out
    if (d2 < r * r && d2 > 0) { 
      const d = Math.sqrt(d2); 
      pos.x += (dx / d) * (r - d); 
      pos.z += (dz / d) * (r - d); 
    }
  }
}