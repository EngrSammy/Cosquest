import { Platform } from "react-native";

// The website's address, e.g. https://cosquest.vercel.app
// Set EXPO_PUBLIC_WEB_URL in .env (and in eas.json / Vercel) once the
// website is online, so every shared link is a normal web link anyone can
// open — on a phone, a computer, in WhatsApp, on an iPhone without the app.
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL;

export function getWebBaseUrl(): string | null {
  if (WEB_URL) {
    return WEB_URL.replace(/\/+$/, "");
  }

  // Running as the website without the setting: use its own address.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }

  return null;
}

// Link to one post. Web link when the website address is known; otherwise
// (phone app before the website is online) the app's own cosquest:// link.
export function getPostShareLink(postId: string): string {
  const base = getWebBaseUrl();

  return base ? `${base}/post/${postId}` : `cosquest://post/${postId}`;
}
