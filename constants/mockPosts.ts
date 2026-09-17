import type { ImageSourcePropType } from "react-native";

export type Post = {
  id: string;
  handle: string;
  avatar: ImageSourcePropType;
  image: ImageSourcePropType;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  time: string;
  caption: string;
  hashtags: string[];
};

export const MOCK_POST: Post[] = [
  {
    id: "1",
    handle: "Mark.J",
    avatar: require("@/assets/images/avatars/avatar_06.png"),
    image: require("@/assets/images/feeds_post.png"),
    likes: 1250,
    comments: 27,
    shares: 10,
    saves: 7,
    time: "12 hours ago",
    caption:
      "From anime and gaming to comics, movies, and original creations, cosplay is where imagination becomes reality",
    hashtags: [
      "Cosplay",
      "Cosplayer",
      "CosplayCommunity",
      "CosplayLife",
      "Cosplay",
    ],
  },
];
