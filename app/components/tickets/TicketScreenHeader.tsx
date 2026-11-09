// A simple back-arrow header for the ticket screens.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

export default function TicketScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const ink = useInk();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: insets.top + 10, paddingBottom: 12, paddingHorizontal: 16 }}>
      <Pressable
        onPress={onBack || (() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home" as any)))}
        hitSlop={10}
        accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color={ink.text("#24283C")} />
      </Pressable>
      <Text style={{ flex: 1, fontFamily: FONTS.bold, fontSize: 20, color: ink.text("#24283C") }}>{title}</Text>
    </View>
  );
}
