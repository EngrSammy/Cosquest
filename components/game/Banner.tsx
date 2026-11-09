// The big moment banner (costquest-ios UI/GameKit.swift GameBannerModel /
// GameBannerView): "Guardian beaten!", "Taken!", "Quest done!". Springs in
// from 0.3 scale, holds 2.2 s, flies out to the top; a success haptic and a
// sound with it. One at a time: a new banner replaces the one showing.
//   showBanner("Quest done!", { subtitle: "Three points today", color: GP.mint })
// GameRoot draws <GameBannerHost/> once, over everything.
import * as Haptics from "expo-haptics";
import { useEffect, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import Animated, { FadeOutUp } from "react-native-reanimated";

import { announce, GameTitle } from "./kit";
import { type GameSoundEffect, playSound } from "./sound";
import { ACCENT, labelOn } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { POP_IN_BANNER, usePopIn } from "./sheetMotion";

export type GameBanner = { id: number; title: string; subtitle?: string | null; color: string };

const HOLD_MS = 2200;
let current: GameBanner | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showBanner(title: string, opts: { subtitle?: string | null; color?: string; sound?: GameSoundEffect } = {}) {
  const banner: GameBanner = { id: ++seq, title, subtitle: opts.subtitle ?? null, color: opts.color ?? ACCENT.sun.fill };
  current = banner;
  emit();
  playSound(opts.sound ?? "reward");
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  announce(banner.subtitle ? `${title}. ${banner.subtitle}` : title);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (current?.id === banner.id) {
      current = null;
      emit();
    }
  }, HOLD_MS);
}

export function clearBanner() {
  current = null;
  emit();
}

function useBanner(): GameBanner | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

/** Drawn once by GameRoot; `top` is where the banner's centre line sits (iOS: 150 below the top). */
export function GameBannerHost({ top }: { top: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const banner = useBanner();
  // Grows in from small and stops dead (sheetMotion.ts); a fade under Reduce Motion.
  const enter = usePopIn(POP_IN_BANNER);
  // A banner left over when the game goes behind the chat should not wait there.
  useEffect(() => () => clearBanner(), []);
  if (!banner) return null;
  return (
    <View pointerEvents="none" style={[styles.host, { top }]} importantForAccessibility="no-hide-descendants">
      <Animated.View key={banner.id} entering={enter} exiting={FadeOutUp.duration(260)} style={styles.banner}>
        <GameTitle text={banner.title} size={46} />
        {banner.subtitle ? (
          <View style={[styles.subtitle, { backgroundColor: banner.color }]}>
            <Text style={[styles.subtitleText, { color: labelOn(banner.color) }]} maxFontSizeMultiplier={1.3}>
              {banner.subtitle}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  host: { position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 50 },
  banner: { alignItems: "center", gap: 6 },
  // A flat label in the moment's colour, its words in that colour's own label ink (never white on Sun).
  subtitle: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 10 },
  subtitleText: { fontFamily: GF.bold, fontSize: 17, lineHeight: 22 },
});
