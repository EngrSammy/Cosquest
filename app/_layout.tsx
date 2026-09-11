import { AppBackground } from "@/components/AppBackground";
import { UserProvider } from "@/context/UserContext";
import { DefaultTheme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

// Transparent nav theme so screens don't paint white over <AppBackground/>.
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "transparent" },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserProvider>
      <AppBackground variant="blueGradient">
        <ThemeProvider value={navTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="contact-options" />
          <Stack.Screen name="followers" />
          <Stack.Screen name="following" />
          <Stack.Screen name="category" />
          <Stack.Screen name="settings" />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppBackground>
    </UserProvider>
    </GestureHandlerRootView>
  );
}
