import type { ImageSourcePropType } from "react-native";

export type Faction = {
  id: string;
  label: string;
  image: ImageSourcePropType;
};

export const FACTIONS: Faction[] = [
  { id: "marvel", label: "Marvel", image: require("@/assets/images/factions/marvel.png") },
  { id: "dc", label: "DC", image: require("@/assets/images/factions/dc.png") },
  { id: "anime", label: "Anime", image: require("@/assets/images/factions/anime.png") },
];
