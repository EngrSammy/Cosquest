// TEST BUILDS ONLY (EXPO_PUBLIC_E2E=1, or a dev build): the Ranks sheet
// (faction entry test, rank gates, rank test, weapon ladder, season, event
// friends) on this device's own key, without the chat's sign-in, against
// whichever game server the build points at. For walkthrough recordings.
//   cosquest://dev/ranks-preview[?t=<anything>]  (a new t reloads the sheet)
// Every other build sends this route home.
import { useFonts } from "expo-font";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { LogBox, View } from "react-native";

import { GAME_FONTS } from "@/components/game/fonts";
import { GameSchemeProvider } from "@/components/game/look";
import ProgressionSheet from "@/components/game/ProgressionSheet";
import { gameStore } from "@/features/game/runtime";

const ON = process.env.EXPO_PUBLIC_E2E === "1" || __DEV__;

export default function RanksPreview() {
  const [fontsReady, fontsError] = useFonts(GAME_FONTS);
  const [ready, setReady] = useState(false);
  const [round, setRound] = useState(0);
  const { t } = useLocalSearchParams<{ t?: string }>();
  useEffect(() => {
    if (!ON) return;
    LogBox.ignoreAllLogs(true);
    // The player must exist on the game server before progression can join it.
    void gameStore
      .playOnThisPhone()
      .then(() => gameStore.refreshMe())
      .finally(() => setReady(true));
  }, []);
  if (!ON) return <Redirect href="/" />;
  if ((!fontsReady && !fontsError) || !ready) return <View style={{ flex: 1, backgroundColor: "#E9E2D2" }} />;
  return (
    <GameSchemeProvider>
      <View style={{ flex: 1, backgroundColor: "#E9E2D2" }}>
        {/* Closing reopens it, so a recording can start over without relaunching. */}
        <ProgressionSheet key={`${t ?? ""}-${round}`} onClose={() => setRound((r) => r + 1)} />
      </View>
    </GameSchemeProvider>
  );
}
