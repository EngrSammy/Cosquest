// ==========================================
// GET A TICKET (Register / Join on the home page)
// ==========================================
// Shows the ticket types (price, places left), then:
//   free  -> the ticket at once
//   paid  -> Stripe's payment page (see openPayment)
// A second tap after a network drop gets the SAME order back (the server
// keeps one open checkout per person), so nobody pays twice.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { Quest } from "@/services/quests";
import { type TicketType, TicketError, checkout, formatMoney, getTicketTypes } from "@/services/tickets";
import { useAppSelector } from "@/store/hooks";

import { openPayment } from "./openPayment";

const PINK = "#C34D9C";

export default function GetTicketSheet({ quest, onClose, onTicket }: { quest: Quest | null; onClose: () => void; onTicket: (questId: string, ticketId: string | null) => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const token = useAppSelector((state) => state.auth.token);
  const [types, setTypes] = useState<TicketType[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!quest) return;
    setTypes(null);
    setError("");
    setChosen(null);
    getTicketTypes(quest.id)
      .then(({ ticketTypes }) => {
        setTypes(ticketTypes);
        const firstOnSale = ticketTypes.find((t) => t.onSale);
        setChosen(firstOnSale?.id || null);
      })
      .catch((e) => setError(e?.message || "Couldn't load tickets."));
  }, [quest]);

  if (!quest) return null;
  const type = types?.find((t) => t.id === chosen) || null;

  const go = async () => {
    if (!token || !type || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await checkout(quest.id, type.id, token);
      if (result.ticket) {
        // Free: done.
        onTicket(quest.id, result.ticket.id);
        onClose();
        router.push({ pathname: "/tickets/[id]", params: { id: result.ticket.id } } as any);
        return;
      }
      if (result.checkoutUrl) {
        onClose();
        await openPayment(result.checkoutUrl, result.order.id);
      }
    } catch (e) {
      const err = e as TicketError;
      if (err.code === "has_ticket") {
        onTicket(quest.id, err.data?.ticketId || null);
        onClose();
        router.push((err.data?.ticketId ? { pathname: "/tickets/[id]", params: { id: err.data.ticketId } } : "/tickets") as any);
        return;
      }
      setError(
        err.code === "sold_out"
          ? "Sold out. Places may free up if someone doesn't finish paying - try again in a few minutes."
          : err.code === "payments_unavailable"
            ? "Card payments aren't available right now. Please try again later."
            : err.message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={2}>
              {quest.title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={ink.text("#24283C")} />
            </Pressable>
          </View>
          <Text style={styles.sub}>
            {quest.location?.name ? `${quest.location.name} · ` : ""}
            {quest.startsAt ? new Date(quest.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
          </Text>

          {!types && !error ? (
            <ActivityIndicator color={PINK} style={{ marginVertical: 30 }} />
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {(types || []).map((t) => {
                const on = t.id === chosen;
                return (
                  <Pressable
                    key={t.id}
                    disabled={!t.onSale}
                    onPress={() => setChosen(t.id)}
                    style={[styles.type, on && styles.typeOn, !t.onSale && { opacity: 0.5 }]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on, disabled: !t.onSale }}>
                    <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.typeName}>{t.name}</Text>
                      <Text style={styles.typeSub}>
                        {t.soldOut ? "Sold out" : !t.onSale ? "Not on sale right now" : t.remaining <= 10 ? `Only ${t.remaining} left` : `${t.remaining} places left`}
                        {t.description ? ` · ${t.description}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.price}>{formatMoney(t.price)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {quest.prizePool?.amount ? <Text style={styles.note}>Prize pool {formatMoney(quest.prizePool as any)}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.button, (!type || busy) && { opacity: 0.5 }]} disabled={!type || busy} onPress={go} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{!type ? "Choose a ticket" : type.free ? "Get free ticket" : `Pay ${formatMoney(type.price)}`}</Text>}
          </Pressable>
          {type && !type.free ? (
            <View style={styles.secure}>
              <Ionicons name="lock-closed" size={12} color={ink.text("#7A8296")} />
              <Text style={styles.secureText}>Secure payment by Stripe. Your card details never reach CosQuest.</Text>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    backdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: { width: "100%", maxWidth: 560, paddingHorizontal: 20, paddingTop: 10, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#FFFFFF" },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 12, backgroundColor: "#D9DDE6" },
    head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    title: { flex: 1, fontFamily: FONTS.bold, fontSize: 19, color: "#24283C" },
    sub: { marginTop: 4, marginBottom: 12, fontFamily: FONTS.regular, fontSize: 13, color: "#66738A" },
    type: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 10, borderRadius: 14, borderWidth: 1, borderColor: "#E4E8F0" },
    typeOn: { borderColor: PINK, backgroundColor: "#FBEAF3" },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#C3C8D4", alignItems: "center", justifyContent: "center" },
    radioOn: { borderColor: PINK },
    radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: PINK },
    typeName: { fontFamily: FONTS.semibold, fontSize: 15, color: "#24283C" },
    typeSub: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12.5, color: "#7A8296" },
    price: { fontFamily: FONTS.bold, fontSize: 16, color: "#24283C" },
    note: { marginTop: 2, fontFamily: FONTS.medium, fontSize: 13, color: PINK },
    error: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: "#D9364F" },
    button: { marginTop: 14, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
    buttonText: { fontFamily: FONTS.bold, fontSize: 16, color: "#FFFFFF" },
    secure: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 },
    secureText: { fontFamily: FONTS.regular, fontSize: 11.5, color: "#7A8296" },
  },
  {
    sheet: { backgroundColor: "#1F2130" },
    handle: { backgroundColor: "#3A3D52" },
    title: { color: "#F4F5FA" },
    sub: { color: "#B5BBCB" },
    type: { borderColor: "#34374A" },
    typeOn: { backgroundColor: "rgba(195,77,156,0.18)" },
    radio: { borderColor: "#5D6478" },
    typeName: { color: "#F4F5FA" },
    typeSub: { color: "#9AA1B4" },
    price: { color: "#F4F5FA" },
    secureText: { color: "#9AA1B4" },
  },
);
