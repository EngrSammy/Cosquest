// Chat wallpapers: colours, gradients, CosQuest patterns, or your own photo.
export type Wallpaper =
  | { kind: "preset"; id: string }
  | { kind: "photo"; uri: string };

export type WallpaperPreset = {
  id: string;
  label: string;
  // Plain colour (also the base under patterns).
  color: string;
  // Two-colour gradient instead of a plain colour.
  gradient?: [string, string];
  // A faint pattern drawn over the colour.
  image?: number;
  imageOpacity?: number;
  locations?: [number, number, ...number[]];
  vertical?: boolean;
};

export const DEFAULT_WALLPAPER: Wallpaper = { kind: "preset", id: "default" };

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  // Figma chat background: soft sky blue.
  {
    id: "default",
    label: "Default",
    color: "#D4ECF8",
    gradient: ["#E2F2FB", "#C8E4F4"],
  },
  {
    id: "map",
    label: "CosQuest map",
    color: "#EAF2FB",
    image: require("@/assets/images/map-texture.png"),
    imageOpacity: 0.35,
  },
  {
    id: "blueMap",
    label: "Blue map",
    color: "#E3EEFA",
    image: require("@/assets/images/blue-map-texture.png"),
    imageOpacity: 0.45,
  },
  {
    id: "cosquest",
    label: "CosQuest",
    color: "#FDE7F3",
    gradient: ["#FDE7F3", "#E4EEFD"],
  },
  {
    id: "sunset",
    label: "Sunset",
    color: "#FFE3D3",
    gradient: ["#FFE6D6", "#F7D2EA"],
  },
  {
    id: "aurora",
    label: "Aurora",
    color: "#D8F3EE",
    gradient: ["#D6F4EC", "#E2DBFA"],
  },
  { id: "blush", label: "Blush", color: "#FBE7F1" },
  { id: "lavender", label: "Lavender", color: "#ECE8FB" },
  { id: "mint", label: "Mint", color: "#E1F5EC" },
  { id: "sand", label: "Sand", color: "#F5EEE2" },
  { id: "night", label: "Night", color: "#1E1D26" },
];

export function findPreset(id: string) {
  return (
    WALLPAPER_PRESETS.find((preset) => preset.id === id) || WALLPAPER_PRESETS[0]
  );
}
