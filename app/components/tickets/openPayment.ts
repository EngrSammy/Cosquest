// Opens Stripe's payment page.
// Phones: an in-app browser; when it closes, the return screen asks the
//   server how the payment went (the server asks Stripe if needed).
// Website: the same tab; Stripe sends people back to /tickets/return.
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

export async function openPayment(checkoutUrl: string, orderId: string) {
  if (Platform.OS === "web") {
    window.location.assign(checkoutUrl);
    return;
  }
  // Show the "waiting for confirmation" screen behind the browser.
  router.push({ pathname: "/tickets/return", params: { order: orderId } } as any);
  try {
    await WebBrowser.openBrowserAsync(checkoutUrl, { dismissButtonStyle: "close", presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  } catch {
    // The return screen still asks the server.
  }
}
