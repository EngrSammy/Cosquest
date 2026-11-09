# Local chat backend and peer driver for Maestro journeys

These files give you a throwaway CosQuest chat backend with realistic data, plus a CLI that acts as the other people while a Maestro journey runs on the emulator, signed in as `ada`.

| File | What it is |
| --- | --- |
| `chat-local.js` | Starts the real chat backend against in-memory MongoDB and Redis, seeds it and writes `.seed.json`. |
| `peer.js` | Acts as any seeded user over HTTP (and Socket.IO for typing and presence). |
| `media.js` | Generates PNG pictures, a WAV voice note and a PDF in memory. Nothing is downloaded. |
| `.seed.json`, `.uploads/`, `.peer-state.json` | Run-time output. Git-ignored. |

## Run it

```sh
cd /home/engineer/cq-work/cx-journeys/merged
node e2e/seed/chat-local.js                      # waits until "[chat-local] ready" (about 3 s)
adb reverse tcp:4120 tcp:4120                     # the app and media URLs use http://localhost:4120
```

- The app is built with `EXPO_PUBLIC_API_URL=http://localhost:4120` (the default in `app/scripts/android-emulator-build.sh`).
- Stop the backend with Ctrl+C or `kill <pid>`. Mongo, Redis and every bit of data go with it, so each start is a clean, fully seeded world.
- Memory use is about 450 MB in total: node about 200 MB, mongod about 190 MB, and a small redis.

### Environment

All of these are optional.

| Variable | Default | Notes |
| --- | --- | --- |
| `CHAT_BACKEND_DIR` | `/home/engineer/cq-work/cx-journeys/mcj-merged/cosquest-backend` | MCJ main plus the merged-app branch. Modules (mongodb-memory-server and the rest) resolve from here. MCJ main on its own (`mcj/cosquest-backend`) also works, but it has no game invites. |
| `PORT` | `4120` | Do not use 4121; the coordinator's exploration backend runs there. |
| `CHAT_HOST` | `127.0.0.1` | The emulator reaches it as 10.0.2.2 or, through adb reverse, as localhost. Use `0.0.0.0` for a phone on the LAN. |
| `MEDIA_BASE_URL` | `http://localhost:PORT` | The prefix of every uploaded file's URL. Use `http://10.0.2.2:4120` if you don't use adb reverse. |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `ws://10.0.2.2:7880`, `devkey`, `secret` | The `livekit-server --dev` defaults. I checked the key and secret against the LiveKit server already running on this box: `listRooms` on `localhost:7880` succeeds. |
| `JWT_SECRET` | `local-dev-only-secret-not-for-production` | |
| `SPARKS_ENGINE` | `module` | Sparks module 1.3.2. Use `legacy` for the old keyword engine (see Sparks below). |
| `SPARKS_TIMERS`, `SPARKS_CONFIG` | unset | Passed through, e.g. `SPARKS_TIMERS=demo` makes Sparks go quiet after 75 s. |
| `CLOUDINARY_CLOUD_NAME` | `h3vdfsoe` | The public delivery name the test server uses. It has no keys, so it can only build read URLs for the avatar catalogue. |
| `REDISMS_SYSTEM_BINARY` | `~/.local/bin/redis-server` | Used if that file exists, so redis-memory-server doesn't try to build Redis. |
| `SEED_OUT` | `e2e/seed/.seed.json` | |
| `DEV_PASSWORD` | `cosquest-dev-1` | Password for every seeded user. |
| `VOICE_TRANSCRIPT` | a fixed sentence | What every voice note is "transcribed" to. |
| `GAME_TARGET_ID`, `GAME_PLACE`, `GAME_LAT`, `GAME_LNG` | Caffè Nero, Trafalgar Square (a real staging Quest Point, `Ldf5686bcfc03`) | Where the seeded game invite points. |
| `CHAT_LOCAL_RATE_LIMITS=1` | off | Keeps the backend's sign-in and sign-up rate limits, which are switched off by default. |
| `CHAT_LOCAL_KEEP_KEYS=1` | off | Keeps any real keys in your shell. By default these are removed before the backend loads: Cloudinary key and secret, SMTP, Anthropic, Deepgram, Expo, Google and Apple OAuth, `GAME_PUSH_SECRET`, `SPARKS_MODEL_MANIFEST_URL`. `PUSH_ENABLED` is always 0. |

