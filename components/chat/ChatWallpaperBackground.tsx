// Draws the chat wallpaper behind the messages.
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { findPreset, type Wallpaper } from "@/constants/wallpapers";

export function ChatWallpaperBackground({
  wallpaper,
}: {
  wallpaper: Wallpaper;
}) {
  // A photo that can no longer be found falls back to the default.
  const [photoFailed, setPhotoFailed] = useState(false);

  if (wallpaper.kind === "photo" && !photoFailed) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={{ uri: wallpaper.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={3}
          onError={() => setPhotoFailed(true)}
        />
        {/* A soft veil so messages stay easy to read on busy photos */}
        <View style={[StyleSheet.absoluteFill, styles.photoVeil]} />
      </View>
    );
  }

  const preset = findPreset(
    wallpaper.kind === "preset" ? wallpaper.id : "default",
  );

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: preset.color }]}
      pointerEvents="none">
      {preset.gradient ? (
        <LinearGradient
          colors={preset.gradient}
          locations={preset.locations}
          start={{ x: 0, y: 0 }}
          // vertical = top to bottom (Figma), otherwise corner to corner
          end={preset.vertical ? { x: 0, y: 1 } : { x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {preset.image ? (
        <Image
          source={preset.image}
          style={[
            StyleSheet.absoluteFill,
            { opacity: preset.imageOpacity ?? 0.4 },
          ]}
          contentFit="cover"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photoVeil: {
    backgroundColor: "rgba(0,0,0,0.32)",
  },
});
