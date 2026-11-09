// The player's journal: today's dailies and streak, the Codex (the cards
// earned by playing points, sets, foils), and this week's faction war and
// leaders. The server decides every card and every number; this draws them.
// costquest-ios Roam/RoamSheets.swift (DailiesSheet, DailyRow, WarSheet,
// WarBar), Features/CodexFeature.swift (CodexSheet).
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  countChips,
  dailyFraction,
  dailyLabel,
  dailyProgressText,
  endsIn,
  groupByRealm,
  orderSets,
  realmTitle,
  regionName,
  resetTime,
  setFraction,
  setLabel,
  showBestStreak,
  streakLine,
  streakTitle,
  topPoints,
  warBarWidth,
  warFooter,
} from "@/features/game/journal";
import { hasDayToTell } from "@/features/game/recap";
import { gameStore, useGame } from "@/features/game/runtime";
import type { GameState } from "@/features/game/store";
import { unlocked } from "@/features/game/unlocks";
import { startWardenModel, useWardenModel } from "@/features/game/wardenModel";
import type { CodexCard, FactionWar } from "@/features/game/wire";

import { CodexBar, XPBar } from "./Bars";
import CodexDetail, { CodexTile } from "./CodexDetail";
import { Chip, GameButton, GameHeading, GamePanel, MAX_FONT_SCALE, ProgressBar } from "./kit";
import LiveStampCard from "./LiveStampCard";
import { SheetHost } from "./Sheet";
import { SheetHeader } from "./SheetHeader";
import { SheetFrame } from "./SheetFrame";
import StepsCard from "./StepsCard";
import { GF, GP, realmColor, realmIcon } from "./theme";
import { wardenVoice } from "./wardenVoice";
import { ACCENT, labelOn, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { ErrorState } from "@/components/kit";

type Tab = "today" | "codex" | "war";

const TITLES: Record<Tab, string> = { today: "Daily quests", codex: "Codex", war: "Faction war" };
const TAB_NAMES: Record<Tab, string> = { today: "Dailies", codex: "Codex", war: "Faction war" };
const DONE_FACE = "#E3F4EA";
const L = SURFACES.light;
const D = SURFACES.dark;

/** While a list loads: its shape in the well colour, not a bare spinner. */
function Skeleton({ rows = 3 }: { rows?: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={{ gap: 16 }} accessible accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeleton}>
          <View style={[styles.skeletonLine, { width: "55%" }]} />
          <View style={[styles.skeletonLine, { width: "85%", height: 10 }]} />
        </View>
      ))}
    </View>
  );
}

type JournalProps = {
  onClose: () => void;
  initial?: Tab;
  /** Opens "Your day" (RecapSheet) when the player has played today. */
  onRecap?: () => void;
};

export default function Journal(props: JournalProps) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: insets.top + 40, height: 130 }} scrimLabel="Close the journal" onClose={props.onClose}>
      {(close) => <JournalSheet {...props} close={close} />}
    </SheetHost>
  );
}

