// js/utils.js
import { walls } from './map.js';

// ════════════ ANTI-TUNNELING COLLISION ENGINE ════════════
export function pushOut(pos, r, isPlayer = false) {
  // Player pos is at eye level (1.75), zombies are at 0. Find the feet!
  const feetY = isPlayer ? pos.y - 1.75 : pos.y; 

  for (const w of walls) {
    // ── THE STEP-UP FIX ──
    // If our feet are above or within 0.7 units of the top of the block, 
    // ignore the horizontal wall collision so we can step onto it!
    if (w.maxY !== undefined && feetY >= w.maxY - 0.7) continue;

    // Find the closest point on the AABB wall to the entity's position
    const cx = Math.max(w.minX, Math.min(pos.x, w.maxX));
    const cz = Math.max(w.minZ, Math.min(pos.z, w.maxZ));
    
    // Calculate vector distance
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    
    if (d2 > 0 && d2 < r * r) { 
      // 1. STANDARD EXTERIOR COLLISION
      const d = Math.sqrt(d2); 
      pos.x += (dx / d) * (r - d); 
      pos.z += (dz / d) * (r - d); 
    } 
    else if (pos.x > w.minX && pos.x < w.maxX && pos.z > w.minZ && pos.z < w.maxZ) {
      // 2. DEEP PENETRATION TUNNELING FIX
      const pushLeft  = pos.x - w.minX + r;
      const pushRight = w.maxX - pos.x + r;
      const pushUp    = pos.z - w.minZ + r;
      const pushDown  = w.maxZ - pos.z + r;
      
      const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);
      
      if (minPush === pushLeft)      pos.x -= pushLeft;
      else if (minPush === pushRight) pos.x += pushRight;
      else if (minPush === pushUp)    pos.z -= pushUp;
      else if (minPush === pushDown)  pos.z += pushDown;
    }
  }
}