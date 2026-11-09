# CosQuest journeys: findings

Task cq 054, 2026-10-20. Android emulator (API 35, x86_64, 1080x2400),
release builds of `merged-app-sync`, against local backends:

- chat: `MCJ-events/COSQUEST` main 8a218aa with its `merged-app` branch merged
  in locally (main alone has no game-invite route, see F-01), in-memory Mongo
  and Redis, seeded by `e2e/seed/chat-local.js`;
- game: `ubmids/costquest-backend` `integration-20261016` (what staging runs),
  local Postgres, the seeded test world at Trafalgar Square;
- calls: a local LiveKit dev server; the other people in a call are
  `e2e/seed/peer.js` joining the room with `@livekit/rtc-node` and sending a tone.

Plus a light pass against the test servers (`e2e/testserver/smoke.js`).
How to run everything: `e2e/README.md`. Journey results: the table at the end.

Severity: **Blocker** (a journey cannot be finished), **High** (wrong or
broken in a way most people hit), **Medium** (wrong but there is a way
round), **Low** (polish, copy, consistency), **Info** (test rig notes).

Owner: **app** (the merged Expo app; for chat screens that is the team's code
in `app/`), **chat backend** (MCJ-events/COSQUEST), **game backend**
(ubmids/costquest-backend), **Sparks** (SDK/module), **design** (needs a
product decision).

Status: **fixed** (commit on `merged-app-sync`), **open**. "Proof" names the
journey or unit test that shows it.

## Fixed

