// A sheet's title row (Roam/RoamSheets.swift SheetHeader): the title (Lilita
// One, the `title` size) and a quiet round close button. iOS has no Back button, so every sheet closes here.
import { View } from "react-native";

import { GameHeading, GameIconButton } from "./kit";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export function SheetHeader({ title, onClose, closeLabel = "Close" }: { title: string; onClose: () => void; closeLabel?: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.row}>
      <View style={styles.title}>
        <GameHeading text={title} />
      </View>
      <GameIconButton icon="close" diameter={38} onPress={onClose} accessibilityLabel={closeLabel} />
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 8 },
  title: { flex: 1 },
});
