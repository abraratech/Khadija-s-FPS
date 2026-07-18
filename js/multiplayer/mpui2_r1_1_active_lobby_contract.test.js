import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MultiplayerLobbyUI } from './lobby_ui.js';

const root = new URL('../../', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), 'utf8');
const ui = read('js/multiplayer/lobby_ui.js');
const css = read('css/multiplayer.css');
const release = JSON.parse(read('multiplayer-release.json'));

assert.match(ui, /MPUI\.2 R1\.1/);
assert.match(ui, /const online = Boolean\(this\.state\?\.room && this\.state\?\.connected\)/);
assert.match(ui, /activeLobbyReplacesRoomsPanel/);
assert.match(ui, /this\.elements\.roomView\.hidden = !\(online && next === 'rooms'\)/);
assert.match(ui, /this\.elements\.connectView\.hidden = false/);
assert.match(ui, /this\.elements\.tabbar\.hidden = false/);
assert.match(ui, /if \(online && !wasOnline\)/);
assert.match(ui, /this\.activeTab = 'rooms'/);
assert.match(css, /\.ka-mp-room-view\[hidden\] \{ display: none !important; \}/);

const createButton = (tab) => ({
  dataset: { mpTab: tab },
  classList: { toggle() {} },
  setAttribute() {}
});
const createPanel = (tab) => ({ dataset: { mpPanel: tab }, hidden: false });
const instance = new MultiplayerLobbyUI();
instance.elements = {
  tabButtons: ['play', 'rooms', 'competitive', 'private'].map(createButton),
  tabPanels: ['play', 'rooms', 'competitive', 'private'].map(createPanel),
  roomView: { hidden: true }
};
instance.state = { connected: true, room: { roomCode: 'ABC123' } };
instance.switchHubTab('rooms');
assert.equal(instance.elements.roomView.hidden, false);
assert.equal(instance.elements.tabPanels.find((panel) => panel.dataset.mpPanel === 'rooms').hidden, true);
instance.switchHubTab('competitive');
assert.equal(instance.elements.roomView.hidden, true);
assert.equal(instance.elements.tabPanels.find((panel) => panel.dataset.mpPanel === 'competitive').hidden, false);
instance.state = { connected: false, room: null };
instance.switchHubTab('rooms');
assert.equal(instance.elements.roomView.hidden, true);
assert.equal(instance.elements.tabPanels.find((panel) => panel.dataset.mpPanel === 'rooms').hidden, false);

assert.equal(release.multiplayerHub.hotfix, 'mpui2-r1-1-active-lobby-tab-isolation');
assert.equal(release.multiplayerHub.activeLobbyRoomsTabOnly, true);
assert.equal(release.multiplayerHub.hubTabsRemainAvailableInLobby, true);
assert.equal(release.multiplayerHub.activeLobbyAutoOpensRoomsOnJoin, true);
assert.equal(release.multiplayerHub.nonRoomTabsHideActiveLobby, true);
assert.equal(release.multiplayerHub.gameplayAuthorityUnchanged, true);
assert.equal(release.multiplayerHub.workerProtocolUnchanged, true);

console.log('MPUI.2 R1.1 active lobby tab isolation contract tests passed');
