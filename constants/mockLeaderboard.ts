import type { ImageSourcePropType } from "react-native";

// TEMPORARY. To be replaced with GET /api/leaderboard once the backend is deployed.
// Sorted high → low on points; an entry's rank is its position in the array.
export type LeaderboardEntry = {
  id: string;
  name: string;
  avatar: ImageSourcePropType;
  points: number;
  realm: string;
};

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  {
    id: "1",
    name: "Susan",
    avatar: require("@/assets/images/avatars/avatar_09.png"),
    points: 96,
    realm: "Anime Realms",
  },
  {
    id: "2",
    name: "Wale.G",
    avatar: require("@/assets/images/avatars/avatar_04.png"),
    points: 80,
    realm: "Anime Realms",
  },
  {
    id: "3",
    name: "Mark.J",
    avatar: require("@/assets/images/avatars/avatar_06.png"),
    points: 70,
    realm: "Anime Realms",
  },
  {
    id: "4",
    name: "Anime",
    avatar: require("@/assets/images/avatars/avatar_11.png"),
    points: 53,
    realm: "Anime Realms",
  },
  {
    id: "5",
    name: "Wemida",
    avatar: require("@/assets/images/avatars/avatar_15.png"),
    points: 50,
    realm: "Anime Realms",
  },
  {
    id: "6",
    name: "Koda",
    avatar: require("@/assets/images/avatars/avatar_20.png"),
    points: 44,
    realm: "Anime Realms",
  },
  {
    id: "7",
    name: "Rin",
    avatar: require("@/assets/images/avatars/avatar_23.png"),
    points: 38,
    realm: "Anime Realms",
  },
];
