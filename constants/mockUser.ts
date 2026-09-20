import type { ImageSourcePropType } from "react-native";

export type ProfileUser = {
  // Real account information
  name: string;
  username: string;
  email: string;
  bio: string[];

  // Profile media
  profileBanner: ImageSourcePropType;
  profileImage: ImageSourcePropType;

  // Profile information
  about: string;
  faction: string;
  interests: string[];

  // Social statistics
  followers: string;
  following: number;
  posts: number;

  // Quest/game statistics
  quests: number;
  wins: number;
  points: number;

  // Temporary post thumbnails
  postThumbs: ImageSourcePropType[];

  // Contact information
  contact: {
    email: string;
    phone: string;
    address: string;
  };
};

export const MOCK_USER: ProfileUser = {
  name: "Alex Rivera",
  username: "alexrivera",
  email: "emaculate619@gmail.com",

  bio: ["Cosplay creator", "Building in public"],

  profileBanner: require("@/assets/images/cover-avatar.png"),
  profileImage: require("@/assets/images/dp-avatar.png"),

  about:
    "Building a community around cosplay, prop-making, and creative experiments. New tutorials and behind-the-scenes every week.",

  faction: "controllers",

  interests: [
    "anime",
    "comic",
    "movie",
    "game",
    "fantasy",
    "horror",
    "cosplay",
  ],

  followers: "0",
  following: 0,
  posts: 0,

  quests: 0,
  wins: 0,
  points: 0,

  postThumbs: [
    require("@/assets/images/interests/anime.png"),
    require("@/assets/images/interests/games.png"),
    require("@/assets/images/interests/movies.png"),
    require("@/assets/images/interests/fantasy.png"),
    require("@/assets/images/interests/horror.png"),
    require("@/assets/images/interests/cosplay.png"),
  ],

  contact: {
    email: "emaculate619@gmail.com",
    phone: "",
    address: "",
  },
};
