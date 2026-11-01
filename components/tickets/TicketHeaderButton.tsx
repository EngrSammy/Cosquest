// The 🎟️ button in the home header: opens My tickets, with how many
// upcoming tickets you have.
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, type StyleProp, Text, View, type ViewStyle } from "react-native";

import { FONTS } from "@/constants/fonts";
import { useUpcomingTickets } from "@/services/ticketCache";

export default function TicketHeaderButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { tickets, refresh } = useUpcomingTickets();
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const count = tickets?.filter((t) => t.status === "valid").length || 0;
  return (
    <Pressable
      onPress={() => router.push("/tickets" as any)}
      hitSlop={10}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={count ? `My tickets, ${count} upcoming` : "My tickets"}>
      <Ionicons name="ticket" size={28} color="#B63D91" />
      {count ? (
        <View style={{ position: "absolute", top: -4, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#B63D91", borderWidth: 2, borderColor: "#FFFFFF" }}>
          <Text style={{ fontFamily: FONTS.bold, fontSize: 10, color: "#FFFFFF" }}>{count > 9 ? "9+" : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
