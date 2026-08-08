import { AppBackground } from "@/components/AppBackground";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function TabLayout() {
  return (
    <AppBackground>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: "#DC179F",
          tabBarInactiveTintColor: "#FEFEFE",
          headerShown: false,
          tabBarButton: HapticTab,
          sceneStyle: { backgroundColor: "transparent" },
          tabBarStyle: {
            position: "absolute",
            marginHorizontal: 20,
            bottom: 30,
            height: 64,
            borderTopWidth: 0,
            backgroundColor: "transparent",
            elevation: 0,
          },
          tabBarBackground: () => (
            <View style={styles.barShadow}>
              <BlurView intensity={10} tint="light" style={styles.barClip}>
                <LinearGradient
                  colors={["rgba(30, 25, 29, 0.50)", "rgba(30, 25, 29, 0.30)"]}
                  style={StyleSheet.absoluteFill}
                />
              </BlurView>
              <View pointerEvents="none" style={styles.barOutline} />
            </View>
          ),
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Cosquest",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="mappin.and.ellipse" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="live"
          options={{
            title: "Live",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={28}
                name="dot.radiowaves.left.and.right"
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: "Community",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="bubble.left.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="person.fill" color={color} />
            ),
          }}
        />
      </Tabs>
    </AppBackground>
  );
}

const RADIUS = 30;
const styles = StyleSheet.create({
  barShadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, // iOS depth
    elevation: 12, // Android depth
  },
  barClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS,
    overflow: "hidden", // clips ONLY the blur + sheen to the pill
  },
  barOutline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)", // crisp rim, no overflow → no chips
  },
});
