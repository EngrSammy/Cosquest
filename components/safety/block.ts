// Block someone from anywhere (task 059): a profile, a group's member list,
// a post's menu, a message's menu. Asks first, then blocks (by username on
// every server, by id where the server has POST /api/blocks).
import { Alert } from "react-native";

import { loadCapabilities } from "@/services/capabilities";
import { blockPerson } from "@/services/safety";
import { store } from "@/store/store";
import { haptic } from "@/utils/haptics";

export function confirmBlock(who: { username?: string | null; userId?: string | null; name?: string }, onBlocked?: () => void) {
  const label = who.name || (who.username ? `@${who.username}` : "this person");
  Alert.alert(`Block ${label}?`, "They won't be able to message you or see your profile, and you won't see their posts. They aren't told.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Block",
      style: "destructive",
      onPress: async () => {
        const token = store.getState().auth.token;
        if (!token) return;
        try {
          const caps = await loadCapabilities();
          await blockPerson(token, who, caps.blockAnywhere);
          haptic.success();
          onBlocked?.();
          Alert.alert("Blocked", `You blocked ${label}. You can unblock them from Privacy & Visibility.`);
        } catch (error) {
          haptic.error();
          Alert.alert("Block", error instanceof Error ? error.message : "Couldn't block them. Try again.");
        }
      },
    },
  ]);
}
