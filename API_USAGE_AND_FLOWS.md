# CosQuest API Usage Examples and Flows

> Current signup, comments/replies, chat links/files, Spotlight, and Settings contract: [COMMUNITY_SETTINGS_API.md](COMMUNITY_SETTINGS_API.md). That guide supersedes older examples and deferred-feature notes below for these features.

This document reflects the current backend routes. Base URL in Postman:

```text
{{baseUrl}} = http://localhost:6893
```

## Common Postman setup

Use collection variables instead of placing passwords or tokens directly in every request.

```text
email          test@example.com
username       test_user
password       AStrongPassword!1
accessToken    set from signup, login, OAuth exchange, or a credential change
targetUsername another_user
questId        copied from GET /api/quests
postId         copied from a post response
commentId      copied from a comment response
```

For every endpoint marked **Bearer**, add this header:

```http
Authorization: Bearer {{accessToken}}
```

Authentication labels:

- **Public** — no sign-in needed.
- **Identifier or Bearer** — before onboarding/login, include `email`, `username`, or `identifier` in the body/query. After login, use the Bearer header instead. If both are supplied, Bearer wins.
- **Bearer + completed onboarding** — user must be logged in and have completed onboarding.

Important: creation endpoints correctly return **201**, not 200. A duplicate like/follow/quest registration returns **409** by design. Signup is the one exception: re-signing-up with an email/username whose onboarding was never finished **resumes** that same account (`200`, `resumed: true`) instead of erroring - it's the same person coming back, not a real conflict. Signup only returns `409` when the existing account already finished onboarding.

## Recommended end-to-end flow

