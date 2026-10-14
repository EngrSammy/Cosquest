# Wale pages audit (M01 to M32)

Designs: Adewale's 32 community chat screens (M01 to M32).
Base: `dammy-development` at `4ee0ab8` (main + Sparks SDK 1.2.4 + group calls).
Method: the app was built for web against the TEST backend
(`cosquest-api-test`), signed in as `chioma_e2e`, and every screen was
screenshotted at 390 x 844 and put next to its design. A design-like test
group ("Barrio Logan Ascendants") was seeded on the TEST backend with
`chioma_e2e` (owner) and `dami_e2e` (admin).

Most of the experience already exists on the base branch: the code cites the
same M numbers. The gaps are mostly details, three pending choices, and a few
pieces of data the screens show but nothing supplies yet.

## Starting state (before this branch)

| Screen | Status | What differs from the design | What this branch builds | Backend? |
|---|---|---|---|---|
| M01 Chat hub | partly | Lives inside the Community tab, so it has the tab header (avatar and bell) instead of back/close and the "Your people. Your next adventure." subtitle. Group rows, filters, DM row and "Create a group" exist. | Subtitle under the title. Keep the tab header (the hub is a tab, not a pushed screen). | no |
| M02 Conversation | partly | Header shows a group avatar and "N members" but no "· N online". The pinned bar says "Pinned message", not "Pinned by {name}". The composer has no send circle until you type. | "N members · N online", "Pinned by {name}", always-visible send circle. | yes: online count for a group |
| M03 Option A, side rail | partly | Built, but only reachable by editing `constants/sparkLayout.ts`. | One runtime setting for A/B/C, default B. | no |
| M04 Option B, top orbit | partly | The orbit strip sits on a white band. Quiet Sparks are big lilac tiles, not small white "Quiet · Open →" cards. Spark tag sits above the text, not beside the time. | Strip on the chat background, compact quiet cards, Spark tag on the time row ("✦ Next CosQuest ... 9:32 AM"). | no |
| M05 Option C, inline cards | partly | Same as M03 (code-only switch). | Runtime setting. | no |
| M06 Dark mode | missing | `app.json` forces light mode. The chat has no dark colours. | Chat screens follow the system appearance (dark palette for the chat, its sheets and the Spark overlay). | no |
| M07 Active Spark overlay | partly | Panel exists (summary card, replies, "Reply to this Spark", return link). No "· N people" in the status line. No "Also visible in the main conversation" note. | Add both. | no |
| M08 Dormant Spark card | done | Card under the latest message: "Quiet · last reply · N messages", summary, "Open conversation". | Small spacing tweaks only. | no |
| M09 Revived Spark history | partly | Revived header, era colours, seams with labels and "Conversation resumed · date" exist. No live revived Spark on TEST to prove it. | Keep. Verified with the data the backend returns. | no |
| M10 Long-press actions | partly | Sheet exists. It shows a one-line preview, not the message card with sender and rank. Emoji row differs (8 faces vs ❤️ 🙌 😂 👍 🔥 +). Own messages say "Edit" / "Delete", not "Edit your message" / "Delete your message", and there is no "Your message · only you can edit this text" note. | Message card, the design's emoji row with "+" for more, own-message wording and footnote. Extra actions (copy, forward, pin, select, copy link) stay. | no |
| M11 Start a Spark | done | Matches (wording, subject box, "Check for matching Sparks", Cancel). | none | no |
| M12 Topic match decision | done | "A familiar subject", add to active, add to quiet, start new, "Nothing is merged without your choice". | none | no |
| M13 Checkbox mentions | partly | Picker shows username, not role/rank/expertise. No "Barrio Logan Ascendants" subtitle. Button reads "Choose who to mention" instead of "Confirm · mention 2 members". No "2 selected · names" / "They'll be notified..." lines. | All of that. List stays paged (50 per page, search on the server). | no |
| M14 Quote reply with mentions | done | Quote inside the bubble, reactions under it, "Replying to ..." bar, "... will be notified" line. | none | no |
| M15 Own-message edit and rollback | done | "Your message" card, "Edit again", "Undo · restore previous message" (backend rollback). | none | no |
| M16 In-chat search | partly | Exists. "All dates" only flips the order. Results have no rank line. Only the latest recent search shows. | Date filter (any time / past week / past month / past year), three recent searches, rank line. | yes: date range on search |
| M17 Media and voice share | done | Share sheet with photo/voice/video, preview, caption, re-record/delete. | none | no |
| M18 Create poll | done | | none | no |
| M19 Poll results and media | done | Poll bubble with votes and "Your vote", albums, voice notes. | none | no |
| M20 Choose group type | done | | none | no |
| M21 Group basics | done | | none | no |
| M22 Add contacts | done | | none | no |
| M23 Joining, privacy and notifications | done | | none | no |
| M24 Group created | done | | none | no |
| M25 Invite and pending approval | done | Invite preview, introduction, "Request pending", "Cancel join request". | none | no |
| M26 Roster and member detail | partly | No rank line in the list (the member API sends no rank). | Rank line once the backend sends it. | yes: rank on members |
| M27 Group settings | partly | Same items, different order and grouping. "Administrators" and "Manage Sparks" sit in Group controls. The design has a "Management · admin only" section (Members & administrators, Join requests, Moderation & slow mode). | Reorder to the design, add counts ("24 members · 2 administrators", "2 awaiting review"). Extras (expertise, Sparks AI, Manage Sparks, invite link, leave) stay below. | no |
| M28 Promote admin | done | | none | no |
| M29 Join request moderation | done | | none | no |
| M30 Member moderation and slow mode | done | | none | no |
| M31 Manage Sparks (requirements pending) | partly | Built (pin, delete, merge with confirmation). Members who are not admins can open it and see disabled buttons. | Admin-only entry. Marked "built to the current concept, awaiting Mark's requirements". | no |
| M32 Role pings (concept) | missing | Nothing in the app reads role pings. | Concept card in the Spark overlay from the SDK's role pings, marked "Concept · requirements pending". | yes: expose role pings |

