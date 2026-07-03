// js/ui/menu_selector.js
// Staged main menu:
// 1. Mode Select
// 2. Arena Select
// 3. Mission Setup
// Keeps hidden #map-select and #diff-select synced for main.js.

import { MAP_IDS, getPlayableMaps, getMapMeta } from '../maps/map_registry.js';

const mapGrid = document.getElementById('menu-map-grid');
const mapSelect = document.getElementById('map-select');
const diffSelect = document.getElementById('diff-select');
const selectedMapPill = document.getElementById('selected-map-pill');

const stepTitle = document.getElementById('mission-step-title');
const stepSubtitle = document.getElementById('mission-step-subtitle');

const summaryMap = document.getElementById('mission-summary-map');
const summaryDesc = document.getElementById('mission-summary-desc');

const savedMap = localStorage.getItem('khadija_selected_map') || MAP_IDS.GRID_BUNKER;
const savedDifficulty = localStorage.getItem('khadija_selected_difficulty') || '1.0';

const STAGE_COPY = {
  'stage-mode': {
    title: 'SELECT MODE',
    subtitle: "Choose how you want to enter Khadija's Arena."
  },
  'stage-arena': {
    title: 'SELECT ARENA',
    subtitle: 'Pick your combat space.'
  },
  'stage-setup': {
    title: 'MISSION SETUP',
    subtitle: 'Choose difficulty and confirm your mission.'
  }
};

function showStage(stageId) {
  document.querySelectorAll('.mission-stage').forEach((stage) => {
    stage.classList.toggle('active', stage.id === stageId);
  });

  const copy = STAGE_COPY[stageId];

  if (copy) {
    stepTitle.textContent = copy.title;
    stepSubtitle.textContent = copy.subtitle;
  }
}

function setSelectedMap(mapId) {
  if (!mapSelect || !selectedMapPill) return;

  const meta = getMapMeta(mapId);

  mapSelect.value = meta.id;
  selectedMapPill.textContent = meta.name.toUpperCase();

  document.querySelectorAll('.menu-map-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.mapId === meta.id);
  });

  if (summaryMap) summaryMap.textContent = meta.name;
  if (summaryDesc) summaryDesc.textContent = meta.description || meta.subtitle || '';

  localStorage.setItem('khadija_selected_map', meta.id);
}

function setSelectedDifficulty(value) {
  if (!diffSelect) return;

  diffSelect.value = value;

  document.querySelectorAll('.menu-diff-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.diff === value);
  });

  localStorage.setItem('khadija_selected_difficulty', value);
}

function buildHiddenMapSelect() {
  if (!mapSelect) return;

  mapSelect.innerHTML = '';

  getPlayableMaps().forEach((map) => {
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = map.name;
    mapSelect.appendChild(option);
  });
}

function buildMapCards() {
  if (!mapGrid) return;

  mapGrid.innerHTML = '';

  getPlayableMaps().forEach((map) => {    
  const card = document.createElement('button');
    card.type = 'button';
    card.className = 'menu-map-card';
    card.dataset.mapId = map.id;

    card.innerHTML = `
      <div class="menu-map-card-inner">
        <div class="menu-map-thumb"></div>
        <div class="menu-map-info">
          <div class="menu-map-name">${map.name}</div>
          <div class="menu-map-subtitle">${map.subtitle || 'Survival Arena'}</div>
          <div class="menu-map-desc">${map.description || ''}</div>
          <span class="menu-map-status">${map.status || 'stable'}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      setSelectedMap(map.id);
    });

    mapGrid.appendChild(card);
  });
}

document.querySelectorAll('.menu-mode-card').forEach((card) => {
  card.addEventListener('click', () => {
    if (card.classList.contains('locked')) return;

    document.querySelectorAll('.menu-mode-card').forEach((btn) => {
      btn.classList.toggle('active', btn === card);
    });
  });
});

document.getElementById('mode-next-btn')?.addEventListener('click', () => {
  showStage('stage-arena');
});

document.getElementById('arena-next-btn')?.addEventListener('click', () => {
  showStage('stage-setup');
});

const setupReadyBtn = document.getElementById('setup-ready-btn');
const startBtn = document.getElementById('start-btn');

function isGameStartReady() {
  return startBtn && startBtn.style.display !== 'none';
}

function refreshStartMissionButton() {
  if (!setupReadyBtn) return;

  const ready = isGameStartReady();

  setupReadyBtn.disabled = !ready;
  setupReadyBtn.textContent = ready ? 'START MISSION' : 'LOADING ASSETS...';

  setupReadyBtn.classList.toggle('ready', ready);
  setupReadyBtn.classList.toggle('loading', !ready);
}

setupReadyBtn?.addEventListener('click', () => {
  refreshStartMissionButton();

  if (!isGameStartReady()) return;

  startBtn.click();
});

const startReadyPoll = window.setInterval(() => {
  refreshStartMissionButton();

  if (isGameStartReady()) {
    window.clearInterval(startReadyPoll);
  }
}, 250);

refreshStartMissionButton();

document.querySelectorAll('.mission-back-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    showStage(btn.dataset.backTo);
  });
});

document.querySelectorAll('.menu-diff-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    setSelectedDifficulty(btn.dataset.diff);
  });
});

buildHiddenMapSelect();
buildMapCards();

const playableIds = getPlayableMaps().map((map) => map.id);
setSelectedMap(playableIds.includes(savedMap) ? savedMap : MAP_IDS.GRID_BUNKER);
setSelectedDifficulty(savedDifficulty);
showStage('stage-mode');