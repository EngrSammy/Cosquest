import { useUser } from "@/context/UserContext";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

// The compose bar at the top of the feed. Tapping it will open a post
// composer later; for now it's an inert entry point.
function PostField() {
  const { user: u } = useUser();
  return (
    <Pressable
      style={styles.composer}
      onPress={() => {
        // TODO: open the post composer screen.
      }}
    >
      <Image
        source={u.profileImage}
        style={styles.composerAvatar}
        contentFit="cover"
      />
      <Text style={styles.composerPlaceholder} numberOfLines={1}>
        Share Your Cosplay Or A Hot Take…
      </Text>
      <View style={styles.composerAdd}>
        <Ionicons name="add" size={20} color="#C5399A" />
      </View>
    </Pressable>
  );
}

export function Feeds() {
  return (
    <View>
      <PostField />
      {/* Post cards go here next */}
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 15,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingVertical: 8,
    paddingHorizontal: 20,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  composerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
  },
  composerPlaceholder: {
    flex: 1,
    fontSize: 13.5,
    color: "#6b6b72",
  },
  composerAdd: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});
