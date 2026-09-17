import type { ImageSourcePropType } from "react-native";

// TEMPORARY. Replace with GET /api/notifications once the backend is deployed.
export type NotifKind = "follow" | "like" | "comment" | "mention";

export type AppNotification = {
  id: string;
  handle: string;
  avatar: ImageSourcePropType;
  kind: NotifKind;
  body: string;
  time: string;
  thumb?: ImageSourcePropType;
};

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: "1",
    handle: "saskia_b",
    avatar: require("@/assets/images/avatars/avatar_03.png"),
    kind: "follow",
    body: "started following you.",
    time: "10m ago",
  },
  {
    id: "2",
    handle: "d.thorne",
    avatar: require("@/assets/images/avatars/avatar_07.png"),
    kind: "like",
    body: "liked your post.",
    time: "1h ago",
    thumb: require("@/assets/images/interests/games.png"),
  },
  {
    id: "3",
    handle: "ariasterling",
    avatar: require("@/assets/images/avatars/avatar_12.png"),
    kind: "mention",
    body: "mentioned you in a comment: '@valentin_v this structure is flawless.'",
    time: "4h ago",
  },
  {
    id: "4",
    handle: "lindqvist",
    avatar: require("@/assets/images/avatars/avatar_18.png"),
    kind: "like",
    body: "liked your post.",
    time: "12h ago",
    thumb: require("@/assets/images/interests/movies.png"),
  },
  {
    id: "5",
    handle: "tariq_m",
    avatar: require("@/assets/images/avatars/avatar_21.png"),
    kind: "comment",
    body: "commented: 'Sublime aesthetic overall!'",
    time: "1d ago",
  },
  {
    id: "6",
    handle: "zoe_win",
    avatar: require("@/assets/images/avatars/avatar_25.png"),
    kind: "follow",
    body: "started following you.",
    time: "2d ago",
  },
];
