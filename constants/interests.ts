import type { ImageSourcePropType } from "react-native";

export type Interest = {
  id: string;
  label: string;
  image: ImageSourcePropType;
};

export const INTERESTS: Interest[] = [
  { id: "anime", label: "Anime & Manga", image: require("@/assets/images/interests/anime.png") },
  { id: "comics", label: "Comics", image: require("@/assets/images/interests/comics.png") },
  { id: "movies", label: "Movies & TV", image: require("@/assets/images/interests/movies.png") },
  { id: "games", label: "Video Games", image: require("@/assets/images/interests/games.png") },
  { id: "fantasy", label: "Fantasy", image: require("@/assets/images/interests/fantasy.png") },
  { id: "horror", label: "Horror", image: require("@/assets/images/interests/horror.png") },
  { id: "cosplay", label: "Cosplay & Props", image: require("@/assets/images/interests/cosplay.png") },
  { id: "sports", label: "Sports", image: require("@/assets/images/interests/sports.png") },
  { id: "music", label: "Music", image: require("@/assets/images/interests/music.png") },
  { id: "politics", label: "Politics", image: require("@/assets/images/interests/politics.png") },
  { id: "scifi", label: "Sci-Fi", image: require("@/assets/images/interests/scifi.png") },
  { id: "toons", label: "Toons", image: require("@/assets/images/interests/toons.png") },
];
