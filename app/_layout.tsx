import AvatarCatalogLoader from "@/components/AvatarCatalogLoader";
import ActiveCallOverlay from "@/components/calls/ActiveCallOverlay";
import CallBannerFrame from "@/components/calls/CallBannerFrame";
import IncomingCallListener from "@/components/calls/IncomingCallListener";
import SessionGate from "@/components/SessionGate";
import { UserProvider } from "@/context/UserContext";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { store } from "@/store/store";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
// LiveKit setup for phones (does nothing on web — see the file itself).
import "@/utils/livekitSetup";
// Makes Alert.alert show real popups on the website (does nothing on phones).
import "@/utils/webAlert";
// Browser-only style fixes (does nothing on phones).
import "@/utils/webGlobalStyles";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Provider } from "react-redux";

// useSocketConnection() calls useAppSelector internally, which only
// works inside <Provider store={store}>. RootLayout below is the
// component that CREATES that Provider, so calling the hook directly
// in RootLayout's own body would run before the Provider exists in the
// tree yet — this tiny component exists only to be a Provider
// DESCENDANT, so the hook has real Redux access. Renders nothing.
function SocketConnectionGate() {
  useSocketConnection();

  return null;
}

export default function RootLayout() {
  // Preload the icon fonts so they resolve correctly on web
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialIcons.font,
  });

  if (!fontsLoaded) return null;

  return (
    <Provider store={store}>
      {/* Stay logged in: loads the saved login before the screens show */}
      <SessionGate>
        <SocketConnectionGate />

        {/* Loads all the backend's avatars (GET /api/meta/avatars) */}
        <AvatarCatalogLoader />

        <GestureHandlerRootView style={{ flex: 1 }}>
          <UserProvider>
            {/* Green "Tap to return to call" bar while a call is minimized */}
            <CallBannerFrame>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="edit-profile" />
                <Stack.Screen name="contact-options" />
                <Stack.Screen name="followers" />
                <Stack.Screen name="following" />
                <Stack.Screen name="category" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="notifications" />

                {/* Audio/video call screen */}
                <Stack.Screen
                  name="call/[id]"
                  options={{ gestureEnabled: false, animation: "fade" }}
                />
              </Stack>
            </CallBannerFrame>

            {/* The ongoing call - stays mounted, so minimizing never ends it */}
            <ActiveCallOverlay />

            {/* Ringing screen — shows on top of any screen when someone calls */}
            <IncomingCallListener />

            <StatusBar style="auto" />
          </UserProvider>
        </GestureHandlerRootView>
      </SessionGate>
    </Provider>
  );
}
