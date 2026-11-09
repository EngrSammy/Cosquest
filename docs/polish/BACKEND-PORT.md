# Chat backend changes the polished app can use (port guide)

Branch `polish-responsive`, commit `aff39d0`, folder `cosquest-backend/` of this repo.
Not deployed, not pushed to MCJ-events/COSQUEST. Every change is optional for
the app: the app on this branch works against today's backend (it was measured
and journey-tested against it) and gets faster with these.

All three live in `src/controllers/chatController.js`. Tests:
`test/polishPaging.js` (15 checks, wired into `npm test` via
`test/runWithMemoryMongo.js`). Full suite on this copy: 779 passed, 0 failed.

## 1. Cursor paging on messages: `GET /api/chats/:id/messages?before=`

Today the endpoint pages by offset (`page`, `limit`, newest first, default 30).
Offset pages shift when new messages arrive while you scroll up (you see a
message twice, or after a delete you skip one).

New, optional query param `before`:

| `before` | Meaning |
|---|---|
| a message id in this chat | the `limit` messages just older than that message (by `createdAt`, then `_id` for ties) |
| an ISO time | the `limit` messages older than that time |
| absent, not an id or time, or an id from another chat | ignored: the old offset behaviour |

With `before`, `page` is ignored. The response is the same shape, plus:

```json
"pagination": { "page": null, "limit": 50, "total": 2000, "hasMore": true, "nextBefore": "<id of the oldest message returned>" }
```

`hasMore` with a cursor comes from fetching `limit + 1` rows (no count needed);
`total` is still counted, as before. Without `before`, `pagination` is as today
plus `nextBefore`.

What the app sends (`app/services/messagePaging.ts`): the first page as
`?limit=50`; older pages as `?before=<oldest loaded id>&page=<n>&limit=50`.
Today's backend uses `page` and ignores `before`; this one uses `before` and
ignores `page`. The app drops duplicates by id and stops asking when a page
brings nothing new.

Port: copy `messageCursor()` and the changed body of `listMessages()`.
Index: the existing `{ conversation: 1, createdAt: -1 }` on `Message` serves
it; no new index.

## 2. Some chats in one request: `GET /api/chats?ids=a,b,c`

Today the app refreshes DMs one request each after every reconnect (coming
back to the app), and one request per `chat:preview` event.

New, optional `ids` (comma separated, at most 200, invalid ids dropped): the
same list the endpoint builds today, filtered to those ids before the
(expensive) per-chat summaries are computed. Chats that aren't the caller's are
left out. Without `ids`: unchanged.

The app (`refreshConversations` in `app/store/thunks/chatThunks.ts`) merges the
answer into its list, so today's backend (which ignores `ids` and returns every
chat) is also right, just bigger.

Port: `parseIdList()` and the two changed lines in `listChats()`.

## 3. DM previews that carry the chat: `chat:preview { conversationId, chat }`

Today `chat:preview` carries only `{ conversationId }` and every receiver
fetches the conversation again (`GET /api/chats/:id`).

For DMs (two people) the event now carries each participant's own summary,
exactly what `GET /api/chats` gives for that chat (unread count, last message,
the other person): `emitDmPreviews()`. It runs after the response is sent
(`void`), and on any error falls back to the bare event. Groups are unchanged
(a summary per member would be one count query per member); the app batches
those (one fetch per chat per 400 ms, several chats in one `?ids=` request).

Apps that only read `conversationId` are unaffected. The app uses `chat` when
it has an `id` (`previewSummary()` in `app/services/idBatcher.ts`).

Port: `emitDmPreviews()` and the one-line change where `createMessage` emits
the DM preview. The other `chat:preview` emitters (forward, game invites, group
changes, chat extras) can stay bare; the app handles both.

## Not changed

- Feed posts already page (`/api/posts?page=&limit=`, `pagination.hasMore`);
  the app now uses it (20 at a time).
- No change to auth, models or socket rooms.

---

# Task 059 additions: App Store must-haves, push, game events, result cards

Branch `polish-cohesion`, folder `cosquest-backend/`. Not deployed, not pushed to MCJ-events/COSQUEST. Tests: `test/polishCohesion.js` (54 checks, in `npm test`). Full suite on this copy: 833 passed, 0 failed.

The app feature-detects all of it with `GET /api/meta/capabilities`: where that answers 404 (today's test server) the app hides Delete account, Report, block-by-id and the result card, and keeps working.

| What | Route / file | Notes for porting |
|---|---|---|
| Capabilities | `GET /api/meta/capabilities` (public), `src/controllers/safetyController.js` | Port first: it is what turns the app's features on |
| Delete account | `DELETE /api/users/me` `{ password }` or `{ confirm: "DELETE" }` for Google/Apple accounts | Wipes the profile to "Deleted user", removes email and password, bumps `tokenVersion`; deletes posts (and their likes/comments/bookmarks/shares), follows, blocks, reactions, poll votes, notifications, OAuth identities, password resets, quest registrations, join requests, memberships; marks their messages deleted for everyone. New field `User.deletedAt`. `sanitize()` now sends `hasPassword` (true/false, never the hash) so the app knows which confirmation to ask for |
| Reports | `POST /api/reports` `{ targetType: user|post|comment|message|group, targetId, reason, details?, snapshot?, conversationId? }`, model `src/models/Report.js` | One report per reporter per target (reporting again updates it). Reasons: spam, harassment, hate, nudity, violence, self_harm, impersonation, underage, other. No admin screen yet: read the `reports` collection (status open/reviewed/actioned/dismissed) |
| Block from anywhere | `POST /api/blocks` `{ userId }` or `{ username }`; `DELETE /api/blocks/:userId` | Same Block model and follow clean-up as `POST /api/users/:username/block`; idempotent (200 when already blocked) |
| Push tokens | existing `POST /api/users/me/devices`, now moves a token from any other account first; new `DELETE /api/users/me/devices` `{ pushToken }` (sign out) | |
| Push sending | `src/utils/push.js` (Expo push API), `src/utils/messagePush.js` | Off unless `PUSH_ENABLED=1`; optional `EXPO_ACCESS_TOKEN`. Sends for follows, group adds, mentions, game events (`notificationModel.createForUser`) and new DM / group messages to members who are not connected and have not muted the chat (never Community / faction rooms). Data: `{ type, conversationId, username, link }`, badge = unread notifications. Removes tokens Expo reports as DeviceNotRegistered |
| Game events | `POST /api/notifications/game-events` with header `X-Game-Events-Key: $GAME_EVENTS_KEY`, body `{ userIds?|usernames?, kind, message, link? }` | For the game backend to call (raid started, boss appeared, duel challenge, friend joined, reward ready, live event, invite accepted). `link` must be `cosquest://play...`. Creates type `game` notifications (new `link`, `gameKind` fields) and pushes. 503 without the key. Nothing in ubmids/costquest-backend calls it yet |
| Game result card | `POST /api/chats/:id/game-results` `{ headline, pointName?, realm?, win?, xp?, coins?, level?, rank?, note? }`, Message kind `game_result` with `gameResult` | `content` carries the same result as one line of text, so apps without the card still show it. Same send rules as a message (blocked DMs, admin mute, slow mode) |
| Routes mounted first | `src/routes/safetyRoutes.js`, `router.use('/', ...)` at the top of `src/routes/index.js` | So `DELETE /users/me` is not caught by the settings router |

Env to add on a server: `PUSH_ENABLED`, `EXPO_ACCESS_TOKEN` (optional), `GAME_EVENTS_KEY`.
