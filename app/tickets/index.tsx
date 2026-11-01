// ==========================================
// MY TICKETS
// ==========================================
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import TicketScreenHeader from "@/components/tickets/TicketScreenHeader";
import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { type MyTicket, getMyTickets } from "@/services/tickets";
import { useAppSelector } from "@/store/hooks";

const PINK = "#C34D9C";

export default function MyTickets() {
  const ink = useInk();
  const token = useAppSelector((state) => state.auth.token);
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [items, setItems] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItems((await getMyTickets(scope, token)).tickets);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load your tickets.");
    }
  }, [token, scope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }}>
      <TicketScreenHeader title="My tickets" />
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 10 }}>
        {(["upcoming", "past"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => {
              setScope(key);
              setItems(null);
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: scope === key ? PINK : ink.dark ? "#252837" : "#FFFFFF" }}>
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 13.5, color: scope === key ? "#FFFFFF" : ink.text("#5F6170") }}>{key === "upcoming" ? "Upcoming" : "Past"}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 640, width: "100%", alignSelf: "center" }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {error ? <Text style={{ fontFamily: FONTS.regular, fontSize: 13.5, color: "#D9364F" }}>{error}</Text> : null}
        {!items ? (
          <ActivityIndicator color={PINK} style={{ marginTop: 40 }} />
        ) : items.length ? (
          items.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: "/tickets/[id]", params: { id: t.id } } as any)}
              style={{ flexDirection: "row", gap: 12, padding: 12, borderRadius: 18, backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF" }}>
              {t.quest?.coverImageUrl ? (
                <Image source={{ uri: t.quest.coverImageUrl }} style={{ width: 72, height: 72, borderRadius: 12 }} contentFit="cover" />
              ) : (
                <View style={{ width: 72, height: 72, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FBEAF3" }}>
                  <Ionicons name="ticket-outline" size={28} color={PINK} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: ink.text("#24283C") }} numberOfLines={1}>
                  {t.quest?.title || "Quest"}
                </Text>
                <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#66738A") }} numberOfLines={1}>
                  {t.quest?.startsAt ? new Date(t.quest.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                </Text>
                <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#66738A") }} numberOfLines={1}>
                  {t.quest?.location?.name || ""}
                  {t.ticketType ? ` · ${t.ticketType.name}` : ""}
                </Text>
              </View>
              <Text
                style={{
                  alignSelf: "flex-start",
                  fontFamily: FONTS.semibold,
                  fontSize: 11.5,
                  color: t.status === "valid" ? "#1D9A6C" : t.status === "checked_in" ? PINK : "#7A8296",
                }}>
                {t.status === "valid" ? "Valid" : t.status === "checked_in" ? "Checked in" : t.status === "refunded" ? "Refunded" : "Cancelled"}
              </Text>
            </Pressable>
          ))
        ) : (
          <View style={{ alignItems: "center", marginTop: 50, gap: 8 }}>
            <Ionicons name="ticket-outline" size={40} color={ink.text("#9AA1B4")} />
            <Text style={{ fontFamily: FONTS.medium, fontSize: 15, color: ink.text("#24283C") }}>{scope === "upcoming" ? "No upcoming tickets" : "No past tickets"}</Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: ink.text("#66738A") }}>Register for an event from the home page.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
