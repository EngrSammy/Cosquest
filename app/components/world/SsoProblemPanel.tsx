// Over the game, when one login did not give it the account's player
// (gameStore ssoProblem). Blocking on purpose: the game used to fall back to
// this phone's own key without a word, which split a person's progress across
// two players. Now the player decides (ported from 0fa0d44, merged-app-push-android).
//
//   unavailable  the game server or the chat backend can't do it right now:
//                Retry (the store also retries on its own), or this phone.
//   rejected     the game server did not accept the chat sign-in (a Beta build
//                whose chat is the live server while the game is on staging):
//                Retry, or play on this phone's own key.
// Drawn in the game's kit: cream paper by day, ink by dusk, the Sun primary.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { GameButton } from "@/components/game/kit";
import { GameSchemeProvider, useLook } from "@/components/game/look";
import { GF, GP } from "@/components/game/theme";
import { gameStore, useGame } from "@/features/game/runtime";
import { world } from "@/features/world/worldState";
import { useAppSelector } from "@/store/hooks";

export default function SsoProblemPanel() {
  const problem = useGame((s) => s.ssoProblem);
  const session = useGame((s) => s.session);
  const token = useAppSelector((state) => state.auth.token);
  if (!problem || session || !token) return null;
  return (
    <GameSchemeProvider>
      <Panel kind={problem.kind} message={problem.message} retryAt={problem.retryAt ?? null} />
    </GameSchemeProvider>
  );
}

function Panel({ kind, message, retryAt }: { kind: "rejected" | "unavailable"; message: string; retryAt: number | null }) {
  const look = useLook();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [retryAt]);
  const waitS = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  // The chat bubble tucks in while this is up (it sat over the card); "Back to chat" is here.
  useEffect(() => {
    world.setGameFocus(true);
    return () => world.setGameFocus(false);
  }, []);

  async function retry() {
    setBusy(true);
    try {
      await gameStore.retrySession();
    } finally {
      setBusy(false);
    }
  }

  const title = kind === "rejected" ? "Your game account didn't load" : "Can't reach your game account";
  const body =
    kind === "rejected"
      ? "Your chats are fine. The game server couldn't match your CosQuest sign-in, so your game player can't load yet."
      : `${message} ${waitS > 0 ? `Trying again in ${waitS} s.` : "Trying again."} Your progress follows your CosQuest account once it's back.`;

  return (
    <View style={[styles.cover, { backgroundColor: look.scrim }]} accessibilityViewIsModal testID="sso-problem">
      <View style={[styles.card, { backgroundColor: look.surface, borderColor: look.hairline }]}>
        <View style={[styles.badge, { backgroundColor: look.surfaceAlt }]}>
          <Ionicons name={kind === "rejected" ? "person-circle-outline" : "cloud-offline-outline"} size={34} color={look.text} />
        </View>
        <Text style={[styles.title, { color: look.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        <Text style={[styles.text, { color: look.textMuted }]} maxFontSizeMultiplier={1.4}>
          {body}
        </Text>
        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator color={GP.sun} style={styles.spinner} />
          ) : (
            <GameButton title="Retry" onPress={() => void retry()} size="medium" />
          )}
          <GameButton
            title="Play on this phone only"
            color={look.dark ? "#2A3A55" : "#EDE5D6"}
            onPress={() => void gameStore.playOnThisPhone()}
            size="medium"
            accessibilityHint="Your progress stays on this phone and won't follow your CosQuest account"
          />
          <Text style={[styles.note, { color: look.textMuted }]} maxFontSizeMultiplier={1.4}>
            On this phone only, your progress stays on this phone and won&apos;t follow your account.
          </Text>
        </View>
        <Pressable onPress={() => world.openChat(null)} accessibilityRole="button" hitSlop={12} style={styles.linkHit}>
          <Text style={[styles.link, { color: look.textMuted }]}>Back to chat</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 420, alignItems: "center", gap: 10, padding: 22, borderRadius: 24, borderWidth: 1 },
  badge: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  title: { fontFamily: GF.display, fontSize: 24, lineHeight: 29, textAlign: "center" },
  text: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 10, marginTop: 6 },
  spinner: { height: 50 },
  note: { fontFamily: GF.regular, fontSize: 13, lineHeight: 18, textAlign: "center" },
  linkHit: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  link: { fontFamily: GF.body, fontSize: 15, textDecorationLine: "underline" },
});
