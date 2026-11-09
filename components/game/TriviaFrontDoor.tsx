// The trivia front door (cosquest://trivia, the /trivia route): CosQuest
// trivia with no location, no walking and no sign-up. Mark, 1 Nov 2026:
// trivia ships first, playable without location, shareable, a thing people
// can watch and play while the rest of the game is built.
//
// The game is the server's trivia run (a Pocket Run with no fights and one
// global board, ubmids/costquest-backend roam_trivia.py). This screen reuses
// the run's own pieces (Run.tsx: the HUD, the tile board, the challenge, the
// results with Share) and adds the door: who is playing, the Play button and
// today's top players, refreshed while you watch.
//
// Who plays: the signed-in player when one login gave one; with no chat login
// at all, this phone's own key (a guest). A signed-in chat user whose game
// account has not loaded is asked, as the game asks (SsoProblemPanel), rather
// than being moved to this phone's key without a word.
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { triviaOnlyWeb } from "@/features/game/config";
import { isLive, isTrivia, type RunPoint, triviaSub } from "@/features/game/run";
import { gameStore, useGame } from "@/features/game/runtime";
import { useAppSelector } from "@/store/hooks";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

import { GAME_FONTS } from "./fonts";
import { GameBackdrop } from "./GameBackdrop";
import { announce, GameButton, GameIconButton, MAX_FONT_SCALE } from "./kit";
import { ACCENT, GameSchemeProvider, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { impact } from "./prefs";
import { BountyBoard, RunChallenge, RunHUD, RunResults, RunTray } from "./Run";
import { runModel, useRun } from "./runModel";
import { POP_IN_COUNT, usePopIn } from "./sheetMotion";
import { playSound } from "./sound";
import { GF, GP } from "./theme";

const L = SURFACES.light;
const D = SURFACES.dark;
/** The public web page (<game server>/play): trivia is the whole site, nothing to close to. */
const TRIVIA_ONLY = triviaOnlyWeb(process.env.EXPO_PUBLIC_TRIVIA_WEB, Platform.OS);
/** How often the board is read again while you watch it. */
const WATCH_MS = 20000;

export default function TriviaFrontDoor() {
  return (
    <GameSchemeProvider>
      <Door />
    </GameSchemeProvider>
  );
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

function Door() {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const [fontsReady, fontsError] = useFonts(GAME_FONTS);
  const session = useGame((s) => s.session);
  const chatToken = useAppSelector((s) => s.auth.token);
  const s = useRun();
  const live = isLive(s.run);
  const [runPoint, setRunPoint] = useState<RunPoint | null>(null);

  // A guest: no chat login, so this phone's own key is the player.
  useEffect(() => {
    if (!session && !chatToken) void gameStore.playOnThisPhone();
  }, [session, chatToken]);

  // A player: pick up a run already on (or one that ended while away), and today's runs left.
  const playerKey = session?.playerKey ?? null;
  useEffect(() => {
    if (!playerKey) return;
    void runModel.resume();
    void runModel.loadAllowance();
  }, [playerKey]);

  // Today's top players, read again every 20 s while nobody is mid-run: the thing to watch.
  useEffect(() => {
    if (live) return;
    void runModel.loadTriviaBoard();
    const t = setInterval(() => void runModel.loadTriviaBoard(), WATCH_MS);
    return () => clearInterval(t);
  }, [live, playerKey]);

  if (!fontsReady && !fontsError) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={GP.mist} size="large" />
      </View>
    );
  }

  const otherRun = live && s.run && !isTrivia(s.run);
  return (
    <View style={styles.fill}>
      <GameBackdrop />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        {TRIVIA_ONLY ? null : <GameIconButton icon="close" diameter={40} accessibilityLabel="Leave trivia" onPress={leave} />}
        {live && !otherRun ? (
          <View style={{ flex: 1 }}>
            <RunHUD />
          </View>
        ) : null}
      </View>
      {!session ? (
        chatToken ? (
          <AccountNotLoaded />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={GP.mist} size="large" />
          </View>
        )
      ) : otherRun ? (
        <View style={[styles.center, styles.pad]}>
          <Text style={styles.title}>A Quest Run is on</Text>
          <Text style={styles.lead}>Finish it in the game first, then come back for trivia.</Text>
          <GameButton title="Back" color={GP.sun} onPress={leave} style={{ alignSelf: "stretch" }} />
        </View>
      ) : live ? (
        <View style={[styles.fill, { paddingTop: 8, paddingBottom: insets.bottom + 8 }]}>
          <RunTray fill onPick={setRunPoint} onEnd={() => void runModel.finish()} distanceOf={() => null} inReach={() => true} />
        </View>
      ) : (
        <StartView />
      )}

      {runPoint ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
          <RunChallenge key={runPoint.idx} point={runPoint} onDone={() => setRunPoint(null)} />
        </Animated.View>
      ) : s.finished && isTrivia(s.finished.run) ? (
        <Animated.View entering={FadeIn.duration(220)} style={StyleSheet.absoluteFill}>
          <RunResults
            result={s.finished}
            board={s.board}
            onClose={() => {
              runModel.close();
              void runModel.loadAllowance();
              void runModel.loadTriviaBoard();
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Play, the name on the board, and today's top players. */
function StartView() {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const look = useLook();
  const s = useRun();
  const profile = useGame((g) => g.profile);
  const [name, setName] = useState<string | null>(null);
  const [counting, setCounting] = useState<number | null>(null);
  const countIn = usePopIn(POP_IN_COUNT);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    runModel.clearProblem();
    return () => {
      alive.current = false;
    };
  }, []);

  const saved = profile?.handle ?? "";
  const shownName = name ?? saved;
  const out = s.triviaLeft === 0;

  const play = async () => {
    // The name on the board and on a shared card: saved only when it changed (2 to 24 letters).
    const want = shownName.trim();
    if (want.length >= 2 && want !== saved) {
      try {
        await (profile?.avatar ? gameStore.saveProfile(want.slice(0, 24), profile.avatar) : gameStore.saveProfile(want.slice(0, 24)));
        // The server keeps the name it may show in public (a rude name or a link
        // comes back as a neutral one); the field shows that from now on.
        if (alive.current) setName(null);
      } catch {
        // Plays on as "Player"; the name can be set next time.
      }
    }
    if (!(await runModel.start("trivia", null))) return;
    for (const n of [3, 2, 1]) {
      if (!alive.current) return;
      setCounting(n);
      announce(String(n));
      playSound("tap");
      impact(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise((r) => setTimeout(r, 650));
    }
    if (!alive.current) return;
    setCounting(0);
    announce("Go!");
    await new Promise((r) => setTimeout(r, 450));
    if (alive.current) setCounting(null);
  };

  if (counting !== null) {
    return (
      <View style={styles.center}>
        <Animated.Text key={counting} entering={countIn} exiting={FadeOut} style={[styles.count, counting === 0 && { color: ACCENT.mint.fill }]}>
          {counting === 0 ? "GO!" : counting}
        </Animated.Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.pad, { gap: 16, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.kicker}>COSQUEST</Text>
      <Text style={styles.display} accessibilityRole="header">
        Trivia
      </Text>
      <Text style={styles.lead} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        Ten tiles: trivia, picture puzzles, famous quotes, quick-fire rounds and put-in-order. 15 minutes on the clock. No walking and no location needed.
      </Text>
      <View style={styles.nameRow}>
        <Ionicons name="person" size={18} color={look.textMuted} />
        <TextInput
          value={shownName}
          onChangeText={setName}
          placeholder="Your name on the board"
          placeholderTextColor={look.textMuted}
          maxLength={24}
          autoCorrect={false}
          returnKeyType="done"
          style={[styles.nameInput, { color: look.text }]}
          accessibilityLabel="Your name on the board"
          testID="trivia-name"
        />
      </View>
      <GameButton
        title="Play trivia"
        color={GP.sun}
        disabled={out || s.busy}
        icon={<Ionicons name="play" size={20} color={ACCENT.sun.label} />}
        onPress={() => void play()}
        style={{ alignSelf: "stretch" }}
        testID="trivia-play"
      />
      <Text style={styles.sub}>{triviaSub(s.triviaLeft)}</Text>
      {s.problem ? <Text style={styles.problem}>{s.problem}</Text> : null}
      {s.board && s.board.region === "global" ? <BountyBoard board={s.board} title="TODAY'S TOP PLAYERS" /> : null}
    </ScrollView>
  );
}

/** Signed in to chat, but the game account did not come with it: the player chooses (as SsoProblemPanel). */
function AccountNotLoaded() {
  const styles = useThemedStyles(STYLE_PAIR);
  const problem = useGame((g) => g.ssoProblem);
  const [busy, setBusy] = useState(false);
  return (
    <View style={[styles.center, styles.pad, { gap: 14 }]}>
      <Text style={styles.title}>{problem ? "Your game account didn't load" : "Loading your game account"}</Text>
      <Text style={styles.lead}>
        {problem?.message ?? "One moment."} You can try again, or play on this phone: trivia you play here stays on this phone.
      </Text>
      <GameButton
        title="Try again"
        color={GP.sun}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void gameStore.retrySession().finally(() => setBusy(false));
        }}
        style={{ alignSelf: "stretch" }}
      />
      <GameButton title="Play on this phone" color={GP.skyDeep} onPress={() => void gameStore.playOnThisPhone()} style={{ alignSelf: "stretch" }} />
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    fill: { flex: 1, backgroundColor: L.screen },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    pad: { paddingHorizontal: 22 },
    top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
    kicker: { paddingTop: 12, fontFamily: GF.bold, fontSize: 13, lineHeight: 16, letterSpacing: 1.2, color: L.textMuted },
    display: { fontFamily: GF.display, fontSize: 40, lineHeight: 44, color: L.text },
    title: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text, textAlign: "center" },
    lead: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted },
    sub: { fontFamily: GF.regular, fontSize: 13, lineHeight: 17, color: L.textMuted, textAlign: "center" },
    problem: { fontFamily: GF.body, fontSize: 14, lineHeight: 19, color: TEXT_ON_LIGHT.danger, textAlign: "center" },
    count: { fontFamily: GF.display, fontSize: 120, lineHeight: 132, color: L.text },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, minHeight: 48, borderRadius: RADIUS.button, backgroundColor: L.surfaceAlt },
    nameInput: { flex: 1, fontFamily: GF.body, fontSize: 17, lineHeight: 22, paddingVertical: 10 },
  },
  {
    fill: { backgroundColor: D.screen },
    kicker: { color: D.textMuted },
    display: { color: D.text },
    title: { color: D.text },
    lead: { color: D.textMuted },
    sub: { color: D.textMuted },
    problem: { color: TEXT_ON_DARK.danger },
    count: { color: D.text },
    nameRow: { backgroundColor: D.surfaceAlt },
  },
);
