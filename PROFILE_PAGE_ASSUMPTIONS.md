# CosQuest Profile Page — Product Assumptions

> Current signup, comments/replies, chat links/files, Spotlight, and Settings contract: [COMMUNITY_SETTINGS_API.md](COMMUNITY_SETTINGS_API.md). That guide supersedes older examples and deferred-feature notes below for these features.

This note records the agreed assumptions for the Profile page. It is kept outside `cosquest-backend` so it is product documentation, not application code.

## What the profile represents

- Profiles are public **by default**, but the owner can change that via `PATCH /api/users/me/privacy`: `public` (anyone, no login needed), `friends` (mutual follows only - there's no separate friend-request system, just one-way Follow), or `private` (owner only). This gates the profile itself plus its followers/following list, quest history, and share link/page. A separate, stricter `showActivityFeed` toggle can hide just the posts list from non-friends even on an otherwise-public profile.
- Blocking exists (`POST`/`DELETE /api/users/:username/block`, `GET /api/users/me/blocked`) and overrides every visibility level unconditionally in both directions - a blocked relationship hides the profile, and blocks new follows and DMs between the two accounts.
- The profile owner can edit their own display details: name, username, bio, profile category, avatar/photo, and public contact details.
- The account-login email is private and is never changed by the public contact-email field.
- Contact Options (`GET`/`PATCH /api/users/me/contact`) works during onboarding, before login exists - but since it holds real PII (phone, address), knowing someone's signup email alone isn't enough: the pre-login path also requires the account's real password (already set at signup), unlike the other onboarding-step fields (profile/avatar/faction/interests/preferences), which accept a bare identifier. `PATCH` takes `{ identifier, password, ... }` in its JSON body; `GET` has no body, so it uses standard HTTP Basic Auth (`Authorization: Basic base64(identifier:password)`) instead, keeping the password out of the URL where it would otherwise leak into logs/browser history.
- The selected preset avatar and an uploaded profile photo **coexist** - the actual profile UI shows the uploaded photo as the main picture with the preset avatar as a small badge over it. Setting either one never clears the other. (This reverses an earlier, incorrect assumption that they were mutually exclusive.)
- "Share Profile" links to a real, public web page (`GET /u/:username`, outside `/api`) with Open Graph/Twitter Card tags, so pasting the link into Instagram, Facebook, WhatsApp, etc. shows a rich preview card (name, bio, avatar/photo) instead of a bare link. `GET /api/users/:username/share` gives the frontend a ready-made `{ url, title, text }` payload to hand to the device's native share sheet, rather than the frontend constructing the link itself.

## Header and profile information

| Screen item | Current backend meaning |
| --- | --- |
| Display name | `firstName` + `lastName`, saved on the profile. |
| Username | Unique, case-insensitive, 3–20 characters using letters, numbers, or underscores. |
| Bio / About | Public text, editable by the owner, maximum 500 characters. |
| Category | Optional public profile category, such as Digital creator. The owner can hide the category without deleting it. |
| Contact options | Optional public contact email, international-format phone, and business address. All supplied contact values are public; there are no individual contact visibility toggles yet. |
| Faction badge | One required faction: Ascendants, Icons, Controllers, Blockbusters, Everborn, or Celestials (`none` is not an option). `GET /api/factions` includes a static `description`/`perks` per faction plus live `memberCount` and `activeQuestCount`; `GET /api/factions/:key/members` gives a small preview list of that faction's onboarded members (e.g. an avatar row). A quest's optional `faction` tag (set only when a quest is created, no creation API exists yet) is a display/counting label only - it never restricts who can register for it. |
| Faction rank/title (e.g. "Lieutenant") and User XP progress bar | **Not implemented.** No rank/tier or XP field exists on the user yet - this is the same deferred leveling system flagged under Points below; it needs an explicit answer on what earns XP and what the rank thresholds/names are before it can be built. |

## Counts and points

| Displayed count | Source and meaning |
| --- | --- |
| Followers | Number of other accounts following this profile. |
| Following | Number of accounts this profile follows. |
| Posts | Number of posts made by this user. |
| Quests | Number of quests the user registered for, including a registration later cancelled. |
| Wins | Number of the user’s quest registrations whose quest system status is `winner`. The quest system decides winners; the profile does not decide them. |
| Points | The user’s in-app `pointsBalance`. It starts at `0` and is currently read-only through the profile API. A later rewards/quest-points system should change the balance through a controlled ledger/service, not directly from the frontend. |
| "Coins" / "gems" (dual currency shown on the home dashboard header) | **Not implemented.** No such fields exist on the user - only the single `pointsBalance` above. Open question: are these meant to be `pointsBalance` under different names, or genuinely separate currencies with their own earn/spend rules? |

## Posts: images, reels, and thoughts

- **Image post:** at least 1 and at most 8 uploaded images. Each image must be JPEG, PNG, WEBP, or GIF and no larger than 10 MB. A caption is optional and limited to 2,200 characters.
- **Reel:** exactly one uploaded MP4, MOV, or WEBM video. It must be 30 seconds or less. Its caption is optional and limited to 2,200 characters.
- **Thought:** text only, no uploaded media. It must contain 1–300 characters.
- Post media uploads are stored in Cloudinary. The database stores each returned Cloudinary URL and public ID, enabling the frontend to fetch the media and the backend to delete it when its post is deleted.
- Posts, comments, and like counts are visible publicly. The post owner may edit its caption/text and delete their own post. A comment author may delete only their own comment.
- The current public feed is chronological with paging. There is no ranking, private post audience, post saving, reposting, sharing counter, reporting, or moderation queue yet.

## Likes, comments, and follows

- A completed, logged-in user can like a post once and can unlike it later. The public `likeCount` changes with those actions.
- A completed, logged-in user can add a public comment of 1–500 characters.
- A completed, logged-in user can follow or unfollow another profile, but cannot follow themself.
- A successful follow creates a notification for the followed user. The notification page can display it and mark notifications read.
- Blocking is implemented (see above). Reporting, content review, and administrative moderation tools are still intentionally deferred - before launch, add reporting, rate limits suitable for social interactions, content review, and administrative tools.
- A comment can be replied to once - `parentComment` on `PostComment` supports exactly one level of nesting (a reply cannot itself be replied to). Deleting a top-level comment cascades to its replies. The emoji "reactions" shown under comments in the UI are frontend-only (they insert a quick-reply string into the comment box) - there is no reaction storage or endpoint for posts.
- Followers/following lists support `?search=` (case-insensitive, matches username/first/last name) via a `Follow` + `User` aggregation, since a plain populate can't filter on the populated side.

## Location and notifications

- Enabling location, with real device coordinates, is a **required** onboarding step (CosQuest is played in the real world) - onboarding cannot complete without it, the same enforcement level as faction/interests/avatar. Users choose a discovery radius between 5 and 100 miles (default 50) and can change both the coordinates and the radius afterward via `PATCH /api/users/me/preferences/location`. Server environment settings (`DASHBOARD_DEFAULT_LAT`, `DASHBOARD_DEFAULT_LNG`, and radius) are now only a fallback, for an account that somehow reaches the dashboard before this existed.
- Users choose whether notifications are enabled during onboarding and can later change that notification preference. Device push tokens can be registered after login.
- Two granular preferences also exist as storage-only toggles for now: `eventReminders` (a push notification category) and `emailWeeklyNewsletter`. Neither actually triggers anything yet - there's no scheduled job producing event reminders, and no email-sending infrastructure in this backend at all (the current notification system is 100% in-app). Both are the first step for a settings screen with per-category toggles; the sending mechanisms are separate future work.

## Items intentionally not implemented yet

1. A points ledger, point-award endpoint, deductions, transactions, and reward history.
2. Quest winner-selection logic and admin controls. The profile only reads the `winner` registration status.
3. Social moderation: reports, content review, hidden/deleted-by-moderator states, and admin actions. (Blocking is implemented - see "What the profile represents" above.)
4. Individual contact-field visibility toggles. (Overall profile visibility levels, activity-feed visibility, and followers/following search are implemented - see above.)
5. Post sharing, bookmarks, pinning, drafts, notifications for likes/comments, and video thumbnails/transcoding rules beyond Cloudinary’s stored media data.

