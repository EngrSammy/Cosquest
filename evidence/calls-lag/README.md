# Group video call lag: evidence

Branch `calls-lag-fixes`. The full write-up (causes, fixes, how to check on a phone) is in the PR description. A copy is at the bottom of this file.

![Before vs after](before-after.png)

## How this was measured
- **Call:** a real 6-person group **video** call on an Android emulator, shown in the orbit view.
  - The phone user joins with the emulator's camera on.
  - 5 LiveKit bots each send a 640x360 camera and take turns talking in 1-3 s bursts that sometimes overlap.
- **Setup:** a local chat backend and a local LiveKit server. Nothing touches production.
- **App:** an x86_64 release APK with the JS bundled in.
- **Comparison:** `main` (c96c546) against this branch (ddee98a). Each build was run twice, with two 60 s windows per run.
- **Signal counts:** taken from the LiveKit server's debug log, counting only messages the phone sent.

| (mean of 4 windows) | Before | After |
|---|---|---|
| App CPU (100% = one core) | 94.4% | 73.8% |
| JS thread CPU | 15.5% | 4.9% |
| UI (main) thread CPU | 7.0% | 4.5% |
| Subscription messages sent to LiveKit per minute | 561 | 0 |
| Video size requests (UpdateTrackSettings) per minute | 65 | 65, but requesting half the pixels (111 vs 222 px for the middle circle) |
| Frames per 60 s / janky % / p90 | 3417 / 1.1% / 23 ms | 3235 / 1.3% / 22 ms |

The emulator renders in software and kept about 57 fps in both builds, so frame pacing doesn't separate them; jank differences of ±0.5% are noise. What changed is the work behind each frame: about 3x less JS-thread time, a fifth less app CPU, and no flood of signalling messages.

On a phone that is also encoding its own camera and decoding five others, that headroom is what decides whether the picture stutters. On this emulator, with these bots, nothing visibly stuttered in either build.

Raw numbers: `numbers-before.json`, `numbers-before-2.json`, `numbers-after.json`, `numbers-after-2.json`.

## Screens
| Before | After |
|---|---|
| ![before](orbit-before.png) | ![after](orbit-after.png) |

The layout is the same; the fixes are under the hood. 12-second clips: [call-before.mp4](call-before.mp4) and [call-after.mp4](call-after.mp4).

## The middle circle (simulation)
`npx tsx scripts/check-orbit-layout.ts` simulates a lively 2-minute, 6-person call with speaker updates every 100 ms and people talking over each other.
- **Before:** the middle circle, and the videos in it, changed hands 249 times, as close as 100 ms apart.
- **After:** 57 times, never closer than 1.5 s.

The emulator bots take clean turns, so this case doesn't show up in the emulator numbers above.

## Not measurable here (needs a real iPhone)
- **Heat and CPU on an iPhone:** VP8 is software-encoded there, at 540p instead of 720p.
- **The Sparks scribe:** its model checks compete with the call for the CPU (see "Not in this PR" in the PR description).
- **Video at 3x pixel density:** whether it looks sharp enough. It now requests 2x, LiveKit's default.

---

## PR description (copy)

## Group video calls: lag and freezes (and the phone getting hot and stuck)

The team reported this on 22 and 23 October: group video calls lag and freeze ("it just hung for some time"), and Emmanuel's iPhone hangs.

This PR fixes the causes found in the app. The rest are in the Sparks SDK and are listed under "Not in this PR".

### What was wrong, and what changed

