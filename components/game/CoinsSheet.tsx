// CosCoins (costquest-ios Features/CoinsFeature.swift CoinsSheet): the
// balance, the packs sold through Stripe's hosted checkout where the web shop
// is allowed, and the ledger. Coins are bought, never earned, and the sheet
// says so. A purchase that lands plays the "+1,200 CosCoins added" moment.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type CoinHistoryRow,
  type CoinPack,
  COUNT_STEP_MS,
  COUNT_STEPS,
  countAt,
  deltaText,
  formatCoins,
  historyIcon,
  historyTitle,
  packLabel,
  packSub,
  packTag,
  packTagText,
  packTotal,
  priceText,
  relativeWhen,
} from "@/features/game/coins";

import { coinsStore, openCheckout, useCoins } from "./coinsModel";
import { GameButton, GameCoin, GamePanel, MAX_FONT_SCALE, announce, pressFeedback } from "./kit";
import { impact } from "./prefs";
import { SheetHost } from "./Sheet";
import { SheetFrame } from "./SheetFrame";
import { SheetHeader } from "./SheetHeader";
import { playSound } from "./sound";
import { ACCENT, ELEVATION, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { settle, SPRING_PRESS } from "@/features/game/spring";

export default function CoinsSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: insets.top + 40, height: 90 }} scrimLabel="Close CosCoins" onClose={onClose}>
      {(close) => <CoinsBody close={close} />}
    </SheetHost>
  );
}