1. Call public reference endpoints: avatars, factions, interests, and categories.
2. Sign up with an email **or** a username and a strong password. Signup returns 201 with `token` and `onboardingRequired: true`. Save the token immediately.
3. Complete onboarding using the email/username from signup (or use a token if the user already has one). It requires name, username, age, gender, an avatar or uploaded photo, faction, at least one interest, an explicit notification choice, and enabled location with real coordinates. (Sign in works even before this step now - see step 4 - but nothing beyond onboarding itself is usable until it's done.)
4. Onboarding completion returns `onboardingRequired: false`. Continue into the app using the same signup token; no extra login is needed. Returning users can still use Login.
5. Use Bearer-protected profile, dashboard, social, post, quest, notification, and points endpoints.
6. To test a post lifecycle: create a thought → copy `post.id` → like/comment/read/update/delete → copy `comment.id` before deleting it.
7. To test a quest lifecycle: list quests → copy a published quest ID → register → view profile quest history → cancel registration.
8. Logout last. Logout invalidates every existing token for that user; sign in again for a new one.

## Health

| Method and URL | Login? | Usage / expected result |
| --- | --- | --- |
| `GET /health` | Public | Server check. Returns `200` with `{ "ok": true, "service": "cosquest-backend" }`. |

## Authentication and OAuth

| Method and URL | Login? | Usage |
| --- | --- | --- |
| `POST /api/auth/signup` | Public | Creates and signs in the account: `201` with `token`, `onboardingRequired: true`, and user. An incomplete account resumes with `200` only after checking its existing password. Completed accounts return `409`; incorrect resume credentials return `401`. |
| `POST /api/auth/login` | Public | Sign in with a valid password, whether or not onboarding is finished. Returns `200` with `token` and `onboardingRequired` (`true` if onboarding still isn't done - use that token to continue it; `requireCompletedOnboarding` still blocks every real feature until it's actually finished). |
| `POST /api/auth/logout` | Bearer | Invalidates current tokens for the account. Returns `200`. |
| `GET /api/auth/oauth/google` | Public | Browser redirect to Google. Expected browser redirect, not a JSON 200 response. |
| `GET /api/auth/oauth/google/callback` | Provider | Google redirects here after consent. Do not manually invent the code/state. |
| `GET /api/auth/oauth/apple` | Public | Browser redirect to Apple. |
| `POST /api/auth/oauth/apple/callback` | Provider | Apple posts provider data here after consent. |
| `POST /api/auth/oauth/exchange` | Public, one-time code | Exchange the OAuth completion code returned to the frontend redirect for a Bearer token. |

Email signup body:

```json
{
  "identifier": "{{email}}",
  "password": "{{password}}",
  "confirmPassword": "{{password}}"
}
```

Username signup body (use this instead of email if desired):

```json
{
  "identifier": "{{username}}",
  "password": "{{password}}",
  "confirmPassword": "{{password}}"
}
```

Password rule: include uppercase, lowercase, number, and special character; use at least 8 characters.

Login body. The **field name** must remain `identifier`; its value can be an email or username.

```json
{
  "identifier": "{{email}}",
  "password": "{{password}}"
}
```

OAuth exchange body:

```json
{ "oauthCode": "{{oauthCode}}" }
```

## Onboarding, preferences, and reference data

| Method and URL | Login? | Usage |
| --- | --- | --- |
| `GET /api/meta/avatars` | Public | List valid Cloudinary preset avatars. Use the returned `key` in avatar requests. |
| `GET /api/meta/profile-categories` | Public | List valid profile categories. |
| `GET /api/factions` | Public | List the six valid factions - `key`, `name`, `color`, `description`, `perks` (a static array of perk strings), a live `memberCount` (onboarded accounts currently in that faction), and a live `activeQuestCount` (published quests tagged to that faction with status `live`/`upcoming`). A quest's faction tag is purely a label - it never restricts who can register. |
| `GET /api/factions/:key/members?page=1&limit=6` | Public | A small preview page of that faction's onboarded members (e.g. the avatar row on a faction card) - same shape as followers/following. `404` for an invalid key. |
| `GET /api/interests` | Public | List valid interest keys. |
| `GET /api/users/me` | Identifier or Bearer | Read the current/in-progress user record. Before login include `?email={{email}}`. |
| `PATCH /api/users/me/profile` | Identifier or Bearer | Save profile details during onboarding or edit profile later. |
| `GET /api/users/check-username?username=new_name` | Identifier or Bearer | Check if a username is available. Before login also send `&email={{email}}`. |
| `PATCH /api/users/me/avatar` | Identifier or Bearer | Set a valid preset avatar. Coexists with an uploaded photo (the real profile UI shows the photo as the main picture with this as a small badge over it) - setting one never clears the other. |
| `POST /api/users/me/avatar/photo` | Identifier or Bearer | Multipart upload; set form-data `photo` to a local image file and also add `email` before login. Accepts JPEG/PNG/WEBP/GIF even if the client mislabels the file's Content-Type (`image/jpg`, `application/octet-stream`, `text/plain` are all tolerated) - Cloudinary's real content check is the actual gatekeeper, so a genuinely non-image file still fails there with a clear `400`. |
| `POST /api/users/me/faction` | Identifier or Bearer | Choose/replace faction. A faction is required before onboarding completion. |
| `PUT /api/users/me/interests` | Identifier or Bearer | Replace the full list of interests. At least one is required before completion. |
| `PATCH /api/users/me/preferences/notifications` | Identifier or Bearer | Save the master on/off notification choice, and/or `eventReminders` (a per-category push toggle) and/or `emailWeeklyNewsletter` - any subset of the three in one call. At least one field is required. `eventReminders`/`emailWeeklyNewsletter` are preference storage only - no email actually sends yet (no email infrastructure exists in this backend), and no scheduled "event" trigger exists yet either. |
| `PATCH /api/users/me/preferences/location` | Identifier or Bearer | Save real device coordinates and a discovery radius (5-100 miles, default 50). **Required** before onboarding completion - CosQuest is played in the real world. `lat`/`lng` are required whenever `locationEnabled` is `true`. |
| `POST /api/users/me/devices` | Identifier or Bearer | Register an iOS, Android, or web push token. |
| `POST /api/users/me/onboarding/complete` | Identifier or Bearer | Atomic final onboarding submission. Returns `200` only if every required selection is valid, including location. |

Profile update body:

```json
{
  "email": "{{email}}",
  "firstName": "Postman",
  "lastName": "Tester",
  "username": "{{username}}",
  "age": 25,
  "gender": "Female",
  "bio": "Cosplayer and quest explorer.",
  "category": "Digital creator",
  "showCategoryOnProfile": true
}
```

Preset avatar body:

```json
{ "email": "{{email}}", "avatar": "adventurer" }
```

Faction body:

```json
{ "email": "{{email}}", "factionKey": "ascendants" }
```

Interest body:

```json
{ "email": "{{email}}", "interests": ["anime", "comic", "movies-tv"] }
```

Notification preference body:

```json
{ "email": "{{email}}", "notificationsEnabled": true }
```

Location preference body (required before onboarding can complete):

```json
{ "email": "{{email}}", "locationEnabled": true, "radiusMiles": 50, "lat": 6.5244, "lng": 3.3792 }
```

Send `locationEnabled: false` (no `lat`/`lng` needed) to disable it and clear the saved coordinates - but onboarding cannot complete while it's off.

Device body:

```json
{ "pushToken": "example-device-token-from-your-mobile-app", "platform": "android" }
```

Final onboarding body (preset-avatar route):

```json
{
  "email": "{{email}}",
  "profile": {
    "firstName": "Postman",
    "lastName": "Tester",
    "username": "{{username}}",
    "age": 25,
    "gender": "Female",
    "avatar": "adventurer"
  },
  "faction": "ascendants",
  "interests": ["anime", "comic"],
  "preferences": { "notificationsEnabled": true },
  "location": { "locationEnabled": true, "radiusMiles": 50, "lat": 6.5244, "lng": 3.3792 }
}
```

If a photo was uploaded first, omit `profile.avatar`; the uploaded photo already satisfies the avatar requirement. `location` follows the same shape as the standalone location-preference body above and is required the same way.

## My profile, contact, and notifications

All endpoints in this section require a logged-in, fully onboarded account, **except `GET`/`PATCH /api/users/me/contact`** (see below).

| Method and URL | Usage |
| --- | --- |
| `GET /api/users/me/points` | Read current app points balance. Returns `200` with `{ "points": 0 }` until a future reward system awards points. |
| `GET /api/users/me/contact` | Read the owner’s editable public contact values. Works two ways: **Bearer token** (post-login), or **pre-login** via standard HTTP Basic Auth - `Authorization: Basic base64(identifier:password)`. A GET has no body, so Basic Auth is used instead of a JSON field, keeping the password out of the URL (which would otherwise leak into browser history and server logs). |
| `PATCH /api/users/me/contact` | Save public contact fields; does not change login email. Works two ways: **Bearer token** (post-login, same as everything else here), or **pre-login** with `{ email\|username, password, ...contact fields }` in the JSON body - contact holds more sensitive PII (phone, business address) than the other onboarding-step fields, so unlike those (which accept a bare identifier), this requires the account's real password too. Wrong identifier or wrong password both return a generic `401`. |
| `GET /api/users/me/notifications` | List this user’s notifications, including follow notifications. |
| `PATCH /api/users/me/notifications/read` | Mark every currently unread notification as read. Body not required. |
| `GET /api/home/dashboard` | Get the dashboard anchored to the user's own saved location (`location.source: "user"`): user preview, unread notification count, live/upcoming/nearby quests. |
| `GET /api/users/me/privacy` | Read my current Settings > Privacy & Visibility values. |
| `PATCH /api/users/me/privacy` | Save any subset of `profileVisibility` (`public`/`friends`/`private`), `showActivityFeed`, `allowDirectMessages`. |
| `GET /api/users/me/blocked?page=1&limit=20` | Paginated list of profiles I've blocked. |

Contact body (post-login, Bearer):

```json
{
  "email": "creator@example.com",
  "phone": "+2348148327836",
  "businessAddress": "Lekki, Lagos, Nigeria"
}
```

Save contact body (pre-login, no token yet - identifier and password both required):

```json
{
  "identifier": "hero@example.com",
  "password": "Quest@1234",
  "phone": "+2348148327836",
  "businessAddress": "Lekki, Lagos, Nigeria"
}
```

Read contact pre-login (no token, no body on a GET) - send identifier:password as an HTTP Basic Auth header instead:

```http
GET /api/users/me/contact
Authorization: Basic aGVyb0BleGFtcGxlLmNvbTpRdWVzdEAxMjM0
```

(that's `base64("hero@example.com:Quest@1234")` - every HTTP client library has a helper for Basic Auth, so the frontend rarely needs to build this by hand.)

Privacy body (any subset of these three fields):

```json
{ "profileVisibility": "friends", "showActivityFeed": false, "allowDirectMessages": true }
```

`profileVisibility` gates the profile itself (and its followers/following/quest-history/share-link) - `public` is visible to anyone, `private` to the owner only, `friends` to the owner plus mutual follows (this app has no separate friend-request system, so "friends" means both users follow each other). `showActivityFeed: false` is a stricter, independent gate just on the posts list - it hides posts from anyone who isn't the owner or a friend even when the profile itself is otherwise public; a blocked viewer, or one denied by `profileVisibility`, gets `404` on the profile - a hidden activity feed alone returns `200` with an empty `posts` array instead, since the profile really is there. A block (see below) overrides every visibility level in both directions, always.

## Public profiles and follow system

| Method and URL | Login? | Usage |
| --- | --- | --- |
| `GET /api/users/:username/profile` | Public, or Bearer to be recognized as a friend/owner | Public profile, bio, visible category, public contact, and stats. `404` if hidden from this viewer by `profileVisibility` or a block - see Privacy above. |
| `GET /api/users/:username/quests?status=winner&page=1&limit=20` | Public, or Bearer | Registered-quest history. `status` may be `registered`, `cancelled`, `completed`, or `winner`. Same visibility rules as the profile. |
| `GET /api/users/:username/followers?page=1&limit=20&search=jamie` | Public, or Bearer | Paginated followers. Same visibility rules as the profile. Optional `search` matches (case-insensitive, substring) against the follower's username, first name, or last name. |
| `GET /api/users/:username/following?page=1&limit=20&search=jamie` | Public, or Bearer | Paginated following. Same visibility rules as the profile. Optional `search`, same matching rules as followers. |
| `POST /api/users/:username/follow` | Bearer + completed onboarding | Follow another user. Returns `201` and creates a notification for them. `404` across a block. |
| `DELETE /api/users/:username/follow` | Bearer + completed onboarding | Unfollow another user. Returns `200`. |
| `GET /api/users/:username/posts?type=thought&page=1&limit=20` | Public, or Bearer | List only one user’s posts; omit `type` for all types. `404` if the profile itself isn't visible; `200` with an empty list if only the activity feed is hidden. |
| `POST /api/users/:username/block` | Bearer + completed onboarding | Block a user. Returns `201`, and removes any existing follow between the two of you in either direction. `409` if already blocked. |
| `DELETE /api/users/:username/block` | Bearer + completed onboarding | Unblock a user. Returns `200`. |
| `GET /api/users/:username/share` | Public | Returns `{ url, title, text }` ready to hand straight to a native share sheet (`Share.share()` on mobile, `navigator.share()` on web) - the frontend never has to construct the link itself. |
| `GET /u/:username` | Public, plain HTML (not JSON, not under `/api`) | The actual link to share to Instagram/Facebook/WhatsApp/etc. Real server-rendered HTML with Open Graph + Twitter Card tags (title, bio, avatar/photo image), so pasting it anywhere shows a rich preview card instead of a bare link. Anyone without the app still sees a readable profile card. `404` (HTML, not JSON) for an unknown username. |

Example public URL:

```http
GET {{baseUrl}}/api/users/{{targetUsername}}/profile
```

## Posts, reels, thoughts, likes, and comments

| Method and URL | Login? | Usage |
| --- | --- | --- |
| `GET /api/posts?page=1&limit=20&type=thought` | Public | Chronological public feed. `type` is optional: `image`, `reel`, or `thought`. |
| `POST /api/posts` | Bearer + completed onboarding | Create image post, reel, or thought. Returns `201`. |
| `GET /api/posts/:postId` | Public | Read one public post. |
| `PATCH /api/posts/:postId` | Bearer + completed onboarding | Owner only; edit `content`. Stamps `editedAt`, which stays set (no time limit on editing). |
| `DELETE /api/posts/:postId` | Bearer + completed onboarding | Owner only; removes post, comments, likes, and Cloudinary media. |
| `POST /api/posts/:postId/likes` | Bearer + completed onboarding | Like once. Returns `201`; repeated like is `409`. |
| `DELETE /api/posts/:postId/likes` | Bearer + completed onboarding | Remove own like. |
| `POST /api/posts/:postId/shares` | Bearer + completed onboarding | Share once. Returns `201`; repeated share is `409`. |
| `DELETE /api/posts/:postId/shares` | Bearer + completed onboarding | Remove own share. |
| `POST /api/posts/:postId/bookmarks` | Bearer + completed onboarding | Bookmark once. Returns `201`; repeated bookmark is `409`. |
| `DELETE /api/posts/:postId/bookmarks` | Bearer + completed onboarding | Remove own bookmark. |
| `GET /api/users/me/bookmarks?page=1&limit=20` | Bearer + completed onboarding | List my saved posts, newest bookmark first. |
| `GET /api/posts/:postId/comments?page=1&limit=20` | Public | Read public **top-level** comments (omit `parentComment`), each with a `replyCount`. |
| `GET /api/posts/:postId/comments?parentComment=:commentId&page=1&limit=20` | Public | Read the replies under one specific top-level comment. |
| `POST /api/posts/:postId/comments` | Bearer + completed onboarding | Create a public 1–500 character comment. Add `parentComment: "{{commentId}}"` to reply under an existing top-level comment - replies to replies stay in the root thread, with `replyToComment` recording the exact target. Returns `201`. |
| `DELETE /api/posts/:postId/comments/:commentId` | Bearer + completed onboarding | Comment author only. Deleting a top-level comment cascades to delete its replies too. |

Create a thought: choose **raw → JSON**.

```json
{ "type": "thought", "content": "Getting ready for the next CosQuest!" }
```

Create image post: choose **form-data** (not raw JSON). Add text fields `type=image`, `content=Quest photos`, then add 1–8 `media` fields of type **File**.

Create reel: choose **form-data**. Add text fields `type=reel`, `content=My cosplay reveal`, then add exactly one `media` file. It must be MP4, MOV, or WEBM and 30 seconds or shorter.

Edit post body:

```json
{ "content": "Updated caption or updated thought text." }
```

Create comment body:

```json
{ "body": "This cosplay looks amazing!" }
```

Reply to a comment body (`parentComment` can be any comment or reply on the same post):

```json
{ "body": "Thanks, glad you like it!", "parentComment": "{{commentId}}" }
```

Emoji reactions on a post ("quick replies") are frontend-only - the client sends them straight into the comment box as text, there's no separate reaction endpoint or storage for posts. (Chat messages are different: those reactions do have a real backend endpoint - see below.)

## Chats (Community, faction rooms, and direct messages)

Every endpoint here is **Bearer + completed onboarding** - there is no pre-login/email-identified access, unlike the onboarding-step endpoints.

**Real-time: use the socket, don't poll.** New, edited and deleted messages, reactions, read receipts, pins, typing, presence and incoming calls are pushed live over Socket.IO. To receive them:

1. Connect once after login with the same bearer token: `io(API_URL, { auth: { token }, transports: ['websocket'] })`.
2. Emit `conversation:join` with the conversation id whenever a chat screen opens, and `conversation:leave` when it closes. Without the join, that phone never receives `message:new` for the chat.
3. On `message:new`, append the message straight into the open chat instead of refetching.
4. Use `GET .../messages` for the first page of history, and to catch up once when the app returns to the foreground or the socket reconnects - never on a timer.

Full event list and payloads: the "Real-time: WebSockets + Redis" section of `cosquest-backend/README.md`.

| Method and URL | Usage |
| --- | --- |
| `GET /api/chats` | "Your Space": the single Community room, my current faction's room, and every DM I'm part of. Each entry includes `unreadCount` and a `lastMessage` preview. |
| `POST /api/chats/dm` | Find-or-create a DM with `{ "username": "..." }`. Calling it again with the same username returns the same conversation, not a duplicate. `404` across a block; `403` if the target's `allowDirectMessages` privacy setting is off. |
| `GET /api/chats/:conversationId` | Room detail: title, member count, pinned message, and (for DMs) the other participant's presence (`lastActiveAt`). |
| `GET /api/chats/:conversationId/messages?page=1&limit=30` | Paginated, newest first. Each message includes its reactions and, for a DM, `read` (whether the recipient has seen it) on messages I sent. |
| `POST /api/chats/:conversationId/messages` | Send a message. `content` (text) and/or a single `media` file (image or voice note - MP3/M4A/WEBM/OGG/WAV) via multipart form-data; optional `replyTo` (a message id in the same conversation) to quote a message. |
| `PATCH /api/chats/:conversationId/messages/:messageId` | Sender-only. Edits `content`; stamps `editedAt`, which the message keeps showing forever afterward (no time limit on editing). |
| `DELETE /api/chats/:conversationId/messages/:messageId?scope=me` | Hides the message from **just the caller** - any time, no limit. Everyone else still sees it untouched. |
| `DELETE /api/chats/:conversationId/messages/:messageId?scope=everyone` | Sender-only, and only within **5 minutes** of sending. Replaces the message with a "This message was deleted." tombstone for every viewer. `scope` defaults to `me` if omitted. Neither scope ever removes the database row - only flags on it change, so the original content/media stay recoverable in the database even though the API stops returning them. |
| `PATCH /api/chats/:conversationId/read` | Marks the conversation read as of now, clearing my unread badge. |
| `PATCH /api/chats/:conversationId/pinned-message` | `{ "messageId": "..." }` to pin, or `{ "messageId": null }` to unpin. Any member can do this - there is no moderator role yet. |
| `POST /api/chats/:conversationId/messages/:messageId/reactions` | `{ "emoji": "😂" }` - one reaction per user per message; sending a new emoji replaces your old one. Returns `201` with the message's grouped reaction counts. |
| `DELETE /api/chats/:conversationId/messages/:messageId/reactions` | Remove my own reaction from the message. |
| `GET /api/chats/:conversationId/messages/:messageId/seen?page=1&limit=30` | Who has read up to (and including) this message, excluding the sender - reuses the same per-viewer `lastReadAt` the unread badge and DM read receipt are built on, so it's naturally 0-1 people in a DM and potentially many in the Community/faction rooms. |
| `POST /api/chats/:conversationId/messages/:messageId/forward` | Body needs **exactly one** of `targetConversationId` (a conversation the caller already belongs to - Community, their current faction room, or any DM) or `targetUsername` (any user found via `GET /api/users/search` - the DM is found-or-created automatically, same as tapping "+" then forwarding). `403` for a conversation you don't belong to; `400` for zero or both target fields; the DM-by-username path applies the same block/`allowDirectMessages` checks as `POST /api/chats/dm`. The copy is marked `forwarded: true`; the original is untouched and unlinked from the copy's lifecycle (deleting/editing one never affects the other). |
| `GET /api/users/search?search=jamie&page=1&limit=20` | Find people to start a DM/forward with, by username/first/last name (case-insensitive substring). Unlike profile visibility, this is **not gated by `profileVisibility`** - it's a discoverability search for messaging, not a profile-content view, so even a private/friends-only account can be found here (most chat apps work this way: you can find someone by name to message them even if you can't see their content). A block hides someone from search in both directions, same as everywhere else; incomplete accounts never show up. `400` with no `search` term. |

Faction-room access follows the user's **current** `faction` value live - there's no separate join/leave step, and switching factions moves you into the new faction's room automatically. A logged-in user who isn't in a given faction room gets `403` posting or reading there.

Send a text message:

```json
{ "content": "Yooo, anyone at Waterfront?" }
```

Reply to a message (form field alongside `content`, or JSON if there's no attachment):

```json
{ "content": "I can see you", "replyTo": "{{messageId}}" }
```

Send a voice note: choose **form-data**, add field `media` as a File (MP3/M4A/WEBM/OGG/WAV), leave `content` empty.

Forward a message body (into a conversation you're already in):

```json
{ "targetConversationId": "{{dmConversationId}}" }
```

Forward a message body (to any user by username - finds or creates the DM for you):

```json
{ "targetUsername": "Jamie123" }
```

"Copy text" on long-press is frontend-only - it copies a message's already-loaded `content` to the device clipboard, no API call involved. Stories are intentionally not implemented yet.

## Quests and registration

| Method and URL | Login? | Usage |
| --- | --- | --- |
| `GET /api/quests?lat=6.5244&lng=3.3792&radiusMiles=30&status=upcoming&faction=ascendants&limit=20` | Public | List published quests. Coordinates are optional; if supplied they filter/sort by distance. `faction` is optional - filters to quests tagged with that faction (a label only, not a registration restriction; a quest's `faction` is `null` unless explicitly tagged when it was created). |
| `GET /api/quests/:questId` | Public | Read one published quest. |
| `POST /api/quests/:questId/registrations` | Bearer + completed onboarding | Register for an available upcoming/live quest. Returns `201`; paid quests return `paymentStatus: pending`. |
| `DELETE /api/quests/:questId/registrations` | Bearer + completed onboarding | Cancel the user’s active registration. Returns `200`. |

Quest registration has no raw body. First call `GET /api/quests`, copy a returned quest `id` to `{{questId}}`, then call the registration URL.

## Status-code guide

| Status | Meaning in this API |
| --- | --- |
| `200` | Successful read, update, login, logout, delete, or completion. |
| `201` | Successful new account, follow, post, comment, like, or quest registration. |
| `302` | Normal OAuth browser redirect. |
| `400` | Missing/invalid body, invalid option, invalid upload, or validation failure. |
| `401` | Missing, invalid, logged-out, or expired Bearer token. |
| `403` | Logged in but onboarding incomplete, trying to edit/delete another user’s content, or the target has direct messages turned off. |
| `404` | User, quest, post, comment, or route does not exist - or exists but is hidden from you by a privacy setting or a block (deliberately indistinguishable from not existing). |
| `409` | An already-onboarded email/username re-signing up, or a duplicate follow/like/share/bookmark/registration, or an unavailable/full quest. (Re-signing up with an *incomplete* email/username resumes instead - see signup above.) |
| `503` | Cloudinary or OAuth provider configuration is missing. |

