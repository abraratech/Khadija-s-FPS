# Khadija's Arena — M4.59–M4.62 Final Certification & Player-Facing Polish

Baseline: `d4024500eaf52ef1660e09a96a3bbec792a1ec48`  
Release: `m4-final-player-polish-r1`  
Multiplayer protocol: `6`

## Included fixes

- Local leaderboard storage reloads before display and submission.
- The latest completed map and difficulty open automatically.
- Local score-save and online accepted/queued results are visible after a run.
- Online challenge tokens are preserved correctly through asynchronous run submission.
- Career & Achievements screen explains Profile Level, XP, statistics, achievement rewards, locked achievements, and completion dates.
- Cloud Save settings now show a simple default surface.
- Device, recovery, history, passkey, backup, diagnostics, reliability, and deletion tools remain under **Manage Cloud Account**.
- Passkey sign-in reports friendly account-state errors instead of exposing raw Worker codes.
- Signing into the currently connected guest account is prevented until that account is upgraded.
- Passkey registration advertises and verifies both ES256 and RS256.
- Frontend and Worker release identity is updated together.

## Required browser certification

1. Complete a single-player run on a non-default map and difficulty.
2. Confirm **LOCAL SCORE SAVED** appears and the Local Leaderboard opens to that category.
3. Confirm **ONLINE SCORE ACCEPTED** or **ONLINE SCORE QUEUED** appears.
4. Open Career & Achievements and verify level, XP, career totals, locked achievements, and completed achievements.
5. Confirm Settings shows the simplified Cloud Save row by default.
6. Open and close Manage Cloud Account.
7. On a connected guest account, click Sign In using its own account ID and confirm the game instructs the player to upgrade first.
8. Upgrade the guest account using a passkey on the HTTPS Pages deployment.
9. Sign out and sign in again.
10. Verify the frontend and Worker release manifests match.

## Deferred roadmap

- M5 early: co-op quick messages and text chat.
- Later M5: evaluate push-to-talk voice chat with mute, device selection, permissions, and safety controls.
- CrazyGames and other web portal publishing remains after game stability and certification.
- Android APK/native mobile packaging is a post-web-release phase. It should replace the mobile-browser presentation only after single-player, multiplayer, portal publishing, and web release stabilization are complete.


## M4.63–M4.64 browser hotfix

Baseline: `44c73c05aa0dabb4c89f9201c504a6526b481f03`  
Hotfix: `m4-leaderboard-refresh-style-r1`

- Persists the latest local leaderboard save feedback across a normal page refresh.
- Persists the latest online accepted or queued feedback across a normal page refresh.
- Restores the latest map/difficulty category and rank message during leaderboard initialization.
- Styles Local Leaderboards, Online Leaderboards, and Career & Achievements with the existing Khadija's Arena menu controls.
- Adds deterministic refresh-restoration tests for accepted and queued submissions.
- Frontend-only hotfix: no Worker code, protocol, or release identity change.

## M4.65–M4.66 expired cloud-session recovery

Baseline: `9db29410993c0a9a8001fbc3ff768d98da17ffdc`

Hotfix: `m4-expired-cloud-session-recovery-r1`

- Treats `PROFILE_TOKEN_REJECTED` and `PROFILE_AUTH_REQUIRED` as permanent session expiry rather than retryable network failures.
- Clears only invalid cloud credentials, retry state, and queued remote work.
- Preserves local progression, achievements, settings, scores, leaderboard feedback, and the cloud account ID hint.
- Displays `CLOUD SESSION EXPIRED · LOCAL PROFILE KEPT` and returns Cloud Save to its disconnected state.
- Stops the retry loop and changes security refreshes from four parallel requests to fail-fast sequential requests.
- Adds deterministic core and runtime tests that force a 401 rejection and prove the local profile survives.
- Frontend-only hotfix: multiplayer protocol and Worker release remain unchanged.

