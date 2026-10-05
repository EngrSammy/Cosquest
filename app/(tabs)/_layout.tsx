import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { FONTS } from "@/constants/fonts";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

const ACTIVE = "#DC179F";
const INACTIVE = "#FFFFFF";

// Figma: the open tab gets a short pink line above its icon.
function TabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.iconWrap}>
      {focused ? <View style={styles.activeLine} /> : null}
      {children}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          position: "absolute",
          marginHorizontal: 16,
          bottom: 24,
          height: 68,
          paddingTop: 8,
          borderTopWidth: 0,
          backgroundColor: "transparent",
          elevation: 0,
        },
        // Figma: a darker grey see-through bar.
        tabBarBackground: () => (
          <View style={styles.barShadow}>
            <BlurView intensity={25} tint="dark" style={styles.barClip}>
              <LinearGradient
                colors={["rgba(52, 46, 52, 0.78)", "rgba(52, 46, 52, 0.62)"]}
                style={StyleSheet.absoluteFill}
              />
            </BlurView>
            <View pointerEvents="none" style={styles.barOutline} />
          </View>
        ),
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: "Cosquest",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <IconSymbol size={26} name="mappin.and.ellipse" color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: "Live",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <IconSymbol
                size={26}
                name="dot.radiowaves.left.and.right"
                color={color}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              {/* Figma: an outline chat bubble */}
              <Ionicons name="chatbox-outline" size={25} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Ionicons name="person-outline" size={24} color={color} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

const RADIUS = 34;

const styles = StyleSheet.create({
  barShadow: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  barClip: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    overflow: "hidden",
  },

  barOutline: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },

  label: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    marginTop: 2,
  },

  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  // The short pink line above the open tab's icon.
  activeLine: {
    position: "absolute",
    top: -12,
    width: 26,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACTIVE,
  },
});
