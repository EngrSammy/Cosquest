// The game's own type, as costquest-ios UI/GameKit.swift GameFont: Lilita One
// for headlines, numbers and button labels, Fredoka for everything else.
// Both are SIL OFL 1.1 (assets/fonts/game/OFL.txt). Fredoka ships as a
// variable font on iOS; these are its named weights cut as static files
// (fontTools instancer, wdth 100), because Android does not pick weights out
// of a variable font by name. Loaded by GameRoot before the game draws.
export const GAME_FONTS = {
  "CQ-LilitaOne": require("@/assets/fonts/game/LilitaOne-Regular.ttf"),
  "CQ-Fredoka-Regular": require("@/assets/fonts/game/Fredoka-Regular.ttf"),
  "CQ-Fredoka-Medium": require("@/assets/fonts/game/Fredoka-Medium.ttf"),
  "CQ-Fredoka-SemiBold": require("@/assets/fonts/game/Fredoka-SemiBold.ttf"),
  "CQ-Fredoka-Bold": require("@/assets/fonts/game/Fredoka-Bold.ttf"),
} as const;
