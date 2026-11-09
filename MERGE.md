# The merged app (branch `merged-app`)

CosQuest (the chat app) and CostQuest (the AR game) as **one app**: the chat
tabs and the game's live map side by side, one swipe apart, one login.
How it feels and why: [docs/merged-app-ux.md](docs/merged-app-ux.md).

This branch lives only here (MCJ-events/COSQUEST, private). Nothing from it
goes to the chat app's public repo.

## What went in

| Source | Commit | Where it is here |
|---|---|---|
| This repo, `main` | `fa08ca7` (Merge pull request #4, deploy-test-pipeline) | the branch point; `cosquest-backend/` as it was, plus the changes below |
| Chat app, EngrSammy/Cosquest `main` | `b1e0ee9aa98a3dd34c55b0ae6b33aaf5916714bc` (13 Oct 2026, "Fix long-press sheet and Community top spacing on web; Sparks SDK: …") | `app/`, imported **with its history** by `git subtree add --prefix=app` (merge commit `06cc6e1`) |
| Game, ubmids/costquest-ios `main` | `94db554a0c836b6cb92a86fdcd103dca0a62e7b4` ("Relicdex shows Forge weapons…") | `app/modules/costquest-game/ios/Game/` (copied, not merged: see below); recorded in `app/modules/costquest-game/UPSTREAM` |
| Unity world, ubmids/costquest-unity `street-look` | `47560e40567c5a0c92df1e69706a22bab351f463` (Unity 6000.0.84f1), duel sim ubmids/costquest-duel `af4aa08efb221dddbaeb83a93bfe7337eb2d3ec9` | not in git: `UnityFramework.framework` from release `unity-fw-47560e4` on ubmids/costquest-ios, sha256 `2c504d9fe6ce3f9d8ef9257940fd35792ea77aa0ca345836d9c62aa1578b6d99` (`app/modules/costquest-game/FRAMEWORK_PIN.md`) |
| Game backend, ubmids/costquest-backend | branch `cosquest-sso` at `8eff8ba` (from `main` `b2a9c68`) | stays in its own repo: `POST /v1/sso/cosquest` (one login), `docs/SSO.md`. Not deployed |

## Layout

```
app/                              the Expo app (chat app + the merge)
  app/(tabs)/_layout.tsx          tabs wrapped in the world pager (page 0)
  app/play.tsx, app/coins.tsx     cosquest://play?… and cosquest://coins?… links
  components/world/               the shell: pager, game page, bubble, handle,
                                  coachmark, invite card, share picker, bridge
  features/world/                 the shell's rules as pure TypeScript + tests
  services/gameInvites.ts         POST /api/chats/:id/game-invites
  modules/costquest-game/         the game as an Expo local module
    ios/Game/                     costquest-ios's CostQuest/ sources, copied
    ios/Embed/                    the embedding layer (GameHost, the module,
                                  the view, one login, account key)
    ios/patches/                  4 small hooks applied to the copied sources
    ios/Resources/                the game's fonts, logo and launch colour
    ios/CostQuestGame.podspec     Unity on device builds, NO_UNITY otherwise
    ios/Frameworks/               UnityFramework.framework (gitignored, fetched)
    android/                      placeholder with the same API (merge task 2)
    plugin/withCostQuestGame.js   Info.plist / entitlements / Unity embed phase
    src/index.ts                  the JS API
    UPSTREAM, FRAMEWORK_PIN.md    exactly what was copied and which Unity build
  scripts/sync-game-from-ios.sh   re-copy the game from costquest-ios
  scripts/fetch-unity-framework.sh  download + verify the pinned Unity build
cosquest-backend/                 the chat backend (+ game invites, game session)
docs/merged-app-ux.md             the shell's gesture rules, states, timings
scripts/verify-ios.sh             the Mac's end-to-end iOS build check
MERGE.md                          this file
```

Backend additions on this branch (`cosquest-backend/`, not deployed):
`kind: "game_invite"` messages, `POST /api/chats/:id/game-invites`, and
`GET /api/game/session` (what the game backend's one login asks). See
`cosquest-backend/API_GUIDE.md`, "Game invites and the game session".
Tests: `cosquest-backend/test/gameInvites.js`.

## Pulling later changes

### The chat app (subtree)

```sh
git checkout merged-app
git subtree pull --prefix=app https://github.com/EngrSammy/Cosquest.git main
```

No `--squash`: the history came in whole, keep it that way. Conflicts are
most likely in the files the merge touched in `app/`:
`app/(tabs)/_layout.tsx`, `app/_layout.tsx`, `app/chat/[id].tsx` (the invite
card, the `Message` type), `services/chats.ts` (`gameInvite` on
`ChatMessage`), `store/slices/chatSlice.ts` (the preview line), `app.json`
(the game plugin, iOS 18), `package.json` (`test`, `typecheck`),
`tsconfig.json` (`allowImportingTsExtensions`). Everything else under `app/`
that the merge added is in new files and directories.

Then run `cd app && npm install && npm test && npm run typecheck`.

Team syncs so far (the team's main merged into `app/` with its history):

| Date | Team commit | Merge commit | Notes |
|---|---|---|---|
| 20 Oct 2026 | main `0dd7569` + sparks-calls `98627ba` | `5b4a735` | Sparks SDK 1.2.7 |
| 3 Nov 2026 | main `4b911db` (contains TestFlight build 14 = `d5e4888`) | branch `team-sync-20261103` | 131 commits, 102 conflicted files; see `~/Desktop/cosquest-review/day1-20261103/team-sync/README.md` |

What was done on 3 Nov, and works again next time:

```sh
git remote add team https://github.com/EngrSammy/Cosquest.git   # fetch only:
git remote set-url --push team DISABLED-never-push-public        # the repo is PUBLIC
git fetch team
git merge -s recursive -Xsubtree=app --no-ff team/main            # = git subtree pull
cd app && git checkout --ours package-lock.json && npm install --package-lock-only --ignore-scripts
```

Since 3 Nov the chat side's own pieces are the source of truth for push (the
token: `components/PushRegistration.tsx`; taps: `components/PushTapHandler.tsx`
via `utils/openFromNotification.ts`, which leaves `cosquest://play` links to
`components/world/GameBridge.tsx`), Report (`components/report/reportStore`),
socket preview refreshes and the Home tab. Our `PushBridge` keeps only the
waiting links and the badge. In conflicts, take the team's behaviour and fold
our accessibility, perf and game code back in.

The team's "CosQuest Beta" TestFlight build (App Store Connect app 6824541255,
bundle com.subomi.cosquest.chat) is `COSQUEST_TESTFLIGHT=1` in `app.config.js`;
`source app/scripts/cosquest-beta-env.sh` sets the whole environment (chat on
Render, game on staging, build number 15 unless COSQUEST_BUILD_NUMBER says otherwise).

### The game (copy + patches)

The game is an Xcode app, not a package, so it is copied rather than merged:

```sh
cd app
scripts/sync-game-from-ios.sh            # costquest-ios main
scripts/sync-game-from-ios.sh <sha>      # or a commit / branch
COSTQUEST_IOS_DIR=~/src/costquest-ios scripts/sync-game-from-ios.sh   # a local checkout as is
```

It replaces `modules/costquest-game/ios/Game/`, drops the `@main` App struct,
re-points named assets at the module's bundle, regenerates the public C
header from the game's bridging header, applies `ios/patches/*.patch`, and
rewrites `UPSTREAM` and `FRAMEWORK_PIN.md`. If a patch no longer applies it
stops and names it: fix the patch against the new upstream and run it again.
Commit `modules/costquest-game` in one go.

If the Unity pin moved (the script says so), fetch the new framework on the
Mac:

```sh
app/scripts/fetch-unity-framework.sh     # gh release download + sha256 check
```

### The game backend

`cosquest-sso` on ubmids/costquest-backend is a normal branch: merge `main`
into it (or rebase) as usual. Nothing of the game backend lives here.

## Building

* JS checks (anywhere): `cd app && npm ci && npm test && npm run typecheck && npx expo lint`
* Android (Linux or Mac, JDK 17 + Android SDK):
  `cd app && npx expo prebuild --platform android --clean && cd android && ./gradlew assembleDebug`
* iOS (Mac): `scripts/verify-ios.sh` (fetch Unity, `npm ci`, prebuild,
  `pod install`, simulator build without Unity, generic device build with
  Unity); `--no-unity`, `--sim-only`, `--run`.

The iOS deployment target is **18.0** (the game's RealityKit/SwiftUI APIs and
`Synchronization.Mutex` need it). The chat app was 16.0 before the merge, so
two groups can no longer install it: the iPhone 8, 8 Plus and X (their last
iOS is 16), and anyone on a newer iPhone who has not updated to iOS 18 yet.
Every iPhone from the XS / XR and SE (2nd gen) on runs iOS 18.
