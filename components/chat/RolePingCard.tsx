// ==========================================
// ROLE PING CARD (Figma M32 · Planned role pings & retrieval · CONCEPT)
// ==========================================
// Built to the current concept, awaiting Mark Jones's requirements.
// Shown in the chat after the message that led the Sparks bot to notify
// people by their expertise role ("Front-end", "Back-end"). The pings come
// from the Sparks SDK's role-ping jobs, applied by the backend's Sparks
// module; this card only shows what already happened. No extra rules.
//
// The "earlier message retrieval" half of M32 has no approved behaviour
// yet (the SDK's findRelated is marked PROVISIONAL), so only its
// "requirements pending" note is shown, never made-up context.
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { RankLine } from "@/components/chat/RankBadge";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { listSparkMembers, type SparkMember, type SparkRolePing } from "@/services/sparks";

const PINK = "#B63D91";
const TEAL = "#2A8A92";
const INK = "#24283C";
const MUTED = "#66738A";
const TINTS = ["#E9E1F5", "#DCE8EF", "#F3DDED", "#E2F0E8", "#F5E6D8"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2)).toUpperCase();
}

function tint(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

// "Front-end and Back-end", "A, B and C"
function joinRoles(roles: string[]) {
  if (roles.length <= 1) return roles[0] || "";
  return `${roles.slice(0, -1).join(", ")} and ${roles[roles.length - 1]}`;
}

function RolePingCard({
  conversationId,
  token,
  pings,
  onOpenMember,
}: {
  conversationId: string;
  token: string;
  pings: SparkRolePing[];
  onOpenMember?: (userId: string) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const [members, setMembers] = useState<SparkMember[]>([]);

  useEffect(() => {
    let cancelled = false;
    listSparkMembers(conversationId, token).then((list) => {
      if (!cancelled) setMembers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, token]);

  const byId = new Map(members.map((member) => [member.userId, member]));
  // One row per person, under the first role they were pinged for.
  const rows: { userId: string; role: string }[] = [];
  const seen = new Set<string>();
  for (const ping of pings) {
    for (const userId of ping.userIds) {
      if (!seen.has(userId)) {
        seen.add(userId);
        rows.push({ userId, role: ping.role });
      }
    }
  }
  const roles = [...new Set(pings.map((ping) => ping.role))];

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>Concept · automatic role ping</Text>
        </View>

        <View style={styles.botRow}>
          <Ionicons name="sparkles-outline" size={20} color={PINK} />
          <Text style={styles.bot}>Sparks bot</Text>
        </View>

        <Text style={styles.lead}>Relevant expertise: {joinRoles(roles)}.</Text>

        {rows.map(({ userId, role }) => {
          const member = byId.get(userId);
          const name = member?.displayName || "Member";
          return (
            <View key={userId}>
              <Pressable
                style={styles.person}
                onPress={onOpenMember ? () => onOpenMember(userId) : undefined}
                accessibilityRole={onOpenMember ? "button" : undefined}>
                <View style={[styles.avatar, { backgroundColor: ink.surface(tint(name)) }]}>
                  <Text style={styles.avatarText}>{initials(name)}</Text>
                </View>
                <View style={styles.personText}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    {member?.isAdmin ? <Text style={styles.admin}>Admin</Text> : null}
                  </View>
                  <RankLine rank={member?.rank} />
                  {member?.roles?.length ? (
                    <Text style={styles.expertise} numberOfLines={1}>
                      {member.roles.join(", ")}
                    </Text>
                  ) : null}
                </View>
                {onOpenMember ? <Ionicons name="chevron-forward" size={18} color={ink.text(MUTED)} /> : null}
              </Pressable>
              <Text style={styles.notified}>{role} · automatic role notification</Text>
            </View>
          );
        })}

        <Text style={styles.note}>Based on expertise roles, not faction ranks or manual @ mentions.</Text>
      </View>

      <View style={styles.pending}>
        <Text style={styles.pendingTitle}>Concept — requirements pending</Text>
        <Text style={styles.pendingText}>Earlier-message retrieval · Mark Jones to specify the requirements.</Text>
      </View>
    </View>
  );
}

export default memo(RolePingCard);

const STYLE_PAIR = themedStyles({
  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: INK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#F7D2EA",
  },
  chipText: { fontFamily: FONTS.medium, fontSize: 11, color: PINK },
  botRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  bot: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },
  lead: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: INK },
  person: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#7D356D" },
  personText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 14, color: INK },
  admin: { fontFamily: FONTS.medium, fontSize: 12, color: PINK },
  expertise: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },
  notified: {
    marginTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(36,40,60,0.08)",
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: TEAL,
  },
  note: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 11.5, lineHeight: 16, color: MUTED },
  pending: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFF1D6",
  },
  pendingTitle: { fontFamily: FONTS.semibold, fontSize: 13, color: "#7A5A12" },
  pendingText: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: "#7A5A12" },
});
