import IncomingCallListener from "@/components/calls/IncomingCallListener";
import { UserProvider } from "@/context/UserContext";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { store } from "@/store/store";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { registerGlobals } from "@livekit/react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Provider } from "react-redux";

// LiveKit (calls) needs this ONCE, before any call screen is opened.
// Without it, LiveKit can't make its connection and every call ends the
// moment it starts ("Connection lost"). Do NOT remove it to make the app
// open in Expo Go — this app needs a development build (Expo Go can't
// run LiveKit at all).
registerGlobals();

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
      <SocketConnectionGate />

      <GestureHandlerRootView style={{ flex: 1 }}>
        <UserProvider>
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

          {/* Ringing screen — shows on top of any screen when someone calls */}
          <IncomingCallListener />

          <StatusBar style="auto" />
        </UserProvider>
      </GestureHandlerRootView>
    </Provider>
  );
}
