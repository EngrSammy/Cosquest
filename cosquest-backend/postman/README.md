# CosQuest Postman collection

`CosQuest.postman_collection.json` (89 requests across 9 folders, generated from [API_USAGE_AND_FLOWS.md](../../API_USAGE_AND_FLOWS.md)) and `CosQuest.postman_environment.json`.

## Import

1. Postman → Import → select both files.
2. Pick the "CosQuest Local" environment in the top-right environment dropdown. Its `baseUrl` is `http://localhost:6893`, matching this project's `.env` (`PORT=6893`) — if you ever run on a different port, change it there (or in the collection's own variables tab), nowhere else.

## Real values, not placeholders

Every request body uses real, literal example values — the same ones `test/smoke.js` uses (`hero@example.com` / `Quest@1234` / `Ravencaller` for the main account, `buddy@example.com` / `Buddy` for a second account used by Follow/DM requests) — not `{{email}}`/`{{username}}`-style template variables. Start your server and press Send; nothing needs filling in first.

The only things that stay as variables are values that literally cannot be known ahead of time because the server generates them: `{{accessToken}}`, `{{postId}}`, `{{commentId}}`, `{{replyCommentId}}`, `{{questId}}`, `{{communityConversationId}}`, `{{factionConversationId}}`, `{{dmConversationId}}`, `{{messageId}}`, `{{forwardedMessageId}}`. Each is captured automatically by a test script on the request that creates or first lists it — run things roughly top-to-bottom within a folder the first time through and they fill themselves in.

## No manual token pasting

The collection sets Bearer auth at the **collection level**, pointed at `{{accessToken}}`. Run these three once, in order, and everything else in the collection is authenticated automatically:

1. **Auth → Signup (me)**
2. **Onboarding → Complete onboarding (me, one-shot)** — this now includes a `location` block (real coordinates + a 5-100 mile radius, default 50). Enabling location with real coordinates is **required** to complete onboarding, same enforcement level as faction/interests/avatar - not optional like notifications.
3. **Auth → Login** — its test script saves the returned token into `{{accessToken}}` for you.

**Public folders** (Reference data, most of Onboarding, some of Public profiles/Posts/Quests) are marked `noauth` at the request level, so they work before you've logged in at all.

## Re-running against the same database

Because the identities are fixed literal values rather than freshly generated each run, re-sending **Signup (me)** or **Signup (buddy)** against a database that already has that account correctly returns `409` — that's the real API behaving correctly, not a broken request. To start over cleanly, either delete those two accounts from your database first, or edit the `ME_EMAIL`/`BUDDY_EMAIL`-equivalent literal values in the requests you want to re-run.

## Requests that need your input

- Any request marked "multipart, attach a file/video manually" — Postman collections can't embed real binary files portably, so open the request's Body tab and select a real file before sending. For the reel and voice-note requests this needs to be a genuine short video/audio file — a real Cloudinary account rejects placeholder bytes as invalid.
- **OAuth exchange** and the two OAuth browser-redirect requests — these need a real Google/Apple consent flow to produce a real `oauthCode`; they're kept here for reference, not for scripted runs.
- **Open shareable profile page (me)** — this returns real HTML, not JSON. Postman will show the raw markup; to see the actual rendered card (and confirm the Open Graph preview looks right), paste `{{baseUrl}}/u/Ravencaller` into a real browser instead.
