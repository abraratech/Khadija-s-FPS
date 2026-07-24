import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const index = read('../index.html');
const css = read('../css/menu.css');
const core = read('./onboarding1_core.js');
const runtime = read('./onboarding1.js');
const main = read('./main.js');
const loadout = read('./loadout.js');
const launch1 = read('./launch1.js');
const careerAchievements = read('./career_achievements.js');
const updateDelivery = read('./update_delivery_core.js');
const builder = read('../scripts/build_production.py');
const verifier = read('../scripts/verify_launch2_build.py');
const release = JSON.parse(read('../release-version.json'));
const multiplayer = JSON.parse(read('../multiplayer-release.json'));

assert.equal(release.releaseId, 'onboarding1-r1-instant-quick-play-funnel');
assert.equal(release.productVersion, '1.14.0-onboarding1-r1');
assert.equal(release.releaseSequence, 2026072401);
assert.equal(release.sourceBaselineSha, 'fea265003ac0625c8f4268f237746abc6a2043fd');
assert.equal(release.workerChangeRequired, false);
assert.equal(release.workerBaselineSha, 'a37d98313472d9f3706a7af2ce10810404b78607');
assert.equal(release.baselineWorkerVersionId, '6243d37c-191f-4a06-b6a7-b2e60c2a768a');

assert.equal(multiplayer.protocol, 6);
assert.equal(multiplayer.productVersion, '1.14.0-onboarding1-r1');
assert.equal(multiplayer.onboarding1R1.patch, 'onboarding1-r1-instant-quick-play-funnel');
assert.equal(multiplayer.onboarding1R1.oneClickQuickPlay, true);
assert.equal(multiplayer.onboarding1R1.firstTimeDirectDeployment, true);
assert.equal(multiplayer.onboarding1R1.mapId, 'grid_bunker');
assert.equal(multiplayer.onboarding1R1.difficulty, 1);
assert.equal(multiplayer.onboarding1R1.defaultBalancedLoadout, true);
assert.equal(multiplayer.onboarding1R1.advancedSelectionsPreserved, true);
assert.equal(multiplayer.onboarding1R1.launchModalAutoOpenRemoved, true);
assert.equal(multiplayer.onboarding1R1.postRunDiscoveryGuidance, true);
assert.equal(multiplayer.onboarding1R1.workerChangeRequired, false);
assert.equal(multiplayer.onboarding1R1.frontendOnly, true);
assert.equal(multiplayer.onboarding1R1.simplifiedPrimaryRail, true);
assert.equal(multiplayer.onboarding1R1.brandReturnsHome, true);
assert.equal(multiplayer.onboarding1R1.quickPlayPrimaryAction, true);
assert.equal(multiplayer.onboarding1R1.soloOperationsRail, true);
assert.equal(multiplayer.onboarding1R1.unifiedLeaderboardsSection, true);
assert.deepEqual(multiplayer.onboarding1R1.leaderboardTabs, ['LOCAL', 'ONLINE']);
assert.equal(multiplayer.onboarding1R1.careerRewardsFullSection, true);
assert.deepEqual(multiplayer.onboarding1R1.careerTabs, ['OVERVIEW', 'OPERATIONS', 'REWARDS', 'ACHIEVEMENTS', 'HISTORY']);
assert.equal(multiplayer.onboarding1R1.liveCommandFoldedIntoOperations, true);
assert.equal(multiplayer.onboarding1R1.primarySectionsModalFree, true);
assert.equal(multiplayer.onboarding1R1.decorativeModeRailRemoved, true);
assert.equal(multiplayer.onboarding1R1.homeDashboardCleaned, true);
assert.equal(multiplayer.onboarding1R1.deploymentStepperContextual, true);
assert.equal(multiplayer.onboarding1R1.loadoutRailRemoved, true);
assert.equal(multiplayer.onboarding1R1.loadoutFlowPreserved, true);