| ID | Sev | Owner | Where | What | Commit | Proof |
|----|-----|-------|-------|------|--------|-------|
| F-02 | High | app | Cosquest tab (`app/(tabs)/home.tsx`) | The first tab, where sign-in and the splash land, was the Expo starter screen ("Edit app/(tabs)/index.tsx to see changes"). Same in the team's chat app. Now the map-pin tab opens the game and `/home` goes to the chats. | badebea | J01 asserts the starter text is gone |
| F-03 | High | app / design | Live tab | Also the Expo starter screen. Now an honest page pointing to voice chats, calls, Quest Hours and raids until a Live design exists. Its copy said "a voice chat in any group" (wrong: only Community and faction rooms) and "Go to your chats" landed on Feeds; both fixed. | badebea, 7c8b33a | manual |
| F-04 | Blocker | app | Sign-up, picture step | Continue did nothing visible: the step needs a photo AND an avatar and the error showed at the top, off screen below the 100-avatar grid. The error now also shows next to Continue. | 50dbd3f | J01 |
| F-07 | Medium | app (a11y) | `components/Field.tsx` | Onboarding text inputs and the password eye had no accessible names. | 50dbd3f | TalkBack names |
| F-11 | Low | app (lint) | team chat code | `npm run lint` failed with 15 errors: 13 unescaped apostrophes in the team's chat copy, `__dirname` in the game's config plugin, and the conditional hooks (F-31). Now 0 errors. | ecbfc0b | `npm run lint` |
| F-12 | Low | app (a11y) | Onboarding permissions | The location and notification switches had no names or switch role. | 89ca7fb | a11y tree |
| F-13 | High | app | Onboarding faction step | Choosing Everborn ("Fantasy Fans") failed: "Failed to save faction. Please try again." The app sent `everborn`, the backend only takes `everborns`. | 2ba5b5d | J01 before: FAIL at the faction step |
| F-14 | Low | app (a11y) | Profile photo screen | Avatar tiles and the back chevron had no names. | 89ca7fb | a11y tree |
| F-16a | High | app / chat backend | Onboarding | The onboarding calls identified the account by the email in the body only, so anyone who knows an email could edit an account still onboarding (`identifyUser.js:40`). The app now also sends the sign-up token. The backend still accepts email alone: see F-16b. | 0f0c1bc | unit test signupSession |
| F-21 | High | app | Chat composer, sheets (14 screens) | On Android 15 (edge-to-edge) the keyboard covered the message box and Send: you could not see what you typed or reach Send. `KeyboardAvoidingView` had no behaviour on Android, and edge-to-edge stops the window resizing. Now `padding` on both platforms. | b434ee5 | J03 before: FAIL at Send; after: PASS |
| F-22 | High | app | Reply bubbles | Every reply quote said "Reply / Message". The backend sends `replyTo: {id, senderName, preview}`; the app read `sender.username` and `content`. | 32cdc02 | J06 asserts no placeholder; unit test replyQuote |
| F-23 | Low | app (a11y) | Chat header | The back chevron had no name. | cf4da93 | a11y tree |
| F-24 | Low | app | New group, step 4 | The subtitle said "Private group group". | c67723e | J03 |
| F-25 | Low | app (a11y) | Photo preview | Close and send had no names. | 9934006 | a11y tree |
| F-31 | Blocker | app | 1:1 call becomes a group call | **The app crashed** ("Rendered fewer hooks than expected") as soon as someone was added to a 1:1 call: two hooks in `CallSession.tsx` ran after the group call's early return. This is the `rules-of-hooks` lint error from the team's main. | 9034081 | J07 before: crash; after: PASS |
| F-33 | High | app (game) | Point sheet | A link or chat invite opened the point tapped earlier instead of its own (`selectedId ?? focusPoint`). On Trafalgar Square, where pins overlap (F-37), this is easy to hit. | 6c2e372 | J09 taps a pin then follows a link |
| F-34 | Medium | app / design | Game reward screen | There was no way to share a game result into a chat (only "Invite a chat here" from a point). Added "Share to a chat" on the reward screen; it sends a text line ("🏆 Point taken at Test Trivia Stone · +470 XP in CosQuest") because the chat backend has no result card (`Message.kind` has `game_invite` only). A real card needs a backend kind: see F-44. | 1c71855 | J10; unit test resultShareText |
| F-35 | Low | app (a11y) | Community header, Notifications | The profile and bell buttons and the notifications back arrow had no names. | 2ab7e5e | a11y tree |
| F-36 | Medium | app | `cosquest://play` links | A play link opened while a chat screen was showing opened the game behind the chat (nothing visible happened). The route now dismisses to the tabs first, as the in-chat invite card already did. | c5550b4 | J12 |
| F-06 | Medium | app | Sign-up, picture step | Continue sat under 100 avatars: you scrolled past all of them to move on. It is now pinned at the bottom with the photo error next to it. | 6f2590f | J01 asserts Continue is on screen without scrolling |
| F-15 | Medium | app | Sign-in and every chat API call | With the backend unreachable the raw platform error was shown ("fetch failed: java.net.ConnectException: Failed to connect to localhost/127.0.0.1:4120", "java.io.IOException: unexpected end of stream"). `apiRequest` now says "Can't reach CosQuest right now. Check your connection and try again." and retries a GET once (a dead pooled connection after a server restart). POSTs are not retried silently. | 1b7a2c3 | unit test networkError |
| F-19 | Medium | app | Profile | The Quest/Wins/Points cards, Edit Profile / Share Profile and the Posts/Reels/Thoughts bar rendered on Android as a grey box with a line across the label: Android draws the elevation shadow through a see-through background. Elevation is now off on Android for those (iOS unchanged). | ca9ee20 | J02 screenshot j02-profile, before vs after |
| F-26 | Medium | app | Chat, edited message | After an edit the "Saved text / Changes saved / Restore previous wording" card opened under every message edited in the last 10 minutes, each time the chat was opened (half the screen). It now shows only under the message you just edited and has Done. | 55b5ca5 | J06 edits, sees the card, taps Done |
| F-41 | Low | app | Incoming call | Tapping the "Accept"/"Decline" captions did nothing; only the round buttons did. The caption is now part of the button. | 3718d17 | J07 answers by tapping the caption |
| F-46 | Low | app | Links | A link with no screen (e.g. the message link fallback `cosquest://chat/<id>/message/<id>`) showed expo-router's developer "Unmatched Route" page. There is now a `+not-found` screen with "Go to your chats". Still open: invite links are `https://cosquest.vercel.app/group/join/<code>`, which won't open the Android app without app links (needs the domain's assetlinks.json). | 39dda0c | J12 opens an unknown link |
| F-47 | Low | app | Chat search | "Open the chat" from a search result pushed a second copy of the chat (Back showed the same chat again) and did not show the message. It now goes back to the chat and scrolls to the message. | b83f40f, 79c3d33 | J06: Open the chat, the message is on screen, one Back reaches the list; unit test chatFocus |
| F-49 | High | app | Sign-up, location step | The switch asked only for a low-power (network) fix and gave up after 6 s. With no network location (Wi-Fi off, no Google location services, the emulator) no fix ever came: "We could not get your location quickly enough", then "Location is required to play CosQuest", and sign-up could not continue. It now asks the GPS as well when no network fix comes in 8 s. | 3a1a7c4, c50dd51 | J01 failed on builds 9 and 10 (fresh emulators); passes after |
| F-50 | Medium | app | Sign-up first screen | "Sign up with Apple" did nothing when tapped (`onPress={() => {}}`), a dead end on both platforms. It now says Apple sign-in is coming, as sign-in's Apple button already did. Apple sign-in itself still needs building (and is required by App Review when Google sign-in is offered on iOS). | bc59520 | J01 taps it |

## Open

| ID | Sev | Owner | Where | What |
|----|-----|-------|-------|------|
| F-01 | High | chat backend | `POST /api/chats/:id/game-invites` | The route the merged app uses for invite cards exists only on MCJ-events/COSQUEST `merged-app`, not on `main`, and **not on the test server** (404, `e2e/testserver/smoke.js`). Against them every "Invite a chat here" fails ("Couldn't send to ..."). Merging `merged-app` into main locally needed 7 small union resolutions; the backend suite then passes 1008/1008. |
| F-05 | Medium | design | Sign-up, picture step | The subtitle says "take a photo **or** pick an avatar" but a photo is required (added on purpose in 3c01fbc). Copy or rule should change. |
| F-08 | High | design | Factions | Two faction systems: chat onboarding asks for one of 6 ("Anime Fans", "Comic Book Fans", ... backed by Ascendants, Icons, ...), the game asks again on first open ("Choose your side") with 5 different ones (Anime, Marvel, DC, Movies, Gaming) and does not pre-fill. A new player picks a side twice, with different names. |
| F-09 | Low | app | Sign-up vs sign-in | Sign-up offers Google and Apple; sign-in only Google. |
| F-10 | Low | design | Create profile | Gender is Male or Female only. |
| F-16b | High | chat backend | `src/middleware/identifyUser.js:40` | Onboarding routes still accept an email with no token, for any account not yet onboarded. With F-16a the app sends the token, so the backend can now require it. |
| F-18 | Low | app | Profile faction card | Shows "Private · 4 members" (her faction group) under the ICONS logo, while the faction has 1.9K members. |
| F-20 | Low | app | Profile photo | "Change Profile Photo" in Account Information opens the system picker straight away; the same label in Edit Profile opens a screen with photo and avatars. Two flows, one label. |
| F-27 | Low | app / Sparks | Start a Spark | A Spark started from an older message opens as "Quiet · last reply 4:27 AM" the moment you start it. |
| F-29 | Low | design | New group, step 4 | "Eligible faction members join automatically" shows for a private group. |
| F-32 | High | app / Sparks | Group calls and voice chats | The "Sparks" button in a group call or a Community/faction voice chat only says "Sparks in calls is coming soon." Sparks in calls works in 1:1 calls only (the sparks-calls branch). Same for "Share" (screen sharing) and tapping a person ("Player cards and private calls are coming soon"). |
| F-37 | Medium | app (game) | Map at Trafalgar Square | About 20 points within 40 m overlap; tapping one pin often opens another (tapping "Test Trivia Stone" opened "Nelson's Column"). No clustering or a picker for stacked pins. |
| F-38 | Medium | app (game) | Game screens | The Chats bubble (left edge, mid-screen) sits over content: the first quiz answer, the "+470 XP" on the reward screen, the boss name on the raid screen. A tap meant for the first answer can open the chats mid-question. |
| F-39 | Low | app (game) | Boss sheet | "58 min left" next to "It leaves at half past" (the server keeps bosses out from :00 to :30). |
| F-40 | Medium | game backend | integration-20261016, one uvicorn worker | After about 6 hours the local API stopped answering (`/health` timed out, two DB sessions left "idle in transaction"); the app showed "Can't reach CosQuest right now." A restart fixed it. Log: `out/logs/game-api-hang-1.log` in the task folder. Worth a check on staging. |
| F-42 | Medium | Sparks | 1:1 call with Sparks on | "Sparks starts once Sparks AI has downloaded": the model comes from the backend's `/v1/model` manifest. The local backend has none, so Sparks notes in calls could not be exercised here; the consent card and pill were. |
| F-44 | Medium | chat backend | Messages | No message kind for a game result, so shared results (F-34) are plain text. |
| F-45 | Low | app | Chat attach sheet (from code) | No File/Document option although documents render; "Audio" only shows a "press and hold the mic" alert. |
| F-48 | Medium | backend / rig | Uploads | The chat backend has no local storage fallback: without Cloudinary keys every upload (onboarding photo, chat media, voice) is a 500. The rig stubs it. Any file sent as `application/octet-stream` is stored as `kind: "image"`. |
| F-51 | Low | design | Chat list, All chats | Every group comes first and DMs are a row of avatars with a count but no preview, below the fold under seven groups. Coming back from the game (the Chats bubble said something was new), Bolu's "Are you at the fountains yet?" is nowhere in sight until you scroll and open his DM. No ordering by latest message across groups and DMs. |

## Looked at, not changed (by design)

| ID | Where | What |
|----|-------|------|
| F-28 | Spark panel | Each message carries its own date and time: that is the Figma M07 timeline (a date-time dot per message), not a repeated header. |
| F-17 | Profile | "Posts 1" while the Posts tab says "No posts yet": the count is every post (photos, reels, thoughts), the tab shows photo posts only. Which one the number means is a design call. |
| F-43 | Call controls | The audio call's Mute button always shows a crossed mic; its state is the pink ring and TalkBack's "selected", the usual mute-toggle pattern. Left to design. |

## Test rig notes (Info)

- **Voice recording** cannot be tested on the farm's headless emulator (no
  microphone); J06 plays a seeded voice note instead.