The runner changes into `e2e/seed/` before loading the backend. That means the backend's `dotenv` cannot pick up a stray `.env` from somewhere else, and nothing is written into the backend directory.

### Dev routes

These are added by the runner, answer loopback callers only, and run on the same port.

- `GET /__dev/seed`: the same JSON as `.seed.json`.
- `GET /__dev/mail?to=<email>`: every email the backend "sent", with any 6-digit code pulled out (`latest.code`).
- `POST /__dev/notify` with `{ username, message, type?, actor?, conversationId? }`: creates a notification. It goes out live on `notification:new`, like a real one.
- `GET /uploads/<file>` (also `/__media/<file>`): uploaded media, with Range support for audio and video.

## Accounts

Every seeded user signs in with the username or `<username>@example.test`, password `cosquest-dev-1`.

| User | Name | Faction | Notes |
| --- | --- | --- | --- |
| **ada** | Ada Nwosu | Icons | The phone user. Onboarded, photo plus preset avatar `pink-idol`, bio, 4 interests, Lagos location, 1240 points, costume-crafting expertise. |
| bo | Bolu Adeyemi | Icons | photo |
| cy | Cyrus Mensah | Controllers | photo |
| dami | Damilola Ojo | Icons | no photo, so the UI shows initials |
| chioma | Chioma Eze | Ascendants | photo |
| tunde | Tunde Bakare | Icons | photo |
| zara | Zara Ahmed | Celestials | photo |
| kofi | Kofi Boateng | Controllers | no photo |
| lena | Lena Fischer | Everborn (`everborns`) | photo |

- Profile photos are generated head-and-shoulders PNGs served from `/uploads/avatar-<user>.png`.
- Everyone also has a preset `avatarKey` (the app bundles the first 25 presets).
- **Free for the sign-up journey:** `newbie@example.test`, username `newbie`. Use the password `Cosquest-dev-1!`: the app's sign-up screen insists on 8 or more characters with an uppercase letter, a digit and a special character, which `cosquest-dev-1` does not have.

## What is seeded

As seen from ada. Ids change every run, so use the names, the seed keys, or `.seed.json`.

| Seed key | Chat | What is in it | Unread for ada |
| --- | --- | --- | --- |
| `dm:bo` | DM with Bolu | Chat from 2 days ago (a reply, a 😂 reaction), then "You around this evening?", "There's a Shrine...", "Race you to it 😄" and a **game invite card** (shrine at Caffè Nero, note "Meet me here?") | 4 |
| `dm:chioma` | DM with Chioma | A **photo** ("First try on the wig"), reactions both ways, a reply. ada sent the last message. | 0 |
| `dm:tunde` | DM with Tunde | A **link**, ada's **edited** message (shows edited and undo to ada only), and a **voice note** (4 s WAV, waveform, transcript). | 1 |
| `dm:zara` | DM with Zara | ada's last message is **not read yet** by zara. | 0 |
| `dm:dami` | DM with Damilola | A **PDF** ("Storm-cape-pattern.pdf"). | 0 |
| `dm:kofi` | DM with Kofi | Old chat, a **missed voice call** log, then "Call me back...". | 2 |
| `g:sketch` | Lagos Comic Sketch Club (private) | **ada is the owner**; tunde is an admin; bo, dami and chioma are members. A **poll** by ada with 4 votes. | 1 |
| `g:raid` | Raid Night Crew (open) | ada is a member and cy is the owner. cy **@mentions ada**, kofi replies to it, and there is a **pinned message**. | 4 |
| `g:con` | Cosplay Con 2026 🎭 (open, 9 people) | About 30 messages of chatter, a **poll** with 7 votes, a **photo** with 3 reactions, zara **@mentions ada**, a pinned message, and **two Sparks**: "Hotel near the venue" (5 messages) and "Badge pre-sale" (4 messages, one of them from ada). | 9 |
| `g:icons` | Icons Lagos Chapter (faction group) | Every Icons member is in it automatically. | 2 |
| `community` | Community | Hellos from each faction, and a **Spark** "Lagos meetup" (3 messages). | 5 |
| `faction:icons` | Icons (faction room) | A rank update; dami **@mentions ada**. | 2 |

Message times are rewritten to between 3 days and 10 minutes ago, so the list shows realistic times. Unread counts come from each member's last-read time.

Other seeded content:

