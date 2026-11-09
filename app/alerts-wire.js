// Calls Part B: "Faction in danger". Needs the files from alerts.zip
// (after moderation.zip). Run from the project folder:   node alerts-wire.js
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
if (!fs.existsSync("components/alerts/FactionAlertLayer.tsx")) { report.push("NOT FOUND: components/alerts/FactionAlertLayer.tsx - unzip alerts.zip first"); problems++; }

// Respond from a call: like accepting it.
edit("store/slices/callSlice.ts", "Respond opens the call", (s) => {
  if (s.includes("joinedFromAlert")) return s;
  s = rep(s, "    clearActiveCall(state) {", `    // "Respond" to a faction alert from a call: like accepting it.
    joinedFromAlert(state, action: PayloadAction<any>) {
      state.active = { ...action.payload, direction: "incoming" };
      state.incoming = null;
    },

    clearActiveCall(state) {`);
  return rep(s, "  setCallUserId,\n  clearActiveCall,\n", "  setCallUserId,\n  joinedFromAlert,\n  clearActiveCall,\n");
});

// The flare, and where an alert can be sent from.
edit("components/calls/useModeration.ts", "the flare and the alert target", (s) => {
  if (s.includes("flareId")) return s;
  s = rep(s, "  const stageOn = Boolean((room as any)?.stage);\n", `  const stageOn = Boolean((room as any)?.stage);
  // Faction in danger: the flare on the sender's circle until it expires.
  const alertInfo: any = (room as any)?.alert || (call as any)?.alert || null;
  const flareId = alertInfo && new Date(alertInfo.expiresAt).getTime() > Date.now() ? String(alertInfo.userId) : null;
`);
  s = rep(s, `        const member = members.get(person.id);
        if (!member) return person;
        return {
          ...person,`, `        const member = members.get(person.id);
        const flare = person.id === flareId;
        if (!member) return flare ? { ...person, flare } : person;
        return {
          ...person,
          flare,`);
  s = rep(s, "    [rawPeople, members, stageOn],\n", "    [rawPeople, members, stageOn, flareId],\n");
  return rep(s, "  return { people, actionsFor, listener, handRaised, toggleHand, micLock, stage };",
    `  // Where a danger alert is sent from (this call or voice chat).
  const alertTarget = source && sourceId ? { kind: source.kind === "voice" ? ("voice" as const) : ("call" as const), id: sourceId } : null;

  return { people, actionsFor, listener, handRaised, toggleHand, micLock, stage, alertTarget };`);
});

edit("components/calls/OrbitCall.tsx", "danger alert button and the flare", (s) => {
  if (s.includes("SendAlertSheet")) return s;
  s = rep(s, 'import { useModeration, type ModerationSource, type PersonAction } from "./useModeration";',
    'import { useModeration, type ModerationSource, type PersonAction } from "./useModeration";\nimport SendAlertSheet from "@/components/alerts/SendAlertSheet";');
  s = rep(s, "  mutedByAdmin?: boolean;\n", "  mutedByAdmin?: boolean;\n  // Faction in danger: the flare on the sender.\n  flare?: boolean;\n");
  s = rep(s, "      {pinned ? (\n        <View style={[styles.badge, styles.badgePin]}>", `      {person.flare ? (
        <View style={[styles.badge, { backgroundColor: "#E5484D" }]} accessibilityLabel="Faction in danger">
          <Ionicons name="flame" size={size >= 90 ? 14 : 10} color="#FFFFFF" />
        </View>
      ) : pinned ? (
        <View style={[styles.badge, styles.badgePin]}>`);
  s = rep(s, "  const people = mod.people;\n", "  const people = mod.people;\n  const [alertOpen, setAlertOpen] = useState(false);\n");
  s = rep(s, "        {tools.canRouteAudio ? (", `        {mod.alertTarget ? (
          <Pressable
            style={[styles.roundBtn, { backgroundColor: "rgba(229,72,77,0.14)" }]}
            onPress={() => setAlertOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Faction in danger: alert my faction">
            <Ionicons name="warning-outline" size={20} color="#E5484D" />
          </Pressable>
        ) : null}
        {tools.canRouteAudio ? (`);
  return rep(s, "      {cardPerson && card ? (\n", "      <SendAlertSheet target={mod.alertTarget} visible={alertOpen} onClose={() => setAlertOpen(false)} />\n\n      {cardPerson && card ? (\n");
});

// Live alerts, the layer, push taps, the Android channel.
edit("hooks/useSocketConnection.ts", "faction alerts from the socket", (s) => {
  if (s.includes("showFactionAlert")) return s;
  s = 'import { showFactionAlert } from "@/components/alerts/alertStore";\n' + s;
  s = rep(s, '    socket.on("banner", pushBanner);\n', '    socket.on("banner", pushBanner);\n    socket.on("alert:faction", showFactionAlert);\n');
  return rep(s, '      socket.off("banner", pushBanner);\n', '      socket.off("banner", pushBanner);\n      socket.off("alert:faction", showFactionAlert);\n');
});
edit("app/_layout.tsx", "mount the faction alert", (s) => {
  if (s.includes("<FactionAlertLayer />")) return s;
  s = rep(s, 'import InAppBanner from "@/components/notifications/InAppBanner";',
    'import InAppBanner from "@/components/notifications/InAppBanner";\nimport FactionAlertLayer from "@/components/alerts/FactionAlertLayer";');
  return rep(s, "            <InAppBanner />\n", "            <InAppBanner />\n\n            {/* Faction in danger */}\n            <FactionAlertLayer />\n");
});
edit("utils/openFromNotification.ts", "a faction alert push opens the alert", (s) => {
  if (s.includes("faction_alert")) return s;
  s = rep(s, 'import { router } from "expo-router";', 'import { router } from "expo-router";\n\nimport { showFactionAlertById } from "@/components/alerts/alertStore";');
  return rep(s, '  if (type === "call") return;\n', `  if (type === "call") return;

  // Faction in danger: the alert, with Respond.
  if (type === "faction_alert" && data.alertId) {
    showFactionAlertById(String(data.alertId));
    return;
  }
`);
});
edit("components/PushTapHandler.tsx", "the Android alerts channel", (s) => {
  if (s.includes("ensureAlertChannel")) return s;
  s = rep(s, 'import { openFromNotification } from "@/utils/openFromNotification";',
    'import { openFromNotification } from "@/utils/openFromNotification";\nimport { ensureAlertChannel } from "@/components/alerts/alertSound";');
  return rep(s, "// Show pushes while the app is open (once, at startup).", "// Faction alerts: their own high-importance channel on Android.\nensureAlertChannel();\n\n// Show pushes while the app is open (once, at startup).");
});

console.log(report.join("\n"));
console.log(problems ? `\n${problems} step(s) need a look - paste this output to Claude.` : "\nAll done. Now run: npx tsc --noEmit");
