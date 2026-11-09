# The merged app: swipe between worlds

CosQuest (chats, groups, calls, Sparks) and CostQuest (the AR faction game)
are one app. After sign-in the app is **two pages side by side**: the chat
tabs on the left and the game's live map on the right. You move between
them the way Snapchat moves between chat and camera: a horizontal swipe
that follows your finger. The game stays warm in the background, so going
in is a slide, not a load.

This document is the contract for that shell: the gesture rules, the
states, the timings, and why each one is the way it is. The numbers live in
code in one place, `app/features/world/gesture.ts` (pure functions with
unit tests in `app/features/world/__tests__`). If you change a number,
change it there and update the table here.

| Piece | File |
|---|---|
| Pager (layers, gesture, warm game) | `app/components/world/WorldPager.tsx` |
| Rules and numbers | `app/features/world/gesture.ts`, `prewarm.ts` |
| Game page, veil, Android placeholder | `app/components/world/GamePage.tsx` |
| Chat bubble over the game | `app/components/world/GameBubble.tsx` |
| World handle on the chat | `app/components/world/WorldHandle.tsx` |
| First-run coachmark | `app/components/world/SwipeCoachmark.tsx` |
| Chat to game bridge (login, unread, calls, events) | `app/components/world/GameBridge.tsx` |
| Invite card, share picker | `app/components/world/GameInviteCard.tsx`, `ShareToChatSheet.tsx` |
| Links | `app/app/play.tsx`, `app/app/coins.tsx`, `app/features/world/deepLink.ts` |
| The game, natively | `app/modules/costquest-game` (iOS: `ios/Embed`) |

## 1. Shape

```
 ┌──────────── chat (page 0) ────────────┐┌──────────── game (page 1) ────────────┐
 │ header                                 ││ game top bar (player chip, coins)     │
 │                                      ▐ ││▌                                      │
 │  chats, feed, live, profile          ▐◀││▶▌ chat bubble (unread, long press)    │
 │                                      ▐ ││▌                                      │
 │  [ floating tab bar ]                  ││ game cards                             │
 └────────────────────────────────────────┘└────────────────────────────────────────┘
   ▐ = edge strip where the swipe starts    ▌ = edge strip on the game side
   ◀ = world handle (tap or drag)           ▶ = chat bubble (tap, long press or drag)
```

* The pager wraps the **tabs** (`app/app/(tabs)/_layout.tsx`). Screens pushed
  on top of the tabs (a chat, a group, settings, the call screen) cover the
  pager completely, so the swipe is simply not there while you are in a
  conversation.
* The game is to the **right**, because a leftward swipe from the right edge
  is free in this app: iOS uses the left edge for "back", the chat has no
  right-edge gesture, and the game's page sits where the finger pulls it from.
* The way back is on the game's **left** edge, the side the chat is on.

## 2. Gesture rules

The world swipe never competes with a gesture inside the chat or the game,
because it only **starts** in places nothing else uses:

| Where it can start | Size | Why there |
|---|---|---|
| Chat: right edge strip | 22 pt wide, from 64 pt below the status bar to above the floating tab bar | clear of the header buttons (top right) and the tab bar |
| Chat: the world handle | 30 x 56 pt tab on the right edge, at 42% of the height | the visible, tappable way in |
| Game: left edge strip | 22 pt wide, from 64 pt below the status bar to 96 pt above the bottom | clear of the game's player chip (top left) and its bottom cards |
| Game: the chat bubble | tab on the left edge, same height as the handle | the visible way back; reads as the same doorway |

Once started:

* **Direction.** From the chat only a leftward drag activates it; from the
  game, only rightward. A drag the other way does nothing and the touch is
  released to whatever is underneath.
* **Activation.** 10 pt of horizontal travel (`ACTIVATE_OFFSET_X`), so taps
  on the handle or bubble stay taps.
* **Vertical cancels.** 18 pt of vertical travel before activation fails the
  gesture (`FAIL_OFFSET_Y`): it was a scroll.
* **Following.** 1:1 with the finger, clamped to the two pages.

When it is **off**:

| Situation | Why |
|---|---|
| The keyboard is up | the person is typing; an edge brush must not throw them into a map |
| A call is full screen | the call UI owns the screen; minimize it first (the green bar) |
| A screen is pushed over the tabs (a chat, settings) | the tabs are not focused; the strip is not mounted |
| A settle animation is running | one decision at a time |
| No game module (web, Expo Go) | there is nothing to swipe to; the handle is hidden too |

### Conflicts, one by one

