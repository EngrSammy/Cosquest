// ==========================================
// WEBSITE CHECKOUT (cosquest.vercel.app/checkout?h=<link>)
// ==========================================
// Payment brief, decision 2: people pay here, never inside the app. The app
// opens this page with a 20-minute link; the page swaps it (once) for a
// checkout-only pass, shows what's being bought, checks the member may pay
// (18+, region), and sends them to Stripe's page. Stripe returns to
// /checkout/return. Normal CosQuest look (glass is the admin dashboard only).
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { formatMoney } from "@/services/tickets";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { chooseTicketType } from "@/store/slices/paymentSlice";
import { payNow, redeemCheckout } from "@/store/thunks/paymentThunks";
import { Message, backToApp } from "@/components/checkout/CheckoutParts";

const PINK = "#C34D9C";
const LOGO = require("@/assets/images/cosquest-logo.png");

function useMinutesLeft(expiresAt: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60000));
}


export default function WebCheckout() {
  const ink = useInk();
  const dispatch = useAppDispatch();
  const { h } = useLocalSearchParams<{ h?: string }>();
  const web = useAppSelector((state) => state.payment.web);
  const asked = useRef(false);
  const minutesLeft = useMinutesLeft(web.expiresAt);

  useEffect(() => {
    if (asked.current || !h) return;
    asked.current = true;
    dispatch(redeemCheckout({ h: String(h) }));
    // The link is one-use and private: keep it out of the address bar and history.
    if (Platform.OS === "web") window.history.replaceState(null, "", "/checkout");
  }, [h, dispatch]);

  const card = { borderRadius: 20, padding: 20, backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF" };
  const text = (light: string) => ink.text(light);
  const type = web.ticketTypes.find((t) => t.id === web.selectedTicketTypeId) || null;
  const blocked = web.eligibility && !web.eligibility.allowed;
  const expired = minutesLeft === 0;

  let body: React.ReactNode;
  if (!h && web.status === "idle") {
    body = <Message icon="link-outline" title="Open this page from CosQuest" text="Tap Pay on a quest in the CosQuest app, and it brings you here." />;
  } else if (web.status === "redeeming" || (web.status === "idle" && h)) {
    body = <ActivityIndicator color={PINK} style={{ marginTop: 40 }} />;
  } else if (web.status === "error" && !web.quest) {
    body = <Message icon="time-outline" title="This checkout link can't be used" text={web.error?.message || "Go back to CosQuest and tap Pay again."} action="Back to CosQuest" onAction={backToApp} />;
  } else if (web.quest) {
    const q = web.quest;
    body = (
      <View style={{ gap: 16 }}>
        <View style={[card, { gap: 12 }]}>
          {q.coverImageUrl ? <Image source={{ uri: q.coverImageUrl }} style={{ width: "100%", height: 170, borderRadius: 14 }} contentFit="cover" /> : null}
          <Text style={{ fontFamily: FONTS.bold, fontSize: 22, color: text("#24283C") }}>{q.title}</Text>
          <Row icon="calendar-outline" text={q.startsAt ? new Date(q.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""} />
          <Row icon="location-outline" text={[q.location?.name, q.location?.address].filter(Boolean).join(" · ")} />
          {q.prizePool?.amount ? <Row icon="trophy-outline" text={`Prize pool ${formatMoney(q.prizePool as any)}`} /> : null}
          {q.description ? <Text style={{ fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: text("#3D4256") }}>{q.description}</Text> : null}
        </View>

        <View style={[card, { gap: 10 }]}>
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 16, color: text("#24283C") }}>Your ticket</Text>
          {web.ticketTypes.map((t) => {
            const on = t.id === web.selectedTicketTypeId;
            return (
              <Pressable
                key={t.id}
                disabled={!t.onSale}
                onPress={() => dispatch(chooseTicketType(t.id))}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !t.onSale }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: on ? PINK : ink.dark ? "#34374A" : "#E3E7EF", opacity: t.onSale ? 1 : 0.5 }}>
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? PINK : text("#98A0B0")} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 15, color: text("#24283C") }}>{t.name}</Text>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: text("#66738A") }}>{t.onSale ? `${t.remaining} places left` : t.soldOut ? "Sold out" : "Not on sale"}</Text>
                </View>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: text("#24283C") }}>{formatMoney(t.price)}</Text>
              </Pressable>
            );
          })}
        </View>

        {blocked ? (
          <Message icon="alert-circle-outline" title="You can't pay for this" text={web.eligibility?.message || "Paid quests aren't available for you right now."} compact />
        ) : expired ? (
          <Message icon="time-outline" title="This checkout has closed" text="Go back to CosQuest and tap Pay again." action="Back to CosQuest" onAction={backToApp} compact />
        ) : (
          <View style={{ gap: 10 }}>
            {web.error ? <Text style={{ fontFamily: FONTS.regular, fontSize: 13.5, color: "#D9364F", textAlign: "center" }}>{web.error.message}</Text> : null}
            <Pressable
              onPress={() => dispatch(payNow())}
              disabled={!type || web.status === "paying"}
              accessibilityRole="button"
              style={{ height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: !type ? "#B9BECB" : PINK }}>
              {web.status === "paying" ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: "#FFFFFF" }}>{type ? `Pay ${formatMoney(type.price)}` : "Choose a ticket"}</Text>
              )}
            </Pressable>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, textAlign: "center", color: text("#66738A") }}>
              Secure payment by Stripe. Your card details never reach CosQuest.{minutesLeft ? ` This checkout closes in ${minutesLeft} min.` : ""}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }} contentContainerStyle={{ padding: 20, paddingBottom: 48, width: "100%", maxWidth: 560, alignSelf: "center", gap: 18 }}>
      <View style={{ alignItems: "center", gap: 6, marginTop: 8 }}>
        <Image source={LOGO} style={{ width: 150, height: 60 }} contentFit="contain" accessibilityLabel="CosQuest" />
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 18, color: text("#24283C") }}>Checkout</Text>
        {web.member ? <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: text("#66738A") }}>For {web.member.username ? `@${web.member.username}` : web.member.name}</Text> : null}
      </View>
      {body}
    </ScrollView>
  );
}

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const ink = useInk();
  if (!text) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name={icon} size={17} color={PINK} />
      <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: ink.text("#3D4256") }}>{text}</Text>
    </View>
  );
}
