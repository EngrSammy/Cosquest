// "Your day", told by the Warden, on a card worth posting (costquest-ios
// Warden/RecapSheet.swift). The numbers are the server's (me.today); the
// story is the Warden's line for the day (the on-device model's when it is
// on, the authored one otherwise), said aloud unless the Warden is muted.
// iOS shares the card as an image (ImageRenderer); here the share sheet
// carries the same card as text (features/game/recap.ts shareText), as no
// view-capture module is in the app.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Share, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cardSubtitle, EMPTY_LINE, hasDayToTell, shareText, tiles, type Today, WAITING_LINE } from "@/features/game/recap";
import { gameStore, useGame } from "@/features/game/runtime";
import { recapMoment } from "@/features/game/warden";

import { Chip, GameButton, GamePanel, MAX_FONT_SCALE, withAlpha } from "./kit";
import { SheetHost } from "./Sheet";
import { SheetFrame } from "./SheetFrame";
import { SheetHeader } from "./SheetHeader";
import { GF, GP, realmColor } from "./theme";
import WardenBadge from "./WardenBadge";
import { wardenVoice } from "./wardenVoice";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export default function RecapSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: insets.top + 40, height: 90 }} scrimLabel="Close your day" onClose={onClose}>
      {(close) => <RecapBody close={close} />}
    </SheetHost>
  );
}

function RecapBody({ close }: { close: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const me = useGame((s) => s.me);
  const [story, setStory] = useState<string | null>(null);
  const tint = realmColor(me?.faction);
  const name = gameStore.playerName();
  const level = me?.standing.level ?? 1;
  const rank = me?.standing.rank ?? "Rookie";

  useEffect(() => {
    let alive = true;
    void (async () => {
      await gameStore.refreshMe();
      const s = gameStore.get();
      const m = recapMoment({ me: s.me, playerName: gameStore.playerName() }, s.war);
      if (!m || !alive) return;
      // The model gets 14 s to write the day; the authored line otherwise.
      const text = await wardenVoice.line(m, 14000);
      if (!alive) return;
      setStory(text);
      void wardenVoice.speak(m, 8000).catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, []);

  const today = me?.today ?? null;
  const share = (t: Today) =>
    void Share.share({ message: shareText({ name, level, rank, faction: me?.faction_name, today: t, story }) }).catch(() => {});

  return (
    <SheetFrame top={insets.top + 40}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <SheetHeader title="Your day" onClose={close} />
        {today && hasDayToTell(me) ? (
          <>
            <RecapCard name={name} faction={me?.faction_name} tint={tint} today={today} level={level} rank={rank} story={story} />
            {story ? (
              <Animated.View entering={FadeIn}>
                <GameButton title="Share your day" color={GP.sun} icon={<Ionicons name="share-outline" size={20} color="#FFF" />} onPress={() => share(today)} />
              </Animated.View>
            ) : null}
          </>
        ) : (
          <GamePanel>
            <View style={styles.emptyRow}>
              <WardenBadge tint={tint} size={56} />
              <Text style={styles.empty} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {EMPTY_LINE}
              </Text>
            </View>
          </GamePanel>
        )}
      </ScrollView>
    </SheetFrame>
  );
}

export function RecapCard({
  name,
  faction,
  tint,
  today,
  level,
  rank,
  story,
}: {
  name: string;
  faction?: string | null;
  tint: string;
  today: Today;
  level: number;
  rank: string;
  story: string | null;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <GamePanel padding={18}>
      <View style={{ gap: 14 }}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {name}
            </Text>
            <Text style={styles.sub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {cardSubtitle(level, rank, faction)}
            </Text>
          </View>
          <Chip text="CostQuest" color={tint} />
        </View>
        <View style={styles.tiles}>
          {tiles(today).map((t) => (
            <View key={t.label} style={[styles.tile, { backgroundColor: withAlpha(tint, 0.14) }]} accessible accessibilityLabel={`${t.value} ${t.label}`}>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {t.value}
              </Text>
              <Text style={styles.tileLabel}>{t.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>
        <View style={styles.storyRow}>
          <WardenBadge tint={tint} size={48} />
          {story ? (
            <Animated.Text entering={FadeIn.duration(400)} style={styles.story} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {story}
            </Animated.Text>
          ) : (
            <View style={styles.waiting}>
              <ActivityIndicator color={withAlpha(GP.ink, 0.6)} />
              <Text style={styles.waitingText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {WAITING_LINE}
              </Text>
            </View>
          )}
        </View>
        {today.best_place ? (
          <View style={styles.best}>
            <Ionicons name="star" size={14} color={GP.sunDeep} />
            <Text style={styles.bestText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Best stop: {today.best_place}
            </Text>
          </View>
        ) : null}
      </View>
    </GamePanel>
  );
}

const STYLE_PAIR = themedStyles({
  body: { paddingHorizontal: 18, gap: 18 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  empty: { flex: 1, fontFamily: GF.bold, fontSize: 17, color: GP.ink },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontFamily: GF.display, fontSize: 28, color: GP.ink },
  sub: { fontFamily: GF.bold, fontSize: 14, color: withAlpha(GP.ink, 0.6) },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 14 },
  tileValue: { fontFamily: GF.display, fontSize: 26, color: GP.ink },
  tileLabel: { fontFamily: GF.display, fontSize: 11, color: withAlpha(GP.ink, 0.55) },
  storyRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  story: { flex: 1, fontFamily: GF.bold, fontSize: 16, color: GP.ink },
  waiting: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  waitingText: { flex: 1, fontFamily: GF.body, fontSize: 15, color: withAlpha(GP.ink, 0.6) },
  best: { flexDirection: "row", alignItems: "center", gap: 6 },
  bestText: { fontFamily: GF.bold, fontSize: 14, color: GP.sunDeep },
});
