import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
      ActivityIndicator,
      Pressable,
      StyleSheet,
      Text,
      View,
} from "react-native";

import { AVATARS } from "@/constants/avatars";

function avatarSource(person: any) {
  if (person?.avatarPhotoUrl) {
    return {
      uri: person.avatarPhotoUrl,
    };
  }

  if (person?.profile?.avatarPhotoUrl) {
    return {
      uri: person.profile.avatarPhotoUrl,
    };
  }

  const avatar = AVATARS.find(
    (item) =>
      item.id === (person?.avatarKey || person?.profile?.avatarKey || ""),
  );

  return avatar?.source || require("@/assets/images/dp-avatar.png");
}

export function SharePerson({
  person,
  sent,
  sending,
  onPress,
}: {
  person: any;
  sent: boolean;
  sending: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.person} onPress={onPress} disabled={sending}>
      <View style={styles.avatarWrap}>
        <Image
          source={avatarSource(person)}
          style={styles.avatar}
          contentFit="cover"
        />

        {sent ? (
          <View style={styles.badge}>
            <Ionicons name="checkmark" size={11} color="#FFFFFF" />
          </View>
        ) : null}

        {sending ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#C5399A" />
          </View>
        ) : null}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {person.username}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  person: {
    width: "31%",
    alignItems: "center",
  },

  avatarWrap: {
    position: "relative",
  },

  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: "rgba(197,57,154,0.18)",
  },

  badge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22A679",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  loading: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.5)",
  },

  name: {
    marginTop: 6,
    maxWidth: 85,
    fontSize: 11,
    fontWeight: "600",
    color: "#3B3B42",
    textAlign: "center",
  },
});
