// WEB ONLY - stand-in for react-native-maps, which doesn't work in a
// browser. metro.config.js swaps this in for the website; phones keep the
// real map. Shows a small note where the map would be, so the rest of the
// screen (e.g. Contact Options) still works.
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

type AnyProps = {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  [key: string]: unknown;
};

export default function MapView({ style }: AnyProps) {
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.text}>The map is available in the mobile app.</Text>
    </View>
  );
}

// Things drawn ON a map - nothing to draw on web.
export function Marker(_props: AnyProps) {
  return null;
}

export function Callout(_props: AnyProps) {
  return null;
}

export function Circle(_props: AnyProps) {
  return null;
}

export function Polyline(_props: AnyProps) {
  return null;
}

export function Polygon(_props: AnyProps) {
  return null;
}

export const PROVIDER_GOOGLE = "google";
export const PROVIDER_DEFAULT = undefined;

// Types some screens import (only used for TypeScript, never at runtime).
export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type LatLng = { latitude: number; longitude: number };

export type MapPressEvent = {
  nativeEvent: { coordinate: LatLng };
};

const styles = StyleSheet.create({
  placeholder: {
    minHeight: 160,
    borderRadius: 14,
    backgroundColor: "rgba(197,57,154,0.08)",
    borderWidth: 1,
    borderColor: "rgba(197,57,154,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  text: {
    color: "#5D5F6B",
    fontSize: 13,
    textAlign: "center",
  },
});
