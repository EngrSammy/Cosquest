// "Your next ticket" at the top of home: only when one starts within 24
// hours (or is happening now), with Show QR. Works offline (saved copy).
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { useUpcomingTickets } from "@/services/ticketCache";

const PINK = "#C34D9C";

function whenText(startsAt: string, endsAt?: string) {
  const start = new Date(startsAt);
  const now = Date.now();
  if (start.getTime() <= now && (!endsAt || new Date(endsAt).getTime() > now)) return "Happening now";
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date().toDateString() === start.toDateString();
  const mins = Math.round((start.getTime() - now) / 60000);
  if (mins <= 90) return `Starts in ${mins} min · ${time}`;
  return `${today ? "Today" : "Tomorrow"} · ${time}`;
}

export default function NextTicketCard() {
  const ink = useInk();
  const { tickets } = useUpcomingTickets();
  const next = tickets?.find((t) => t.status === "valid" && t.quest?.startsAt && new Date(t.quest.startsAt).getTime() - Date.now() < 24 * 3600e3);
  if (!next || !next.quest) return null;
  const open = () => router.push({ pathname: "/tickets/[id]", params: { id: next.id } } as any);

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Your ticket for ${next.quest.title}. Show QR code`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 6, marginBottom: 4, padding: 14, borderRadius: 18, backgroundColor: ink.dark ? "#2A1E2C" : "#FBEAF3", borderWidth: 1, borderColor: ink.dark ? "#4A2D46" : "#F2C6E1" }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: PINK }}>
        <Ionicons name="ticket" size={22} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 11.5, color: PINK }}>YOUR NEXT TICKET</Text>
        <Text style={{ marginTop: 1, fontFamily: FONTS.bold, fontSize: 15, color: ink.text("#24283C") }} numberOfLines={1}>
          {next.quest.title}
        </Text>
        <Text style={{ marginTop: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#5F6170") }} numberOfLines={1}>
          {whenText(next.quest.startsAt!, next.quest.endsAt)}
          {next.quest.location?.name ? ` · ${next.quest.location.name}` : ""}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: PINK }}>
        <Ionicons name="qr-code" size={14} color="#FFFFFF" />
        <Text style={{ fontFamily: FONTS.bold, fontSize: 12.5, color: "#FFFFFF" }}>Show QR</Text>
      </View>
    </Pressable>
  );
}
