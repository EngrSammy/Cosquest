import type { ImageSourcePropType } from "react-native";

// TEMPORARY mock. Replace with GET /api/users/me/following once the backend
// is deployed.
export type Following = {
  id: string;
  name: string;
  handle: string;
  avatar: ImageSourcePropType;
  following: boolean; // starts true for all — everyone here is already followed
};

export const MOCK_FOLLOWING: Following[] = [
  {
    id: "1",
    name: "Saskia Blom",
    handle: "saskia_b",
    avatar: require("@/assets/images/avatars/avatar_03.png"),
    following: true,
  },
  {
    id: "2",
    name: "Damian Thorne",
    handle: "d.thorne",
    avatar: require("@/assets/images/avatars/avatar_07.png"),
    following: true,
  },
  {
    id: "3",
    name: "Aria Sterling",
    handle: "ariasterling",
    avatar: require("@/assets/images/avatars/avatar_12.png"),
    following: true,
  },
  {
    id: "4",
    name: "Mikael Lindqvist",
    handle: "mikaelvl",
    avatar: require("@/assets/images/avatars/avatar_18.png"),
    following: true,
  },
  {
    id: "5",
    name: "Tariq Mahmood",
    handle: "tariq_m",
    avatar: require("@/assets/images/avatars/avatar_21.png"),
    following: true,
  },
  {
    id: "6",
    name: "Zoe Winters",
    handle: "zoe_win",
    avatar: require("@/assets/images/avatars/avatar_25.png"),
    following: true,
  },
];
