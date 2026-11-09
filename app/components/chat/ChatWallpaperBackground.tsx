// Draws the chat wallpaper behind the messages.
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { DARK_CHAT_BG, DARK_CHAT_BG_2, useChatScheme } from "@/constants/chatTheme";
import { findPreset, type Wallpaper } from "@/constants/wallpapers";

// Figma M06: in dark mode the default wallpaper is a deep navy.
const DARK_GRADIENT = [DARK_CHAT_BG_2, DARK_CHAT_BG] as const;

export function ChatWallpaperBackground({
  wallpaper,
}: {
  wallpaper: Wallpaper;
}) {
  // A photo that can no longer be found falls back to the default.
  const [photoFailed, setPhotoFailed] = useState(false);
  const dark = useChatScheme() === "dark";

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

  // Dark mode: the default (and plain) wallpapers turn navy; a chosen
  // picture or pattern gets a dark veil so light bubbles never sit on it.
  if (dark && (preset.id === "default" || !preset.image)) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: DARK_CHAT_BG }]} pointerEvents="none">
        <LinearGradient colors={DARK_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
    );
  }

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

      {dark ? <View style={[StyleSheet.absoluteFill, styles.darkVeil]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photoVeil: {
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  darkVeil: {
    backgroundColor: "rgba(23,24,35,0.78)",
  },
});