- **Notifications for ada** (11): 2 system ("Icons climbed to #2...", welcome), 4 follows (bo, chioma, zara, tunde), 3 mentions, 2 "added you to" group notices.
- **Follows:** ada follows bo, chioma and cy.
- **Posts:** ada's thought (liked by chioma and bo, with a comment from bo), thoughts from chioma and zara, and an image post from tunde.
- **Quests** near Lagos for the Home dashboard: "Cosplay City Hunt" (live), "Marvel Trivia Night" (upcoming, Icons, ada is registered) and "Anime Realm Showdown" (upcoming).
- **Spotlight:** everyone has points and an expertise.

## peer.js

```text
node e2e/seed/peer.js <user> <command> [args] [--flags]
node e2e/seed/peer.js help
```

Arguments:

- `<conv>` is resolved from that user's own chat list. It can be:
  - a username, meaning "my DM with them", created if needed;
  - a group name or part of one ("Cosplay Con");
  - `community` or `faction`;
  - a seed key (`g:con`) or a conversation id.
- `<msg>` is one of:
  - `last`, the newest message not sent by me;
  - `last-mine`;
  - `last-poll`;
  - a message id;
  - some text the message contains.

`CHAT_API` sets the base URL (default `http://localhost:4120`).

Every command below was run against the backend, with its result checked through the API.

```sh
P="node e2e/seed/peer.js"
$P bo send ada "Heading out now, see you at the Shrine"
$P bo reply ada "Storm cape" "Glue gun is charged and ready"
$P bo react ada last "🔥"           # and: unreact
$P bo edit ada last-mine "Heading out in 5"
$P bo delete ada last-mine --everyone
$P zara mention "Cosplay Con" ada "can you bring the spare safety pins?"   # or: everyone
$P zara poll "Cosplay Con" "Lunch on day one?" "Suya" "Jollof" "Shawarma"   # --multiple --anonymous --closes 1h
$P kofi vote "Cosplay Con" last-poll 2
$P chioma image ada "Wig take two"        # generated photo, or --file pic.jpg
$P tunde voice ada --secs 3               # generated WAV, or --file note.m4a
$P dami file ada ./flyer.pdf "flyer draft"
$P bo typing ada --secs 4                 # typing:start / typing:stop over Socket.IO
$P kofi online --secs 60                  # online dot for 60 s
$P cy read "Raid Night"                   # cy pin "Raid Night" "Can someone send"
$P bo messages ada 10                     # inspect; also: chats

# Sparks
$P chioma spark-create "Cosplay Con" "Day one ride share" "Let's sort out lifts for day one" \
   --msg "I have 3 seats from Lekki" --msg "kofi: I'll take one" --msg "bo: me too please"
$P lena spark-reply "Cosplay Con" "ride share" "I can drive back on day two"
$P zara spark-add "Cosplay Con" "ride share" "Saving a seat for Ada"
$P bo spark-create ada "Shrine run" "Shrine run tonight?"     # Sparks work in DMs too (module engine)
$P ada sparks "Cosplay Con"
$P bo spark-burst "Raid Night" "healer build"   # 3 on-topic messages from bo and two members

# Calls (run in the background with & so the journey can continue)
$P bo call ada --hold 45 &                # rings ada; hangs up after 45 s or when the call ends
$P bo call ada --add cy,kofi --hold 120 & # rings ada and adds cy and kofi: a group call
$P bo accept-call --wait 60 --hold 120 &  # for "ada calls bo": waits for the ring, answers, stays 120 s
$P bo decline-call --wait 60
$P bo call-add cy                         # add someone to the call bo is in
$P bo end-call
$P chioma group-call "Cosplay Con" --hold 300 &   # voice chat in a group (calls are DM only)
$P tunde voice-join faction --hold 300 &          # voice chat in the faction room; pings every 25 s
$P tunde voice-leave faction

# Game
$P bo invite ada shrine --note "Meet me here?"    # duel | raid; --target --place --lat --lng --at
$P bo share-result ada "Beat you to the Shrine by 40 seconds"

# People and notifications
$P lena follow ada                        # "lena started following you"; unfollow
$P bo notify ada "Bolu sent you a friend quest" --type system

# Global
$P signup newbie@example.test newbie      # the app's whole onboarding sequence, see below
$P forgot newbie@example.test             # sends a reset code and prints it
$P reset newbie@example.test "New-pass-1!"   # uses the code from the dev outbox
$P mail [email]
$P seed                                   # conversation keys, ids and Sparks
```

What to expect from these commands:

