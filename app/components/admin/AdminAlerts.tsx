// The top bar's bell: new high-priority reports, reports assigned to you,
// join requests waiting, pending admin invitations. A red dot shows what's
// new since you last opened it (remembered in this browser). Refreshes
// every minute.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import { type AlertItem, getAlerts } from "@/services/adminExtras";

import { useAdminTheme } from "./theme";
import { timeAgo } from "./ui";

const SEEN_KEY = "cq_admin_alerts_seen";
const ICONS: Record<AlertItem["kind"], keyof typeof Ionicons.glyphMap> = {
  high_priority_report: "alert-circle-outline",
  assigned_to_you: "person-circle-outline",
  join_requests: "person-add-outline",
  admin_invitation: "key-outline",
};

function seenAt() {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export default function AdminAlerts() {
  const t = useAdminTheme();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(seenAt());

  const load = useCallback(() => {
    getAlerts()
      .then((result) => setItems(result.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const unseen = items.filter((item) => new Date(item.at).getTime() > seen).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      load();
      const now = Date.now();
      try {
        window.localStorage.setItem(SEEN_KEY, String(now));
      } catch {}
      // Keep the dots visible while the list is open; clear them next time.
      setTimeout(() => setSeen(now), 1500);
    }
  };

  const go = (item: AlertItem) => {
    setOpen(false);
    const { page, report, group } = item.link;
    router.navigate({ pathname: `/admin/${page}`, params: { ...(report ? { report } : {}), ...(group ? { group } : {}) } } as any);
  };

  return (
    <View style={{ zIndex: 40 }}>
      <Pressable onPress={toggle} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Alerts${unseen ? `, ${unseen} new` : ""}`}>
        <Ionicons name="notifications-outline" size={20} color={t.muted} />
        {unseen ? (
          <View style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: t.red }}>
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 9.5, color: "#FFFFFF" }}>{unseen > 9 ? "9+" : unseen}</Text>
          </View>
        ) : null}
      </Pressable>
      {open ? (
        <View style={{ position: "absolute", right: -10, top: 34, width: 360, maxHeight: 480, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
          <Text style={{ padding: 10, fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Alerts</Text>
          {items.length ? (
            items.slice(0, 12).map((item) => {
              const fresh = new Date(item.at).getTime() > seen;
              return (
                <Pressable key={item.id} onPress={() => go(item)} style={({ hovered }: any) => ({ flexDirection: "row", gap: 10, padding: 10, borderRadius: 8, backgroundColor: hovered ? t.cardSoft : "transparent" })}>
                  <Ionicons name={ICONS[item.kind]} size={18} color={item.kind === "high_priority_report" ? t.red : t.muted} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
                      {item.text}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ fontFamily: FONTS.regular, fontSize: 10.5, color: t.faint }}>{timeAgo(item.at)}</Text>
                    {fresh ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.pink }} /> : null}
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text style={{ padding: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>You're all caught up.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
