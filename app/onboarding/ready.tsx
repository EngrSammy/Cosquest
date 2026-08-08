import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Ready() {
  return (
    <AppBackground variant="plain">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.body}>
          <Text style={styles.small}>Welcome To</Text>
          <Text style={styles.big}>COSQUEST</Text>
          <View>
            <Image
              source={require("@/assets/images/ready/hero.png")}
              style={styles.hero}
              contentFit="contain"
            />
            <Image
              source={require("@/assets/images/ready/left_hero.png")}
              style={styles.left}
              contentFit="contain"
            />
            <Image
              source={require("@/assets/images/ready/right_hero.png")}
              style={styles.right}
              contentFit="contain"
            />
          </View>
        </View>

        <View style={styles.btn}>
          <Button
            label="Continue"
            variant="brand"
            onPress={() => router.replace("/home")}
          />
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 },
  body: { flex: 1, justifyContent: "center", alignItems: "center" },
  small: {
    fontSize: 30,
    fontWeight: "700",
    color: "#191922",
    textAlign: "center",
  },
  big: {
    fontSize: 45,
    fontWeight: "900",
    color: "#191922",
    textAlign: "center",
    letterSpacing: 1,
  },
  hero: { width: "100%", height: 340, marginTop: 24 },
  left: { width: "60%", height: 300, marginTop: 5 },
  right: { width: "60%", height: 300, marginTop: 5 },
  btn: { marginTop: "auto", paddingTop: 24 },
});