| # | Cause (where) | Fix |
|---|---|---|
| 1 | **The middle circle changed hands on every speaker update.** Group calls with 8 people or fewer use the orbit. It put whoever LiveKit called "speaking" in the middle immediately. With people talking over each other, the big and small circles, and the live videos in them, swapped several times a second. Each swap was a >1 s JS-thread spring on left/top/width/height. It resized the videos every frame, which made LiveKit switch video quality mid-animation; a new quality needs a fresh keyframe, so the picture **freezes**. Simulated 2-minute, 6-person call: **249 swaps, 100 ms apart at the closest**. | The middle is held for at least 1.5 s. It goes back to the pinned person only after 1.5 s of quiet, not at every breath. Moves are a 320 ms glide. Same simulation: **57 swaps, never closer than 1.5 s** (`npx tsx scripts/check-orbit-layout.ts`). |
| 2 | **The orbit re-rendered twice a second for the whole call**, including every video (the engagement timer in `OrbitCall.tsx`). | It re-renders only when the layout actually changes. `OrbitView` and `OrbitCircle` are memoized. |
| 3 | **The whole call screen re-rendered every second** (the call timer), and so did the orbit, the Sparks notes, and the hidden Sparks page with the full transcript. | Orbit people objects and `renderVideo` stay the same while nothing changed. The Sparks page is built the first time it is opened. The Sparks notes and panel are memoized. |
| 4 | **The speaking pulse ran on the JS thread** for every speaker, the whole time they spoke. | It uses the native driver (opacity and scale only). |
| 5 | **One LiveKit message per microphone on every speaker update.** The focus-mode and private-call-volume effects ran on every participant update, and `setSubscribed` sends a signalling message every time it is called. | They run only when focus or private mode changes, or a microphone is added. |
| 6 | **Camera at 1280x720, 30 fps** (LiveKit's default), encoded three times over (simulcast) on every phone for the whole call, while nobody sees more than a 132 px circle. `adaptiveStream` density "screen" (3x on iPhones) asked for bigger layers than the default. Flipping the camera reopened it at 720p. | 960x540 at 25 fps, with 540/360/180p simulcast. The camera flip keeps that size. LiveKit's default density (2x). |
| 7 | **Camera lists updated on every active-speaker and connection-quality event** (`useTracks` default). | They update on camera events only. |
| 8 | **Sparks during calls.** A call answered from a cold start boots Sparks from the call screen, and the ~1 GB model download then ran during the call. While call notes waited for the speech files, every download progress event re-rendered the call screen. | The download waits until the call ends; a model already on the phone still loads at once, since that is only a file mapping. Notes retry only when the model phase changes. |

Voice chats (Community / faction) use the same orbit and had the same patterns, so they get the same fixes. The shared settings are in `components/calls/callMedia.ts`.

### Not in this PR (Sparks SDK, needs Subomi)
- **On-phone AI competes with the call for the CPU.** The phone picked as the call's "scribe" runs a topic check with the 1.7B model every 15 s or every 8 lines, plus live topic summaries. Each check uses all CPU cores but one (`MOTE_RESERVE_CORES=1`), and mote has no batched prefill, so a ~200-token prompt keeps those cores busy for seconds (`docs/PERFORMANCE.md`). On that phone this is the most likely remaining cause of freezes and heat.
  - The app can't turn it down without turning off live topics: `setGameState` pauses the scribe without releasing its lease, and `trivia` mutes transcription.
  - Suggested SDK change: run background-priority jobs at a lower thread QoS. On iOS that means `pthread_set_qos_class_self_np(QOS_CLASS_UTILITY, 0)` on the engine worker before a `P_BACKGROUND` job; `dispatch_apply` inherits it, and iOS then prefers the efficiency cores. Alternatively, cap the matmul threads at 2 while a call transcription session is open.
- The model load itself is not a JS-thread hang: it is an `mmap` on a native background queue.

### How to check on a phone
1. Start a group **video** call with 4 or more people and their cameras on, and get two people to talk over each other for a minute.
   - Before: the circles jump around and the videos stutter or freeze.
   - Now: the middle changes at most every 1.5 s, and the videos keep playing.
2. Flip the camera mid-call. The other side should keep a smooth picture.
3. Leave the call on for 10 minutes. The phone should get noticeably less warm than on build 10.
4. Optional, in Xcode Instruments (Time Profiler, plus the Animation Hitches template) during a 5-person video call: the JS thread should be mostly idle between speaker changes.
5. Swipe to the Sparks page: it still shows live topics and lines.
6. Focus mode and private calls still mute and quiet the call as before.

### Checks run
- `npx tsc --noEmit`: clean.
- `npx expo lint`: no new errors. The 12 errors are already on main, in files this PR doesn't touch.
- `npx tsx scripts/check-call-subscriptions.ts`: ok.
- `npx tsx scripts/check-orbit-layout.ts` (new): ok.

### Note on PR #12 (`ios-build11-fixes`)
They conflict in one place: the `SparksCallPanel` element in `CallSession.tsx`. To resolve, keep the `sparksSeen ? (...) : null` wrapper and add #12's `clearMinimize={!call.isGroup}` prop inside it. A pre-merged branch is pushed as `calls-lag-fixes-build11`.
