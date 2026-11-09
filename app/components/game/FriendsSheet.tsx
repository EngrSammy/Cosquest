// Friends: add a friend standing beside you with a six-letter code, open the
// gifts friends sent, and send each friend one a day. No chat, and nobody
// sees where you are. costquest-ios Features/FriendsFeature.swift
// (FriendsSheet); the server (roam_social.py) decides every add and every
// gift, and its refusals are shown in its own words.
//
// iOS's "hold two phones together" card (HoldPhonesCard.tsx) sits on top
// where the phone has the beacon; Android has no way to reach an iPhone like
// that, so there the code panel is the way in. The code is the same on both,
// so an iPhone can type this phone's code and this phone can type an iPhone's.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  canGiftTo,
  canSubmitCode,
  cleanCode,
  codeSecondsLeft,
  countdownText,
  daysLine,
  type FriendEntry,
  giftFromLine,
  levelTone,
  spelledCode,
} from "@/features/game/friends";
import { nearbyFriends } from "@/features/game/friendsNearbyDevice";
import { friendsModel, useFriends } from "@/features/game/friendsRuntime";
import { useGame } from "@/features/game/runtime";

import { HoldPhonesCard } from "./HoldPhonesCard";
import { Chip, GameButton, GamePanel, MAX_FONT_SCALE } from "./kit";
import { QrCode } from "./QrCode";
import { SheetHost } from "./Sheet";
import { SheetFrame } from "./SheetFrame";
import { SheetHeader } from "./SheetHeader";
import { labelOn, SURFACES } from "./look";
import { GF, GP, realmColor } from "./theme";
import { useOnScreen } from "./useOnScreen";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/kit";

export default function FriendsSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: insets.top + 40, height: 90 }} scrimLabel="Close Friends" onClose={onClose}>
      {(close) => <FriendsBody close={close} />}
    </SheetHost>
  );
}

