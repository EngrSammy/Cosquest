// Shared by the website checkout pages (app/checkout).
import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, Text, View } from "react-native";

import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

const PINK = "#C34D9C";

export function backToApp() {
  // Phones: back to the CosQuest app. Computers: the website's home.
  if (Platform.OS === "web") window.location.assign(/Android|iPhone|iPad/i.test(navigator.userAgent) ? "cosquest://tickets" : "/");
}

export function Message({ icon, title, text, action, onAction, compact }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; action?: string; onAction?: () => void; compact?: boolean }) {
  const ink = useInk();
  return (
    <View style={{ alignItems: "center", gap: 10, padding: 24, marginTop: compact ? 0 : 24, borderRadius: 20, backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF" }}>
      <Ionicons name={icon} size={40} color={PINK} />
      <Text style={{ fontFamily: FONTS.bold, fontSize: 18, textAlign: "center", color: ink.text("#24283C") }}>{title}</Text>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, textAlign: "center", color: ink.text("#66738A") }}>{text}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" style={{ marginTop: 6, height: 48, paddingHorizontal: 24, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: PINK }}>
          <Text style={{ fontFamily: FONTS.bold, fontSize: 15, color: "#FFFFFF" }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