for (const token of [
  'ONBOARDING1_QUICK_PLAY_PRESET',
  "mapId: 'grid_bunker'",
  'difficulty: 1',
  "loadoutPolicy: 'default-balanced'",
  "loadoutId: 'loadout-field-standard'",
  'persistPresetSelection: false',
  'preserveAdvancedSelections: true',
  'markOnboarding1QuickPlayStarted',
  'markOnboarding1QuickPlayCompleted',
  'shouldShowOnboarding1Discovery',
]) assert.match(core, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

for (const token of [
  'initOnboarding1Experience',
  'completeOnboarding1QuickPlayRun',
  'ka:onboarding1-quick-play-start',
  'ka:onboarding1-quick-play-complete',
  'ka:onboarding1-quick-play-failed',
  'data-onboarding1-quick-play',
  'data-onboarding1-discover',
]) assert.ok(runtime.includes(token), `Missing onboarding runtime token: ${token}`);

assert.match(index, /id="onboarding1-quick-play-primary"/);
assert.match(index, /data-onboarding1-quick-play="rail"/);
assert.match(index, /data-onboarding1-quick-play="welcome"/);
assert.doesNotMatch(index, /data-next-screen="home" data-rail-screen="home"[^>]*>.*Quick Play/);
assert.match(index, /ARENA <b>GRID BUNKER<\/b>/);
assert.match(index, /DIFFICULTY <b>NORMAL<\/b>/);
assert.match(index, /LOADOUT <b>FIELD STANDARD<\/b>/);
assert.match(index, /data-onboarding1-discovery-panel/);
assert.match(index, /FIRST DEPLOYMENT COMPLETE/);
assert.match(index, /data-rail-screen="leaderboards"[^>]*>[^<]*<span>[^<]*<\/span> Leaderboards<\/button>/);
assert.match(index, /data-menu-screen="leaderboards"/);
assert.match(index, /data-leaderboards-tab="local"/);
assert.match(index, /data-leaderboards-tab="online"/);
assert.match(index, /id="ka-local-leaderboards-mount"/);
assert.match(index, /id="ka-online-leaderboards-mount"/);
assert.match(index, /data-rail-screen="career"/);
assert.match(index, /data-menu-screen="career"/);
assert.match(index, /data-career-tab="overview"/);
assert.match(index, /data-career-tab="operations"/);
assert.match(index, /data-career-tab="rewards"/);
assert.match(index, /data-career-tab="achievements"/);
assert.match(index, /data-career-tab="history"/);
assert.match(index, /id="ka-career-live-panel"/);
assert.doesNotMatch(index, /data-menu-screen="live"/);
assert.doesNotMatch(index, /<button[^>]+data-rail-action="(?:local-leaderboard|online-leaderboard|career-rewards)"/);
assert.doesNotMatch(index, /data-rail-screen="difficulty"[^>]*>[\s\S]*?Loadout<\/button>/i);
assert.match(index, /data-next-screen="difficulty"[^>]*>Continue to Loadout/);
assert.match(css, /ONBOARDING\.1 R1/);
assert.match(css, /data-ka-onboarding1-busy/);
assert.match(css, /ka-onboarding1-postrun/);

assert.match(main, /launchOnboardingQuickPlay/);
assert.match(main, /waitForArenaAssets/);
assert.match(main, /loadoutPolicy: 'default-balanced'/);
assert.match(main, /completeOnboarding1QuickPlayRun/);
assert.match(main, /restoreOnboardingMenuSelections/);
assert.match(main, /initOnboarding1Experience/);
assert.match(loadout, /freezeDefaultBalancedLoadoutForRun/);
assert.match(loadout, /createDefaultLoadoutProfile/);
assert.match(loadout, /onboarding-default-balanced-pve/);
assert.match(launch1, /disabled-by-onboarding1/);
assert.doesNotMatch(launch1, /window\.setTimeout\(\(\) => \{\s*if \(!readSeen\(\)\) openLaunch1Welcome\(\)/);

assert.match(updateDelivery, /onboarding1-r1-instant-quick-play-funnel/);
assert.match(updateDelivery, /releaseSequence: 2026072401/);
assert.match(builder, /ONBOARDING1_R1_PATCH/);
assert.match(builder, /"onboarding1_r1"/);
assert.match(verifier, /ONBOARDING\.1 R1/);
assert.match(verifier, /js\/onboarding1\.js/);
assert.match(verifier, /js\/onboarding1_core\.js/);


assert(index.includes('id="ka-career-live-panel" class="ka-career-live-block" data-career-live-panel hidden'), 'Career Operations live panel must be a dedicated embedded block');
assert(!index.includes('id="ka-career-live-panel" class="ka-career-panel" data-career-panel="operations"'), 'Career Operations must not activate two sibling operations panels');
assert(careerAchievements.includes("class: 'ka-career-operations-stack'"), 'Career Operations must use a single stacked layout host');
assert(careerAchievements.includes("operationsStack.append(liveOperationsPanel)"), 'Live Command must be mounted inside the Career Operations flow');
assert(careerAchievements.includes("liveOperationsPanel.hidden = false"), 'Embedded Live Command must be revealed only after it is mounted in the operations flow');

console.log('ONBOARDING.1 source integration and unchanged-protocol contract passed');
