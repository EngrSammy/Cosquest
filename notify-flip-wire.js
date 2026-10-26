// Emmanuel's posts/follows/notifications update + in-app banners, and Flip
// camera in voice chats and scheduled calls. Needs the files from
// notify-flip.zip. Run from the project folder:   node notify-flip-wire.js
const fs = require("fs");
const report = [];
let problems = 0;
function edit(file, label, fn) {
  if (!fs.existsSync(file)) { report.push(`NOT FOUND: ${file}`); problems++; return; }
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  let out;
  try { out = fn(s); } catch (e) { report.push(`NOT FOUND: ${file} - ${label} (${e.message})`); problems++; return; }
  if (out === s) { report.push(`already done: ${file} - ${label}`); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  report.push(`done: ${file} - ${label}`);
}
function rep(s, find, replace) {
  if (!s.includes(find)) throw new Error("anchor: " + find.slice(0, 60).replace(/\n/g, "\\n"));
  return s.replace(find, () => replace);
}
for (const f of ["utils/openFromNotification.ts", "components/notifications/InAppBanner.tsx", "components/calls/flipCamera.ts"]) {
  if (!fs.existsSync(f)) { report.push(`NOT FOUND: ${f} - unzip notify-flip.zip first`); problems++; }
}

// ---------- banners: socket + layer ----------
edit("hooks/useSocketConnection.ts", "in-app banners from the socket", (s) => {
  if (s.includes("pushBanner")) return s;
  s = 'import { pushBanner } from "@/components/notifications/bannerStore";\n' + s;
  s = rep(s, '    socket.on("notification:new", handleNotification);\n',
    '    socket.on("notification:new", handleNotification);\n    // Pop-up banner while the app is open (instead of a push).\n    socket.on("banner", pushBanner);\n');
  return rep(s, '      socket.off("notification:new", handleNotification);\n',
    '      socket.off("notification:new", handleNotification);\n      socket.off("banner", pushBanner);\n');
});
edit("app/_layout.tsx", "mount the in-app banner", (s) => {
  if (s.includes("<InAppBanner />")) return s;
  s = rep(s, 'import PushTapHandler from "@/components/PushTapHandler";',
    'import PushTapHandler from "@/components/PushTapHandler";\nimport InAppBanner from "@/components/notifications/InAppBanner";');
  return rep(s, "            <PushTapHandler />\n", "            <PushTapHandler />\n\n            {/* Pop-up banners while the app is open */}\n            <InAppBanner />\n");
});

// ---------- notifications: posts ----------
edit("services/notifications.ts", "notifications carry their post", (s) => {
  if (s.includes("postId?: string | null;")) return s;
  s = rep(s, "  scheduledCallId?: string | null;\n};", "  scheduledCallId?: string | null;\n  // like / comment / repost / post: the post (and comment) to open.\n  postId?: string | null;\n  commentId?: string | null;\n};");
  return rep(s, "    scheduledCallId: item?.scheduledCallId ?? null,\n", "    scheduledCallId: item?.scheduledCallId ?? null,\n    postId: item?.postId ?? null,\n    commentId: item?.commentId ?? null,\n");
});
edit("app/notifications.tsx", "tap a post notification: open the post", (s) => {
  if (s.includes("item.postId")) return s;
  return rep(s, "            onOpen={\n              item.scheduledCallId\n",
    `            onOpen={
              item.postId
                ? () =>
                    router.push({
                      pathname: "/post/[id]",
                      params: { id: item.postId!, ...(item.commentId ? { commentId: item.commentId } : {}) },
                    } as any)
                : item.scheduledCallId
`);
});
edit("components/desktop/DesktopNotifications.tsx", "Activity (likes, comments, reposts, posts) on computers", (s) => {
  if (s.includes('activity: { label: "Activity"')) return s;
  s = rep(s, 'type Kind = "follow" | "mention" | "group" | "cosquest";', 'type Kind = "follow" | "activity" | "mention" | "group" | "cosquest";');
  s = rep(s, '  follow: { label: "Follows", icon: "person-add", color: PINK },\n',
    '  follow: { label: "Follows", icon: "person-add", color: PINK },\n  // Likes, comments, reposts, and posts from people you follow.\n  activity: { label: "Activity", icon: "heart", color: PINK },\n');
  s = rep(s, '  if (item.type === "follow") return "follow";\n',
    '  if (item.type === "follow") return "follow";\n  if (["like", "comment", "repost", "post"].includes(item.type || "")) return "activity";\n');
  s = rep(s, '  const tabs: Filter[] = ["all", "follow", "mention", "group", "cosquest"];', '  const tabs: Filter[] = ["all", "follow", "activity", "mention", "group", "cosquest"];');
  s = rep(s, "{ follow: 0, mention: 0, group: 0, cosquest: 0 }", "{ follow: 0, activity: 0, mention: 0, group: 0, cosquest: 0 }");
  return rep(s, "                      const openChat = item.scheduledCallId\n",
    `                      const openChat = item.postId
                        ? () =>
                            router.push({
                              pathname: "/post/[id]",
                              params: { id: item.postId!, ...(item.commentId ? { commentId: item.commentId } : {}) },
                            } as any)
                        : item.scheduledCallId
`);
});

// ---------- posts: filled hearts and bookmarks (post.viewer) ----------
edit("store/slices/postSlice.ts", "filled hearts and bookmarks from post.viewer", (s) => {
  if (s.includes("raw.viewer?.liked")) return s;
  s = rep(s, `  const liked =
    typeof raw.liked === "boolean"`, `  // The server's "viewer" (Emmanuel): this person's own like / bookmark.
  const liked =
    typeof raw.viewer?.liked === "boolean"
      ? raw.viewer.liked
      : typeof raw.liked === "boolean"`);
  return rep(s, `  const bookmarked =
    typeof raw.bookmarked === "boolean"`, `  const bookmarked =
    typeof raw.viewer?.bookmarked === "boolean"
      ? raw.viewer.bookmarked
      : typeof raw.bookmarked === "boolean"`);
});

// ---------- profile: Follow / Following from the server ----------
edit("app/user/[username].tsx", "Follow / Following from profile.relationship", (s) => {
  if (s.includes("relationship?.following")) return s;
  return rep(s, `  const iFollow =
    followingOverride ??
    following.some(`, `  const iFollow =
    followingOverride ??
    // The server says (profile.relationship), else the people I follow.
    ((profile as any)?.relationship?.following as boolean | undefined) ??
    following.some(`);
});

// ---------- Flip camera: voice chats and scheduled calls ----------
const IMPORT = 'import { flipCamera, type Facing } from "@/components/calls/flipCamera";\n';
function addFlip(file, { participant, mirrorFind, mirrorReplace, extra }) {
  edit(file, "Flip camera", (s) => {
    if (s.includes("onFlipCamera=")) return s;
    s = IMPORT + s;
    s = rep(s, "  const [focusOn, setFocusOn] = useState(false);\n",
      '  const [focusOn, setFocusOn] = useState(false);\n  // Front or back camera (Flip).\n  const [facing, setFacing] = useState<Facing>("user");\n');
    const m = s.match(/\n( +)onToggleCamera=\{toggleCamera\}\n/);
    if (!m) throw new Error("anchor: onToggleCamera");
    s = s.replace(m[0], () => `${m[0]}${m[1]}onFlipCamera={async () => {\n${m[1]}  const next = await flipCamera(${participant}, facing);\n${m[1]}  if (next) setFacing(next);\n${m[1]}}}\n`);
    s = rep(s, mirrorFind, mirrorReplace);
    if (extra) s = rep(s, extra[0], extra[1]);
    return s;
  });
}
addFlip("components/voice/VoiceRoomSession.tsx", {
  participant: "localParticipant as any",
  mirrorFind: "          mirror={slot.participant.isLocal}\n",
  mirrorReplace: '          mirror={slot.participant.isLocal && facing === "user"}\n',
  extra: ["    [cameraSlots, meId],\n  );\n  const toggleFocus", "    [cameraSlots, meId, facing],\n  );\n  const toggleFocus"],
});
addFlip("components/voice/VoiceRoomSession.web.tsx", {
  participant: "roomRef.current?.localParticipant",
  mirrorFind: "<WebVideo track={localVideo} mirror />",
  mirrorReplace: '<WebVideo track={localVideo} mirror={facing === "user"} />',
});
addFlip("components/calls/scheduled/ScheduledCallSession.tsx", {
  participant: "localParticipant as any",
  mirrorFind: "mirror={slot.participant.isLocal} />",
  mirrorReplace: 'mirror={slot.participant.isLocal && facing === "user"} />',
});
addFlip("components/calls/scheduled/ScheduledCallSession.web.tsx", {
  participant: "roomRef.current?.localParticipant",
  mirrorFind: "<WebVideo track={localVideo} mirror />",
  mirrorReplace: '<WebVideo track={localVideo} mirror={facing === "user"} />',
});

console.log(report.join("\n"));
console.log(problems ? `\n${problems} step(s) need a look - paste this output to Claude.` : "\nAll done. Now run: npx tsc --noEmit");