- **Calls do not carry audio.** The peer gets a real LiveKit token and URL, but it never joins the LiveKit room. The phone sees the call state change (ringing, accepted, ended, group with more people), but hears nobody.
- **The call ends when only one person is left.** When ada and the added person leave a call bo started, bo is ended too.
- **A second call to ada is refused while she is busy.** While ada is being rung or is in a call, another call to her gets `409 One of you is already on another call`. That is the backend's rule.
- **`share-result` is a plain text message.** No result card exists in either the app or the backend (the app has only `game_invite`), so it sends a text message starting with 🏆.
- **`spark-burst` forms a Spark by itself only with `SPARKS_ENGINE=legacy`.** The legacy engine needs 3 messages from 2 people sharing a keyword within 2 minutes. With the module engine (the default), Spark detection runs on members' phones through the Sparks SDK (SPARKS_INTEGRATION.md §7). Without a phone running the model, only manual starts happen: `spark-create`, or "Start a Spark" in the app.
- **`reset` changes the password of the account you give it.** Use it on `newbie`, not ada, or ada's journey can no longer sign in with `cosquest-dev-1`.
- **The peer never signs in as ada by default.** One session per account: signing in rotates the session and signs the other device out. Peers use tokens minted by the runner, which have no session id and stay valid until someone actually signs in as that user. The moment the phone signs in, ada's seed token stops working. `peer.js ada ...` then stops with an explanation instead of signing in (set `PEER_ALLOW_MAIN_LOGIN=1` to force it). Other users sign in again automatically if their seed token is rejected.

## Sign-up and onboarding, step by step

The app makes these calls (screens in `app/app/onboarding/`). `peer.js signup` runs the same sequence, and it passes against this backend: the account finishes onboarding, signs in and sees Community plus its faction room.

1. `signup.tsx`: `POST /api/auth/signup { identifier: email, password, confirmPassword }`. The response is 201 with a token right away. **There is no email verification step in sign-up**: the backend never sends a code, and the app has no verification screen in this flow.
2. `createProfile.tsx`:
   - `GET /api/users/check-username?username=&email=` returns `{ available }`.
   - `PATCH /api/users/me/profile { email, firstName, lastName, username, age, gender }`.
3. `uploadPicture.tsx`. The app requires both a photo and a preset here:
   - `POST /api/users/me/avatar/photo`, multipart with `email` and `photo`;
   - then `PATCH /api/users/me/avatar { email, avatar }`. The field is `avatar`, not `avatarKey`.
4. `interests.tsx`: `PUT /api/users/me/interests { email, interests }`.
5. `permissions.tsx`, sent together:
   - `PATCH /api/users/me/preferences/notifications { email, notificationsEnabled }`;
   - `PATCH /api/users/me/preferences/location { email, locationEnabled, radiusMiles, lat, lng }`. Location is required.
6. `faction.tsx`: `POST /api/users/me/faction { email, factionKey }`.
7. `ready.tsx`: `POST /api/users/me/onboarding/complete { email, profile{..., avatar}, faction, interests, preferences, location }`.
8. `signin.tsx`: `POST /api/auth/login { identifier, password }`.

Steps 2 to 7 identify the user by the `email` in the body. The app does not send the sign-up token.

**Verification codes locally.** The only emailed code is the forgot-password code (`forgotPassword.tsx`, then `verification.tsx`, then `POST /api/auth/reset-password { email, code, newPassword, confirmPassword }`). There is no SMTP here, so the runner catches the email instead:

- it logs `[chat-local] mail to <email>: "Your CosQuest password reset code" code 123456`;
- it keeps the email for `GET /__dev/mail?to=<email>`, whose `latest.code` field holds the code (`peer.js mail <email>` prints it).

A Maestro flow can call that URL with `runScript` / `http.get` and type the code. Without the runner, the backend answers forgot-password with **503 "Email is not configured"** whenever SMTP is unset.

**Maestro notes from the app source:**

- There are no `testID`s anywhere in the app, so match visible text.
- **Faction screen sequence.** After 2 s a consent modal opens. Tap the checkbox row that starts "Got it", then "Continue". Then tap a card, then "Join Faction" in the modal, then "Continue" on the page.
- **Permissions toggles.** They are unlabelled Pressables, so tap them relative to the row text.

## Uploads without Cloudinary