function JournalSheet({ close, initial = "today", onRecap }: JournalProps & { close: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(initial);
  const me = useGame((s) => s.me);
  const codex = useGame((s) => s.codex);
  const war = useGame((s) => s.war);
  const leaders = useGame((s) => s.leaders);
  const [codexTried, setCodexTried] = useState(false);
  const [codexFailed, setCodexFailed] = useState(false);
  const [warTried, setWarTried] = useState(false);
  const [picked, setPicked] = useState<CodexCard | null>(null);

  const fetchCodex = useCallback(() => {
    gameStore
      .refreshCodex()
      .then((got) => setCodexFailed(!got))
      .finally(() => setCodexTried(true));
  }, []);
  const loadCodex = useCallback(() => {
    setCodexFailed(false);
    fetchCodex();
  }, [fetchCodex]);

  useEffect(() => {
    if (tab === "codex") fetchCodex();
  }, [tab, fetchCodex]);
  // Android Back closes an open card first, then the sheet (the root's handler).
  useEffect(() => {
    if (!picked) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setPicked(null);
      return true;
    });
    return () => sub.remove();
  }, [picked]);
  useEffect(() => {
    void gameStore.refreshMe();
    gameStore.refreshWar().finally(() => setWarTried(true));
  }, []);

  return (
    <SheetFrame top={insets.top + 40}>
      <View style={styles.head}>
        <SheetHeader title={TITLES[tab]} onClose={close} />
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(["today", "codex", "war"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              setPicked(null);
              setTab(t);
            }}
            style={[styles.tab, tab === t && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {TAB_NAMES[t]}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {tab === "today" ? (
          me ? (
            <>
              <GamePanel>
                <View style={styles.streakRow} accessible accessibilityLabel={`${streakTitle(me.streak)}. ${streakLine(me.streak)}${showBestStreak(me.streak) ? ` Best ${me.streak.best}.` : ""}`}>
                  <Ionicons name="flame" size={34} color={me.streak.days > 0 ? ACCENT.sun.fill : look.textMuted} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.streakTitle}>{streakTitle(me.streak)}</Text>
                    <Text style={styles.streakLine}>{streakLine(me.streak)}</Text>
                  </View>
                  {showBestStreak(me.streak) ? (
                    <View style={{ alignItems: "center" }}>
                      <Text style={styles.bestNum}>{me.streak.best}</Text>
                      <Text style={styles.bestLabel}>best</Text>
                    </View>
                  ) : null}
                </View>
              </GamePanel>
              <LiveStampCard me={me} />
              {me.dailies.map((d) => (
                <GamePanel key={d.id} face={d.done ? DONE_FACE : GP.cream}>
                  <View accessible accessibilityLabel={dailyLabel(d)} style={{ gap: 10 }}>
                    <View style={styles.dailyHead}>
                      <Ionicons name={d.done ? "checkmark-circle" : "locate"} size={24} color={d.done ? ACCENT.mint.fill : ACCENT.sky.fill} />
                      <Text style={styles.dailyTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                        {d.title}
                      </Text>
                      <Text style={styles.dailyXp} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`+${d.reward.xp} XP`}</Text>
                    </View>
                    <XPBar progress={dailyFraction(d)} />
                    <Text style={styles.dailyLine}>{dailyProgressText(d)}</Text>
                  </View>
                </GamePanel>
              ))}
              {unlocked(me, "walking") ? <StepsCard /> : null}
              <Text style={styles.footnote}>{`New quests every day at ${resetTime()}.`}</Text>
              <WardenCard />
              {me.today && hasDayToTell(me) && onRecap ? (
                <GameButton title="Your day" color={GP.sun} onPress={onRecap} />
              ) : me.today && !onRecap ? (
                <Text style={styles.footnote}>
                  Today: {me.today.points_played} points, {me.today.correct} won, {me.today.xp} XP{me.today.best_place ? `. Best: ${me.today.best_place}` : ""}.
                </Text>
              ) : null}
            </>
          ) : (
            <Skeleton />
          )
        ) : tab === "codex" ? (
          <CodexBody
            codex={codex}
            tried={codexTried}
            failed={codexFailed}
            onRetry={loadCodex}
            onPick={setPicked}
          />
        ) : (
          <WarBody war={war} leaders={leaders} mine={me?.faction ?? null} tried={warTried} />
        )}
      </ScrollView>
      {picked ? <CodexDetail card={picked} onClose={() => setPicked(null)} /> : null}
    </SheetFrame>
  );
}

// ---------- the Codex ----------

