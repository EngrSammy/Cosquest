// ==========================================
// A QUEST / EVENT (from See All)
// ==========================================
// Cover, live / starts-in countdown, when, venue (with Directions), the
// prize and entry, places left, and Get ticket / See my ticket.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";

import GetTicketSheet from "@/components/tickets/GetTicketSheet";
import TicketScreenHeader from "@/components/tickets/TicketScreenHeader";
import { useInk } from "@/constants/chatTheme";
import { useIsDesktop } from "@/hooks/useDesktop";
import { FONTS } from "@/constants/fonts";
import { type Quest, getQuest } from "@/services/quests";
import { formatMoney } from "@/services/tickets";
import { useAppSelector } from "@/store/hooks";

const PINK = "#C34D9C";

function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

function span(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${h} h` : `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function QuestDetail() {
  const ink = useInk();
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAppSelector((state) => state.auth.token);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(false);
  const now = useNow();
  // Computers: two columns (picture + description | details + button).
  const desktop = useIsDesktop();

  const load = useCallback(async () => {
    if (typeof id !== "string") return;
    try {
      const data: any = await getQuest(id);
      setQuest(data?.quest || data);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load this quest.");
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load, token]);

  if (!quest) {
    return (
      <View style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }}>
        <TicketScreenHeader title="Quest" />
        {error ? <Text style={{ margin: 20, fontFamily: FONTS.regular, color: "#D9364F" }}>{error}</Text> : <ActivityIndicator color={PINK} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const start = new Date(quest.startsAt || 0).getTime();
  const end = new Date(quest.endsAt || 0).getTime();
  const live = start <= now && end > now;
  const ended = end <= now;
  const cancelled = quest.status === "cancelled";
  const full = quest.spacesRemaining === 0;
  const directions = () => {
    const { lat, lng } = quest.location || ({} as any);
    if (typeof lat !== "number") return;
    const label = encodeURIComponent(quest.location?.name || "Venue");
    const url = Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${label}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url).catch(() => {});
  };
  const row = (icon: any, text: string, sub?: string) => (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <Ionicons name={icon} size={20} color={PINK} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 14.5, color: ink.text("#24283C") }}>{text}</Text>
        {sub ? <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 13, color: ink.text("#66738A") }}>{sub}</Text> : null}
      </View>
    </View>
  );

  const statusAndTitle = (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: cancelled ? "#FDE6EA" : live ? "#E3F6EE" : "#FBEAF3" }}>
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 12, color: cancelled ? "#D9364F" : live ? "#1D9A6C" : PINK }}>
            {cancelled ? "Cancelled" : live ? `● Live · ${span(end - now)} left` : ended ? "Ended" : `Starts in ${span(start - now)}`}
          </Text>
        </View>
        {quest.kind === "event" ? <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: ink.text("#7A8296") }}>Event</Text> : null}
      </View>
      <Text style={{ fontFamily: FONTS.bold, fontSize: desktop ? 28 : 24, color: ink.text("#24283C") }}>{quest.title}</Text>
      {quest.hostName ? <Text style={{ marginTop: 4, fontFamily: FONTS.regular, fontSize: 13, color: ink.text("#66738A") }}>By {quest.hostName}</Text> : null}
    </View>
  );
  const facts = (
    <>
      {row(
        "calendar-outline",
        new Date(start).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }),
        `Until ${new Date(end).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", ...(end - start > 86400e3 ? { month: "short", day: "numeric" } : {}) })}`,
      )}
      <Pressable onPress={directions}>
        {row("location-outline", quest.location?.name || "Venue", [quest.location?.address, typeof quest.distanceMiles === "number" ? `${quest.distanceMiles} mi away` : null, "Directions ›"].filter(Boolean).join(" · "))}
      </Pressable>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[
          ["Entry", formatMoney(quest.entryFee as any)],
          ["Prize pool", quest.prizePool?.amount ? formatMoney(quest.prizePool as any) : "—"],
          ["Places left", typeof quest.spacesRemaining === "number" ? String(quest.spacesRemaining) : "—"],
        ].map(([label, value]) => (
          <View key={label} style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: desktop ? (ink.dark ? "#252837" : "#F4F8FD") : ink.dark ? "#1F2130" : "#FFFFFF" }}>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: ink.text("#7A8296") }}>{label}</Text>
            <Text style={{ marginTop: 2, fontFamily: FONTS.bold, fontSize: 16, color: ink.text("#24283C") }}>{value}</Text>
          </View>
        ))}
      </View>
      {quest.requireAtVenue ? row("navigate-circle-outline", "Be at the venue to join", "Joining while it's live only works near the venue.") : null}
    </>
  );
  const description = quest.description ? <Text style={{ fontFamily: FONTS.regular, fontSize: 15, lineHeight: 23, color: ink.text("#3D4256") }}>{quest.description}</Text> : null;
  const button =
    !cancelled && !ended ? (
      <Pressable
        disabled={!quest.isRegistered && full}
        onPress={() => (quest.isRegistered ? router.push("/tickets" as any) : setSheet(true))}
        style={({ hovered }: any) => ({
          height: 54,
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
          borderRadius: 27,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: quest.isRegistered ? "#1D9A6C" : full ? "#B9BECB" : hovered ? "#A93F86" : PINK,
        })}>
        <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: "#FFFFFF" }}>
          {quest.isRegistered ? "✓ You're in · See my ticket" : full ? "Full" : live ? "Join now" : quest.entryFee?.amount ? `Get ticket · ${formatMoney(quest.entryFee as any)}` : "Get free ticket"}
        </Text>
      </Pressable>
    ) : null;
  const sheetEl = sheet ? <GetTicketSheet quest={quest} onClose={() => setSheet(false)} onTicket={() => load()} /> : null;

  if (desktop) {
    return (
      <View style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }}>
        <TicketScreenHeader title={live ? "Live now" : "Quest"} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 40, width: "100%", maxWidth: 1240, alignSelf: "center" }}>
          <View style={{ flexDirection: "row", gap: 28, alignItems: "flex-start" }}>
            <View style={{ flex: 1.4, gap: 20, minWidth: 0 }}>
              {quest.coverImageUrl ? (
                <Image source={{ uri: quest.coverImageUrl }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 24 }} contentFit="cover" />
              ) : (
                <View style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: ink.dark ? "#2A1E2C" : "#FBEAF3" }}>
                  <Ionicons name={live ? "flash" : "calendar"} size={64} color={PINK} />
                </View>
              )}
              {description ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 18, color: ink.text("#24283C") }}>About</Text>
                  {description}
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 18, padding: 24, borderRadius: 24, backgroundColor: ink.dark ? "#1C1E2B" : "#FFFFFF", borderWidth: 1, borderColor: ink.dark ? "#2C2F42" : "#E7ECF4" }}>
              {statusAndTitle}
              {facts}
              {button}
            </View>
          </View>
        </ScrollView>
        {sheetEl}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }}>
      <TicketScreenHeader title={live ? "Live now" : "Quest"} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120, maxWidth: 640, width: "100%", alignSelf: "center" }}>
        {quest.coverImageUrl ? <Image source={{ uri: quest.coverImageUrl }} style={{ marginHorizontal: 16, height: 200, borderRadius: 20 }} contentFit="cover" /> : null}
        <View style={{ padding: 20, gap: 16 }}>
          {statusAndTitle}
          {facts}
          {description}
        </View>
      </ScrollView>

      {button ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }}>{button}</View>
      ) : null}
      {sheetEl}
    </View>
  );
}