function CoinsBody({ close }: { close: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const coins = useCoins();
  const packs = coinsStore.packs();
  const balance = coinsStore.displayBalance();
  const shop = coins.config !== null && packs.length > 0;
  const look = useLook();

  // On open, and back from the browser or the background (willEnterForeground).
  useEffect(() => {
    void coinsStore.refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void coinsStore.refresh();
    });
    return () => sub.remove();
  }, []);

  const buy = async (pack: CoinPack) => {
    const url = await coinsStore.buy(pack);
    if (url) await openCheckout(url);
  };

  return (
    <SheetFrame top={insets.top + 40}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <SheetHeader title="CosCoins" onClose={close} />
        <GamePanel>
          <View style={styles.balanceRow} accessible accessibilityLabel={`${balance} CosCoins`}>
            <GameCoin size={46} />
            <View style={{ gap: 2 }}>
              <Text style={styles.balance} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {formatCoins(balance)}
              </Text>
              <Text style={styles.balanceUnit} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                CosCoins
              </Text>
            </View>
          </View>
          <Text style={styles.small} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {"CosCoins are for use in CosQuest. They have no cash value and can't be withdrawn."}
          </Text>
        </GamePanel>

        {shop ? (
          <View style={{ gap: 10 }}>
            <SectionTitle text="Get CosCoins" />
            <View style={styles.grid}>
              {packs.map((p) => (
                <PackCard key={p.id} pack={p} disabled={coins.busy} onPress={() => void buy(p)} />
              ))}
            </View>
            {coins.problem ? <Text style={styles.problem}>{coins.problem}</Text> : null}
            <View style={styles.secure}>
              <Ionicons name="lock-closed" size={12} color={look.textMuted} />
              <Text style={styles.secureText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Payment is handled securely by Stripe.
              </Text>
            </View>
          </View>
        ) : coins.config !== null ? (
          // Outside the regions where the app may point at the web shop: said plainly, no other route.
          <GamePanel padding={14}>
            <View style={styles.notSold}>
              <Ionicons name="globe" size={22} color={ACCENT.sky.fill} />
              <Text style={styles.notSoldText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                CosCoins are sold in the US only for now.
              </Text>
            </View>
          </GamePanel>
        ) : null}

        <View style={{ gap: 10 }}>
          <SectionTitle text="History" />
          {coins.history.length === 0 ? (
            <Text style={styles.empty} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              No coins in or out yet. Every pack you buy and every coin you spend lands here.
            </Text>
          ) : (
            <GamePanel padding={6}>
              {coins.history.map((row, i) => (
                <View key={row.id}>
                  <HistoryLine row={row} />
                  {i < coins.history.length - 1 ? <View style={styles.rule} /> : null}
                </View>
              ))}
            </GamePanel>
          )}
        </View>
      </ScrollView>
      {coins.gained !== null ? <GainedMoment coins={coins.gained} onDone={() => coinsStore.dismissGained()} /> : null}
    </SheetFrame>
  );
}

function SectionTitle({ text }: { text: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Text style={styles.section} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
      {text}
    </Text>
  );
}

const PRESS = SPRING_PRESS;

/** One pack, as a flat printed card like the Nearby cards (CoinPackCard), pressed in like them (CardPress). */
function PackCard({ pack, disabled, onPress }: { pack: CoinPack; disabled: boolean; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const tag = packTag(pack);
  const look = useLook();
  const down = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.05 * down.get() }] }));
  return (
    <Pressable
      style={styles.packWrap}
      disabled={disabled}
      onPressIn={() => {
        pressFeedback();
        down.set(withSpring(1, PRESS));
      }}
      onPressOut={() => {
        down.set(withSpring(0, PRESS));
      }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={packLabel(pack)}
      accessibilityState={{ disabled }}>
      <Animated.View style={[style, disabled && { opacity: 0.6 }]}>
        <View style={[styles.pack, tag === "best_value" && styles.packBest, !look.dark && ELEVATION.low]}>
          <View style={styles.packTop}>
            <GameCoin size={30} />
            {tag ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{packTagText(tag)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.packTotal} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {formatCoins(packTotal(pack))}
          </Text>
          <Text style={styles.packSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {packSub(pack)}
          </Text>
          <View style={styles.price}>
            <Text style={styles.priceText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {priceText(pack)}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function HistoryLine({ row }: { row: CoinHistoryRow }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const up = row.delta >= 0;
  const look = useLook();
  const ok = look.dark ? TEXT_ON_DARK.success : TEXT_ON_LIGHT.success;
  const title = row.label ?? historyTitle(row.kind);
  const [now] = useState(() => Date.now());
  const when = relativeWhen(row.at, now);
  return (
    <View style={styles.line} accessible accessibilityLabel={`${title}, ${when}, ${up ? "plus" : "minus"} ${Math.abs(row.delta)} CosCoins`}>
      <Ionicons name={historyIcon(row.kind)} size={18} color={up ? ok : look.textMuted} style={{ width: 22 }} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.lineTitle} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {title}
        </Text>
        <Text style={styles.lineWhen} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {when}
        </Text>
      </View>
      {row.receipt_url ? (
        <Pressable onPress={() => void Linking.openURL(row.receipt_url!)} hitSlop={8} accessibilityRole="link" accessibilityLabel={`Receipt for ${title}`}>
          <Ionicons name="document-text" size={16} color={look.dark ? TEXT_ON_DARK.info : TEXT_ON_LIGHT.info} />
        </Pressable>
      ) : null}
      <Text style={[styles.delta, { color: up ? ok : look.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {deltaText(row.delta)}
      </Text>
    </View>
  );
}

/** "+1,200 CosCoins added": the count runs up, then settles (CoinsGainedMoment). */
function GainedMoment({ coins, onDone }: { coins: number; onDone: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? COUNT_STEPS : 0);
  const landed = useSharedValue(reduce ? 1 : 0.6);
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ scale: landed.get() }] }));
  useEffect(() => {
    landed.set(withSpring(1, settle(0.45)));
    announce(`${coins} CosCoins added`);
    let i = reduce ? COUNT_STEPS : 0;
    const t = setInterval(() => {
      i += 1;
      setStep(Math.min(i, COUNT_STEPS));
      if (i >= COUNT_STEPS) {
        clearInterval(t);
        playSound("reward");
        impact(Haptics.ImpactFeedbackStyle.Medium);
      }
    }, COUNT_STEP_MS);
    return () => clearInterval(t);
  }, [coins, landed, reduce]);
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.moment} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityLabel="Close the coins moment" />
      <View style={styles.momentCol} accessible accessibilityLabel={`${coins} CosCoins added`}>
        <Animated.View style={coinStyle}>
          <GameCoin size={84} />
        </Animated.View>
        <Text style={styles.momentCount}>+{formatCoins(countAt(coins, step))}</Text>
        <Text style={styles.momentLine}>CosCoins added</Text>
      </View>
      <GameButton title="Nice" color={ACCENT.sun.fill} onPress={onDone} style={{ alignSelf: "center", marginTop: 6 }} />
    </Animated.View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    body: { paddingHorizontal: 18, gap: 18 },
    balanceRow: { flexDirection: "row", alignItems: "center", gap: 14 },
    balance: { fontFamily: GF.display, fontSize: 40, lineHeight: 44, color: L.text, fontVariant: ["tabular-nums"] },
    balanceUnit: { fontFamily: GF.body, fontSize: 14, color: L.textMuted },
    small: { marginTop: 10, fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
    section: { paddingTop: 4, paddingLeft: 4, fontFamily: GF.display, fontSize: 20, lineHeight: 24, color: L.text },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
    packWrap: { width: "48%" },
    pack: { gap: 8, padding: 12, borderRadius: RADIUS.card, backgroundColor: L.surface, borderWidth: 2, borderColor: "transparent" },
    packBest: { borderColor: ACCENT.coin.fill },
    packTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 4 },
    tag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: RADIUS.chip, backgroundColor: ACCENT.coin.fill },
    tagText: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 0.4, color: ACCENT.coin.label },
    packTotal: { fontFamily: GF.display, fontSize: 26, lineHeight: 30, color: L.text, fontVariant: ["tabular-nums"] },
    packSub: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
    // The price is the button: Sun with an ink label (never white on Sun).
    price: { alignItems: "center", paddingVertical: 8, borderRadius: 12, backgroundColor: ACCENT.sun.fill, borderBottomWidth: 3, borderBottomColor: ACCENT.sun.edge },
    priceText: { fontFamily: GF.display, fontSize: 17, lineHeight: 21, color: ACCENT.sun.label },
    problem: { fontFamily: GF.bold, fontSize: 14, color: TEXT_ON_LIGHT.danger },
    secure: { flexDirection: "row", alignItems: "center", gap: 6 },
    secureText: { fontFamily: GF.regular, fontSize: 12, color: L.textMuted },
    notSold: { flexDirection: "row", alignItems: "center", gap: 12 },
    notSoldText: { flex: 1, fontFamily: GF.body, fontSize: 16, lineHeight: 21, color: L.text },
    empty: { fontFamily: GF.regular, fontSize: 14, lineHeight: 20, color: L.textMuted, paddingHorizontal: 4 },
    rule: { height: 1, marginHorizontal: 10, backgroundColor: L.hairline },
    line: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
    lineTitle: { fontFamily: GF.bold, fontSize: 15, color: L.text },
    lineWhen: { fontFamily: GF.regular, fontSize: 12, color: L.textMuted },
    delta: { fontFamily: GF.display, fontSize: 17, fontVariant: ["tabular-nums"] },
    moment: { ...StyleSheet.absoluteFill, backgroundColor: L.scrim, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
    momentCol: { alignItems: "center", gap: 14 },
    momentCount: { fontFamily: GF.display, fontSize: 56, lineHeight: 60, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
    momentLine: { fontFamily: GF.bold, fontSize: 18, color: "#F3F0E8" },
  },
  {
    balance: { color: D.text },
    balanceUnit: { color: D.textMuted },
    small: { color: D.textMuted },
    section: { color: D.text },
    pack: { backgroundColor: D.surface, borderColor: D.hairline },
    packBest: { borderColor: ACCENT.coin.fill },
    packTotal: { color: D.text },
    packSub: { color: D.textMuted },
    problem: { color: TEXT_ON_DARK.danger },
    secureText: { color: D.textMuted },
    notSoldText: { color: D.text },
    empty: { color: D.textMuted },
    rule: { backgroundColor: D.hairline },
    lineTitle: { color: D.text },
    lineWhen: { color: D.textMuted },
    moment: { backgroundColor: D.scrim },
  },
);
