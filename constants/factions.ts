import type { ImageSourcePropType } from "react-native";

export type Faction = {
  id: string;
  label: string;
  image: ImageSourcePropType;
};

export const FACTIONS: Faction[] = [
  {
    id: "ascendants",
    label: require("@/assets/images/factions/ascendants-label.png"),
    image: require("@/assets/images/factions/ascendants.png"),
  },
  {
    id: "icons",
    label: require("@/assets/images/factions/icons-label.png"),
    image: require("@/assets/images/factions/icons.png"),
  },
  {
    id: "controllers",
    label: require("@/assets/images/factions/controllers-label.png"),
    image: require("@/assets/images/factions/controllers.png"),
  },
  {
    id: "controllers",
    label: require("@/assets/images/factions/blockbusters-label.png"),
    image: require("@/assets/images/factions/blockbusters.png"),
  },
  {
    id: "controllers",
    label: require("@/assets/images/factions/everborn-label.png"),
    image: require("@/assets/images/factions/everborn.png"),
  },
  {
    id: "controllers",
    label: require("@/assets/images/factions/celestials-label.png"),
    image: require("@/assets/images/factions/celestials.png"),
  },
];
