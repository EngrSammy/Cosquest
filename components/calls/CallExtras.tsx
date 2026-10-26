// ==========================================
// ORBIT SCREEN EXTRAS
// ==========================================
//   ConnectionPill - "Poor connection" / "Reconnecting…" under the header
//   SharePanel     - a shared screen, large, above the orbit
//   EveryoneSheet  - tap "+N": everyone in the call
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

import type { OrbitPerson } from "./OrbitCall";
import ScreenShareView from "./ScreenShareView";
import type { Connection, ShareInfo } from "./useCallTools";

const AMBER = "#B45309";
const PINK = "#B63D91";

export function ConnectionPill({ connection }: { connection: Connection }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  if (!connection) return null;
  const reconnecting = connection === "reconnecting";
  return (
    <View style={styles.pillRow} accessibilityLiveRegion="polite">
      <View style={styles.pill}>
        <Ionicons name={reconnecting ? "sync" : "cellular-outline"} size={14} color={ink.text(AMBER)} />
        <Text style={styles.pillText}>{reconnecting ? "Reconnecting…" : "Poor connection · video may pause"}</Text>
      </View>
    </View>
  );
}

export function SharePanel({ share, name, onStop }: { share: ShareInfo; name: string; onStop: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.share}>
      {share.isLocal ? (
        // Not your own screen inside itself (it would repeat forever).
        <View style={styles.ownShare}>
          <Ionicons name="desktop-outline" size={30} color="#FFFFFF" />
          <Text style={styles.ownText}>Everyone can see your screen</Text>
        </View>
      ) : (
        <ScreenShareView share={share} />
      )}
      <View style={styles.shareBar}>
        <Ionicons name="desktop-outline" size={14} color="#FFFFFF" />
        <Text style={styles.shareLabel} numberOfLines={1}>
          {share.isLocal ? "You are sharing your screen" : `${name} is sharing`}
        </Text>
        {share.isLocal ? (
          <Pressable style={styles.stop} onPress={onStop} accessibilityRole="button">
            <Text style={styles.stopText}>Stop</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function EveryoneSheet({ people, visible, onClose }: { people: OrbitPerson[]; visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  // Talking first, then you, then everyone else by name.
  const sorted = [...people].sort(
    (a, b) => Number(!!b.speaking) - Number(!!a.speaking) || Number(!!b.isMe) - Number(!!a.isMe) || a.name.localeCompare(b.name),
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>In this call · {people.length}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={ink.text("#24283C")} />
            </Pressable>
          </View>
          <ScrollView style={styles.list}>
            {sorted.map((person) => (
              <View key={person.id} style={styles.row}>
                <View style={[styles.dot, person.speaking ? styles.dotOn : null]} />
                <Text style={styles.name} numberOfLines={1}>
                  {person.isMe ? `${person.name} (you)` : person.name}
                </Text>
                {person.away ? <Text style={styles.tag}>In a private call</Text> : null}
                {person.speaking ? <Text style={[styles.tag, styles.tagPink]}>Speaking</Text> : null}
                <Ionicons
                  name={person.micOff ? "mic-off-outline" : "mic-outline"}
                  size={18}
                  color={ink.text(person.micOff ? "#C0394B" : "#66738A")}
                />
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    pillRow: { alignItems: "center", marginTop: 4 },
    pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: "#FEF3C7" },
    pillText: { fontFamily: FONTS.medium, fontSize: 12.5, color: AMBER },
    share: { height: "34%", minHeight: 170, marginHorizontal: 12, marginTop: 8, borderRadius: 18, overflow: "hidden", backgroundColor: "#0E0F16" },
    ownShare: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    ownText: { fontFamily: FONTS.medium, fontSize: 14, color: "#FFFFFF" },
    shareBar: {
      position: "absolute",
      left: 10,
      right: 10,
      bottom: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 12,
      paddingRight: 6,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    shareLabel: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: "#FFFFFF" },
    stop: { height: 26, paddingHorizontal: 14, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#E5484D" },
    stopText: { fontFamily: FONTS.semibold, fontSize: 12.5, color: "#FFFFFF" },
    backdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { width: "100%", maxWidth: 560, maxHeight: "75%", paddingHorizontal: 20, paddingTop: 18, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "#FFFFFF" },
    sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    sheetTitle: { fontFamily: FONTS.bold, fontSize: 18, color: "#24283C" },
    list: { flexGrow: 0 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(36,40,60,0.06)" },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D3D8E0" },
    dotOn: { backgroundColor: "#22C55E" },
    name: { flex: 1, fontFamily: FONTS.medium, fontSize: 15, color: "#24283C" },
    tag: { fontFamily: FONTS.regular, fontSize: 12, color: "#66738A" },
    tagPink: { fontFamily: FONTS.medium, color: PINK },
  },
  {
    pill: { backgroundColor: "rgba(245,158,11,0.18)" },
    pillText: { color: "#FCD34D" },
    sheet: { backgroundColor: "#1F2130" },
    sheetTitle: { color: "#F4F5FA" },
    row: { borderBottomColor: "rgba(255,255,255,0.06)" },
    dot: { backgroundColor: "#3A3D50" },
    name: { color: "#F4F5FA" },
    tag: { color: "#9AA1B4" },
    tagPink: { color: "#F29BD3" },
  },
);