function FriendsBody({ close }: { close: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const friends = useFriends();
  const fix = useGame((s) => s.fix);
  const [typed, setTyped] = useState("");
  // With the hold-phones card above it, this panel is the other way in.
  const holdPhones = nearbyFriends !== null;

  useEffect(() => {
    void friendsModel.refresh();
    return () => friendsModel.dismissed();
  }, []);

  const add = async () => {
    const r = await friendsModel.add(typed);
    if (!r) return;
    setTyped("");
    if (r.added) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const claim = async () => {
    const gifts = await friendsModel.claim();
    if (gifts?.length) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const pending = friends.payload?.pending_gifts ?? 0;

  return (
    <SheetFrame top={insets.top + 40}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        <SheetHeader title="Friends" onClose={close} closeLabel="Close Friends" />
        <Text style={styles.lead} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          Friends are added face to face. No chat, and nobody sees where you are.
        </Text>

        <HoldPhonesCard />

        <GamePanel>
          <View style={styles.stack}>
            {holdPhones ? (
              <Text style={styles.big} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Or use a code
              </Text>
            ) : (
              <View style={styles.addHead}>
                <Ionicons name="people" size={30} color={GP.berry} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.big} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Add a friend
                  </Text>
                  <Text style={styles.sub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Stand beside them. One of you shows a code, the other types it.
                  </Text>
                </View>
              </View>
            )}
            {!fix ? (
              <View style={styles.row}>
                <ActivityIndicator color={GP.mist} />
                <Text style={styles.line} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  Waiting for your location
                </Text>
              </View>
            ) : (
              <>
                <MyCode />
                <View style={styles.divider} />
                <Text style={styles.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {"Got a friend's code?"}
                </Text>
                <View style={styles.row}>
                  <TextInput
                    value={typed}
                    onChangeText={(v) => setTyped(cleanCode(v))}
                    placeholder="ABC123"
                    placeholderTextColor="rgba(30,58,76,0.3)"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    // No suggestion strip on Android: it would "correct" a code.
                    keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (canSubmitCode(typed) && !friends.busy) void add();
                    }}
                    style={styles.input}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    accessibilityLabel="Friend's code"
                  />
                  <GameButton
                    title="Add"
                    size="medium"
                    color={GP.mint}
                    onPress={() => void add()}
                    disabled={!canSubmitCode(typed) || friends.busy}
                    accessibilityLabel="Add the friend with this code"
                  />
                </View>
              </>
            )}
          </View>
        </GamePanel>

        {friends.message ? (
          <GamePanel padding={14}>
            <Text style={styles.line} accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {friends.message}
            </Text>
          </GamePanel>
        ) : null}

        {pending > 0 || friends.opened.length ? (
          <GamePanel>
            <View style={styles.stackTight}>
              {pending > 0 ? (
                <GameButton
                  title={`Open gifts (${pending})`}
                  size="medium"
                  color={GP.sun}
                  icon={<Ionicons name="gift" size={20} color={labelOn(GP.sun)} />}
                  onPress={() => void claim()}
                  disabled={friends.busy}
                />
              ) : null}
              {friends.opened.length ? (
                <>
                  <Text style={styles.gifts} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Gifts arrived
                  </Text>
                  {friends.opened.map((g, i) => (
                    <View key={`${i}-${g.item}`} style={styles.row} accessible accessibilityLabel={`${g.name}, ${giftFromLine(g)}`}>
                      <Ionicons name="gift" size={18} color={GP.berry} />
                      <Text style={[styles.name, { flex: 1 }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                        {g.name}
                      </Text>
                      <Text style={styles.sub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                        {giftFromLine(g)}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          </GamePanel>
        ) : null}

        <GamePanel>
          <View style={styles.stackTight}>
            <Text style={styles.big} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Your friends
            </Text>
            {friends.payload ? (
              friends.payload.friends.length ? (
                friends.payload.friends.map((f) => <FriendRow key={f.friend_key} f={f} busy={friends.busy} canGift={canGiftTo(friends, f)} />)
              ) : (
                // Task 059: the shared kit's states, in the game's tone.
                <EmptyState tone="game" compact icon="people-outline" title="No friends yet" message="Meet up, show your code, and play together." />
              )
            ) : friends.failed ? (
              <ErrorState tone="game" compact title="Can't load your friends right now" message="Check your connection and try again." onRetry={() => void friendsModel.refresh()} />
            ) : (
              <SkeletonRows count={3} avatar={40} label="Loading friends" />
            )}
          </View>
        </GamePanel>
      </ScrollView>
    </SheetFrame>
  );
}

/** Your live code with its countdown and QR, or the button that makes one. */
function MyCode() {
  const styles = useThemedStyles(STYLE_PAIR);
  const friends = useFriends();
  const [now, setNow] = useState(() => Date.now());
  const onScreen = useOnScreen();
  const left = codeSecondsLeft(friends.codeExpiresAt, now);
  // Tick only while there is a code to count down and the game is in front
  // (a new code reads high for at most the first tick).
  const ticking = friends.codeExpiresAt !== null && left > 0 && onScreen;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  if (!friends.code || left <= 0) {
    return (
      <GameButton
        title={friends.code ? "Code expired. New code" : "Show my code"}
        size="medium"
        color={GP.skyDeep}
        onPress={() => void friendsModel.makeCode()}
        disabled={friends.busy}
      />
    );
  }
  return (
    <View style={styles.codeBox}>
      <Pressable
        onPress={() => void friendsModel.makeCode()}
        disabled={friends.busy}
        accessibilityRole="button"
        accessibilityLabel={`Your code ${spelledCode(friends.code.code)}. Tap for a new one.`}>
        <Text style={styles.code} selectable maxFontSizeMultiplier={1.2}>
          {friends.code.code}
        </Text>
      </Pressable>
      <QrCode text={friends.code.code} />
      <View style={styles.centre}>
        <Chip text={`Valid ${countdownText(left)}`} color={left < 60 ? GP.berry : GP.skyDeep} />
      </View>
      <Text style={styles.sub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        Show this to a friend standing beside you.
      </Text>
    </View>
  );
}

function FriendRow({ f, busy, canGift }: { f: FriendEntry; busy: boolean; canGift: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.friend}>
      <View style={[styles.dot, { backgroundColor: realmColor(f.faction) }]} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {f.handle}
        </Text>
        <View style={styles.row}>
          <Chip text={f.level_name} color={GP[levelTone(f.level_name)]} />
          <Text style={styles.days} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {daysLine(f)}
          </Text>
        </View>
      </View>
      <GameButton
        title={canGift ? "Gift" : "Sent"}
        size="small"
        color={GP.berry}
        icon={<Ionicons name={canGift ? "gift" : "checkmark"} size={16} color="#FFF" />}
        onPress={() => void friendsModel.gift(f)}
        disabled={!canGift || busy}
        accessibilityLabel={canGift ? `Send ${f.handle} a gift` : `Gift sent to ${f.handle} today`}
      />
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    body: { paddingHorizontal: 18, gap: 16 },
    lead: { fontFamily: GF.body, fontSize: 15, color: L.textMuted },
    stack: { gap: 14 },
    stackTight: { gap: 12 },
    addHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    big: { fontFamily: GF.display, fontSize: 22, color: L.text },
    gifts: { fontFamily: GF.display, fontSize: 20, color: L.text },
    sub: { fontFamily: GF.regular, fontSize: 14, color: L.textMuted, flexShrink: 1 },
    line: { fontFamily: GF.body, fontSize: 15, color: L.text, flexShrink: 1 },
    empty: { fontFamily: GF.regular, fontSize: 15, color: L.textMuted },
    label: { fontFamily: GF.bold, fontSize: 15, color: L.text },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.hairline },
    input: {
      flex: 1,
      height: 52,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: L.hairline,
      backgroundColor: L.surface,
      fontFamily: GF.display,
      fontSize: 24,
      letterSpacing: 4,
      color: L.text,
    },
    codeBox: { alignItems: "center", gap: 10 },
    centre: { alignSelf: "center" },
    code: { fontFamily: GF.display, fontSize: 46, lineHeight: 52, letterSpacing: 6, color: L.text },
    friend: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
    dot: { width: 14, height: 14, borderRadius: 7 },
    name: { fontFamily: GF.bold, fontSize: 17, color: L.text },
    days: { fontFamily: GF.body, fontSize: 13, color: L.textMuted, flexShrink: 1 },
  },
  {
    lead: { color: D.textMuted },
    big: { color: D.text },
    gifts: { color: D.text },
    sub: { color: D.textMuted },
    line: { color: D.text },
    empty: { color: D.textMuted },
    label: { color: D.text },
    divider: { backgroundColor: D.hairline },
    input: { borderColor: D.hairline, backgroundColor: D.surface, color: D.text },
    code: { color: D.text },
    name: { color: D.text },
    days: { color: D.textMuted },
  },
);
