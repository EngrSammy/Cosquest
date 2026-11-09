# Sparks integration (backend)

This backend can now run Sparks on the real Sparks module, `@cosquest/sparks-backend` (version in `vendor/`), instead of the stand-in keyword engine in `src/utils/sparks.js`.

**Turning it on.** Merging this changes nothing by default: `SPARKS_ENGINE` defaults to `legacy`, so the app keeps today's keyword Sparks. The real Sparks detects topics on members' phones through the SDK, so switch to `SPARKS_ENGINE=module` once the Expo app ships the SDK (or once the server fallback worker runs for chats without a capable phone). Everything in this document describes `module` mode. Switching back is the same variable.

What the module does: the trigger gate (3+ messages from 2+ people within 2 minutes), leasing AI jobs to members' phones (detect a topic, sort a message into a Spark, summarize, role pings, call scribe and outline), HPKE encryption of every job input to one phone, Spark state (create, attach, dormancy, revival with seams, merge, pin, delete) and calls. All AI runs on the phones through the Sparks SDK; the backend never sees a model. The module touches our database and sockets only through `src/sparks/`.

Upstream guides (cosquest-sparks repo): `docs/guides/BACKEND_INTEGRATION.md` (the contract this follows), `docs/DATA_CONTRACT.md` (every wire message), `docs/guides/APP_INTEGRATION.md` (the app side).

## 1. What changed

| Where | What |
|---|---|
| `vendor/cosquest-sparks-backend-1.2.1.tgz`, `package.json` | The module, as a `file:` dependency. ESM, Node 20+ |
| `src/sparks/index.js` | The one place it is loaded (`await import(...)` from CommonJS), at startup after Mongo and Socket.IO are up. Socket channel, message hook, manual start, engine switch |
| `src/sparks/mongoStore.js` | `MongoSparksStore`: all ~45 `SparksStore` methods on MongoDB |
| `src/sparks/ports.js`, `members.js` | Socket delivery, membership, admins, history visibility, role pings. Module 1.2 ports: `isMember` (a real member missing from a capped Community/faction list is still a member) and `canReadMany` (one query per job instead of one per message) |
| `src/sparks/rest.js`, `compat.js` | The existing Spark REST endpoints and socket events, served by the module in their old shapes |
| `src/sparks/calls.js` | Call hooks (from `callController.broadcastCallUpdate`) and `GET /api/calls/:callId/outline` |
| `src/models/Message.js` | New fields `seq`, `sparkId`, `sparkRevivalIndex`, `sparkHintState` (existing fields untouched); a pre-save hook assigns `seq` |
| `src/models/MessageSeqCounter.js` | Per-conversation counter (`message_seq_counters`), one atomic `$inc` per message |
| `src/controllers/chatController.js`, `chatExtrasController.js` | Every message insert (send, album, forward) calls the module, in every chat type including DMs. Messages now carry `seq` |
| `src/controllers/sparkController.js` | Dispatches to `src/sparks/rest.js`, or to the old code with `SPARKS_ENGINE=legacy` |
| `src/realtime/socket.js` | Binds each socket to the `sparks` channel |
| `server.js` | `sparks.init()` at startup, `sparks.stop()` on shutdown, `GET /v1/model` |
| `scripts/backfillMessageSeq.js` | `npm run migrate:message-seq`: numbers existing messages |
| `scripts/sparksSmoke.js` | `npm run sparks:smoke`: the real server plus two mock phones |
| `test/sparksStore.js`, `test/sparksModule.js`, `test/helpers/sparksPhone.js` | Store contract tests and the end-to-end test |

### How a Spark happens now

1. A message is saved (`POST /api/chats/:id/messages`, album, forward). The pre-save hook gives it the next `seq` of its chat.
2. `sparks.onMessage(message)` hands it to the module (`onChatMessage`), one message at a time per chat.
2b. (module 1.2.1) A reply to a message that is already in a Spark joins that Spark right here, with no model run and no phone needed (config `replyJoinsSpark`, on by default; it needs `replyToMessageId` on the message row, which `src/sparks/messageRow.js` sends). A reply to a main-chat message is sorted as below.
3. If the author's phone has the model loaded, the module waits up to 20 s for that phone's hint (`message.spark_hint`: which active Spark, if any, the message belongs to). Otherwise another member's phone sorts it (`spark.assign` job).
4. The trigger gate opens a `spark.detect` job when 3+ unsorted messages from 2+ people land within 2 minutes. The job is offered to the best member phone (model loaded, idle, charging, not busy), with its input sealed to that phone's key.
5. The phone answers; the module checks the answer against the rules and creates or revives the Spark.
6. Every member gets `spark.event` on the `sparks` socket event (SDK apps), and everyone viewing the chat gets the old `spark:updated` / `spark:messages` / `spark:deleted` events. The REST endpoints read the same state.

