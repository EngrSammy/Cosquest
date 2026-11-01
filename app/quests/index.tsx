// ==========================================
// SEE ALL: live quests and upcoming events
// ==========================================
// From the home page's "See All". Tabs: Live now / Upcoming. Distance:
// 10 / 25 / 50 / 100 miles from you, or Anywhere. Nearest first.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";

import TicketScreenHeader from "@/components/tickets/TicketScreenHeader";
import { useInk } from "@/constants/chatTheme";
import { useIsDesktop } from "@/hooks/useDesktop";
import { FONTS } from "@/constants/fonts";
import { type Quest, getQuests } from "@/services/quests";
import { formatMoney } from "@/services/tickets";
import { useAppSelector } from "@/store/hooks";

const PINK = "#C34D9C";
const RADII = [10, 25, 50, 100, 0] as const; // 0 = anywhere

function whenText(q: Quest) {
  const start = new Date(q.startsAt || 0);
  const end = new Date(q.endsAt || 0);
  const now = Date.now();
  if (start.getTime() <= now && end.getTime() > now) {
    const mins = Math.round((end.getTime() - now) / 60000);
    return mins >= 60 ? `Live · ${Math.floor(mins / 60)} h ${mins % 60} min left` : `Live · ${mins} min left`;
  }
  return start.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AllQuests() {
  const ink = useInk();
  // Computers: filters on one line, quests as a grid of picture cards.
  const desktop = useIsDesktop();
  const params = useLocalSearchParams<{ tab?: string; radius?: string }>();
  const user = useAppSelector((state) => state.user.user) as any;
  const token = useAppSelector((state) => state.auth.token);
  const [tab, setTab] = useState<"live" | "upcoming">(params.tab === "upcoming" ? "upcoming" : "live");
  const saved = user?.preferences?.radiusMiles;
  // ?radius=0 (from the home page's "anywhere" link) = Anywhere.
  const [radius, setRadius] = useState<number>(params.radius === "0" ? 0 : RADII.includes(saved) ? saved : 50);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Quest[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const lat = user?.location?.lat;
  const lng = user?.location?.lng;
  const hasPlace = typeof lat === "number" && typeof lng === "number";

  const load = useCallback(async () => {
    try {
      const near = radius && hasPlace ? { lat, lng, radiusMiles: radius } : {};
      const list = await getQuests({ status: tab, ...near } as any);
      setItems(list);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load quests.");
      setItems((current) => current ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, radius, lat, lng, token]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = items || [];
    return s ? list.filter((x) => [x.title, x.location?.name, x.location?.address].some((v) => String(v || "").toLowerCase().includes(s))) : list;
  }, [items, q]);

  const chip = (active: boolean) => ({ paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: "center" as const, backgroundColor: active ? PINK : ink.dark ? "#252837" : "#FFFFFF" });
  const chipText = (active: boolean) => ({ fontFamily: FONTS.semibold, fontSize: 13, color: active ? "#FFFFFF" : ink.text("#5F6170") });

  return (
    <View style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }}>
      <TicketScreenHeader title={tab === "live" ? "Live quests" : "Upcoming events"} />
      <View style={[{ paddingHorizontal: 16, gap: 10, maxWidth: 720, width: "100%", alignSelf: "center" }, desktop && { maxWidth: 1240, paddingHorizontal: 28, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14 }]}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["live", "upcoming"] as const).map((key) => (
            <Pressable key={key} onPress={() => setTab(key)} style={chip(tab === key)}>
              <Text style={chipText(tab === key)}>{key === "live" ? "Live now" : "Upcoming"}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={desktop ? { flexGrow: 0 } : undefined}>
          {RADII.map((r) => (
            <Pressable key={r} disabled={!hasPlace && r !== 0} onPress={() => setRadius(r)} style={[chip(radius === r), !hasPlace && r !== 0 && { opacity: 0.4 }]}>
              <Text style={chipText(radius === r)}>{r ? `${r} mi` : "Anywhere"}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, height: 42, paddingHorizontal: 12, borderRadius: 21, backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF" }, desktop && { flex: 1, minWidth: 260 }]}>
          <Ionicons name="search" size={16} color={ink.text("#7A8296")} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by name or place"
            placeholderTextColor={ink.text("#9AA1B4")}
            style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: ink.text("#24283C"), ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) }}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[{ padding: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" }, desktop && { maxWidth: 1240, padding: 28, flexDirection: "row", flexWrap: "wrap", gap: 20 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {error ? <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: "#D9364F" }}>{error}</Text> : null}
        {!items ? (
          <ActivityIndicator color={PINK} style={{ marginTop: 40 }} />
        ) : shown.length ? (
          shown.map((x) =>
            desktop ? (
              <Pressable
                key={x.id}
                onPress={() => router.push({ pathname: "/quests/[id]", params: { id: x.id } } as any)}
                style={({ hovered }: any) => ({
                  width: "31.8%" as any,
                  minWidth: 280,
                  flexGrow: 1,
                  maxWidth: 400,
                  borderRadius: 20,
                  overflow: "hidden",
                  backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF",
                  borderWidth: 1,
                  borderColor: hovered ? PINK : ink.dark ? "#2C2F42" : "#E7ECF4",
                })}>
                {x.coverImageUrl ? (
                  <Image source={{ uri: x.coverImageUrl }} style={{ width: "100%", height: 170 }} contentFit="cover" />
                ) : (
                  <View style={{ height: 170, alignItems: "center", justifyContent: "center", backgroundColor: ink.dark ? "#2A1E2C" : "#FBEAF3" }}>
                    <Ionicons name={tab === "live" ? "flash" : "calendar"} size={44} color={PINK} />
                  </View>
                )}
                <View style={{ padding: 16, gap: 4 }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: tab === "live" ? "#1D9A6C" : PINK }} numberOfLines={1}>
                    {whenText(x)}
                  </Text>
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 17, color: ink.text("#24283C") }} numberOfLines={1}>
                    {x.title}
                  </Text>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: ink.text("#66738A") }} numberOfLines={1}>
                    {x.location?.name || ""}
                    {typeof x.distanceMiles === "number" ? ` · ${x.distanceMiles} mi` : ""}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                    <Text style={{ flex: 1, fontFamily: FONTS.semibold, fontSize: 14, color: ink.text("#24283C") }}>
                      {x.isRegistered ? "✓ You're in" : formatMoney(x.entryFee as any)}
                    </Text>
                    {x.prizePool?.amount ? <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#66738A") }}>Prize {formatMoney(x.prizePool as any)}</Text> : null}
                  </View>
                </View>
              </Pressable>
            ) : (
            <Pressable
              key={x.id}
              onPress={() => router.push({ pathname: "/quests/[id]", params: { id: x.id } } as any)}
              style={{ flexDirection: "row", gap: 12, padding: 12, borderRadius: 18, backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF" }}>
              {x.coverImageUrl ? (
                <Image source={{ uri: x.coverImageUrl }} style={{ width: 84, height: 84, borderRadius: 14 }} contentFit="cover" />
              ) : (
                <View style={{ width: 84, height: 84, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FBEAF3" }}>
                  <Ionicons name={tab === "live" ? "flash" : "calendar"} size={30} color={PINK} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: ink.text("#24283C") }} numberOfLines={1}>
                  {x.title}
                </Text>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: tab === "live" ? "#1D9A6C" : PINK }} numberOfLines={1}>
                  {whenText(x)}
                </Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#66738A") }} numberOfLines={1}>
                  {x.location?.name || ""}
                  {typeof x.distanceMiles === "number" ? ` · ${x.distanceMiles} mi` : ""}
                </Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#66738A") }} numberOfLines={1}>
                  {x.isRegistered ? "✓ You're in" : `Entry ${formatMoney(x.entryFee as any)}`}
                  {x.prizePool?.amount ? ` · Prize ${formatMoney(x.prizePool as any)}` : ""}
                  {typeof x.spacesRemaining === "number" && !x.isRegistered ? ` · ${x.spacesRemaining ? `${x.spacesRemaining} left` : "Full"}` : ""}
                </Text>
              </View>
            </Pressable>
            ),
          )
        ) : (
          <View style={{ alignItems: "center", marginTop: 50, gap: 8, width: "100%" }}>
            <Ionicons name={tab === "live" ? "flash-outline" : "calendar-outline"} size={40} color={ink.text("#9AA1B4")} />
            <Text style={{ fontFamily: FONTS.medium, fontSize: 15, color: ink.text("#24283C") }}>{tab === "live" ? "Nothing live right now" : "No upcoming events"}</Text>
            <Text style={{ textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: ink.text("#66738A") }}>
              {radius ? `Within ${radius} miles. Try a bigger distance or Anywhere.` : "Check back soon."}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
