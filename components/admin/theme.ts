// The admin dashboard's colours. Since the glass redesign the dashboard is
// always GLASS (dark glassmorphism: frosted panels over soft pink, violet and
// teal glows; the frosted blur itself is in ./glass.tsx). The earlier LIGHT
// and DARK palettes are kept for reference.
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
  // Drop-down menus (account, bell, search): solid enough to read over anything.
  popover: "#FFFFFF",
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
  popover: "#1F2130",
};

// Dark glassmorphism (the canvas "CosQuest Admin – Glass").
const GLASS: typeof LIGHT = {
  page: "#120E1F",
  sidebar: "rgba(255,255,255,0.08)",
  card: "rgba(255,255,255,0.08)",
  cardSoft: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.16)",
  line: "rgba(255,255,255,0.10)",
  text: "#F5F3FA",
  muted: "#D6CDE8",
  faint: "#B3A9C9",
  pink: "#C34D9C",
  pinkSoft: "rgba(195,77,156,0.32)",
  pinkText: "#F7C6E6",
  blue: "#8EC5F0",
  blueSoft: "rgba(110,170,255,0.16)",
  green: "#7FE0B2",
  greenSoft: "rgba(80,200,150,0.18)",
  amber: "#F5C27A",
  amberSoft: "rgba(242,163,58,0.18)",
  red: "#FF9AA8",
  redSoft: "rgba(240,114,130,0.18)",
  chartGrid: "rgba(255,255,255,0.08)",
  chartPrevious: "#8C82A6",
  popover: "rgba(30,23,48,0.94)",
};

export type AdminTheme = typeof LIGHT;

export function useAdminTheme(): AdminTheme {
  // Kept so hooks run in the same order as before; the look is always glass.
  useChatScheme();
  return GLASS;
}