## 2. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `SPARKS_ENGINE` | `legacy` | `module` switches every Spark endpoint, event and message hook to the real Sparks module; `legacy` (the default) keeps the stand-in engine (section 5) |
| `SPARKS_WORKER` | on | `0` keeps this process from running the module's sweepers (`sparks.start()`: dormancy, summaries, job leases and retries, hint timeouts, call outlines). Exactly one process must run them (section 3) |
| `SPARKS_TIMERS` | production | `demo`: the module's `demoOverrides` (a Spark goes quiet after 75 s instead of 12 minutes). For QA builds only |
| `SPARKS_CONFIG` | none | JSON of config overrides, e.g. `{"exitTimeoutMs":900000}`. Every key is in the module's `dist/config.d.ts` |
| `SPARKS_IMPLICIT_MEMBER_CAP` | 300 | How many engaged members Community and faction rooms report to the module (section 6) |
| `SPARKS_MODEL_MANIFEST_URL` | none | Where `GET /v1/model` redirects: the model manifest the Sparks team publishes. The app's SDK uses `${API}/v1/model` |
| `SPARKS_DEBUG` | off | Logs the module's info lines (job offers) during `npm test` |

`ANTHROPIC_API_KEY` and `SPARKS_AI_MODEL` are only read by the legacy engine.

## 3. Deploying on Render

