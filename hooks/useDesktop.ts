// ==========================================
// DESKTOP OR PHONE-SIZE?
// ==========================================
// The website on a computer (1024 px wide or more) gets the desktop layout
// (Figma D1-D8: top bar, left rail, columns). Phones, and the website in a
// narrow window, keep the phone layout exactly as it is.
import { Platform, useWindowDimensions } from "react-native";

export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
}