| Chat gesture | Outcome |
|---|---|
| Swipe-to-reply on a message | lives in the conversation screen, which covers the pager: never in conflict |
| Horizontal carousels (feed media, spotlight) | they keep their whole width except the last 22 pt on the right, between the header and the tab bar; a swipe that starts there is the world swipe |
| Maps (Live tab) | same: only the right 22 pt strip is taken |
| Text selection | selection handles appear in pushed screens (conversations, posts); on the tabs the strip is 22 pt and needs a 10 pt horizontal drag to activate, so a long press there still selects |
| iOS back swipe | left edge, only on pushed screens; the world swipe is on the right edge of the tabs |
| The call screen | full screen: the world swipe is off. Minimized: the green "tap to return" bar sits above both pages |
| Sheets and modals (React Native `Modal`) | drawn above everything; the edge strips are underneath and unreachable |
| The game's own gestures (map pan and pinch, card swipes) | everywhere except the 22 pt left strip and the bubble |
| The game's own full-screen screens (fights, encounters, raids) | presented natively above the whole app, so the strip and bubble are underneath: you finish or close the game screen first. Unread count and call stay visible on a display-only overlay (`GameChromeWindow.swift`) |
| Android Back | on the game: back to the chat. On the chat: unchanged |

## 3. Where a release lands

`settleTarget()` in `gesture.ts`:

1. A **flick** toward the other page (>= 650 pt/s) that travelled at least 8%
   of the width commits. A flick back (>= 650 pt/s the other way) cancels.
2. Otherwise the **commit line** decides: 35% of the width (`COMMIT_FRACTION`).

Why 35% and not 50%: the destination is a whole other world, not the next
photo; a deliberate pull of a third of the screen is a clear intent, and
the haptic (below) tells you the moment it will go.

## 4. Feel

| What | Value | Why |
|---|---|---|
| Chat drift (parallax) | 28% of the width at full travel | depth: the chat is "behind", not shoved off |
| Chat scale | 1.00 to 0.94 | it recedes |
| Chat corner radius | 0 to 28 pt | reads as a card stepping back |
| Chat dim | 0 to 55% black | attention moves to the game |
| Game | slides in from the right edge, opaque | the map is a place you enter |
| Faction veil | the player's faction colour over the game, opaque for the first 55% of the travel, lifting to nothing at rest | the map "fades up" out of your faction's colour |
| Veil hold | stays until the game reports its world is standing (`onReady`); lifts over 220 ms; gives up after 6 s | never show a half-built map |
| Haptic | light impact when the drag crosses the commit line toward the other page | you feel "it will go" before you let go |
| Status bar | turns light at 50% of the travel (not at the end) | matches what is mostly on screen |
| Settle | ease-out cubic, 120 ms + 160 ms x remaining distance (120 to 280 ms) | a short finish after a long drag; a full programmatic open (handle, Join, link) is 280 ms |
| Reduce motion (iOS setting) | no drift, scale or slide: the game cross-fades in place in 160 ms; the chat only dims | motion-sensitive people get a fade |

Faction colours: the game's realm colours (`GAME_FACTION_COLORS`, from
costquest-ios `RoamStyle`) once the game says who the player is; before
that, the chat faction's glow colour (`CHAT_FACTION_COLORS`); otherwise the
game's sky blue.

**Target: swipe to an interactive game in under 300 ms once warm.** The
settle is at most 280 ms; the game's view is already in the window (or is
put back at the first pixel of the drag, see below), and touches go to it
the moment the settle ends. Measure on a device: see section 6.

## 5. States

```
            prewarm (idle, enough memory)
 cold ───────────────────────────────▶ warm, in window (10 s to build)
   │                                        │
   │ first swipe / Join / link              │ 10 s on the chat
   ▼                                        ▼
 mounting under the veil ───────────▶ visible ◀────────── parked (out of window)
                                         │   drag starts      ▲
                                         │                    │ 15 s on the chat
                                         └── back to chat ────┘  (0 s after a memory warning)
```

| Pager state | Game | Location | Unity |
|---|---|---|---|
| chat, settled | paused (`pause()`), then parked after 15 s | stopped | paused if it was running |
| dragging / settling | in window, `resume()` at drag start | started (if it was before) | resumed if the host paused it |
| game, settled | visible, interactive | running | as the game left it |
| signed out | `reset()`: account key dropped, everything forgotten | stopped | as is (Unity cannot restart in a process) |

* **Paused** = `GameHost.setVisible(false)`: the game's location updates stop
  and a running Unity scene is paused. It is the cheap state.
* **Parked** = the native view's `parked` prop: the game's hosting
  controller leaves the window, so RealityKit stops drawing and SwiftUI
  stops its tasks, but the controller (and everything the player was doing)
  stays in memory. Unparking puts the same world back; nothing is rebuilt.
* The game view is **never unmounted** while signed in.

## 6. Warm game and memory

Prewarm (`WorldPager`, `prewarm.ts`): after sign-in, when the JS thread is
idle (`InteractionManager`) plus 2.5 s, the shell asks the game to `prewarm()`
and mounts its view off screen for 10 s: fonts, the account's player, the
points around them and the 3D map are built. Unity is **not** started by a
prewarm (it costs ~100 MB and only fights and event maps use it, as in the
standalone game).

Not prewarmed (the game mounts on the first swipe instead, under the veil):

