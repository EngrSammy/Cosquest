// ==========================================
// DEFAULT ROOM ART (Community hub cards)
// ==========================================
// The built-in rooms come with their own picture instead of an icon:
// Community — General and the faction rooms (only Icons has art so far;
// add the other factions here as their pictures arrive). A group photo
// someone uploaded always wins over these.
import type { ImageSourcePropType } from "react-native";

export type RoomArt = {
  // The round display picture (its circle background is in the image;
  // Icons' characters break out above the circle).
  dp: ImageSourcePropType;
  // width / height of the picture.
  ratio: number;
  // How wide it's drawn on the card.
  width: number;
  // The faction's logo, shown instead of the room's name.
  logo?: ImageSourcePropType;
  logoRatio?: number;
  // Line under the name / logo.
  subtitle?: string;
  // Unread badge colour.
  badge: string;
};

export const COMMUNITY_ART: RoomArt = {
  dp: require("@/assets/images/dp/Community-dp.png"),
  ratio: 150 / 153,
  width: 92,
  badge: "#C34D9C",
};

export const FACTION_ART: Record<string, RoomArt> = {
  icons: {
    dp: require("@/assets/images/dp/Icons-dp.png"),
    ratio: 169 / 184,
    width: 108,
    logo: require("@/assets/images/factions/icons-label.png"),
    logoRatio: 143 / 48,
    subtitle: "(Comic Book Faction)",
    badge: "#7B80F2",
  },
};

// The art for a chat, if it's one of the built-in rooms. (Faction groups
// people create keep their own name and photo.)
export function roomArtFor(chat: { type?: string; factionKey?: string | null }): RoomArt | null {
  if (chat.type === "community") return COMMUNITY_ART;
  if (chat.type === "faction") return FACTION_ART[(chat.factionKey || "").toLowerCase()] || null;
  return null;
}