The backend sends every upload to Cloudinary, and outside `NODE_ENV=test` it throws "Cloudinary is not fully configured" when the key and secret are missing. That covers the avatar photo, chat image, voice note, file, album, group photo and post media (`src/utils/imageHost.js:22,46,108`). Without help, the onboarding photo step and every media message fail with 500. **The backend has no local-disk fallback**: multer writes a temp file and deletes it after the Cloudinary upload.

chat-local.js therefore replaces those functions in the backend process before it loads: `storeAvatarPhoto`, `storeChatMedia`, `storePostMedia`, `deletePostMedia` and `deleteChatMedia`. All uploads go through these functions; nothing else calls the Cloudinary uploader.

- multer's file stays in `e2e/seed/.uploads/`.
- The stored URL is `MEDIA_BASE_URL/uploads/<file>`, served by the runner with the right content type and Range support.
- WAV voice notes get a real `durationSeconds`.
- Voice-note transcription (Deepgram) is replaced by the fixed `VOICE_TRANSCRIPT`.

I checked this over HTTP: an onboarding photo (jpg), image messages (png), a voice note (wav, and a Range request gives 206) and a PDF were uploaded, and each returned URL loads with a 200.

No fake Cloudinary keys are set, on purpose. With a key present, the avatar catalogue (`src/utils/avatarCatalog.js:64-76`) would call Cloudinary's Admin API over the network. Without one it serves its built-in 100 avatars with read URLs on `res.cloudinary.com/h3vdfsoe`, which load from the public CDN.

## Backend and app surprises found

1. **Faction id mismatch.** The app's Everborn faction id is `everborn` (`app/constants/factions.ts:46`), but the backend only accepts `everborns` (`src/models/factionModel.js:31`). `POST /api/users/me/faction { factionKey: "everborn" }` returns 400 "factionKey must be one of the values from GET /api/factions.", so **choosing Everborn during onboarding fails**. I verified this against the running backend.
2. **No upload fallback.** As described above (`src/utils/imageHost.js:22,46,108`), a dev backend without Cloudinary keys cannot finish onboarding, because the app insists on a photo. The runner works around this.
3. **Forgot-password needs SMTP.** Without it the response is 503 (`src/utils/mailer.js:15`). The runner catches the email instead.
4. **Unknown file types become images.** Any upload labelled `application/octet-stream` (allowed by `src/middleware/upload.js:39`) is stored as `kind: "image"` (`src/utils/chatMedia.js:8`). For example, a `.js` file sent from the CLI became an "image" message. A mislabelled document from a phone picker would render as a broken image.
5. **Tight sign-in rate limits.** Sign-in is limited to 10 per IP per 2 hours, and sign-up to 10 per IP per 15 minutes (`src/middleware/rateLimiter.js:43,53`). Every Maestro run comes from 127.0.0.1, so a dozen journeys would lock sign-in. The runner switches the limits off (`CHAT_LOCAL_RATE_LIMITS=1` turns them back on).
6. **One session per account.** Every sign-in rotates the session and signs other devices out (`src/controllers/authController.js:203`). A journey that signs in as ada while a script also signs in as ada signs the phone out.
7. **Onboarding identifies the user by email alone.** Until onboarding is complete, anyone who knows an account's email can change its profile, avatar, faction and so on (`src/middleware/identifyUser.js:40`). This is by design for the app's flow, but worth knowing.
8. **MCJ main has no game invites.** `POST /api/chats/:id/game-invites` is a 404 there (only the merged-app branch has it). The merged app's "share to chat" from the game then shows "Couldn't send to ...". That is why the default backend is `mcj-merged`.
9. **`/api/game` is mounted twice in mcj-merged** (`server.js:59` and `src/routes/index.js:39`). Harmless.
10. **Voice chats in groups.** The app offers voice chats only in Community and faction rooms (`app/services/voiceRooms.ts:44`), but the backend also allows them in groups. `group-call` uses that.
11. **The chat screen ignores `avatarKey`.** It shows only `avatarPhotoUrl`, otherwise initials. The app also ignores the backend's voice-note `waveform` and draws one from a hash of the URL. That is why most seeded users have photo URLs.
12. **Module Sparks need phones.** With `SPARKS_ENGINE=module` no Spark forms automatically unless a phone runs the Sparks SDK model. Seeded Sparks are started by hand through `POST /api/chats/:id/sparks { messageId, subject, force: true }`; replies go in with `sparkId` on the send body. They show `active: true` until the module's quiet timer (12 minutes in production, 75 s with `SPARKS_TIMERS=demo`), and stay listed afterwards.
