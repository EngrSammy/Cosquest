# REPORT: CosQuest group call lag / phone hangs (task 069)

## Summary (read this first)
- **Why group video calls lagged and froze.** The phone was doing a lot of needless work in group video calls. The fixes are on branch **`calls-lag-fixes`** in EngrSammy/Cosquest; voice chats get the same fixes. What the phone was doing:
  - The orbit view re-rendered every live video about 3 times a second.
  - The middle circle flipped between speakers on every LiveKit update.
  - Each swap resized the videos every frame for over a second, which made Android's video surface drop frames and go black.
  - The phone sent LiveKit about 560 subscription messages a minute.
- **Measured** on a real 6-person group video call on the Android emulator (local LiveKit, 5 bot cameras):

  | | Before | After |
  |---|---|---|
  | JS thread | 15.5% | 4.4% |
  | LiveKit subscription messages per minute | 561 | 0 |
  | Video-surface "rejecting buffer" errors per 2 min | ~800 | 0 |
  | Frames showing a black circle | 25% | 14% |

  These are from a quiet machine. A back-to-back pair on a loaded machine shows the same direction: JS 24% → 7.5%, black frames 44% → 27%. Chart, screenshots, clips and raw numbers are in `evidence/calls-lag/` on the branch.

  App CPU drops less: about 8% in the paired run, and one rough quiet run of 94% → 81%. Heat was **not** measured. Some black flashes remain while circles move (14-38% of emulator frames, noisy); they look like an emulator or Android SurfaceView artefact and need a real phone to judge.
- **The phone hangs.**
  - The cause is **not** the Sparks model load blocking the app: it's an mmap on a native background queue, and the SDK's JS layer measured under 1 ms per event.
  - Two app-side Sparks problems are fixed: no 1 GB model download mid-call, and no call-screen re-render on every download progress tick.
  - The most likely remaining cause is **Sparks inference on the call's "scribe" phone**: a 1.7B model on all CPU cores but one, every 15 s, during the call. That needs an SDK change by Subomi (suggestion below) and a real iPhone to confirm.
- **PR: not opened.** `gh` is not logged in on this box. Open it from https://github.com/EngrSammy/Cosquest/compare/main...calls-lag-fixes?expand=1 and paste `/opt/cq/tasks/069-cosquest-call-lag/out/PR_BODY.md`. The same text is at the bottom of `evidence/calls-lag/README.md` on the branch.
- **PR #12.** Its branch (`ios-build11-fixes`) is pushed with these fixes merged in as **`calls-lag-fixes-build11`**, for the next iOS build.

## Did
1. Used the prepared clones:
   - EngrSammy/Cosquest `main` at c96c546, plus PR #12's branch `ios-build11-fixes`;
   - ubmids/cosquest-sparks at 5b0f415.
2. Read the call code: CallSession, OrbitCall, VoiceRoomSession, callSubscriptions, the LiveKit options, and the livekit-client and @livekit/react-native internals. Traced Sparks boot, load and download, and the in-call paths.
3. Built an emulator profiling rig (with a subagent):
   - **Build:** x86_64 release APK.
   - **Servers:** local chat backend and local LiveKit dev server.
   - **Call:** five @livekit/rtc-node bots with cameras and voice bursts; the phone user signs in and accepts a real 6-person group video call through the UI.
   - **Measured:** gfxinfo, per-thread CPU, LiveKit signalling, logcat, a recording, and a black-frame detector.
   - **Re-run:** `rig/run.sh <commit> <label>`.
4. Fixed the app-side causes in small commits, each with a short note on why.
5. Added `scripts/check-orbit-layout.ts` and a focus-mode case in `scripts/check-call-subscriptions.ts`.
6. Ran a reviewer subagent playing Mark on the emulator. It found:
   - the middle circle lagging behind the "speaking" line;
   - black flashes while circles resized;
   - a camera regression from my 540p change;
   - a focus-mode leak in big calls;
   - a Sparks edge case.

   All five are fixed. One attempted fix (moving circles with a native transform) made things worse on Android, and I caught it from the screenshots and reverted it.

   **Second review pass:** all three code issues confirmed fixed, and nothing new is broken.
   - It found the docs overstated CPU and heat: now corrected and stated for the final code only.
   - It found that resized circles overlapped their neighbours mid-move: fixed in 1fc9b43.
   - It found a first-Flip-after-Video-on bug that was already on main: fixed in b7ef86a.
   - Screenshots of every flow: `out/review/` and `out/review2/`.

## Causes found (evidence)
Group calls with up to 8 people use the orbit view (`components/calls/OrbitCall.tsx`): circles with live video inside.

