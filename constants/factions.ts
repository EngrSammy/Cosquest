import type { ImageSourcePropType } from "react-native";

export type Faction = {
  id: string;
  label: ImageSourcePropType;
  image: ImageSourcePropType;
  caption?: string;
  bgColour?: string;
};

export const FACTIONS: Faction[] = [
  {
    id: "ascendants",
    label: require("@/assets/images/factions/ascendants-label.png"),
    image: require("@/assets/images/factions/ascendants.png"),
    caption: "Anime Fans",
    bgColour: "rgba(195, 77, 156, 0.28)",
  },
  {
    id: "icons",
    label: require("@/assets/images/factions/icons-label.png"),
    image: require("@/assets/images/factions/icons.png"),
    caption: "Comic Book Fans",
    bgColour: "rgba(193, 200, 251, 1)",
  },
  {
    id: "controllers",
    label: require("@/assets/images/factions/controllers-label.png"),
    image: require("@/assets/images/factions/controllers.png"),
    caption: "Gaming Fans",
    bgColour: "rgba(77, 126, 195, 0.28)",
  },
  {
    id: "blockbusters",
    label: require("@/assets/images/factions/blockbusters-label.png"),
    image: require("@/assets/images/factions/blockbusters.png"),
    caption: "Movie Fans",
    bgColour: "rgba(213, 228, 0, 0.28)",
  },
  {
    id: "everborn",
    label: require("@/assets/images/factions/everborn-label.png"),
    image: require("@/assets/images/factions/everborn.png"),
    caption: "Fantasy Fans",
    bgColour: "rgba(249, 64, 154, 0.28)",
  },
  {
    id: "celestials",
    label: require("@/assets/images/factions/celestials-label.png"),
    image: require("@/assets/images/factions/celestials.png"),
    caption: "Sci-Fi Fans",
    bgColour: "rgba(255, 255, 255, 0.28)",
  },
];
