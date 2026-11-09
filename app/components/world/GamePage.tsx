// Page 1 of the world: the game (the React Native game, components/game), the
// faction veil it fades up out of, and the chat bubble over it.
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { GestureType } from "react-native-gesture-handler";
import Animated, { type AnimatedStyle } from "react-native-reanimated";
import type { ViewStyle } from "react-native";

import { FONTS } from "@/constants/fonts";
import { world } from "@/features/world/worldState";
import GameRoot from "@/components/game/GameRoot";
import { gamePlayable } from "@/modules/costquest-game/src";

import GameBubble from "./GameBubble";
import SsoProblemPanel from "./SsoProblemPanel";
import { useWorld } from "./useWorld";
import { C } from "@/theme/tokens";

/** If the game never says it is ready, lift the veil anyway after this (ms). */
const READY_TIMEOUT_MS = 6000;

export default function GamePage({
  mounted,
  parked,
  veilColor,
  veilStyle,
  makePan,
}: {
  mounted: boolean;
  parked: boolean;
  veilColor: string;
  veilStyle: AnimatedStyle<ViewStyle>;
  makePan: () => GestureType;
}) {
  const { page, gameReady } = useWorld();

  useEffect(() => {
    if (page !== "game" || gameReady) return;
    const timer = setTimeout(() => world.markGameReady(), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [page, gameReady]);

  return (
    <View style={styles.page}>
      {mounted ? (
        <View style={StyleSheet.absoluteFill} accessibilityLabel="CostQuest game">
          <GameRoot parked={parked} />
        </View>
      ) : null}

      {!gamePlayable ? <NoGameHere /> : null}

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: veilColor }, veilStyle]}>
        {page === "game" && !gameReady ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.loadingText}>Entering the world…</Text>
          </View>
        ) : null}
      </Animated.View>

      {/* One login failed: the player chooses, the game never switches player silently */}
      {mounted && gamePlayable ? <SsoProblemPanel /> : null}

      <GameBubble makePan={makePan} />
    </View>
  );
}

function NoGameHere() {
  return (
    <View style={styles.soon}>
      <View style={styles.soonCard}>
        <Ionicons name="planet" size={40} color="#FFFFFF" />
        {/* Task 059: only builds without the game see this (the website, a
            test build without the module). Not "coming soon": it says where. */}
        <Text style={styles.soonTitle}>Play on your phone</Text>
        <Text style={styles.soonText}>
          Raids, shrines and duels are in the CosQuest app for iPhone and Android. Your chats are one swipe away.
        </Text>
        <Pressable
          style={styles.soonButton}
          onPress={() => world.openChat(null)}
          accessibilityRole="button"
          accessibilityLabel="Back to chat">
          <Text style={styles.soonButtonText}>Back to chat</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#14061A",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#FFFFFF",
    fontFamily: FONTS.semibold,
    fontSize: 15,
    opacity: 0.9,
  },
  soon: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  soonCard: {
    alignItems: "center",
    gap: 10,
    padding: 24,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  soonTitle: {
    color: "#FFFFFF",
    fontFamily: FONTS.bold,
    fontSize: 18,
    textAlign: "center",
  },
  soonText: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: FONTS.regular,
    fontSize: 14,
    textAlign: "center",
  },
  soonButton: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: C.brandVivid,
  },
  soonButtonText: {
    color: "#FFFFFF",
    fontFamily: FONTS.semibold,
    fontSize: 14,
  },
});
