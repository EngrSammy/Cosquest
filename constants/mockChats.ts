import { Ionicons } from "@expo/vector-icons";
import type { ImageSourcePropType } from "react-native";

// TEMPORARY. Replace with GET /api/chats once the backend is wired.
export type GroupChat = {
  id: string;
  name: string;
  iconName: keyof typeof Ionicons.glyphMap;
  lastMessage: string;
  members: number;
};

export type DirectContact = {
  id: string;
  name: string;
  avatar: ImageSourcePropType;
};

export const GROUP_CHATS: GroupChat[] = [
  {
    id: "g1",
    name: "Community — General",
    iconName: "people",
    lastMessage: "PixelRonin: Anyone At Waterfront…",
    members: 200,
  },
  {
    id: "g2",
    name: "ICONS (Comic Book Faction)",
    iconName: "shield-half",
    lastMessage: "PixelRonin: Anyone At Waterfront…",
    members: 85,
  },
];

export type ChatMessage = {
  id: string;
  text: string;
  mine: boolean; // true = sent by the current user (right, pink)
  time: string;
};

export const MOCK_MESSAGES: ChatMessage[] = [
  { id: "m1", text: "Let's get the chatting started", mine: false, time: "4:31 PM" },
  {
    id: "m2",
    text: "I had so many calls today I'd rather not let's just see what we can abide by for tomorrow",
    mine: false,
    time: "4:33 PM",
  },
  { id: "m3", text: "Okay sir", mine: true, time: "4:35 PM" },
  { id: "m4", text: "Okay sir) will need it then with love ❤️", mine: false, time: "4:40 PM" },
  { id: "m5", text: "I have searched it", mine: true, time: "4:45 PM" },
  { id: "m6", text: "I think", mine: true, time: "4:47 PM" },
];

export const DIRECT_CONTACTS: DirectContact[] = [
  {
    id: "d1",
    name: "Joy Af",
    avatar: require("@/assets/images/avatars/avatar_12.png"),
  },
  {
    id: "d2",
    name: "Mark.J",
    avatar: require("@/assets/images/avatars/avatar_06.png"),
  },
  {
    id: "d3",
    name: "Wale.G",
    avatar: require("@/assets/images/avatars/avatar_04.png"),
  },
  {
    id: "d4",
    name: "Susan",
    avatar: require("@/assets/images/avatars/avatar_09.png"),
  },
];