1. **The middle circle flipped constantly.**
   - What it did: `speakingNow[0]` took the middle on every render, and LiveKit updates active speakers several times a second.
   - Cost per flip: a JS-thread spring on left, top, width and height (`useNativeDriver: false`, over 1 s), which resized the videos every frame.
   - Simulated lively call: 249 flips in 2 minutes, as close as 100 ms apart.
2. **The resizing broke the video surface.**
   - Logcat showed about 800 `BLASTBufferQueue … rejecting buffer` errors per 2 minutes on main, and about 25% of recorded frames had a black circle.
   - Each resize also changes the size adaptiveStream reports, so the requested video layer changes: VideoTrack `onLayout` → UpdateTrackSettings.
3. **The orbit re-rendered every 500 ms all call.** `useEngagement` called `setVersion` on every tick, and the new Map busted the memo.
4. **The call screen re-rendered every second** from the timer. That included the orbit, the Sparks notes, and the hidden Sparks page with the whole transcript.
5. **The speaking pulse ran on the JS thread** for each speaker.
6. **Each phone sent about 560 LiveKit messages a minute.**
   - The focus-mode effect keyed on `remoteParticipants`, which changes on every ActiveSpeakersChanged and ConnectionQualityChanged.
   - Each run called `setSubscribed(true)` on every mic, and livekit-client sends UpdateSubscription on every call (`RemoteTrackPublication.ts:54-79`).
   - Measured from the LiveKit server log: 561 a minute, all `subscribe: true`.
7. **`useTracks` re-rendered on every speaker or quality event**, its default `allParticipantRoomEvents`.
8. **`adaptiveStream` used `pixelDensity: "screen"`**: 3x on iPhones, where LiveKit's default caps at 2x.
9. **Sparks in calls, app side.**
   - A call answered from a cold start boots the SDK in CallSession, and `autoDownload` then started the ~1 GB model download plus hashing mid-call.
   - While call notes waited for the speech files, every model-status progress event called `setRetry` and re-rendered the call screen (`sparksCallNotes.native.ts:147`).
10. **Sparks in calls, SDK side (not changed).**
    - The scribe's `scribeCheck` and `summaryCheck` run every 15 s or 8 lines as P_BACKGROUND, lane `live`, with no budget.
    - mote uses all cores but one (`MOTE_RESERVE_CORES=1`) and has no batched prefill. docs/PERFORMANCE.md itself says pegging the cores starves the UI.
    - The engine thread is a default-attribute pthread (`sparks_engine.c:355`), with no QoS set.
11. **Ruled out, by measurement:**
    - The SDK's JS layer: a Node benchmark of the real `src/impl` code over a stub native layer, at 20 chats × 2,000 messages, ran everything under 1 ms per event on desktop.
    - The model load: mmap on a native serial queue (`SparksModule.mm:377-434`, `model.c:147-158`).

## Fixes (EngrSammy/Cosquest `calls-lag-fixes`, all pushed)
| commit | what |
|---|---|
| df225fa | **Orbit:** re-renders only on layout change; native-driver pulse; memoized OrbitView and OrbitCircle; logic in `orbitLayout.ts` with a Node check. |
| 2877874 | **Calls:** camera lists update on camera events only; focus and volume effects run only when needed; stable orbit props; Sparks page built when first opened; Sparks notes and panel memoized. (The 540p camera in this commit was later reverted.) |
| ad81883 | **Sparks:** no model download mid-call (it starts after the call); retry only on a phase change; memoized notes object. |
| 77e5ee7 | People list built only in orbit mode, never for the big-call stage. |
| ddee98a | **Voice chats** get the same fixes; shared `components/calls/callMedia.ts`. |
| 842352b | Evidence. |
| 9a05b29 | The middle goes to the next speaker at once when the holder is quiet (0.4 s minimum). The 1.5 s hold applies only to talking over. The speaking line names the middle. Size changes in one step. |
| 55bae7b | Camera back to LiveKit's default 720p; flip as on main. 540p caused double camera opens and "encodings mismatch". |
| a35077d | Focus mode goes through the subscription manager (`setVoicesMuted`); fixes a voice leak in big calls. Tested. |
| ee06268 | Phones too old for the model still fetch speech files during a call. |
| 5842d38 | Circles move with left/top again: a native transform left Android video surfaces behind. Size still changes in one step. |
| c72396b | Paired before/after evidence. |
| 1fc9b43 | A resized circle grows or shrinks around its centre, so it doesn't overlap its neighbours mid-move. |
| b7ef86a | Video on keeps the camera facing it had, so the first Flip after Video off/on works. This bug was already on main. |
| db88f74 | Evidence wording: honest CPU and heat claims, black-frame caveats, a sanity run of the final head. |

