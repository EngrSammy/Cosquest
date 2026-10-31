// ==========================================
// COMMUNITY HUB, SPLIT IN TWO (new Figma)
// ==========================================
//   Chats:     PersonRow (one per conversation, like WhatsApp) + Read/Unread
//   Community: RoomCard (Community — General, faction rooms, groups)
// The data and actions come from Chats.tsx (one place for loading, unread
// counts, live updates, Find People and Create a group).
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { RoomArt } from "@/constants/roomArt";

const PINK = "#C34D9C";
const BADGE = "#B0157F";

function Badge({ count, muted }: { count: number; muted?: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (!count) return null;
  return (
    <View style={[styles.badge, muted && styles.badgeMuted]}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

// ---------- Chats: Read / Unread (like WhatsApp: Read = everything) ----------
export function ReadUnread({ unreadOnly, onChange, unreadCount }: { unreadOnly: boolean; onChange: (unreadOnly: boolean) => void; unreadCount: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {([false, true] as const).map((value) => {
        const on = unreadOnly === value;
        return (
          <Pressable
            key={String(value)}
            style={[styles.segmentItem, on && styles.segmentOn]}
            onPress={() => onChange(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
              {value ? `Unread${unreadCount ? ` · ${unreadCount}` : ""}` : "Read"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Chats: one conversation ----------
export function PersonRow({
  name,
  photo,
  initials,
  tint,
  preview,
  time,
  unread,
  online,
  muted,
  onPress,
}: {
  name: string;
  photo: any;
  initials: string;
  tint: string;
  preview: string;
  time: string;
  unread: number;
  online?: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: any) => [styles.person, (pressed || hovered) && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${preview}${unread ? `. ${unread} unread` : ""}`}>
      <View style={[styles.personAvatar, { backgroundColor: tint }]}>
        {photo ? <Image source={photo} style={styles.personPhoto} contentFit="cover" /> : <Text style={styles.initials}>{initials}</Text>}
        {online ? <View style={styles.online} /> : null}
      </View>
      <View style={styles.text}>
        <Text style={styles.personName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <View style={styles.side}>
        <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{time}</Text>
        <Badge count={unread} muted={muted} />
      </View>
    </Pressable>
  );
}

// ---------- Community: a built-in room with its own picture ----------
// (Figma: Community — General, faction rooms.) The round picture hangs off
// the card's left edge and rises above it; a faction shows its logo in
// place of the name. Unread badge on the right, "200 Members" under it.
const ART_CARD_H = 72;

function ArtRoomCard({
  art,
  title,
  preview,
  members,
  unread,
  muted,
  onPress,
}: {
  art: RoomArt;
  title: string;
  preview: string;
  members?: number;
  unread: number;
  muted?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const artH = art.width / art.ratio;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.artRow, { paddingTop: Math.max(0, artH - ART_CARD_H) }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${preview}${unread ? `. ${unread} unread` : ""}`}>
      {({ pressed, hovered }: any) => (
        <>
          <View style={[styles.artCard, { paddingLeft: art.width + 10 }, (pressed || hovered) && styles.artCardPressed]}>
            <View style={styles.text}>
              {art.logo ? (
                <Image
                  source={art.logo}
                  style={{ height: 22, width: 22 * (art.logoRatio || 3) }}
                  contentFit="contain"
                  accessibilityLabel={title}
                />
              ) : (
                <View style={styles.cardTitleRow}>
                  <Text style={styles.artTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {muted ? <Ionicons name="notifications-off-outline" size={13} color={ink.text("#8A93A6")} /> : null}
                </View>
              )}
              {art.subtitle ? (
                <Text style={styles.artTitle} numberOfLines={1}>
                  {art.subtitle}
                </Text>
              ) : null}
              <Text style={[styles.artPreview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
                {preview}
              </Text>
            </View>
            <View style={styles.artSide}>
              <View style={styles.artBadgeSlot}>
                {unread ? (
                  <View style={[styles.artBadge, { backgroundColor: muted ? "#A0A6B5" : art.badge }]}>
                    <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
                  </View>
                ) : null}
              </View>
              {members ? (
                <Text style={styles.artMembers}>
                  {members.toLocaleString()} {members === 1 ? "Member" : "Members"}
                </Text>
              ) : null}
            </View>
          </View>
          <Image
            source={art.dp}
            style={[styles.artDp, { width: art.width, height: artH }]}
            contentFit="contain"
          />
        </>
      )}
    </Pressable>
  );
}

// ---------- Community: a room or group card ----------
export function RoomCard({
  title,
  subtitle,
  preview,
  members,
  unread,
  photoUrl,
  icon,
  art,
  muted,
  onPress,
}: {
  title: string;
  subtitle?: string;
  preview: string;
  members?: number;
  unread: number;
  photoUrl?: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  // A built-in room's own picture (used unless a photo was uploaded).
  art?: RoomArt | null;
  muted?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  if (art && !photoUrl) {
    return (
      <ArtRoomCard
        art={art}
        title={title}
        preview={preview}
        members={members}
        unread={unread}
        muted={muted}
        onPress={onPress}
      />
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: any) => [styles.card, (pressed || hovered) && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${preview}${unread ? `. ${unread} unread` : ""}`}>
      <View style={styles.cardImage}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.cardPhoto} contentFit="cover" />
        ) : (
          <Ionicons name={icon} size={30} color={ink.text(PINK)} />
        )}
      </View>
      <View style={styles.text}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          {muted ? <Ionicons name="notifications-off-outline" size={13} color={ink.text("#8A93A6")} /> : null}
        </View>
        {subtitle ? (
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
          {preview}
        </Text>
        {members ? <Text style={styles.members}>{members.toLocaleString()} members</Text> : null}
      </View>
      <View style={styles.cardBadge}>
        <Badge count={unread} muted={muted} />
      </View>
    </Pressable>
  );
}

// Every Community hub card (rooms, factions, groups): light and frosted,
// rounded, with a white edge and a soft shadow (Figma: Community — General).
const FROSTED_CARD = {
  borderRadius: 22,
  backgroundColor: "rgba(237,241,247,0.92)",
  borderWidth: 1.5,
  borderColor: "rgba(255,255,255,0.95)",
  shadowColor: "#24283C",
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
const FROSTED_PRESSED = "rgba(247,228,240,0.95)";

const STYLE_PAIR = themedStyles(
  {
    // Read / Unread
    segment: { flexDirection: "row", gap: 10, marginTop: 4, marginBottom: 8 },
    segmentItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.9)" },
    segmentOn: { backgroundColor: "#F7E4F0" },
    segmentText: { fontFamily: FONTS.medium, fontSize: 13, color: "#5F6170" },
    segmentTextOn: { fontFamily: FONTS.semibold, color: PINK },

    // Person row
    person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 14 },
    pressed: { backgroundColor: "rgba(195,77,156,0.06)" },
    personAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", overflow: "visible" },
    personPhoto: { width: 50, height: 50, borderRadius: 25 },
    initials: { fontFamily: FONTS.semibold, fontSize: 15, color: "#5B4A7A" },
    online: { position: "absolute", right: 1, bottom: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#25D366" },
    text: { flex: 1, minWidth: 0 },
    personName: { fontFamily: FONTS.semibold, fontSize: 15, color: "#191922" },
    preview: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 13, color: "#5F6170" },
    previewUnread: { fontFamily: FONTS.medium, color: "#2C2F3E" },
    side: { alignItems: "flex-end", gap: 6, minWidth: 54 },
    time: { fontFamily: FONTS.regular, fontSize: 11.5, color: "#8A93A6" },
    timeUnread: { color: PINK, fontFamily: FONTS.medium },
    badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: BADGE },
    badgeMuted: { backgroundColor: "#A0A6B5" },
    badgeText: { fontFamily: FONTS.semibold, fontSize: 11, color: "#FFFFFF" },

    // Room card
    card: {
      ...FROSTED_CARD,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 12,
      marginBottom: 12,
    },
    cardPressed: { backgroundColor: FROSTED_PRESSED },
    cardImage: { width: 76, height: 76, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#F7E4F0" },
    cardPhoto: { width: 76, height: 76 },
    cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    cardTitle: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, color: "#191922" },
    cardSubtitle: { marginTop: 1, fontFamily: FONTS.medium, fontSize: 12, color: PINK },
    members: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 11.5, color: "#8A93A6" },
    cardBadge: { alignSelf: "flex-start" },

    // Built-in room with its picture
    artRow: { marginBottom: 14 },
    artCard: {
      ...FROSTED_CARD,
      height: ART_CARD_H,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginLeft: 4,
      paddingRight: 12,
    },
    artCardPressed: { backgroundColor: FROSTED_PRESSED },
    artDp: { position: "absolute", left: 0, bottom: 0 },
    artTitle: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: "#191922" },
    artPreview: { marginTop: 2, fontFamily: FONTS.medium, fontSize: 13, color: "#6B6F80" },
    artSide: { alignSelf: "stretch", alignItems: "flex-end", justifyContent: "space-between", paddingVertical: 8 },
    artBadgeSlot: { flex: 1, justifyContent: "center" },
    artBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    artMembers: { fontFamily: FONTS.medium, fontSize: 9.5, color: "#3A3D4A" },
  },
  {
    segmentItem: { backgroundColor: "#252837" },
    segmentOn: { backgroundColor: "rgba(195,77,156,0.22)" },
    segmentText: { color: "#B5BBCB" },
    segmentTextOn: { color: "#F29BD3" },
    pressed: { backgroundColor: "rgba(255,255,255,0.05)" },
    initials: { color: "#E3DCF0" },
    online: { borderColor: "#1A1C28" },
    personName: { color: "#F4F5FA" },
    preview: { color: "#9AA1B4" },
    previewUnread: { color: "#E3E6EE" },
    time: { color: "#8A93A6" },
    timeUnread: { color: "#F29BD3" },
    card: { backgroundColor: "#1F2130", borderColor: "rgba(255,255,255,0.08)" },
    cardPressed: { backgroundColor: "#262838" },
    artCard: { backgroundColor: "#1F2130", borderColor: "rgba(255,255,255,0.08)" },
    artCardPressed: { backgroundColor: "#262838" },
    cardImage: { backgroundColor: "rgba(195,77,156,0.18)" },
    cardTitle: { color: "#F4F5FA" },
    cardSubtitle: { color: "#F29BD3" },
    members: { color: "#8A93A6" },
  },
);
