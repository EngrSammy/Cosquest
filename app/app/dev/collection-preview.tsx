// TEST BUILDS ONLY (EXPO_PUBLIC_E2E=1, or a dev build): the Collection sheet
// (Relics and Forge) over a plain map backdrop, on either tab, for
// screenshots without a signed-in player.
//   cosquest://dev/collection-preview?tab=relics|forge
// It loads the game's own type first (GameRoot does this for the real game):
// without it the sheet fell back to the browser's serif. Every other build
// sends this route home.
import { useFonts } from "expo-font";
import { Redirect, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import CollectionSheet from "@/components/game/CollectionSheet";
import { GAME_FONTS } from "@/components/game/fonts";
import { GameSchemeProvider } from "@/components/game/look";

const ON = process.env.EXPO_PUBLIC_E2E === "1" || __DEV__;

export default function CollectionPreview() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [fontsReady, fontsError] = useFonts(GAME_FONTS);
  if (!ON) return <Redirect href="/" />;
  if (!fontsReady && !fontsError) return null;
  return (
    <GameSchemeProvider>
      <View style={{ flex: 1, backgroundColor: "#E9E2D2" }}>
        <CollectionSheet initial={tab === "forge" ? "forge" : "relics"} tabs={["relics", "forge"]} onClose={() => {}} />
      </View>
    </GameSchemeProvider>
  );
}
