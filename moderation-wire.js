// Calls Part A (Emmanuel's moderation & stage): admin mute / remove, removed
// can't rejoin, speakers and listeners with raised hands.
// Needs the files from moderation.zip (after call-tools.zip).
// Run from the project folder:   node moderation-wire.js
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
if (!fs.existsSync("components/calls/useModeration.ts")) { report.push("NOT FOUND: components/calls/useModeration.ts - unzip moderation.zip first"); problems++; }

// ---------- voice chats: stage fields and permissions ----------
edit("services/voiceRooms.ts", "stage fields and permissions", (s) => {
  if (s.includes("canManageStage")) return s;
  s = rep(s, "  members: { user: VoicePerson; joinedAt?: string; away?: boolean }[];\n",
    `  members: {
    user: VoicePerson;
    joinedAt?: string;
    away?: boolean;
    // Stage (Emmanuel): speaker or listener, a listener's raised hand, muted by an admin.
    role?: "speaker" | "listener";
    handRaised?: boolean;
    mutedByAdmin?: boolean;
  }[];
  // Stage on: only speakers can talk.
  stage?: boolean;
  speakerCount?: number;
`);
  s = rep(s, "export type VoiceJoinInfo = {\n  voiceRoom: VoiceRoom;\n  token: string;\n  livekitUrl: string;\n};",
    "export type VoiceJoinInfo = {\n  voiceRoom: VoiceRoom;\n  token: string;\n  livekitUrl: string;\n  // What I may do here: mute / remove people, run the stage, end it.\n  canModerate?: boolean;\n  canManageStage?: boolean;\n  canEnd?: boolean;\n};");
  return rep(s, "  return { voiceRoom, token: response.token, livekitUrl: response.livekitUrl };",
    "  return {\n    voiceRoom,\n    token: response.token,\n    livekitUrl: response.livekitUrl,\n    canModerate: Boolean(response.canModerate),\n    canManageStage: Boolean(response.canManageStage),\n    canEnd: Boolean(response.canEnd),\n  };");
});