Faction ranks ("Corporal", "Sergeant", "Private") appear on almost every
screen. The app already draws them (`RankBadge`, `GET /api/ranks`), but
neither backend repo serves `/api/ranks` or a `rank` on senders and members,
so no rank shows today. See the final status below.

## Final status (after this branch)

Screenshots: `docs/wale-pages/MNN.png` puts each design next to the built
screen (design | built). They were taken from the web build at 390 x 844.
The data came from the `wale-pages-backend` branch running locally on an
in-memory database, seeded to match the designs: 24 members, with ranks,
expertise, Sparks, a revived Spark, a poll and join requests. See "How the
screenshots were made" below.

Emoji show as empty boxes in the screenshots because the headless browser
has no emoji font. That is not an app bug.

| Screen | Status | Remaining differences from the design |
|---|---|---|
| M01 Chat hub | done | The hub is a tab, so it keeps the app's tab header (avatar and bell) and tab bar instead of back/close. "Create a group" is at the end of the list rather than pinned above the tab bar. |
| M02 Conversation | done | The header keeps a search icon (the design reaches search through group settings). Your own bubbles are a lighter pink than the design's mauve. "N online" counts members connected right now (backend `onlineCount`). |
| M03 Option A, side rail | done (pending choice) | One setting in Settings › Appearance picks A, B or C. It is per device and B is the default. Revived Sparks use a teal clock icon; the design's ring colour differs slightly. |
| M04 Option B, top orbit | done (pending choice, default) | |
| M05 Option C, inline cards | done (pending choice) | The inline card's second line is the Spark summary (or "active now"), not a hand-written line like "3 people planning Saturday". |
| M06 Dark mode | done | The chat follows the phone's appearance (or the Light/Dark choice in Appearance). The colours are derived from the light theme, so some tints differ slightly from the mock-up. The other app screens stay light, as before. |
| M07 Active Spark overlay | done | The panel is a full-height sheet from the right rather than a floating card. The running summary only exists once a phone has run the summary job (Sparks SDK); before that, no card is shown. |
| M08 Dormant Spark card | done | |
| M09 Revived Spark history | done | The seam label comes from the Sparks module ("10 months later" etc.). |
| M10 Long-press actions | done | The extra actions (Undo edit, Copy, Forward, Pin, Info, Copy link, Select) are listed below the design's four. |
| M11 Start a Spark | done | |
| M12 Topic match decision | done | Matches come from the backend (lexical). The SDK's on-phone match runs only where the SDK is on. |
| M13 Checkbox mentions | done | The search box and the summary/button stay fixed while the list scrolls, so the picker stays usable with 1,000 members. |
| M14 Quote reply with mentions | done | |
| M15 Own-message edit and rollback | done | |
| M16 In-chat search | done | Results match the text literally, as before; the backend has no fuzzy search. The date filter needs the backend branch. |
| M17 Media and voice share | done | The screenshot shows the sheet before media is picked (a browser can't be driven through the file picker). |
| M18 Create poll | done | |
| M19 Poll results and media | done | |
| M20 to M24 Create-group flow | done | |
| M25 Invite and pending approval | done | |
| M26 Roster and member detail | done | Ranks need the backend branch. |
| M27 Group settings | done | Extra rows that are not in the design (Manage Sparks, your expertise role, Sparks AI on this phone, Administrators, Invite link, Leave group) sit in two sections below the design's. "Pinned messages & media" still opens the chat instead of a pins list (the backend keeps one pin per chat). |
| M28 Promote admin | done | |
| M29 Join request moderation | done | |
| M30 Member moderation and slow mode | done | |
| M31 Manage Sparks | built to the current concept | Pin, delete and merge, each with a confirmation, for admins only. Awaiting Mark's requirements; no extra rules invented. Merge suggestions (SDK `suggestMerges`) are not shown: they only exist on a phone with the model, and the panel's requirements are pending. |
| M32 Role pings | built to the current concept | Shows the Sparks bot's automatic role pings (`rolePings` on the Spark, recorded by the backend when the module applies a ping). The "earlier context" half shows only its "requirements pending" note. The SDK's retrieval (`findRelated`) is marked provisional, so no context is invented. |

### Backend changes this needs (`wale-pages-backend`)

The test server runs `main`, so until this branch is deployed:

- ranks don't show;
- "N online" doesn't show;
- "Owner" / "Admin" doesn't show beside names in the chat;
- the date filter in search doesn't narrow results on the server (the app also filters on the client);
- the role-ping card never appears.

What the branch adds:

- `GET /api/ranks` and `rank` on every person in chat. The point levels are placeholders, waiting for Mark's ladder.
- `onlineCount` on `GET /api/chats/:id`.
- `from`, `to` and `sort` on chat search.
- `rolePings` on Spark JSON.
- `senderGroupRole` on messages.

### How the screenshots were made

- The web build was served locally and driven with Playwright and Chromium at 390 x 844, 2x.
- The backend was `wale-pages-backend` run locally the way its test runner does (in-memory Mongo and Redis, `SPARKS_ENGINE=module`), with design-like data seeded through its REST API.
- Three things a phone or the passage of time would normally produce were written straight into the local store:
  - the two running summaries (a phone's summary job);
  - the role pings (a phone's role-ping job, saved through the backend's own `addPing`);
  - 11 months of silence before the revived Spark. Today's messages then revived it for real, and the module drew the seam.
- The TEST backend could not be used for the full set because it rate-limited logins from this machine. A first pass against TEST (before any changes) is what the audit table above is based on.
