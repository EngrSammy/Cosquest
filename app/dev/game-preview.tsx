// TEST BUILDS ONLY (EXPO_PUBLIC_E2E=1, or a dev build): the whole game page
// (GameRoot: the map, the HUD, the tray and every sheet) on its own, without
// the chat's sign-in or the world pager, so the game can be looked at and
// screenshotted in a browser.   cosquest://dev/game-preview
// It plays on this device's own key (no chat login), against whichever game
// server the build points at. Every other build sends this route home.
import { Redirect } from "expo-router";
import { useEffect } from "react";
import { LogBox, StyleSheet, View } from "react-native";

import GameRoot from "@/components/game/GameRoot";
import { equip } from "@/features/game/forgeWorldDevice";
import { requestMapBench } from "@/features/game/mapBench";
import { gameStore, startLocation } from "@/features/game/runtime";
import { world } from "@/features/world/worldState";

const ON = process.env.EXPO_PUBLIC_E2E === "1" || __DEV__;

export default function GamePreview() {
  useEffect(() => {
    if (!ON) return;
    LogBox.ignoreAllLogs(true);
    // For screenshot scripts: drive the store from the page (web only).
    (globalThis as { __cqGame?: unknown }).__cqGame = gameStore;
    // And the map's scripted smoothness bench (EXPO_PUBLIC_MAP_BENCH=1 builds), as cosquest://mapbench does.
    (globalThis as { __cqMapBench?: unknown }).__cqMapBench = requestMapBench;
    // And wearing a Forge hero (any published hero may be worn), so the map marker can be shot with one.
    (globalThis as { __cqForge?: unknown }).__cqForge = { equip };
    // No chat login here: play on this device's own key, as a player who chose
    // "Play on this phone only" would. The game is the page on screen (as the
    // world pager says once it settles there).
    world.settled("game");
    void gameStore.playOnThisPhone().then(async () => {
      await startLocation(true);
      gameStore.resume();
    });
  }, []);
  if (!ON) return <Redirect href="/" />;
  return (
    <View style={StyleSheet.absoluteFill}>
      <GameRoot parked={false} />
    </View>
  );
}
