// The dashboard pages that arrive in later phases (Moderation, Members,
// Groups, Feeds, Chats, Sparks, Roles & permissions, Settings, Audit log).
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { ALL_ITEMS } from "@/components/admin/AdminShell";
import { useAdminTheme } from "@/components/admin/theme";
import { Card, PageHeader } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";

const PHASE: Record<string, { phase: number; text: string }> = {
  moderation: { phase: 2, text: "Review reports with their evidence, assign them, and remove, dismiss, mute or ban with a reason." },
  feeds: { phase: 2, text: "Every community post with its reports, removal with a notice to the author." },
  chats: { phase: 2, text: "Group conversations in context, deleting messages and slow mode." },
  members: { phase: 3, text: "The member directory, safety history, mutes, removals and bans, membership requests." },
  groups: { phase: 3, text: "Every group with its health, settings, join requests and owners." },
  sparks: { phase: 4, text: "Every Spark across the community, with its state and conversation history." },
  roles: { phase: 5, text: "The permission matrix, super admins, invitations and access reviews." },
  settings: { phase: 5, text: "Community identity, guidelines, privacy and joining, notifications and moderation defaults." },
  audit: { phase: 5, text: "Every admin action, with who, what, why and what changed. Already being recorded." },
};

export default function AdminSection() {
  const t = useAdminTheme();
  const { section } = useLocalSearchParams<{ section: string }>();
  const key = Array.isArray(section) ? section[0] : section;
  const item = ALL_ITEMS.find((entry) => entry.key === key);
  const info = PHASE[key || ""];

  return (
    <View>
      <PageHeader title={item?.label || "Not found"} subtitle={info ? info.text : "This page doesn't exist."} />
      <Card>
        <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 15, color: t.text }}>{info ? `Coming in phase ${info.phase}` : "Page not found"}</Text>
          <Text style={{ maxWidth: 460, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: t.muted }}>
            {info ? "This page is being built. The Overview already shows what's happening in the community." : "Pick a page from the menu."}
          </Text>
        </View>
      </Card>
    </View>
  );
}
