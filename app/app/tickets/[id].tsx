// ==========================================
// A TICKET (QR code for the door)
// ==========================================
// The QR holds the ticket's code; staff scan it at the venue (Check-in in
// the admin dashboard). It works once. "Give back" refunds a paid ticket
// (or frees a free one) until 24 hours before the start.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import TicketScreenHeader from "@/components/tickets/TicketScreenHeader";
import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { saveTicket, savedTicket, useTicketOwner } from "@/services/ticketCache";
import { type MyTicket, formatMoney, getMyTicket, giveBackTicket } from "@/services/tickets";
import { useAppSelector } from "@/store/hooks";

const PINK = "#C34D9C";

export default function TicketScreen() {
  const ink = useInk();
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAppSelector((state) => state.auth.token);
  const [ticket, setTicket] = useState<MyTicket | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Shown from the phone's saved copy (no connection at the venue).
  const [offline, setOffline] = useState(false);
  const owner = useTicketOwner();

  const load = useCallback(async () => {
    if (!token || typeof id !== "string") return;
    // The saved copy first (instant, and works offline)...
    const saved = await savedTicket(owner, id);
    if (saved) setTicket((current) => current ?? saved);
    // ...then the server's.
    try {
      const fresh = (await getMyTicket(id, token)).ticket;
      setTicket(fresh);
      setOffline(false);
      setError("");
      saveTicket(owner, fresh);
    } catch (e: any) {
      if (saved) setOffline(true);
      else setError(e?.status ? e?.message || "Couldn't load this ticket." : "No connection, and this ticket isn't saved on this phone yet.");
    }
  }, [token, id, owner]);

  useEffect(() => {
    load();
  }, [load]);

  const giveBack = () => {
    if (!ticket || !token) return;
    const paid = ticket.order?.status === "paid";
    const message = paid ? `You'll get ${formatMoney(ticket.order!.amount)} back to your card (5-10 days), and your place goes back on sale.` : "Your place goes back on sale.";
    const run = async () => {
      setBusy(true);
      try {
        await giveBackTicket(ticket.id, token);
        await load();
      } catch (e: any) {
        Alert.alert("Give back", e?.message || "Couldn't do that. Please try again.");
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === "web") {
      if ((window as any).confirm(`Give this ticket back? ${message}`)) run();
    } else {
      Alert.alert("Give this ticket back?", message, [{ text: "Keep it", style: "cancel" }, { text: paid ? "Refund" : "Give back", style: "destructive", onPress: run }]);
    }
  };

  const q = ticket?.quest;
  return (
    <View style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }}>
      <TicketScreenHeader title="Ticket" />
      <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center", maxWidth: 520, width: "100%", alignSelf: "center" }}>
        {error ? <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: "#D9364F" }}>{error}</Text> : null}
        {!ticket ? (
          !error ? <ActivityIndicator color={PINK} style={{ marginTop: 40 }} /> : null
        ) : (
          <View style={{ width: "100%", padding: 22, borderRadius: 24, alignItems: "center", backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF" }}>
            <Text style={{ textAlign: "center", fontFamily: FONTS.bold, fontSize: 20, color: ink.text("#24283C") }}>{q?.title}</Text>
            <Text style={{ marginTop: 6, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13.5, color: ink.text("#66738A") }}>
              {q?.startsAt ? new Date(q.startsAt).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
            </Text>
            <Text style={{ marginTop: 2, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13.5, color: ink.text("#66738A") }}>
              {[q?.location?.name, q?.location?.address].filter(Boolean).join(" · ")}
            </Text>

            <View style={{ marginTop: 20, padding: 16, borderRadius: 18, backgroundColor: "#FFFFFF" }}>
              {ticket.status === "valid" && ticket.code ? (
                <QRCode value={ticket.code} size={220} color="#1E2232" backgroundColor="#FFFFFF" />
              ) : (
                <View style={{ width: 220, height: 220, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={ticket.status === "checked_in" ? "checkmark-circle" : "close-circle"} size={72} color={ticket.status === "checked_in" ? "#1D9A6C" : "#9AA1B4"} />
                  <Text style={{ marginTop: 8, fontFamily: FONTS.semibold, fontSize: 15, color: "#24283C" }}>
                    {ticket.status === "checked_in" ? "Checked in" : ticket.status === "refunded" ? "Refunded" : "Cancelled"}
                  </Text>
                </View>
              )}
            </View>
            {offline ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Ionicons name="cloud-offline-outline" size={14} color={ink.text("#7A8296")} />
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: ink.text("#7A8296") }}>Saved copy · you're offline. It still works at the door.</Text>
              </View>
            ) : null}
            {ticket.status === "valid" ? (
              <Text style={{ marginTop: 12, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#66738A") }}>Show this at the entrance. It works once.</Text>
            ) : ticket.checkedInAt ? (
              <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#66738A") }}>Checked in {new Date(ticket.checkedInAt).toLocaleString()}</Text>
            ) : null}

            <View style={{ marginTop: 18, alignSelf: "stretch", gap: 6 }}>
              {[
                ["Ticket", ticket.ticketType?.name || "—"],
                ["Order", ticket.order?.number || "—"],
                ["Paid", ticket.order ? (ticket.order.status === "free" ? "Free" : formatMoney(ticket.order.amount)) : "—"],
              ].map(([label, value]) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 13.5, color: ink.text("#66738A") }}>{label}</Text>
                  <Text style={{ fontFamily: FONTS.semibold, fontSize: 13.5, color: ink.text("#24283C") }}>{value}</Text>
                </View>
              ))}
            </View>

            {ticket.canGiveBack ? (
              <>
                <Pressable onPress={giveBack} disabled={busy} style={{ marginTop: 20, height: 46, alignSelf: "stretch", borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: ink.dark ? "#34374A" : "#D9DDE6" }}>
                  {busy ? <ActivityIndicator color={PINK} /> : <Text style={{ fontFamily: FONTS.semibold, fontSize: 14.5, color: ink.text("#24283C") }}>{ticket.order?.status === "paid" ? "Give back for a refund" : "Give back my place"}</Text>}
                </Pressable>
                {ticket.giveBackUntil ? (
                  <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 11.5, color: ink.text("#7A8296") }}>
                    Possible until {new Date(ticket.giveBackUntil).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
