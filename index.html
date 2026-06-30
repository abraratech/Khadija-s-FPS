<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Khadija's Arena</title>
  <style>
  /* ── NEW: PORTRAIT MODE BLOCKER ── */
    #portrait-warning {
      display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: #050505; color: #fff; z-index: 9999;
      flex-direction: column; align-items: center; justify-content: center;
      text-align: center; font-family: sans-serif;
    }
    @media screen and (orientation: portrait) and (max-width: 768px) {
      #portrait-warning { display: flex; }
    }
  </style>
  <link rel="stylesheet" href="css/game.css">
  <link rel="stylesheet" href="css/hud.css">
  <link rel="stylesheet" href="css/menu.css">
</head>
<body>
<div id="portrait-warning">
    <div style="font-size: 60px; margin-bottom: 20px;">🔄</div>
    <h2 style="letter-spacing: 2px;">PLEASE ROTATE DEVICE</h2>
    <p style="color: #888;">This game requires landscape mode.</p>
  </div>
  <canvas id="c"></canvas>

  <div id="hud">
    <style>
      @keyframes radar-spin { from { transform: translateY(-50%) rotate(0deg); } to { transform: translateY(-50%) rotate(360deg); } }
    </style>
    
    <div id="minimap-wrap" style="position: absolute; top: 20px; left: 20px; width: 140px; height: 140px; border-radius: 50%; border: 3px solid #00d4ff; background: rgba(0, 15, 30, 0.7); box-shadow: 0 0 15px rgba(0, 212, 255, 0.4); overflow: hidden; z-index: 10;">
      <canvas id="minimap" width="140" height="140" style="position: absolute; top: 0; left: 0; z-index: 1;"></canvas>
      <div style="position: absolute; top: 50%; left: 50%; width: 50%; height: 2px; background: linear-gradient(90deg, rgba(0,212,255,0), #00d4ff); transform-origin: left center; animation: radar-spin 2s linear infinite; z-index: 2;"></div>
    </div>
    
    <div id="crosshair">
      <div class="ch ch-t"></div><div class="ch ch-b"></div>
      <div class="ch ch-l"></div><div class="ch ch-r"></div>
    </div>
    <div id="damage-indicators-container" style="position: absolute; top: 50%; left: 50%; width: 0; height: 0; z-index: 10; pointer-events: none;"></div>
    <div id="hit-marker">
      <div class="hm hm-tl"></div><div class="hm hm-tr"></div>
      <div class="hm hm-bl"></div><div class="hm hm-br"></div>
    </div>
    <div id="kills-display" style="position: absolute; top: 20px; right: 20px; color: #fff; font-family: sans-serif; font-size: 20px; font-weight: bold; letter-spacing: 1px; text-shadow: 2px 2px 4px #000; z-index: 10;">0 KILLS</div>
    <div id="health-wrap">
      <span id="health-icon">♥</span>
      <div id="health-bar-bg"><div id="health-fill"></div></div>
      <span id="health-label">100</span>
    </div>
    <div id="score-display" style="position: absolute; top: 60px; right: 20px; text-align: right; color: #ffaa00; font-family: sans-serif; font-size: 38px; font-weight: bold; letter-spacing: 2px; text-shadow: 3px 3px 0 #000; z-index: 10;">
      0 <span style="font-size: 20px; color: #fff;">PTS</span>
    </div>
    
    <div id="round-counter-wrap" style="position: absolute; top: 20px; left: 50%; transform: translateX(-50%); color: #fff; font-family: sans-serif; font-size: 24px; font-weight: bold; letter-spacing: 2px; text-shadow: 2px 2px 4px #000; z-index: 10;">
      ROUND: <span id="round-num" style="color: #ff2200;">1</span>
    </div>

    <div id="wave-banner" style="display: none; position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); color: #ff2200; font-family: sans-serif; font-size: 48px; font-weight: bold; letter-spacing: 5px; text-shadow: 3px 3px 6px #000; z-index: 10; pointer-events: none; text-align: center; animation: pulse 1.5s infinite;">
      WAVE 1 BEGINS
    </div>
    <div id="interaction-prompt" style="
      display: none; 
      position: absolute; 
      top: 58%; 
      left: 50%; 
      transform: translate(-50%, -50%); 
      color: #00d4ff; 
      font-family: sans-serif; 
      font-weight: bold; 
      text-shadow: 2px 2px 4px #000; 
      font-size: 18px; 
      pointer-events: none;
      z-index: 10;">
      Press [E] to pick up Weapon
    </div>
<div id="ammo-wrap" style="position: absolute; top: 65px; left: 50%; transform: translateX(-50%); text-align: center; font-family: sans-serif; z-index: 10; text-shadow: 2px 2px 4px #000;">
      <div id="weapon-name" style="color: #00d4ff; font-size: 14px; font-weight: bold; letter-spacing: 1px; margin-bottom: 2px;">AR · 15</div>
      <div style="display: flex; justify-content: center; align-items: baseline; gap: 2px;">
        <span id="ammo-current" style="color: #fff; font-size: 32px; font-weight: bold;">30</span>
        <span id="ammo-reserve" style="color: #888; font-size: 18px; font-weight: bold;">/ 90</span>
      </div>
    </div>
    
    <div id="reload-wrap" style="display: none; position: absolute; top: 58%; left: 50%; transform: translate(-50%, -50%); width: 160px; text-align: center; z-index: 10; font-family: sans-serif;">
      <div id="reload-label" style="color: #ffaa00; font-size: 12px; font-weight: bold; letter-spacing: 2px; margin-bottom: 5px; text-shadow: 1px 1px 2px #000;">RELOADING</div>
      <div id="reload-bar-bg" style="width: 100%; height: 6px; background: rgba(0,0,0,0.5); border: 1px solid #ffaa00; border-radius: 3px; overflow: hidden;">
        <div id="reload-bar" style="width: 0%; height: 100%; background: #ffaa00;"></div>
      </div>
    </div>
    <div id="damage-flash"></div>
  </div>
