import type { ImageSourcePropType } from "react-native";

// TEMPORARY mock profile data. Replace with the real GET /api/users/me response
// (plus the future social/stats endpoints) once the backend is deployed.
// Photos here are placeholders reusing existing assets — swap for real user media.

export type ProfileUser = {
  name: string;
  username: string;
  roles: string[]; // shown as the "· "-separated tagline
  photo: ImageSourcePropType;
  factionBadge: ImageSourcePropType;
  bio: string;
  followers: string;
  following: number;
  posts: number;
  quests: number;
  wins: number;
  points: number;
  postThumbs: ImageSourcePropType[];
};

export const MOCK_USER: ProfileUser = {
  name: "Alex Rivera",
  username: "alexrivera",
  roles: ["Cosplay maker", "Building in public"],
  photo: require("@/assets/images/avatars/avatar_01.png"),
  factionBadge: require("@/assets/images/avatars/avatar_05.png"),
  bio: "Building a community around cosplay, prop-making, and creative experiments. New tutorials and behind-the-scenes every week.",
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
};
