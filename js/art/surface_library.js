// Visual pass 1: shared, deterministic surface maps. No downloads or per-frame work.
import * as THREE from 'three';

const surfaces = new Map();
let environment, poolMask;
function canvas(size, height = size) {
  const image = document.createElement('canvas');
  image.width = size; image.height = height;
  return image;
}
function randomSource(seed = 7721) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function texture(image, color = false, repeat = 1) {
  const result = new THREE.CanvasTexture(image);
  result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(repeat, repeat);
  result.anisotropy = 4;
  return result;
}

export function getSurface(kind = 'metal', repeat = 1) {
  const key = `${kind}:${repeat}`;
  if (surfaces.has(key)) return surfaces.get(key);
  const size = kind === 'panel' || kind === 'floor' ? 512 : 128;
  const image = canvas(size), ctx = image.getContext('2d');
  const random = randomSource(1949 + kind.length * 31);
  ctx.fillStyle = kind === 'panel' ? '#a5aaa4' : kind === 'floor' ? '#626b6c' : '#c3c5c2';
  ctx.fillRect(0, 0, size, size);
  // Broad mottling gives surfaces variation without a noisy silhouette.
  for (let i = 0; i < 80; i++) {
    const x = random() * size, y = random() * size, radius = 4 + random() * size * .22;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(25,31,25,${kind === 'skin' ? .12 : .065})`);
    gradient.addColorStop(1, 'rgba(25,31,25,0)');
    ctx.fillStyle = gradient; ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  for (let i = 0; i < size * 12; i++) {
    const light = random() > .5;
    ctx.fillStyle = light ? 'rgba(255,255,245,.08)' : 'rgba(12,18,17,.08)';
    ctx.fillRect(random()*size,random()*size,kind === 'metal' ? 3 : 1,1);
  }
  if (kind === 'fabric' || kind === 'rubber') {
    const spacing = kind === 'fabric' ? 4 : 8;
    for (let y = 0; y < size; y += spacing) for (let x = 0; x < size; x += spacing) {
      ctx.fillStyle = 'rgba(20,24,21,.24)'; ctx.fillRect(x,y,spacing-1,1);
      ctx.fillStyle = 'rgba(255,255,235,.15)'; ctx.fillRect(x,y+1,1,spacing-2);
    }
  }
  if (kind === 'metal') {
    ctx.strokeStyle = 'rgba(235,240,233,.36)'; ctx.lineWidth = .5;
    for (let i=0;i<38;i++) {
      const x=random()*size, y=random()*size;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*18,y+1);ctx.stroke();
    }
  }
  if (kind === 'panel') {
    // Painted lower half, recessed border, fasteners and stamped service labeling.
    ctx.fillStyle = '#3d686d'; ctx.fillRect(0,280,size,232);
    ctx.fillStyle = '#d3b168'; ctx.fillRect(0,276,size,6);
    ctx.strokeStyle = '#39484a'; ctx.lineWidth = 8;ctx.strokeRect(4,4,504,504);
    ctx.strokeStyle = 'rgba(227,230,213,.65)';ctx.lineWidth=2;ctx.strokeRect(11,11,490,490);
    for (const x of [22,490]) for (const y of [22,256,490]) {
      ctx.fillStyle='#303b3a';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#c3c4b2';ctx.fillRect(x-2,y-2,4,1);
      const rust=ctx.createLinearGradient(0,y,0,y+38);rust.addColorStop(0,'rgba(111,65,27,.32)');rust.addColorStop(1,'rgba(111,65,27,0)');
      ctx.fillStyle=rust;ctx.fillRect(x-3,y+5,6,33);
    }
    ctx.fillStyle='rgba(32,46,43,.65)';ctx.font='bold 18px monospace';ctx.fillText('CONTAINMENT',34,53);
    ctx.font='11px monospace';ctx.fillText('B-07  /  SERVICE ACCESS',35,72);
    ctx.fillStyle='rgba(10,26,28,.7)';
    for(let i=0;i<6;i++)ctx.fillRect(350,345+i*14,116,5);
    for(let i=0;i<85;i++) {
      ctx.fillStyle='rgba(162,164,146,.5)';ctx.fillRect(random()*size,280+random()*232,2+random()*7,1+random()*3);
    }
  }
  if (kind === 'floor') {
    // Large concrete slabs; soft edge occlusion and hairline expansion joints.
    ctx.strokeStyle='#2d393b';ctx.lineWidth=5;ctx.strokeRect(0,0,size,size);
    ctx.strokeStyle='rgba(180,185,172,.30)';ctx.lineWidth=2;ctx.strokeRect(6,6,size-12,size-12);
    for (const [x,y] of [[18,18],[494,18],[18,494],[494,494]]) {
      ctx.fillStyle='#354143';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
    }
    ctx.strokeStyle='rgba(19,30,30,.28)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(80,0);ctx.lineTo(93,32);ctx.lineTo(86,48);ctx.lineTo(109,70);ctx.stroke();
  }
  const rough = canvas(size), rc = rough.getContext('2d');
  rc.fillStyle = kind === 'metal' ? '#b6b6b6' : '#ededed';rc.fillRect(0,0,size,size);
  if(kind === 'floor') {
    for(let i=0;i<6;i++) {
      const x=random()*size,y=random()*size,r=30+random()*70;
      const g=rc.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#535353');g.addColorStop(1,'rgba(83,83,83,0)');
      rc.fillStyle=g;rc.fillRect(x-r,y-r,r*2,r*2);
    }
  }
  const height = canvas(size), hc = height.getContext('2d');
  hc.drawImage(image,0,0); // Low-amplitude relief; never changes collision geometry.
  const result = Object.freeze({map:texture(image,true,repeat),roughnessMap:texture(rough,false,repeat),bumpMap:texture(height,false,repeat)});
  surfaces.set(key,result);
  return result;
}

export function applySurface(material, kind, {repeat = 1, bumpScale = .015} = {}) {
  Object.assign(material,getSurface(kind,repeat));
  material.bumpScale=bumpScale;
  material.userData.artSurface=kind;
  material.needsUpdate=true;
  return material;
}

export function getSoftPoolMask() {
  if(poolMask)return poolMask;
  const image=canvas(128),ctx=image.getContext('2d');
  const g=ctx.createRadialGradient(64,64,2,64,64,63);
  g.addColorStop(0,'#ffffff');g.addColorStop(.35,'#8f8f8f');g.addColorStop(1,'#000000');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  poolMask=texture(image);return poolMask;
}

export function getBunkerEnvironment() {
  if(environment)return environment;
  const image=canvas(512,256),ctx=image.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#526774');gradient.addColorStop(.48,'#202d34');gradient.addColorStop(1,'#0d1417');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);
  for(const [x,color] of [[48,'#f7d6a3'],[240,'#a8d8eb'],[420,'#d3e6e5']]) {
    const g=ctx.createRadialGradient(x,65,2,x,65,44);
    g.addColorStop(0,color);g.addColorStop(.45,color);g.addColorStop(1,'rgba(80,110,120,0)');
    ctx.fillStyle=g;ctx.fillRect(x-44,21,88,88);
  }
  environment=texture(image,true);
  environment.mapping=THREE.EquirectangularReflectionMapping;
  return environment;
}
