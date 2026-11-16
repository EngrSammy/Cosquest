// ==========================================
// WEBSITE CHECKOUT: back from Stripe (cosquest.vercel.app/checkout/return)
// ==========================================
// Stripe sends people here with ?order=&result=success|cancelled. Only the
// server says "paid" (Stripe's signed webhook): this page asks it, every
// 3 seconds for up to 2 minutes. The app updates by itself either way
// ("ticket:issued" on its socket, and a push).
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadReturnOrder, payNow } from "@/store/thunks/paymentThunks";

import { Message, backToApp } from "@/components/checkout/CheckoutParts";

const PINK = "#C34D9C";

export default function CheckoutReturn() {
  const ink = useInk();
  const dispatch = useAppDispatch();
  const { order: orderId, result } = useLocalSearchParams<{ order?: string; result?: string }>();
  const ret = useAppSelector((state) => state.payment.returnOrder);
  const paying = useAppSelector((state) => state.payment.web.status === "paying");
  const order = ret.order;
  const done = order?.status === "paid" || order?.status === "free";
  const doneRef = useRef(false);
  doneRef.current = done;

  useEffect(() => {
    if (!orderId) return;
    dispatch(loadReturnOrder({ orderId: String(orderId) }));
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 40 || doneRef.current) return clearInterval(timer);
      dispatch(loadReturnOrder({ orderId: String(orderId) }));
    }, 3000);
    return () => clearInterval(timer);
  }, [orderId, dispatch]);

  useEffect(() => {
    // Paid: nothing more to ask.
    if (done && Platform.OS === "web") window.history.replaceState(null, "", `/checkout/return?order=${orderId}&result=success`);
  }, [done, orderId]);

  let body: React.ReactNode;
  if (done) {
    body = (
      <Message
        icon="checkmark-circle-outline"
        title="You're in!"
        text="Your ticket is in My tickets in CosQuest. The app updates by itself; you can close this page."
        action="Open CosQuest"
        onAction={() => {
          if (Platform.OS !== "web") return;
          const ticketId = order?.ticket?.id;
          const phone = /Android|iPhone|iPad/i.test(navigator.userAgent);
          window.location.assign(phone ? `cosquest://tickets${ticketId ? `/${ticketId}` : ""}` : ticketId ? `/tickets/${ticketId}` : "/tickets");
        }}
      />
    );
  } else if (order && ["expired", "failed", "refunded", "cancelled"].includes(order.status)) {
    body = <Message icon="close-circle-outline" title="Payment not finished" text={order.refundReason || "Nothing was charged. Go back to CosQuest and tap Pay to try again."} action="Back to CosQuest" onAction={backToApp} />;
  } else if (result === "cancelled") {
    body = (
      <View style={{ gap: 12 }}>
        <Message icon="close-circle-outline" title="Payment not finished" text="Nothing was charged. Your place is held for a few minutes." />
        <Pressable onPress={() => dispatch(payNow())} disabled={paying} accessibilityRole="button" style={{ height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: PINK }}>
          {paying ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontFamily: FONTS.bold, fontSize: 15, color: "#FFFFFF" }}>Try again</Text>}
        </Pressable>
        <Pressable onPress={backToApp} accessibilityRole="button" style={{ alignSelf: "center", padding: 10 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: ink.text("#66738A") }}>Back to CosQuest</Text>
        </Pressable>
      </View>
    );
  } else if (ret.status === "error" && !order) {
    body = <Message icon="alert-circle-outline" title="Couldn't check the payment" text={ret.error?.message || "If you paid, your ticket is in My tickets in CosQuest."} action="Back to CosQuest" onAction={backToApp} />;
  } else {
    body = (
      <View style={{ alignItems: "center", gap: 14, marginTop: 40 }}>
        <ActivityIndicator color={PINK} size="large" />
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 17, color: ink.text("#24283C") }}>Confirming your payment…</Text>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 13.5, textAlign: "center", color: ink.text("#66738A") }}>This takes a few seconds. You won't be charged twice.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }} contentContainerStyle={{ padding: 20, width: "100%", maxWidth: 560, alignSelf: "center" }}>
      {body}
    </ScrollView>
  );
}
