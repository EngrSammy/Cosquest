// A built-in room's picture at avatar size (chat header, chat lists).
// The picture brings its own round background, so it's drawn as is; Icons'
// characters that break out of the circle are kept inside the box here.
import { Image } from "expo-image";

import type { RoomArt } from "@/constants/roomArt";

export default function RoomArtAvatar({ art, size }: { art: RoomArt; size: number }) {
  return (
    <Image
      source={art.dp}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