function CodexBody({
  codex,
  tried,
  failed,
  onRetry,
  onPick,
}: {
  codex: GameState["codex"];
  tried: boolean;
  failed: boolean;
  onRetry: () => void;
  onPick: (card: CodexCard) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [gridWidth, setGridWidth] = useState(0);
  if (codex) {
    const tile = gridWidth > 0 ? Math.floor((gridWidth - 20) / 3) : 0;
    return (
      <>
        <View style={styles.chips}>
          {countChips(codex.counts).map((c, i) => (
            <Chip key={c} text={c} color={i === 0 ? ACCENT.sky.fill : ACCENT.sun.fill} />
          ))}
        </View>
        {codex.sets.length ? (
          <GamePanel>
            <View style={{ gap: 12 }}>
              <Text style={styles.panelTitle}>Sets</Text>
              {orderSets(codex.sets).map((s) => (
                <View key={s.id} accessible accessibilityLabel={setLabel(s)} style={{ gap: 4 }}>
                  <View style={styles.setRow}>
                    {s.done ? <Ionicons name="checkmark-circle" size={18} color={ACCENT.mint.fill} /> : null}
                    <Text style={styles.setTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {s.title}
                    </Text>
                    <Text style={styles.setCount}>{`${s.progress}/${s.target}`}</Text>
                  </View>
                  <CodexBar progress={setFraction(s)} done={s.done} />
                </View>
              ))}
            </View>
          </GamePanel>
        ) : null}
        {codex.cards.length === 0 ? (
          <GamePanel>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Ionicons name="albums" size={36} color={ACCENT.sun.edge} />
              <Text style={styles.emptyText}>No cards yet</Text>
              <Text style={styles.emptyLine}>Win at any Quest Point and its card lands here, foil if you beat the clock.</Text>
            </View>
          </GamePanel>
        ) : (
          groupByRealm(codex.cards).map((g) => {
            const title = realmTitle(g);
            return (
              <View key={g.realm} style={{ gap: 10 }}>
                <View accessible accessibilityRole="header" accessibilityLabel={`${title}, ${g.cards.length}`} style={styles.realmHead}>
                  <View style={[styles.realmDot, { backgroundColor: realmColor(g.realm) }]}>
                    <Ionicons name={realmIcon(g.realm)} size={17} color={labelOn(realmColor(g.realm))} />
                  </View>
                  <GameHeading text={title} size={24} />
                  <Text style={styles.realmCount}>{g.cards.length}</Text>
                </View>
                <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
                  {tile > 0
                    ? g.cards.map((c) => <CodexTile key={c.point_id} card={c} width={tile} onPress={() => onPick(c)} />)
                    : null}
                </View>
              </View>
            );
          })
        )}
      </>
    );
  }
  if (failed || tried) {
    return (
      <GamePanel>
        {/* Task 059: the shared kit's error state, in the game's tone. */}
        <ErrorState tone="game" compact title="Couldn't load your Codex" onRetry={onRetry} />
      </GamePanel>
    );
  }
  return <Skeleton />;
}

// ---------- the war ----------

function WarBody({ war, leaders, mine, tried }: { war: FactionWar | null; leaders: GameState["leaders"]; mine: string | null; tried: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  return (
    <>
      {war ? (
        <GamePanel>
          <View style={{ gap: 12 }}>
            <View style={styles.warHead}>
              <Text style={styles.warRegion} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header">
                {regionName(war.region)}
              </Text>
              <Text style={styles.warEnds}>{endsIn(war.ends_at)}</Text>
            </View>
            {war.standings.map((s) => (
              <WarBar key={s.faction} standing={s} top={topPoints(war)} mine={s.faction === mine} />
            ))}
            <Text style={styles.warFooter}>{warFooter(war)}</Text>
          </View>
        </GamePanel>
      ) : tried ? (
        <Text style={styles.footnote}>No war in this region yet. Take a Quest Point and your house starts one.</Text>
      ) : (
        <Skeleton rows={2} />
      )}
      {leaders?.leaders.length ? (
        <GamePanel>
          <View style={{ gap: 10 }}>
            <Text style={styles.panelTitle} accessibilityRole="header">
              Top players this week
            </Text>
            {leaders.leaders.slice(0, 10).map((l) => (
              <View
                key={l.place}
                accessible
                accessibilityLabel={`${l.place}, ${l.handle}${l.you ? ", you" : ""}, level ${l.level}, ${l.week_xp} XP`}
                style={[styles.leader, l.you && styles.leaderYou]}>
                <Text style={[styles.place, { color: l.place <= 3 ? (look.dark ? TEXT_ON_DARK.warning : TEXT_ON_LIGHT.warning) : look.textMuted }]}>{l.place}</Text>
                <View style={[styles.dot, { backgroundColor: realmColor(l.faction) }]} />
                <Text style={styles.leaderName} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {l.handle}
                </Text>
                <Text style={styles.leaderLevel}>{`Lv ${l.level}`}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.leaderXp}>{`${l.week_xp} XP`}</Text>
              </View>
            ))}
          </View>
        </GamePanel>
      ) : null}
    </>
  );
}

/** WarBar: a house against the top one, never thinner than a nub of 10. */
function WarBar({ standing, top, mine }: { standing: FactionWar["standings"][number]; top: number; mine: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [track, setTrack] = useState(0);
  const colour = realmColor(standing.faction);
  return (
    <View accessible accessibilityLabel={`${standing.name}${mine ? ", you" : ""}, ${standing.points} points`} style={{ gap: 4 }}>
      <View style={styles.warRow}>
        <Ionicons name={realmIcon(standing.faction)} size={17} color={colour} />
        <Text style={styles.warName} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {standing.name}
        </Text>
        {mine ? <Chip text="You" color={colour} /> : null}
        <View style={{ flex: 1 }} />
        <Text style={styles.warName}>{standing.points}</Text>
      </View>
      <View style={styles.warTrack} onLayout={(e) => setTrack(e.nativeEvent.layout.width)}>
        <View style={{ width: Math.min(track, warBarWidth(standing.points, top, track)), height: 12, borderRadius: 6, backgroundColor: colour }} />
      </View>
    </View>
  );
}

/** The Warden's voice on this phone: fetch the model, and what it measures. */
function WardenCard() {
  const styles = useThemedStyles(STYLE_PAIR);
  const model = useWardenModel();
  const mb = model.bytes ? Math.round(model.bytes / 1048576) : null;
  const text =
    model.phase === "unsupported"
      ? "The Warden speaks its written lines on this phone."
      : model.phase === "too-small"
        ? "This phone is too small to hold the Warden's model, so it speaks its written lines."
        : model.phase === "off"
          ? "Let the Warden write its own lines here, on this phone, with no network. A one-time download."
          : model.phase === "downloading"
            ? `Downloading ${model.label ?? "the model"}: ${Math.round((model.progress ?? 0) * 100)}%${mb ? ` of ${mb} MB` : ""}`
            : model.phase === "verifying"
              ? "Checking every byte…"
              : model.phase === "loading"
                ? "Waking the Warden…"
                : model.phase === "ready"
                  ? `${model.label} is writing lines here.${model.tokensPerSecond ? ` ${model.tokensPerSecond.toFixed(1)} words a second, first word in ${((model.firstTokenMs ?? 0) / 1000).toFixed(1)} s.` : ""} ${model.written} written, ${model.rejected} rejected.`
                  : `The model could not start: ${model.error ?? "unknown"}. The written lines speak meanwhile.`;
  return (
    <GamePanel padding={14}>
      <View style={styles.wardenRow}>
        <Ionicons name="eye" size={26} color={ACCENT.sky.fill} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.wardenTitle}>{"The Warden's voice"}</Text>
          <Text style={styles.wardenText}>{text}</Text>
          {model.phase === "downloading" ? <ProgressBar value={model.progress ?? 0} color={ACCENT.sky.fill} /> : null}
          {model.phase === "off" || model.phase === "failed" ? (
            <GameButton
              title={model.phase === "failed" ? "Try again" : "Download"}
              size="small"
              color={ACCENT.sky.fill}
              accessibilityLabel="Download the Warden's model"
              onPress={() => startWardenModel((w) => wardenVoice.setWriter(w))}
              style={{ alignSelf: "flex-start" }}
            />
          ) : null}
        </View>
      </View>
    </GamePanel>
  );
}

const STYLE_PAIR = themedStyles(
  {
    head: { paddingHorizontal: 18 },
    // A segmented control: a well, the chosen tab a paper pill on it.
    tabs: { flexDirection: "row", gap: 4, marginHorizontal: 16, marginVertical: 8, padding: 4, borderRadius: RADIUS.button, backgroundColor: L.surfaceAlt },
    tab: { flex: 1, paddingHorizontal: 10, minHeight: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    tabOn: { backgroundColor: L.surface },
    tabText: { fontFamily: GF.body, fontSize: 14, lineHeight: 18, letterSpacing: 0.2, color: L.textMuted },
    tabTextOn: { color: L.text },
    body: { paddingHorizontal: 18, paddingTop: 6, gap: 16 },
    skeleton: { gap: 10, padding: 18, borderRadius: RADIUS.card, backgroundColor: L.surface },
    skeletonLine: { height: 14, borderRadius: 7, backgroundColor: L.surfaceAlt },
    streakRow: { flexDirection: "row", alignItems: "center", gap: 14 },
    streakTitle: { fontFamily: GF.display, fontSize: 24, lineHeight: 28, color: L.text },
    streakLine: { fontFamily: GF.regular, fontSize: 14, lineHeight: 20, color: L.textMuted },
    bestNum: { fontFamily: GF.display, fontSize: 20, lineHeight: 24, color: L.textMuted },
    bestLabel: { fontFamily: GF.body, fontSize: 12, lineHeight: 16, color: L.textMuted },
    dailyHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    dailyTitle: { flex: 1, fontFamily: GF.bold, fontSize: 18, lineHeight: 22, color: L.text },
    dailyXp: { fontFamily: GF.display, fontSize: 16, lineHeight: 20, color: TEXT_ON_LIGHT.info },
    dailyLine: { fontFamily: GF.regular, fontSize: 14, lineHeight: 19, color: L.textMuted },
    footnote: { fontFamily: GF.regular, fontSize: 14, lineHeight: 20, color: L.textMuted, paddingHorizontal: 4 },
    chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    panelTitle: { fontFamily: GF.bold, fontSize: 20, lineHeight: 24, color: L.text },
    setRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    setTitle: { flex: 1, fontFamily: GF.body, fontSize: 15, lineHeight: 20, color: L.text },
    setCount: { fontFamily: GF.display, fontSize: 14, lineHeight: 18, color: L.textMuted, fontVariant: ["tabular-nums"] },
    emptyText: { fontFamily: GF.bold, fontSize: 18, lineHeight: 22, color: L.text, textAlign: "center" },
    emptyLine: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted, textAlign: "center" },
    realmHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    realmDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    realmCount: { fontFamily: GF.display, fontSize: 18, lineHeight: 22, color: L.textMuted },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    warHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    warRegion: { flexShrink: 1, fontFamily: GF.display, fontSize: 24, lineHeight: 28, color: L.text },
    warEnds: { fontFamily: GF.regular, fontSize: 13, lineHeight: 17, color: L.textMuted },
    warRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    warName: { fontFamily: GF.bold, fontSize: 16, lineHeight: 20, color: L.text },
    warTrack: { height: 12, borderRadius: 6, backgroundColor: "rgba(28,43,58,0.10)", overflow: "hidden" },
    warFooter: { fontFamily: GF.regular, fontSize: 14, lineHeight: 20, color: L.textMuted },
    leader: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4, paddingHorizontal: 4, borderRadius: RADIUS.chip },
    leaderYou: { backgroundColor: "rgba(245,158,42,0.16)" },
    place: { width: 28, fontFamily: GF.display, fontSize: 18, lineHeight: 22, textAlign: "center" },
    dot: { width: 12, height: 12, borderRadius: 6 },
    leaderName: { flexShrink: 1, fontFamily: GF.body, fontSize: 16, lineHeight: 20, color: L.text },
    leaderLevel: { fontFamily: GF.regular, fontSize: 13, lineHeight: 17, color: L.textMuted },
    leaderXp: { fontFamily: GF.display, fontSize: 16, lineHeight: 20, color: L.text, fontVariant: ["tabular-nums"] },
    wardenRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    wardenTitle: { fontFamily: GF.bold, fontSize: 17, lineHeight: 22, color: L.text },
    wardenText: { fontFamily: GF.regular, fontSize: 14, lineHeight: 19, color: L.textMuted },
  },
  {
    tabs: { backgroundColor: D.surfaceAlt },
    tabOn: { backgroundColor: D.surface },
    tabText: { color: D.textMuted },
    tabTextOn: { color: D.text },
    skeleton: { backgroundColor: D.surface },
    skeletonLine: { backgroundColor: D.surfaceAlt },
    streakTitle: { color: D.text },
    streakLine: { color: D.textMuted },
    bestNum: { color: D.textMuted },
    bestLabel: { color: D.textMuted },
    dailyTitle: { color: D.text },
    dailyXp: { color: TEXT_ON_DARK.info },
    dailyLine: { color: D.textMuted },
    footnote: { color: D.textMuted },
    panelTitle: { color: D.text },
    setTitle: { color: D.text },
    setCount: { color: D.textMuted },
    emptyText: { color: D.text },
    emptyLine: { color: D.textMuted },
    realmCount: { color: D.textMuted },
    warRegion: { color: D.text },
    warEnds: { color: D.textMuted },
    warName: { color: D.text },
    warTrack: { backgroundColor: "rgba(255,255,255,0.10)" },
    warFooter: { color: D.textMuted },
    leaderName: { color: D.text },
    leaderLevel: { color: D.textMuted },
    leaderXp: { color: D.text },
    wardenTitle: { color: D.text },
    wardenText: { color: D.textMuted },
  },
);
