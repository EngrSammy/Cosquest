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

Filled in at the end of the work. See the section below.