- **Maestro and the game.** After every step Maestro waits for the screen to
  go idle; the quiz timer and fight scene never do, so each step there takes
  20 to 40 s, longer than a question's clock. The timed taps (answer, strike)
  go through `e2e/seed/phone.js` (adb taps; the quiz answer comes from the
  local game DB). Not an app bug, but the quiz screen redraws continuously.
- **One game player per emulator.** The game's device key survives a
  reinstall, so `e2e/reset.sh` clears the local game DB's players before each
  journey (fresh "Choose your side", no cooldowns, this hour's boss).
- **Sign-in rate limits** (10 per IP per 2 h) and the one-session-per-account
  rule would break repeated runs; the local runner turns the limits off.
- **adb reverse tunnels** dropped a few times during the day; `journey.sh`
  renews them every 5 s, and the GPS fix too.
- **Quiz rows move** with the question's length; `phone.js` finds them in a
  raw screenshot (the quiz screen never goes idle, so a UI dump is slow).
- **Memory**: the emulator uses about 6 GB of the task's 9 GB; it is stopped
  for each Gradle build.

## Journey results

Before: the first merged build, no fixes (journeys as of 249471b). After: build
11 (d77866b, every fix), all 12 in one run on 2026-10-20 16:18-16:39 UTC; J09
failed once on a quiz tap that missed a wrapped answer row (a rig problem,
fixed in `e2e/seed/phone.js`) and passed on the re-run. Videos:
`before-*.mp4`, `after-*.mp4` (build 10) and `final-*.mp4` (build 11) in the
task's `out/videos/`.

| Journey | Before | After (build 11) | Why it failed before |
|---|---|---|---|
| J01 sign-up and onboarding | FAIL | PASS | F-13 faction refused, F-02 starter page (later runs also caught F-49) |
| J02 profile and avatar | PASS | PASS | (F-19 is visual: compare j02-profile screenshots) |
| J03 DMs and groups | FAIL | PASS | F-21 Send hidden by the keyboard |
| J04 a Spark forms | FAIL | PASS | F-21 |
| J05 Start a Spark | FAIL | PASS | F-21 |
| J06 messaging | FAIL | PASS | F-22 reply quotes (now also F-26, F-47) |
| J07 calls | FAIL | PASS | F-31 crash (now also F-41) |
| J08 swipe between worlds | FAIL | PASS | the journey looked for a DM preview that All chats doesn't show (F-51) |
| J09 game play | FAIL | PASS | F-33 the link opened the tapped point |
| J10 share to chat | FAIL | PASS | F-34 no share button |
| J11 factions | PASS | PASS | |
| J12 notifications and links | FAIL | PASS | F-36 game opened behind the chat (now also F-46) |
| **Total** | **2 of 12** | **12 of 12** | |

Test servers (`e2e/testserver/smoke.js`, 2026-10-20 15:45 UTC): 17 of 18; the
failure is F-01.
