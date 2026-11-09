# Polish: decisions for Subomi and Mark (task 059)

Everything below is built and switched off (or set to today's behaviour) until you choose. Nothing here was picked for you.

## 1. The palette (one look for chat and game)

Both halves now read one token module, `app/theme/` (colours light and dark, type scale, spacing, radius, elevation, motion). The chat's hex colours (775 of them in 113 files) and the game's palette (GP) come from it. One build-time flag picks the palette:

| `EXPO_PUBLIC_PALETTE` | What it looks like |
|---|---|
| unset / `current` (default) | Today: chat pink on navy, game sky and sun |
| `A` | Chat pink and navy everywhere: the game's main buttons turn pink, its sky and ice turn lilac, its ink the chat's navy |
| `B` | Game sky and sun everywhere: the chat's pink turns the game's deep sky blue, its ink the game's navy |
| `C` | Blend: pink for actions in both halves, the game keeps its sky, one navy ink for both. Coins stay gold |

Screens: `docs/polish/PALETTE.md`. To try one: build with `EXPO_PUBLIC_PALETTE=A` (any build script; it is an EXPO_PUBLIC variable). Values: `app/theme/palettes.ts`, one object per option, so a tweak is one line.

Done regardless of the choice: the two near-duplicate pinks (`#B63D91`, `#C34D9C`) are now the brand pink `#C5399A`, and two near-duplicate greys were merged.

## 2. Factions (F-08)

The chat has six factions (Ascendants/anime, Icons/comics, Controllers/gaming, Blockbusters/movies, Everborns/fantasy, Celestials/sci-fi). The game has five realms (anime, marvel, dc, movies, gaming). They do not line up one to one:

| Chat faction | Game realm(s) |
|---|---|
| Ascendants (anime) | anime |
| Icons (comics) | marvel or dc (ambiguous) |
| Controllers (gaming) | gaming |
| Blockbusters (movies) | movies |
| Everborns (fantasy) | none |
| Celestials (sci-fi) | none |

The mapping layer is `app/features/world/factionLink.ts` (tested), applied by `components/world/useLinkedFactions.ts`, behind `EXPO_PUBLIC_LINKED_FACTIONS`:

- **Off (default, today).** Two separate choices: the chat asks at sign-up, the game's Warden asks on the first run.
- **`chat`: the chat faction drives the game.** A new player whose faction maps to exactly one realm joins it without being asked. Icons, Everborns and Celestials are still asked (no clean match). Simple for most people; Icons, fantasy and sci-fi fans see the gap.
- **`game`: the game realm drives the chat.** Joining a realm in the game sets the chat faction it maps to (every realm has one). Means people may lose a chat faction (fantasy, sci-fi) that has no realm; the chat backend's faction-change rules still apply.
- **Merge into one list (not built).** One set of factions in both backends (add fantasy and sci-fi realms to the game, or split Icons into two chat factions). The clean end state; needs both backends and the art. If you pick this, the mapping layer becomes the migration table.

## 3. Things that need a key or an account (built, inert)

| Feature | Switch | Off means |
|---|---|---|
| Crash reporting (Sentry) | `EXPO_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` at build for source maps) | The SDK is never started; nothing is sent |
| OTA updates (expo-updates) | `EAS_UPDATE_CHANNEL` at build (project id is in app.json) | The app runs its own bundle and never checks |
| Force update | `EXPO_PUBLIC_CONFIG_URL` (a JSON file: `minVersion`, `latestVersion`, `storeUrl`, `message`) | No check. A bad or slow file also means no check (fails open) |
| Push notifications | Expo project + Firebase (`google-services.json`) for Android, APNs key for iOS; backend `PUSH_ENABLED=1` | Token fetch fails quietly; in-app notifications only |
| Sign in with Apple | `EXPO_PUBLIC_APPLE_SIGNIN=1` and the backend's `APPLE_*` keys | No Apple button (never a dead one) |
| Legal pages | `EXPO_PUBLIC_TERMS_URL`, `_PRIVACY_URL`, `_GUIDELINES_URL`, `_FAQ_URL` | "Not published yet" (no legal text was written by us); the FAQ row is hidden |
| Game events in the notification centre | backend `GAME_EVENTS_KEY` (the game server sends with it) | The route answers 503 |
| Screen share / Sparks in calls | `EXPO_PUBLIC_CALL_SCREEN_SHARE`, `EXPO_PUBLIC_CALL_SPARKS` | The buttons are hidden (they were "coming soon") |

## 4. Smaller calls I made

- **Account deletion keeps a tombstone row.** The user document stays as "Deleted user" with every personal field wiped, the email and password removed and the token version bumped; posts, follows, blocks, notifications and the rest are deleted and their messages read "deleted". Old messages and call logs still resolve a sender. If you need the row gone entirely, it is a small change but every message lookup must then handle a missing sender.
- **Feature detection.** The app asks `GET /api/meta/capabilities`. The current test server answers 404, so on it Delete account, Report and the result card are hidden and Block uses the existing by-username route. Blocking always shows (every server has it).
- **One retry wording:** "Try again" everywhere (was Retry / Try again / Try Again).
- **Apple sign-in uses the backend's existing Apple web flow** (the same one Google uses), so no iOS entitlement or native module is needed. A native button can come later.
- **Release builds drop `console.log`/`info`/`debug`** (Metro's minifier). Test builds made with the timing or perf logs keep them, because the journeys and the perf rig read them from logcat.
- **The game follows dark mode** by the same role mapping as the chat (each game stylesheet gets a dark twin). The map uses its night lighting in dark mode while the world follows the clock; a fixed world clock wins. The art screens (duel, quiz backdrops) keep their own colours. The feed, the chat list and the profile were light-only before and still are: making them follow is the next step if dark mode should cover the whole app.
- **Queued sends are text messages only.** Photos, voice notes and polls still say "Can't reach CosQuest" offline (an upload cannot wait in memory safely). A send whose answer was lost in a network drop could arrive twice; the backend has no idempotency key yet.
- **Haptics in the chat** match the game's: a light tap on send, react, follow and buttons; a firmer one on long-press menus and calls; success / error after report, block, delete.