1. **Node 20 or newer** (the module's requirement). Render's default Node is fine; pin it with `NODE_VERSION=20` (or newer) in the service's environment if the service still pins an older one.
2. **Number the existing messages, once.** In a Render Shell (or locally against the production `MONGODB_URI`): `npm run migrate:message-seq`. It is safe before or after the deploy and safe to run twice. Without it, older messages are simply invisible to Sparks (catch-up history starts at the first new message); nothing breaks.
3. **Deploy.** `npm install` installs the module from `vendor/` (it is committed; there is no registry to reach). On start the logs show `[sparks] module 1.2.1 ready (engine=module, sweepers on)`. The `sparks_*` collections and their indexes, and the two new `messages` indexes, are created at startup.
4. **One sweeper process.** Today the service is one instance, and that instance runs the sweepers: nothing to set. If you scale to more instances (or add a separate worker service), set `SPARKS_WORKER=0` on every instance but one. Running the sweepers twice is not dangerous (job leasing is atomic in Mongo) but wastes work and can open duplicate jobs. More than one web instance also needs the Redis adapter (already wired) so a job offer emitted by one instance reaches a phone connected to another.
5. **Model manifest.** Set `SPARKS_MODEL_MANIFEST_URL` to the manifest URL we give you.

The module keeps a little state in memory per process (the trigger gate's cooldown per chat, recent envelope ids, live call engagement). With one instance that is exact; with several, an occasional duplicate detect job can open, which the idempotency keys and result checks make harmless.

## 4. Upgrading the module

Now: we hand you a new tarball.

```sh
cd cosquest-backend
git rm vendor/cosquest-sparks-backend-1.2.1.tgz
cp ~/Downloads/cosquest-sparks-backend-1.3.0.tgz vendor/
npm install ./vendor/cosquest-sparks-backend-1.3.0.tgz   # rewrites the file: entry and package-lock.json
npm test && npm run sparks:smoke
```

The adapter is deliberately thin (the module's own rules are not copied anywhere here), so a new version drops in. Read its `CHANGELOG.md` for new optional store fields or ports; `src/sparks/mongoStore.js` stores rows as plain documents, so new optional row fields are kept without code changes.

Later: the module is published as a private npm package on GitHub Packages (as `@ubmids/sparks-backend`, installed under its usual name with an npm alias: `"@cosquest/sparks-backend": "npm:@ubmids/sparks-backend@^1.2.1"`, so no code changes). Then `vendor/` goes away, `.npmrc` gets `@ubmids:registry=https://npm.pkg.github.com` plus a read token (a Render secret), and Dependabot or Renovate opens a pull request for every release, which your CI runs `npm test` on.

## 5. Rolling back

Set `SPARKS_ENGINE=legacy` and restart. Then:

- Every Spark endpoint, the old socket events and the message hook use the stand-in engine again, exactly as before this branch (keyword detection, no DMs, optional Claude summaries).
- Sparks made by the stand-in before the switch come back as they were (they were never touched: they live in the `sparks` collection; the module uses `sparks_sparks`). Message markers switch with the engine.
- Sparks made by the module stay in `sparks_*` and reappear when you switch back.
- The `sparks` socket channel answers every frame with `{ error: 'sparks unavailable' }`; SDK phones stay connected and simply get no Spark events.
- `seq` keeps being assigned (harmless).

To roll back the code instead, revert this branch's commits; the new Message fields and `sparks_*` collections can stay or be dropped.

## 6. Compatibility: the app's existing Spark API

URLs, request bodies, status codes and response shapes are unchanged. What the data means now:

| Old field (`GET .../sparks`, `spark:updated`) | Now comes from |
|---|---|
| `id` | the module's `sparkId`, a string like `spk_3f2a9c1b0d4e` (no longer an ObjectId: the app must treat it as opaque, which it already does in URLs) |
| `conversationId` | `chatId` |
| `subject` | the model's subject (2 to 6 words, at most 48 characters) or the member's |
| `summary` | the running summary written on a phone; `''` until the first one (after 5 messages or 90 s) |
| `summarizedByAi` | true once a summary exists |
| `keywords` | the subject's words (the module keeps no keyword list) |
| `active` | `state === 'active'`; quiet (`dormant`) after 12 minutes without messages. Pinned Sparks never go quiet |
| `pinned` | `pinned` |
| `revived` | `revivalIndex > 0` |
| `eras` | the Spark's sessions, one per life: `[{ index, startedAt }]` |
| `messageCount`, `participantCount` | counted from the messages tagged with it (deleted ones excluded) |
| `createdBy`, `startedByBot` | the member who started it, or null for the bot |
| `lastActivityAt`, `createdAt` | `lastMessageAt`, `createdAt` |
| (new) `state`, `revivalIndex`, `seams`, `summaryStale`, `participantIds`, `version`, `mergedInto` | extra module data; ignore or use |

| Old message field | Now |
|---|---|
| `spark: { id, era, postedInSpark }` | `id` = `message.sparkId`, `era` = `message.sparkRevivalIndex` (the Spark's life when the message joined), `postedInSpark` unchanged |
| (new) `seq` | the per-chat sequence number; the app passes it to the SDK |

Panel (`GET .../sparks/:sparkId`): `seams` are the labelled breaks (`[{ beforeMessageId, label }]`, e.g. "5 weeks later"); the quiet folds are in `spark.seams` with `kind: 'fold'`.

Socket events: `spark:updated`, `spark:messages` and `spark:deleted` keep their payloads and fire on the same changes (created, joined, summary, quiet, pinned, revived; deleted and merged as `spark:deleted`, merged with `mergedInto`).

New routes: `GET /api/chats/:id/sparks/native` (the module's own Spark objects, for web clients), `GET /api/chats/:id/sparks/members` (members as Sparks sees them, for the app's `sdk.sparks.setMembers`), `GET /api/calls/:callId/outline`, `GET /v1/model`.

## 7. Differences from the stand-in

| Topic | Stand-in | Module |
|---|---|---|
| **Who detects** | The server, by shared keywords, instantly | Members' phones running the Sparks model. **No phone with the model online = no automatic Sparks** (a detect job waits up to 60 s for one, then lapses). Until the app ships the SDK, only manual starts and panel replies make Sparks. The module has an opt-in server fallback worker (cosquest-sparks `docs/guides/SERVER_WORKER.md`) if that gap matters; it is off by default because it means a server reads chat text |
| Chats | Community, faction, groups | Also **DMs** |
| Follow-up messages | Joined an active Spark that shares a subject word | Sorted by the author's phone (hint) or another member's phone (`spark.assign`) |
| Quiet after | 15 min, computed at read time | 12 min (`exitTimeoutMs`), set by the sweeper and broadcast |
| Revival | A new keyword cluster matching an old Spark | The model's `revive` verdict, a panel reply into a quiet Spark, or a manual "add to it"; each revival gets a seam (fold, or a label for long gaps) stored once |
| Summaries | Built in on every 3 messages, Claude if `ANTHROPIC_API_KEY` | On a phone, every 5 messages or 90 s; empty before the first. No server-side AI, no API key |
| Renaming | Claude could rename bot Sparks | Subjects do not change |
| Duplicate check on manual start | Keyword overlap >= 0.5 | Trigram similarity of subjects >= 0.35 (the module's no-model check); `force: true` skips it as before |
| Subject length | REST 2 to 60 | Same validation; stored up to 48 characters |
| Merge | Kept each message's era; carried `pinned` over; never revived | Moved messages take the target's current revival index; `pinned` is not carried; a quiet target with newer messages becomes active |
| Who manages | Group owners and admins | Same, plus both people in a DM |
| Role pings | Not built | Members whose expertise label the model picks get a mention notification ("A Spark needs Front-end: ...") once per Spark life |
| Calls | Nothing | Consented on-device transcription, live topic colours, post-call outline (needs the SDK's speech files on the phones) |
| Ids | ObjectId | `spk_...` strings |

## 8. Membership as the module sees it

`src/sparks/members.js` mirrors the REST access rules:

- **DM**: the two participants, both admins.
- **Group**: explicit members (owner, admin, member); faction groups also their faction. Owners and admins are admins. Banned people are out.
- **Community and faction rooms** (implicit membership, potentially everyone): the module needs a concrete member list (it goes into AI jobs and decides which phones may work), so these rooms report their *engaged* members: people who opened the room or wrote in it in the last 30 days, most recent first, up to `SPARKS_IMPLICIT_MEMBER_CAP` (300). Nobody is an admin there. Everyone can still read Sparks over REST and the room's socket events; the cap only limits who is sent the `sparks` protocol messages and whose phone may work for that room.
- **Roles** for role pings: the user's expertise label exactly as `expertiseModel.js` spells it ("Quest coordination", "Front-end", "Back-end", "Design", "Community", "Costume crafting", "Photography", "Events"). Readable, one spelling, exact match. Renaming a label in `expertiseModel.js` renames the role.
- **History visibility** (`canRead`): the same access rule as `GET /messages`, minus messages the user deleted "for me". Every message sealed into a job for a phone passes through it.

## 9. Data

New collections: `sparks_devices`, `sparks_outcomes` (2-day TTL), `sparks_sparks`, `sparks_sessions`, `sparks_seams`, `sparks_pings`, `sparks_jobs` (finished jobs kept 7 days, input cleared when done), `sparks_calls`, `sparks_segments`, `sparks_topics`, `sparks_outlines`, `sparks_consents` (append-only), `message_seq_counters`. New `messages` indexes: unique `(conversation, seq)` and `(sparkId, seq)`, both partial (old rows without the fields are not indexed).

Call transcripts (`sparks_segments`) and outlines are kept until you delete them; decide a retention period before calls go live.

## 10. Testing

- `npm test`: everything as before, plus `test/sparksStore.js` (the atomic job methods under concurrency, consent rules, seq assignment and backfill) and `test/sparksModule.js` (the real server, two mock-SDK phones over Socket.IO with real HPKE: device registration, a Spark in a group and in a DM, the old REST and socket API, admin pin refused for members). The stand-in's own suite (`test/sparks.js`) runs with `SPARKS_ENGINE=legacy` and the module suites with `SPARKS_ENGINE=module`, so both paths stay tested.
- `npm run sparks:smoke`: starts `node server.js` against throwaway databases and prints a Spark appearing in a group and in a DM.
- On devices: the checklist in cosquest-sparks `docs/guides/APP_INTEGRATION.md` §12.

## 11. What the Expo app needs next

1. Install the SDK (`@cosquest/sparks-sdk`) in a development build (`expo-dev-client`; Expo Go cannot load it), with `expo-build-properties` for Android `minSdkVersion` 26 and iOS 16.
2. Copy `examples/expo-chat/sparks.js` and follow the Sparks section of `examples/expo-chat/README.md`: one SDK per login with a Socket.IO transport on the `sparks` event, every rendered message (DMs included) fed to `sdk.sparks.ingest`, `setMembers` when a chat opens, the game state, the model download on Wi-Fi.
3. Keep using the REST Spark API for screens; the `useSparks` hook there gives live SDK Sparks when the SDK is running.
4. Full app guide: cosquest-sparks `docs/guides/APP_INTEGRATION.md`.

## 12. Known gaps

- Targeted voice calls ("calling all sergeants") are logged, not rung: CosQuest calls have no "ring this subset" path yet (`ports.onTargetedCall`). Users have no rank yet, so rank targets match nobody.
- Manual starts over REST use the module's own `backend.startSpark` (1.2). Before 1.2 they went through a stand-in device per user (`web-<userId>`); any such rows left in `sparks_devices` are harmless and unused.
- Edits and voice-note transcripts that arrive after sending are not re-sent to phones; the module reads the current text whenever it builds a job.
