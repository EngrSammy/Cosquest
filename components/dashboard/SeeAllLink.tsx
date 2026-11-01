// "> See All" under a home page row (Figma).
import { Pressable, Text } from "react-native";

import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

export default function SeeAllLink({ onPress }: { onPress: () => void }) {
  const ink = useInk();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ alignSelf: "flex-end", marginRight: 16, marginTop: 2, marginBottom: 6 }} accessibilityRole="link">
      <Text style={{ fontFamily: FONTS.semibold, fontSize: 12, color: ink.text("#1E2232") }}>{"> "}See All</Text>
    </Pressable>
  );
}
