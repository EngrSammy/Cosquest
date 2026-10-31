// The admin dashboard's colours (the Figma "Community administration"
// designs), light and dark, following the app's appearance setting.
import { useChatScheme } from "@/constants/chatTheme";

const LIGHT = {
  page: "#EFF6FC",
  sidebar: "#FFFFFF",
  card: "#FFFFFF",
  cardSoft: "#F6F9FC",
  border: "#E4EAF1",
  line: "#EDF1F6",
  text: "#1E2232",
  muted: "#6B7385",
  faint: "#98A0B0",
  pink: "#C34D9C",
  pinkSoft: "#FBEAF3",
  pinkText: "#B23C8C",
  blue: "#4A9BD1",
  blueSoft: "#E6F2FA",
  green: "#1D9A6C",
  greenSoft: "#E3F5EE",
  amber: "#B26B12",
  amberSoft: "#FDF1DE",
  red: "#C0394B",
  redSoft: "#FCE8EB",
  chartGrid: "#EDF1F6",
  chartPrevious: "#B9C1CF",
};

const DARK: typeof LIGHT = {
  page: "#14151F",
  sidebar: "#191A26",
  card: "#1F2130",
  cardSoft: "#24263A",
  border: "rgba(255,255,255,0.08)",
  line: "rgba(255,255,255,0.06)",
  text: "#F1F2F7",
  muted: "#A3A9BA",
  faint: "#7C8396",
  pink: "#D45BAE",
  pinkSoft: "rgba(212,91,174,0.18)",
  pinkText: "#F29BD3",
  blue: "#6DB4E3",
  blueSoft: "rgba(109,180,227,0.16)",
  green: "#4CC795",
  greenSoft: "rgba(76,199,149,0.15)",
  amber: "#F0B24F",
  amberSoft: "rgba(240,178,79,0.15)",
  red: "#F07282",
  redSoft: "rgba(240,114,130,0.15)",
  chartGrid: "rgba(255,255,255,0.06)",
  chartPrevious: "#5D6478",
};

export type AdminTheme = typeof LIGHT;

export function useAdminTheme(): AdminTheme {
  return useChatScheme() === "dark" ? DARK : LIGHT;
}
