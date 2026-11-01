// ==========================================
// AFTER PAYING (/tickets/return?order=...)
// ==========================================
// Stripe sends people back here (website), or the phone shows it behind
// the payment page. It never trusts the redirect: it ASKS the server,
// which only knows the order is paid from Stripe's signed webhook (or by
// asking Stripe itself). Checks every few seconds, and when the app comes
// back to the front.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";

import { openPayment } from "@/components/tickets/openPayment";
import TicketScreenHeader from "@/components/tickets/TicketScreenHeader";
import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { type Order, formatMoney, getOrder } from "@/services/tickets";
import { useAppSelector } from "@/store/hooks";

const PINK = "#C34D9C";
const STOP_AFTER_MS = 35 * 60 * 1000; // a little past the 31-minute hold

export default function PaymentReturn() {
  const ink = useInk();
  const { order: orderId, result } = useLocalSearchParams<{ order?: string; result?: string }>();
  const token = useAppSelector((state) => state.auth.token);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const started = useRef(Date.now());

  const check = useCallback(async () => {
    if (!token || typeof orderId !== "string") return;
    try {
      setOrder((await getOrder(orderId, token)).order);
      setError("");
    } catch (e: any) {
      setError(e?.status === 404 ? "We couldn't find this order." : "No connection. We'll keep checking.");
    }
  }, [token, orderId]);

  // Check now, every 3 seconds while pending, and when the app comes back.
  useEffect(() => {
    check();
    const timer = setInterval(() => {
      if (Date.now() - started.current > STOP_AFTER_MS) return clearInterval(timer);
      check();
    }, 3000);
    const sub = AppState.addEventListener("change", (state) => state === "active" && check());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [check]);

  // Stop polling once the order is decided.
  useEffect(() => {
    if (order && order.status !== "pending") started.current = 0;
  }, [order]);

  const done = order && (order.status === "paid" || order.status === "free");
  const icon = done ? "checkmark-circle" : order?.status === "pending" ? null : order?.status === "refunded" ? "return-down-back" : "close-circle";

  return (
    <View style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }}>
      <TicketScreenHeader title="Your ticket" onBack={() => router.replace("/(tabs)/home" as any)} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
        {!token ? (
          <Text style={{ fontFamily: FONTS.medium, fontSize: 15, color: ink.text("#24283C"), textAlign: "center" }}>Sign in to see your ticket.</Text>
        ) : !order ? (
          <>
            <ActivityIndicator color={PINK} />
            <Text style={{ marginTop: 14, fontFamily: FONTS.regular, fontSize: 14, color: ink.text("#66738A") }}>{error || "Checking your payment…"}</Text>
          </>
        ) : (
          <>
            {icon ? <Ionicons name={icon as any} size={64} color={done ? "#1D9A6C" : order.status === "refunded" ? PINK : "#D9364F"} /> : <ActivityIndicator size="large" color={PINK} />}
            <Text style={{ marginTop: 16, textAlign: "center", fontFamily: FONTS.bold, fontSize: 22, color: ink.text("#24283C") }}>
              {done
                ? "You're in!"
                : order.status === "pending"
                  ? result === "cancelled"
                    ? "Payment not finished"
                    : "Waiting for confirmation…"
                  : order.status === "refunded"
                    ? "Payment refunded"
                    : "Payment window closed"}
            </Text>
            <Text style={{ marginTop: 8, maxWidth: 360, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: ink.text("#66738A") }}>
              {done
                ? `${order.status === "paid" ? `${formatMoney(order.amount)} paid · ` : ""}${order.number}. Your ticket is in My tickets.`
                : order.status === "pending"
                  ? result === "cancelled"
                    ? "Nothing was charged. Your place is held for a few more minutes."
                    : "This usually takes a few seconds. If you paid, your ticket appears here by itself - you won't be charged twice."
                  : order.status === "refunded"
                    ? order.refundReason || "The money is on its way back to your card (5-10 days)."
                    : "Nothing was charged. Your place went back on sale - you can try again."}
            </Text>
            {error ? <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 12.5, color: "#D9364F" }}>{error}</Text> : null}

            <View style={{ marginTop: 24, width: "100%", maxWidth: 360, gap: 10 }}>
              {done && order.ticket ? (
                <Pressable onPress={() => router.replace({ pathname: "/tickets/[id]", params: { id: order.ticket!.id } } as any)} style={{ height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: PINK }}>
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: "#FFFFFF" }}>See my ticket</Text>
                </Pressable>
              ) : null}
              {order.status === "pending" && order.checkoutUrl ? (
                <Pressable onPress={() => openPayment(order.checkoutUrl!, order.id)} style={{ height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: PINK }}>
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: "#FFFFFF" }}>{result === "cancelled" ? "Finish paying" : "Open the payment page again"}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => router.replace("/(tabs)/home" as any)} style={{ height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: ink.dark ? "#34374A" : "#D9DDE6" }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: ink.text("#24283C") }}>Back to home</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
