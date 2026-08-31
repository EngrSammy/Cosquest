import type { ImageSourcePropType } from "react-native";

// TEMPORARY mock profile data. Replace with the real GET /api/users/me response
// (plus the future social/stats endpoints) once the backend is deployed.
// Photos here are placeholders reusing existing assets — swap for real user media.

export type ProfileUser = {
  name: string;
  username: string;
  bio: string[]; // shown as the "· "-separated tagline
  profileBanner: ImageSourcePropType;
  profileImage: ImageSourcePropType;
  about: string;
  followers: string;
  following: number;
  posts: number;
  quests: number;
  wins: number;
  points: number;
  postThumbs: ImageSourcePropType[];
  contact: {
    email: string;
    phone: string;
    address: string;
  };
};

export const MOCK_USER: ProfileUser = {
  name: "Alex Rivera",
  username: "alexrivera",
  bio: ["Cosplay creator", "Building in public"],
  profileBanner: require("@/assets/images/cover-avatar.png"),
  profileImage: require("@/assets/images/dp-avatar.png"),
  about:
    "Building a community around cosplay, prop-making, and creative experiments. New tutorials and behind-the-scenes every week.",
  followers: "12.4k",
  following: 482,
  posts: 128,
  quests: 3,
  wins: 1,
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
    phone: "+2348148327836",
    address: "Business address",
  },
};
