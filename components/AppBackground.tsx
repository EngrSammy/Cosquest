import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export function AppBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="bg" cx="50%" cy="38%" rx="120%" ry="90%">
            <Stop offset="0%" stopColor="white" />
            <Stop offset="55%" stopColor="#FCEAF4" />
            <Stop offset="100%" stopColor="#EAF0FF" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bg)" />
      </Svg>
      {children}
    </View>
  );
}
