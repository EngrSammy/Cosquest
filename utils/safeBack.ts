// Go back if there's a screen to go back to; otherwise open a fallback.
import { router, type Href } from "expo-router";

export function safeBack(fallback: Href = "/home") {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
