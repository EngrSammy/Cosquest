// "Ask the Warden" (costquest-ios UI/WardenView.swift): asking the game a
// question. Framed as an assistant, never the referee: the server judges the
// game. The rule a question is about shows at once and stays; the on-device
// model (when it is loaded) writes the answer from it, and with no model the
// rule is the answer. Four openers are offered as taps, because typing on a
// phone held at arm's length outdoors is miserable.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "@/components/ui/keyboard";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { askPrompt, type AskContext, OPENERS, plainAnswer, settleAnswer, type Turn } from "@/features/game/askWarden";
import { useGame } from "@/features/game/runtime";
import { askModel, startWardenModel, stopModel, useWardenModel } from "@/features/game/wardenModel";

import { GameIconButton, MAX_FONT_SCALE, announce, pressFeedback } from "./kit";
import { ACCENT, ELEVATION, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { GameBackdrop } from "./GameBackdrop";
import { SheetHost } from "./Sheet";
import { GF, GP } from "./theme";
import { wardenVoice } from "./wardenVoice";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const L = SURFACES.light;
const D = SURFACES.dark;

export default function AskWarden({ onClose }: { onClose: () => void }) {
  return (
    <SheetHost band="any" scrimLabel="Close Ask the Warden" onClose={onClose}>
      {(close) => <AskBody close={close} />}
    </SheetHost>
  );
}

function AskBody({ close }: { close: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const insets = useSafeAreaInsets();
  const me = useGame((s) => s.me);
  const problem = useGame((s) => s.problem);
  const points = useGame((s) => s.points);
  const model = useWardenModel();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [answering, setAnswering] = useState(false);
  const serial = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const usesModel = model.phase === "ready";

  // Start loading the model while the player reads the openers, not on their first question.
  useEffect(() => {
    void startWardenModel((w) => wardenVoice.setWriter(w));
    // Leaving the screen stops an answer being read out.
    return () => wardenVoice.hush();
  }, []);

  const context = (): AskContext => ({
    title: "CostQuest",
    faction: me?.faction_name ?? null,
    nearby: points.slice(0, 3).map((p) => p.name),
    isOnline: problem === null,
  });

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || answering) return;
    setQuestion("");
    const c = context();
    const rule = plainAnswer(q, c);
    const asked: Turn = { id: ++serial.current, fromPlayer: true, text: q };
    if (!usesModel) {
      const answer: Turn = { id: ++serial.current, fromPlayer: false, text: rule };
      setTurns((t) => [...t, asked, answer]);
      announce(rule);
      wardenVoice.say(rule, { moment: "ask" });
      return;
    }
    // Seeded with the rule, so something true is on screen while the model writes.
    const id = ++serial.current;
    const history = turns;
    setTurns((t) => [...t, asked, { id, fromPlayer: false, text: "", rule }]);
    setAnswering(true);
    const out = await askModel(askPrompt(c, history, q));
    const settled = settleAnswer(out?.text, rule);
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, text: settled.text, rule: settled.rule } : x)));
    setAnswering(false);
    announce(settled.text);
    wardenVoice.say(settled.text, { moment: "ask" });
  };

  const canSend = question.trim().length > 0 && !answering;

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <GameBackdrop tint={ACCENT.sky.fill} />
      <View style={styles.header}>
        <GameIconButton icon="close" diameter={40} onPress={close} accessibilityLabel="Close Ask the Warden" />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Ask the Warden
          </Text>
        </View>
        {answering ? (
          <GameIconButton icon="stop" color={GP.berry} diameter={40} onPress={stopModel} accessibilityLabel="Stop the answer" />
        ) : turns.length ? (
          <GameIconButton icon="refresh" color={GP.skyDeep} diameter={40} onPress={() => setTurns([])} accessibilityLabel="Clear the conversation" />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {turns.length === 0 ? (
        <Animated.View entering={FadeIn} style={styles.intro}>
          <Ionicons name={usesModel ? "cloud-offline" : "book"} size={32} color={ACCENT.sun.edge} />
          <View style={{ gap: 6, alignItems: "center" }}>
            <Text style={styles.introTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {usesModel ? "This runs on your phone" : "Straight from the rulebook"}
            </Text>
            <Text style={styles.introText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {usesModel
                ? "No signal needed, so it still answers when the venue's wifi gives up. It explains the rules; the server still referees."
                : "Answers come from the game's own rules while the Warden's model downloads. It explains; the server still referees."}
            </Text>
          </View>
          <View style={styles.openers}>
            {OPENERS.map((o) => (
              <Pressable
                key={o}
                onPressIn={pressFeedback}
                onPress={() => void send(o)}
                style={({ pressed }) => [styles.opener, !look.dark && ELEVATION.low, pressed && { transform: [{ scale: 0.98 }] }]}
                accessibilityRole="button"
                accessibilityLabel={`Ask: ${o}`}>
                <Text style={styles.openerText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {o}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={look.textMuted} />
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : (
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.turns} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {turns.map((t) => (
            <Animated.View key={t.id} entering={FadeInDown.duration(200)} style={[styles.turn, t.fromPlayer ? styles.mine : styles.theirs]}>
              {t.rule ? (
                <View style={styles.rule} accessible accessibilityLabel={`Rule: ${t.rule}`}>
                  <Ionicons name="book" size={13} color={look.dark ? TEXT_ON_DARK.info : TEXT_ON_LIGHT.info} style={{ marginTop: 2 }} />
                  <Text style={styles.ruleText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {t.rule}
                  </Text>
                </View>
              ) : null}
              {t.text || !t.rule ? (
                <Text style={[styles.bubble, t.fromPlayer ? styles.bubbleMine : styles.bubbleTheirs]} selectable maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {t.text || "…"}
                </Text>
              ) : null}
            </Animated.View>
          ))}
        </ScrollView>
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 16 }]}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask about the game"
          placeholderTextColor={look.textMuted}
          multiline
          style={styles.input}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={() => void send(question)}
          accessibilityLabel="Ask about the game"
        />
        <View pointerEvents={canSend ? "auto" : "none"} accessibilityState={{ disabled: !canSend }}>
          <GameIconButton icon="arrow-up" solid color={canSend ? ACCENT.mint.fill : "#C9C1B2"} diameter={44} onPress={() => void send(question)} accessibilityLabel="Send your question" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const STYLE_PAIR = themedStyles(
  {
    root: { ...StyleSheet.absoluteFill, backgroundColor: L.screen },
    header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
    title: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text },
    intro: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
    introTitle: { fontFamily: GF.bold, fontSize: 22, lineHeight: 26, color: L.text },
    introText: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted, textAlign: "center", paddingHorizontal: 34 },
    openers: { gap: 8, alignSelf: "stretch", paddingHorizontal: 20 },
    opener: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: RADIUS.button, backgroundColor: L.surface },
    openerText: { flex: 1, fontFamily: GF.body, fontSize: 16, lineHeight: 21, color: L.text },
    turns: { padding: 20, gap: 14 },
    turn: { gap: 6 },
    mine: { alignItems: "flex-end", paddingLeft: 40 },
    theirs: { alignItems: "flex-start", paddingRight: 40 },
    rule: { flexDirection: "row", gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: L.surfaceAlt },
    ruleText: { flexShrink: 1, fontFamily: GF.regular, fontSize: 13, lineHeight: 18, color: L.textMuted },
    bubble: { fontFamily: GF.regular, fontSize: 16, lineHeight: 22, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, overflow: "hidden" },
    bubbleMine: { color: ACCENT.sun.label, backgroundColor: ACCENT.sun.fill },
    bubbleTheirs: { color: L.text, backgroundColor: L.surface },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 12 },
    input: { flex: 1, maxHeight: 110, padding: 12, borderRadius: RADIUS.button, backgroundColor: L.surface, borderWidth: 1, borderColor: L.hairline, color: L.text, fontFamily: GF.regular, fontSize: 16 },
  },
  {
    root: { backgroundColor: D.screen },
    title: { color: D.text },
    introTitle: { color: D.text },
    introText: { color: D.textMuted },
    opener: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline },
    openerText: { color: D.text },
    rule: { backgroundColor: D.surfaceAlt },
    ruleText: { color: D.textMuted },
    bubbleMine: { color: ACCENT.sun.label, backgroundColor: ACCENT.sun.fill },
    bubbleTheirs: { color: D.text, backgroundColor: D.surface },
    input: { backgroundColor: D.surface, borderColor: D.hairline, color: D.text },
  },
);