| Condition | Why |
|---|---|
| less than 3.5 GB of RAM (`LOW_MEMORY_BYTES`) | the 3 GB iOS 18 phones (iPhone XR, SE 2nd gen) have too little headroom for chat + LiveKit call + a warm map |
| a memory warning since launch | iOS already asked for memory back; also parks the game at once |
| no game module / Android placeholder | nothing to warm |

**Measuring (to do on a device).** Dev builds log, from the native
`memoryReport()` (`phys_footprint` and `os_proc_available_memory`):

```
[world] memory before prewarm (enough-memory): footprint … MB, available … MB, device … MB
[world] memory 8 s after prewarm: footprint … MB, available … MB, device … MB
[world] memory memory warning: …
```

Run the app from Xcode on a 4 GB phone and a 6 GB phone, sign in, wait 15 s,
and copy the lines here. If the prewarm costs more than about 25% of what is
available on a 4 GB phone, raise `LOW_MEMORY_BYTES` to 4.5 GB. The Linux
side could not run this.

| Device | Before prewarm | After prewarm | Available after | Decision |
|---|---|---|---|---|
| (to measure) | | | | |

## 7. The chat over the game

* **Bubble**: a tab on the game's left edge with the chat icon and the
  unread count (all conversations' `unreadCount`, capped at "99+").
  Tap: back to the chat. Long press: the last three conversations with
  something new (title, sender for groups, preview); tap one to go straight
  into it (the pager settles on the chat, then pushes the conversation).
  "All chats" goes back to the list. Drag right: the same swipe as the edge.
* **Calls**: an ongoing LiveKit call keeps running across the swipe (it lives
  at the app root, above both pages). Minimized, its green "Tap to return to
  call" bar stays at the top over the game. The game never takes the audio
  session from a call: its sound effects stay in the call's session and voice
  answers are switched off during a call (patch 0004).
* **Under the game's own screens** (fights, encounters): the unread count
  and the call show on a small display-only overlay at the top right
  (`GameChromeWindow.swift`), because those screens cover the React Native
  bubble.

## 8. Invites

* **In chat**: a message of kind `game_invite` renders as a card: RAID /
  SHRINE / DUEL, the place, when ("Now", "In 25 min", "Today 18:30", "Sat
  14:00", "Ended"), and a Join button ("Join the raid", "Meet at the shrine",
  "Take the duel"). The optional note is the caption. Ended invites stay,
  greyed. It is a normal message: reply, react, pin, delete, forward.
* **Join**: closes the conversation (back to the tabs), then the game slides
  in and opens at that spot (`open({raidId|shrineId|duelId, lat, lng,
  place})`). If the spot is not near the player yet, the game says "Head to
  <place>" and opens it once its points load there (for ten minutes).
* **Links**: `cosquest://play?raid=<id>&place=…&lat=…&lng=…` (also `shrine=`,
  `duel=`, or just `lat`/`lng`, or bare `cosquest://play`). Malformed or
  ambiguous links (two spots named) are dropped, never guessed. A link that
  arrives before sign-in waits until the pager is up.
* **Notifications**: any notification whose `data.url` is a play link opens
  it when tapped (each notification once). The chat backend does not send
  push notifications yet; this is the client half of that contract.
* **Share from the game**: the point card's chat button opens a picker
  (recent chats first, search, optional note). Sending posts
  `POST /api/chats/:id/game-invites`; the game stays where it was.

## 9. One login

The game's backend identifies a player by an Ed25519 key. With one login,
the chat session is traded for the account's player:

1. The shell passes the chat token to the game: `setSession(token)` (and
   `reset()` on sign-out).
2. The game calls `POST /v1/sso/cosquest` on the game backend
   (ubmids/costquest-backend, `docs/SSO.md`), which checks the token exactly
   as the chat backend signs it and asks the chat backend
   (`GET /api/game/session`) that the session is still live.
3. It answers with the account's player and key; the game signs with that
   key from then on (patch 0003), so the same person is the same player on
   any phone. On failure the game keeps working on the phone's own identity.

## 10. First run

One coachmark, 1.8 s after the chat first shows: a card next to the world
handle ("A whole world, one swipe away") with a hand that pulls left.
Gone for good after "Got it" or the first trip into the game.

## 11. Accessibility

* The handle is a button "Open the game"; the bubble is a button "Chats, N
  unread" with a long-press action for the previews.
* The page that is not showing is hidden from VoiceOver / TalkBack.
* Reduce motion swaps the slide for a cross-fade (section 4).

## 12. Not yet verified on a device

Everything here was written on Linux. The JS is typechecked, linted, unit
tested and bundled; the Android debug build runs with the placeholder; the
iOS project is generated by prebuild. What only a phone can tell, and what to
check first on the Mac (`scripts/verify-ios.sh --run`, then a device):

1. The edge strips' feel next to a horizontal carousel and the Live map.
2. The 280 ms open and the haptic at the commit line.
3. Parking: the map stops drawing off screen (Xcode GPU gauge) and comes
   back as it was.
4. The memory numbers in section 6.
5. A LiveKit call across several swipes (audio continuous, mic live).