## Results
- `npx tsc --noEmit`: clean.
- `npx expo lint`: 12 errors and 120 warnings. Main also has 12 errors and 121 warnings; all 12 errors are in files not touched here.
- `npx tsx scripts/check-call-subscriptions.ts`: 12 of 12 ok, including the new focus-mode cases.
- `npx tsx scripts/check-orbit-layout.ts`: 11 of 11 ok. 249 hand-overs become 82, and the closest gap goes from 100 ms to 400 ms.
- **Emulator profiles:**
  - Raw runs: `/opt/cq/tasks/069-cosquest-call-lag/out/profile/`:
    - `before`, `before-2`, `before-3`: main;
    - `after`, `after-2`: ddee98a;
    - `after-v2-run1`: the native-transform attempt, broken and not used;
    - `after-v3`, `final`: 5842d38;
    - `final2`: b7ef86a, a sanity run: JS 5.7%, 0 subscription messages, 1 rejecting-buffer error, 38% black frames at load 14;
    - `exp-snap`: a discarded experiment.
  - Tables are in `evidence/calls-lag/README.md`.
  - The emulator's frame pacing (about 57 fps) and jank % are the same in both builds on a quiet machine. The emulator doesn't show the stutter itself; the work behind it is what dropped.
- **Review artefacts:** `/opt/cq/tasks/069-cosquest-call-lag/out/review/` (first pass, with screenshots of every flow) and `out/review2/` (second pass).

## Commits
- EngrSammy/Cosquest `calls-lag-fixes`: df225fa … **db88f74** (head; above). Pushed and verified with `git ls-remote`. All commits are by Subomi-olagoke, with no AI or co-author lines.
- EngrSammy/Cosquest `calls-lag-fixes-build11`: **23bfce3**. That is `ios-build11-fixes` plus `calls-lag-fixes` merged in; the one conflict (the SparksCallPanel props) is resolved by keeping both, and tsc is clean. Pushed.

## Left / blocked
- **The PR needs opening by hand** (no `gh` auth here). Link and description are above.
- **Needs a real iPhone:**
  - heat and CPU over 10 minutes in a 5-person video call;
  - Instruments on the scribe phone, to confirm the Sparks inference contention;
  - whether the brief black flash while a circle moves is emulator-only. The emulator uses software rendering; iOS draws video with Metal;
  - the cold-start-from-call Sparks path;
  - Sparks live topics on the call page. Sparks can't run on the emulator.
- **SDK follow-up for Subomi (not done, untested):** in `cpp/sparks/sparks_engine.c` `worker()`, before `run_one`, on Apple: `pthread_set_qos_class_self_np(n->priority == SPK_P_BACKGROUND ? QOS_CLASS_UTILITY : QOS_CLASS_USER_INITIATED, 0)`. `dispatch_apply` inherits it, and iOS prefers the efficiency cores at utility. Alternatively, cap the matmul threads at 2 while a transcription session is open.
- **Possible follow-up for the remaining black flashes on Android:** `@livekit/react-native-webrtc` only renders through a SurfaceView on Android. A TextureView renderer would follow layout and transforms without blanking, but it is a native change to the package. Only worth doing if a real Android phone shows the flashes.
- **Already on main, not touched:**
  - your own small circle covers the bottom name in the orbit;
  - the 1:1 End button sits at the right edge;
  - the minimize chevron covers "‹ Call" in 1:1 Sparks (PR #12 fixes this).
- **Left on disk:**
  - worktrees `cx-call-lag/build-before`, `build-final2` and `wt-build11`;
  - APKs in `cx-call-lag/apk/`;
  - AVD `cx069`.
  - No background processes are left running.

## Decisions
- **The Sparks scribe stays on during calls.** Pausing it from the app (`setGameState`) stalls its lease without releasing it, and `trivia` mutes transcription, so live topics would silently break. The fix belongs in the SDK.
- **The model download is deferred during a call, but a model already downloaded still loads at once.** Loading is an mmap, and notes and the scribe need it.
- **Middle-circle rules.** The next speaker takes the middle at once when the holder is quiet (0.4 s minimum, against flicker). The holder keeps it for 1.5 s against someone talking over them. It returns to the pinned person after 1.5 s of quiet.
- **Camera left at LiveKit's 720p default.** I tried 540p; the 540p row in the table above has why it was reverted. dynacast already stops unwatched layers.
- **Size changes in one step instead of animating.** Animated resizing of video surfaces caused the black flashes. Circles still glide to their new place.
- **Voice chats got the same fixes:** same orbit code, same bug.
