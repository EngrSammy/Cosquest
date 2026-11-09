#!/usr/bin/env node
// Task 059: list (or count) the chat and community buttons without an
// accessibilityLabel: Pressable / TouchableOpacity / TouchableHighlight
// opening tags. `--fix` adds a label (and role) from the button's own words:
// its visible text, or a name for its icon. Run with --check in CI.
//   node scripts/a11y-buttons.js [--fix] [--check]
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SCOPE = ["app/chat", "app/group", "app/(tabs)/community.tsx", "app/notifications.tsx", "app/post", "app/user", "components/chat", "components/community", "components/groups", "components/calls", "components/voice"];
const ICON_WORDS = {
  "arrow-back": "Back", "chevron-back": "Back", close: "Close", "close-circle": "Clear", send: "Send", "send-outline": "Send",
  "ellipsis-horizontal": "More options", "ellipsis-vertical": "More options", "search-outline": "Search", search: "Search",
  "add": "Add", "add-circle": "Add", "add-circle-outline": "Add", "camera-outline": "Camera", camera: "Camera", "image-outline": "Photo",
  "mic-outline": "Record a voice note", mic: "Record a voice note", "call-outline": "Voice call", call: "Voice call", "videocam-outline": "Video call",
  videocam: "Video call", "happy-outline": "Emoji", "attach-outline": "Attach", attach: "Attach", "heart-outline": "Like", heart: "Unlike",
  "chatbubble-outline": "Comment", "share-outline": "Share", "share-social-outline": "Share", "bookmark-outline": "Save", bookmark: "Saved",
  "trash-outline": "Delete", trash: "Delete", "create-outline": "Edit", "pencil-outline": "Edit", "play-circle": "Play", play: "Play", pause: "Pause",
  "checkmark": "Done", "checkmark-circle": "Selected", "copy-outline": "Copy", "arrow-down": "Jump to latest", "chevron-down": "Jump to latest",
  "information-circle-outline": "Info", "settings-outline": "Settings", "notifications-outline": "Notifications", "people-outline": "People",
  "sparkles": "Sparks", "flag-outline": "Report", "ban-outline": "Block", "stop": "Stop", "refresh": "Try again", "download-outline": "Save to phone",
  "expand-outline": "Full screen", "volume-high": "Sound on", "volume-mute": "Sound off", "pin": "Pinned", "pin-outline": "Pin", "chevron-forward": "Open",
  "arrow-up": "Send", "arrow-redo-outline": "Forward", "arrow-undo-outline": "Reply", "location-outline": "Location", "bar-chart-outline": "Poll",
  "document-outline": "File", "musical-notes-outline": "Audio", "lock-closed-outline": "Private", "link-outline": "Copy link",
};
const fix = process.argv.includes("--fix");
const files = [];
const walk = (p) => {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) return;
  if (fs.statSync(full).isDirectory()) for (const n of fs.readdirSync(full)) walk(path.join(p, n));
  else if (/\.tsx$/.test(p) && !/\.web\.tsx$/.test(p)) files.push(p);
};
SCOPE.forEach(walk);
const open = /<(Pressable|TouchableOpacity|TouchableHighlight)\b/g;
let missing = 0;
let fixed = 0;
const left = [];
for (const rel of files) {
  const file = path.join(ROOT, rel);
  let src = fs.readFileSync(file, "utf8");
  const edits = [];
  let m;
  while ((m = open.exec(src))) {
    // the opening tag runs to the first ">" not inside {...}
    let i = m.index + m[0].length, depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0 && src[i - 1] !== "=") break;
    }
    const tag = src.slice(m.index, i + 1);
    if (/accessibilityLabel=|accessible=\{false\}|aria-label=/.test(tag) || tag.endsWith("/>")) {
      if (!/accessibilityLabel=/.test(tag) && tag.endsWith("/>") && !/accessible=\{false\}/.test(tag) && /onPress/.test(tag) && !/style=\{styles\.(backdrop|scrim|overlay)/.test(tag)) { /* self-closing scrims etc. */ }
      continue;
    }
    if (!/onPress|onLongPress/.test(tag)) continue;
    missing++;
    // the element's body, to the matching close
    const close = src.indexOf(`</${m[1]}>`, i);
    const body = close > 0 ? src.slice(i + 1, close) : "";
    let label = null;
    const words = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").match(/>\s*([A-Za-z][^<>{}]{1,40}?)\s*</);
    const icon = body.match(/name=["']([a-z0-9-]+)["']/);
    if (body.length > 700) label = null;
    else if (words && !body.includes("<TextInput")) label = JSON.stringify(words[1].trim());
    else if (icon && ICON_WORDS[icon[1]]) label = JSON.stringify(ICON_WORDS[icon[1]]);
    if (!label) {
      left.push(`${rel}:${src.slice(0, m.index).split("\n").length}`);
      continue;
    }
    const role = /accessibilityRole=/.test(tag) ? "" : ' accessibilityRole="button"';
    edits.push([m.index + m[0].length, `${role} accessibilityLabel=${label.replace(/^"|"$/g, (q) => q)}`]);
  }
  if (fix && edits.length) {
    for (const [at, text] of edits.reverse()) src = src.slice(0, at) + text + src.slice(at);
    fs.writeFileSync(file, src);
    fixed += edits.length;
  }
}
console.log(`${missing} buttons without a label in ${files.length} files${fix ? `, ${fixed} labelled` : ""}, ${left.length} need a hand-written label`);
if (left.length) console.log(left.join("\n"));
if (process.argv.includes("--check") && missing - fixed > 0) process.exit(1);