<div id="mobile-ui" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 50; pointer-events: none; touch-action: none;">
    
    <div id="joystick-left" style="position: absolute; bottom: 40px; left: 40px; width: 140px; height: 140px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.15); border-radius: 50%; pointer-events: auto;">
      <div id="joystick-knob" style="position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; background: rgba(0, 212, 255, 0.4); border-radius: 50%; transform: translate(-50%, -50%);"></div>
    </div>
    
    <div id="touch-look-area" style="position: absolute; top: 0; right: 0; width: 50%; height: 100%; pointer-events: auto;"></div>
    
    <div style="position: absolute; bottom: 40px; right: 40px; pointer-events: auto; display: flex; flex-wrap: wrap; width: 160px; gap: 15px; justify-content: flex-end;">
       <button id="btn-jump" style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); font-weight: bold;">JMP</button>
       <button id="btn-reload" style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); font-weight: bold;">RLD</button>
       <button id="btn-interact" style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,170,0,0.3); color: white; border: 1px solid rgba(255,170,0,0.5); font-weight: bold;">[ E ]</button>
       <button id="btn-shoot" style="width: 75px; height: 75px; border-radius: 50%; background: rgba(255,34,0,0.4); color: white; border: 2px solid rgba(255,34,0,0.8); font-weight: bold;">FIRE</button>
    </div>
  </div>
  <div id="floating-texts-container" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3; overflow: hidden;"></div>	

<div id="menu">
    <div id="menu-title">KHADIJA ARENA</div>
    
    <div style="color: #ffaa00; font-family: sans-serif; font-size: 18px; font-weight: bold; letter-spacing: 2px; margin-bottom: 15px; text-shadow: 2px 2px 0 #000;">
      HIGH SCORE: <span id="hi-score" style="color: #fff;">0</span> &nbsp;|&nbsp; MAX WAVE: <span id="hi-wave" style="color: #fff;">1</span>
    </div>

    <div id="menu-sub">Zombie-style . HTML5</div>
    
    <div id="controls-grid">
      <div class="key-info"><span class="key-badge">W A S D</span><span>MOVE</span></div>
      <div class="key-info"><span class="key-badge">MOUSE</span><span>AIM</span></div>
      <div class="key-info"><span class="key-badge">CLICK</span><span>SHOOT</span></div>
      <div class="key-info"><span class="key-badge">R</span><span>RELOAD</span></div>
      <div class="key-info"><span class="key-badge">SPACE</span><span>JUMP</span></div>
      <div class="key-info"><span class="key-badge">SHIFT</span><span>SPRINT</span></div>
      <div class="key-info"><span class="key-badge">ESC</span><span>PAUSE</span></div>
    </div>
    
    <div style="margin: 20px auto; text-align: center; display: flex; gap: 10px; justify-content: center;">
      <select id="map-select" style="padding: 10px; font-size: 16px; background: #111; color: #00d4ff; border: 2px solid #00d4ff; border-radius: 4px; outline: none; cursor: pointer; font-family: sans-serif; font-weight: bold;">
        <option value="0">The Bunker</option>
        <option value="1">The Courtyard</option>
      </select>
      
      <select id="diff-select" style="padding: 10px; font-size: 16px; background: #111; color: #ff2200; border: 2px solid #ff2200; border-radius: 4px; outline: none; cursor: pointer; font-family: sans-serif; font-weight: bold;">
        <option value="0.75">Easy</option>
        <option value="1.0" selected>Normal</option>
        <option value="1.5">Hard</option>
      </select>
    </div>

    <button id="start-btn">▶  PLAY</button>
  </div>

  <div id="pause-screen" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 5, 10, 0.85); z-index: 100; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(5px);">
    <div style="color: #fff; font-family: sans-serif; font-size: 54px; font-weight: bold; letter-spacing: 5px; margin-bottom: 40px; text-shadow: 3px 3px 0 #000;">PAUSED</div>
    <button id="resume-btn" style="padding: 15px 40px; font-size: 24px; font-weight: bold; background: #00d4ff; color: #000; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 20px; transition: 0.2s;">RESUME</button>
    <button id="quit-btn" style="padding: 15px 40px; font-size: 18px; font-weight: bold; background: transparent; color: #ff2200; border: 2px solid #ff2200; border-radius: 4px; cursor: pointer; transition: 0.2s;">QUIT TO MENU</button>
  </div>

<div id="death-screen">
    <div id="death-title">YOU DIED</div>
    <div id="death-sub">Eliminations</div>
    <div id="final-kills">0</div>
    
    <div style="display: flex; gap: 20px; justify-content: center; margin-top: 30px;">
      <button id="respawn-btn">↺  RESPAWN</button>
      <button id="death-quit-btn" style="padding: 15px 30px; font-size: 20px; font-weight: bold; background: rgba(255, 0, 0, 0.1); color: #ff2200; border: 2px solid #ff2200; border-radius: 4px; cursor: pointer; transition: 0.2s;">QUIT TO MENU</button>
    </div>
  </div>

  <div id="lock-hint">Click to capture mouse</div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>  
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js"></script>
  <script type="module" src="js/main.js"></script>
</body>
</html>