// ---------- the orbit screen ----------
edit("components/calls/OrbitCall.tsx", "moderation, stage and raised hands", (s) => {
  if (s.includes("useModeration(moderation")) return s;
  s = rep(s, 'import { CAN_SHARE_SCREEN, useCallTools } from "./useCallTools";',
    'import { CAN_SHARE_SCREEN, useCallTools } from "./useCallTools";\nimport { useModeration, type ModerationSource, type PersonAction } from "./useModeration";');
  // People marks.
  s = rep(s, "  away?: boolean;\n", "  away?: boolean;\n  // Stage: a listener (can't talk), a raised hand, muted by an admin.\n  listener?: boolean;\n  handRaised?: boolean;\n  mutedByAdmin?: boolean;\n");
  // ✋ on the circle.
  s = rep(s, `      ) : person.micOff ? (
        <View style={[styles.badge, styles.badgeMuted]}>`, `      ) : person.handRaised ? (
        <View style={[styles.badge, styles.badgePin]} accessibilityLabel="Hand raised">
          <Text style={{ fontSize: size >= 90 ? 13 : 10 }}>✋</Text>
        </View>
      ) : person.micOff ? (
        <View style={[styles.badge, styles.badgeMuted]}>`);
  // The source and the hook.
  s = rep(s, "export default function OrbitCallScreen({\n  title,\n  subtitle,\n  people,\n",
    "export default function OrbitCallScreen({\n  title,\n  subtitle,\n  people: rawPeople,\n");
  s = rep(s, "  extra,\n  room,\n}: {", "  extra,\n  room,\n  moderation,\n}: {");
  s = rep(s, "  room?: Room | null;\n}) {\n", `  room?: Room | null;
  // Admin mute / remove and the stage: what this call is (Emmanuel's moderation).
  moderation?: ModerationSource;
}) {
  const mod = useModeration(moderation, rawPeople);
  const people = mod.people;
`);
  // Mic: Raise hand for listeners; muted by an admin explains.
  s = rep(s, '        <ControlButton icon={micOn ? "mic-outline" : "mic-off-outline"} label="Mic" active={!micOn} onPress={onToggleMic} disabled={ended} />',
    `        {mod.listener ? (
          <ControlButton
            icon={mod.handRaised ? "hand-left" : "hand-left-outline"}
            label={mod.handRaised ? "Lower hand" : "Raise hand"}
            active={mod.handRaised}
            onPress={mod.toggleHand}
            disabled={ended}
          />
        ) : (
          <ControlButton
            icon={micOn ? "mic-outline" : "mic-off-outline"}
            label="Mic"
            active={!micOn}
            onPress={mod.micLock && !micOn ? () => Alert.alert("Microphone", mod.micLock!) : onToggleMic}
            disabled={ended}
          />
        )}`);
  // Everyone list: the stage switch, tap a person for their card.
  s = rep(s, "      <EveryoneSheet people={people} visible={everyoneOpen} onClose={() => setEveryoneOpen(false)} />",
    `      <EveryoneSheet
        people={people}
        visible={everyoneOpen}
        onClose={() => setEveryoneOpen(false)}
        stage={mod.stage}
        onSelect={(person) => {
          setEveryoneOpen(false);
          setCard({ id: person.id, step: "card" });
        }}
      />`);
  // The person's card: their actions.
  s = rep(s, '          onBack={() => setCard({ id: cardPerson.id, step: "card" })}\n',
    '          onBack={() => setCard({ id: cardPerson.id, step: "card" })}\n          actions={mod.actionsFor(cardPerson)}\n');
  s = rep(s, "  onBack,\n  onPrivateCall,\n}: {", "  onBack,\n  onPrivateCall,\n  actions,\n}: {");
  s = rep(s, "  onBack: () => void;\n  onPrivateCall: () => void;\n}) {", "  onBack: () => void;\n  onPrivateCall: () => void;\n  // Admins / the host: Mute, Remove, Make speaker...\n  actions?: PersonAction[];\n}) {");
  return rep(s, "            <Text style={styles.cardHint}>Tap again for progress</Text>",
    `            {actions?.length ? (
              <View style={[styles.cardButtons, { flexWrap: "wrap", marginTop: 10 }]}>
                {actions.map((action) => (
                  <Pressable
                    key={action.key}
                    style={[styles.cardButton, styles.cardButtonOutline]}
                    onPress={action.onPress}
                    accessibilityRole="button">
                    <Ionicons name={action.icon as any} size={16} color={ink.text(action.destructive ? "#C0394B" : PINK)} />
                    <Text style={[styles.cardButtonOutlineText, action.destructive ? { color: "#C0394B" } : null]}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.cardHint}>Tap again for progress</Text>`);
});

// ---------- each screen says what it is ----------
function addSource(file, roomExpr, sourceExpr) {
  edit(file, "moderation source", (s) => {
    if (s.includes("moderation={")) return s;
    const m = s.match(new RegExp(`\\n( +)room=\\{${roomExpr.replace(/[.()]/g, "\\$&")}\\}\\n`));
    if (!m) throw new Error("anchor: room=");
    return s.replace(m[0], () => `${m[0]}${m[1]}moderation={${sourceExpr}}\n`);
  });
}
const voiceSource = '{ kind: "voice", room: session.voiceRoom, canModerate: !!session.canModerate, canManageStage: !!session.canManageStage, onRemoved: endVoiceSession }';
addSource("components/voice/VoiceRoomSession.tsx", "liveRoom", voiceSource);
addSource("components/voice/VoiceRoomSession.web.tsx", "roomRef.current", voiceSource);
addSource("components/calls/CallSession.tsx", "room", '{ kind: "call", call, onRemoved: () => onFinish(null, false) }');
addSource("components/calls/CallSession.web.tsx", "roomRef.current", 'active?.call ? { kind: "call", call: active.call, onRemoved: () => finish(null, false) } : undefined');

console.log(report.join("\n"));
console.log(problems ? `\n${problems} step(s) need a look - paste this output to Claude.` : "\nAll done. Now run: npx tsc --noEmit");
