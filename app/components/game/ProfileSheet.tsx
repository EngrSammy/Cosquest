// Who a player is, what they have won, and how they want the game to behave:
// three tabs (Hero, Record, Settings) and the name-and-emblem editor.
// costquest-ios UI/ProfileView.swift, UI/HeroStage.swift, UI/AvatarView.swift.
//
// Left out on purpose, with the reason:
//  - "Appearance" (Automatic / Light / Dark): it set SwiftUI's colour scheme,
//    which the game's own palette never read; the app's light or dark is the
//    chat app's setting. "Time in town" is here: it lights the map
//    (features/game/mapStyle.ts).
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Haptics from "expo-haptics";
import { type ComponentProps, type ReactNode, useCallback, useEffect, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AVATAR_MARK_NAMES,
  AVATAR_MARKS,
  AVATAR_PALETTE,
  cleanHandle,
  DEFAULT_AVATAR,
  equippedOf,
  fetchProfileFull,
  heroPower,
  heroTitle,
  moneyText,
  placed,
  type ProfileFull,
  statBars,
  validHandle,
  wallCurrency,
  wallSubtitle,
  xpToNext,
} from "@/features/game/profile";
import { gameStore, useGame } from "@/features/game/runtime";
import type { ProfileAvatar } from "@/features/game/wire";

import AvatarView from "./AvatarView";
import { ForgeHeroStage, PlayerAvatar, useHasForgeAvatar } from "./ForgeWorld";
import { HeroStatBar, XPBar } from "./Bars";
import HeroStage, { HeroSlot, SlotIcon } from "./HeroStage";
import { WORLD_CLOCKS } from "@/features/game/mapStyle";
import { Chip, GameButton, GameCoin, GameHeading, GameIconButton, GamePanel, MAX_FONT_SCALE, pressFeedback } from "./kit";
import { notify, setFightReveal, setHapticsOn, setWorldClock, useFightReveal, useHapticsOn, useWorldClock } from "./prefs";
import { REVEAL_ISLAND_OFF } from "./FightReveal";
import { revealSettingShown } from "@/features/game/reveal";
import { CostQuestSummonView, summonARSupported } from "@/modules/costquest-game/src";
import { RelicArt } from "./RelicArt";
import { SheetHost } from "./Sheet";
import StancePicker from "./StancePicker";
import { GameBackdrop } from "./GameBackdrop";
import { SheetFrame } from "./SheetFrame";
import { ACCENT, ELEVATION, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { GF, GP } from "./theme";
import { factionVeilColor } from "@/features/world/worldState";
import { useWardenMuted, wardenVoice } from "./wardenVoice";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

type Tab = "hero" | "record" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "hero", label: "Hero" },
  { id: "record", label: "Record" },
  { id: "settings", label: "Settings" },
];

const L = SURFACES.light;
const D = SURFACES.dark;

type ProfileProps = { onClose: () => void; onCoins?: () => void; initial?: Tab };

export default function ProfileSheet(props: ProfileProps) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: 0, height: insets.top + 130 }} scrimLabel="Close your profile" onClose={props.onClose}>
      {(close) => <ProfileBody {...props} close={close} />}
    </SheetHost>
  );
}

function ProfileBody({ close, onCoins, initial = "hero" }: ProfileProps & { close: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const me = useGame((s) => s.me);
  const [tab, setTab] = useState<Tab>(initial);
  const [profile, setProfile] = useState<ProfileFull | null>(null);
  const [editing, setEditing] = useState(false);
  const [showAllWall, setShowAllWall] = useState(false);

  const load = useCallback(async () => {
    void gameStore.refreshMe();
    try {
      setProfile(await fetchProfileFull(gameStore.client));
    } catch {
      // A 404 is the normal state for a player who has never set one up; anything else keeps what we had.
    }
  }, []);
  useEffect(() => {
    let alive = true;
    void gameStore.refreshMe();
    fetchProfileFull(gameStore.client)
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Android Back closes the editor first, then the sheet (the root's handler).
  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setEditing(false);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  const handle = profile?.handle || me?.handle || "";
  const avatar = profile?.avatar ?? DEFAULT_AVATAR;
  // The deck faction's colour (realm colours stay on chips): the stage's floor light.
  const tint = factionVeilColor(me?.faction, null);

  return (
    <SheetFrame top={0} full>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <GameIconButton icon="arrow-back" diameter={40} onPress={close} accessibilityLabel="Back to the map" />
        <View style={{ flex: 1 }}>
          <GameHeading text="Profile" />
        </View>
        {me ? (
          <Pressable
            disabled={!onCoins}
            onPress={onCoins}
            onPressIn={onCoins ? pressFeedback : undefined}
            accessibilityRole={onCoins ? "button" : undefined}
            accessibilityLabel={`${me.coins} CosCoins`}
            accessibilityHint={onCoins ? "Opens your CosCoins" : undefined}
            style={styles.coinPill}>
            <GameCoin size={18} />
            <Text style={styles.coinPillText}>{me.coins}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                if (on) return;
                Haptics.selectionAsync().catch(() => {});
                setTab(t.id);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn]}>
              <Text style={[styles.tabText, on && styles.tabTextOn]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        <Animated.View key={tab} entering={FadeIn.duration(300)} style={tab === "hero" ? undefined : styles.pad}>
          {tab === "hero" ? (
            <HeroTab tint={tint} handle={handle} onEdit={() => setEditing(true)} />
          ) : tab === "record" ? (
            <RecordTab profile={profile} showAll={showAllWall} onShowAll={() => setShowAllWall(true)} />
          ) : (
            <SettingsTab handle={handle} avatar={avatar} onEdit={() => setEditing(true)} />
          )}
        </Animated.View>
      </ScrollView>

      {editing ? (
        <ProfileEditor
          initialHandle={handle}
          initialAvatar={avatar}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
        />
      ) : null}
    </SheetFrame>
  );
}

// ---------- Hero ----------

function HeroTab({ tint, handle, onEdit }: { tint: string; handle: string; onEdit: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const me = useGame((s) => s.me);
  const equipped = equippedOf(me);
  // A worn Forge hero stands on the stage; else the house-colour figure.
  const forgeHero = useHasForgeAvatar();
  const look = useLook();
  return (
    <View>
      {forgeHero ? <ForgeHeroStage tint={tint} height={330} /> : <HeroStage tint={tint} height={330} />}
      <View style={styles.heroCard}>
        <View style={styles.nameRow}>
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit name and emblem" style={styles.nameButton}>
            <Text style={styles.heroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {handle || "Your hero"}
            </Text>
            <Ionicons name="pencil" size={15} color={look.textMuted} />
          </Pressable>
          <View accessible accessibilityLabel={`Power ${heroPower(me)}`} style={styles.powerRow}>
            <Text style={styles.powerLabel}>Power</Text>
            <Text style={styles.powerValue}>{heroPower(me)}</Text>
          </View>
        </View>
        <View style={styles.rule} />
        <Text style={styles.heroTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {heroTitle(me)}
        </Text>
        {me ? statBars(me).map((b) => <HeroStatBar key={b.name} icon={b.icon} name={b.name} value={b.value} extra={b.extra} progress={b.progress} />) : null}
        <View style={[styles.rule, { marginTop: 4 }]} />
        <Text style={styles.equipLabel}>Equipped</Text>
        <View style={styles.slots}>
          <HeroSlot label="Relic" locked={!equipped} a11y={equipped ? `Relic, ${equipped.name}` : "Relic, none equipped"}>
            {equipped ? <RelicArt kind={equipped.kind} rarity={equipped.rarity} size={52} /> : <SlotIcon name="diamond-outline" />}
          </HeroSlot>
          <HeroSlot label="Outfit" locked>
            <SlotIcon name="shirt" />
          </HeroSlot>
          <HeroSlot label="Charm" locked>
            <SlotIcon name="sparkles" />
          </HeroSlot>
          <HeroSlot label="Emote" locked>
            <SlotIcon name="happy" />
          </HeroSlot>
        </View>
        {me?.features?.duel ? (
          <>
            <View style={styles.rule} />
            <StancePicker duel={me.features.duel} />
          </>
        ) : null}
      </View>
    </View>
  );
}

// ---------- Record ----------

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Stat({ value, label, icon, color }: { value: string; label: string; icon: ComponentProps<typeof Ionicons>["name"]; color: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <GamePanel padding={12} style={{ flex: 1 }}>
      <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.statRow}>
        <Ionicons name={icon} size={22} color={color} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {value}
          </Text>
          <Text style={styles.statLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {label}
          </Text>
        </View>
      </View>
    </GamePanel>
  );
}

function RecordTab({ profile, showAll, onShowAll }: { profile: ProfileFull | null; showAll: boolean; onShowAll: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const me = useGame((s) => s.me);
  const wall = profile?.wall ?? [];
  const shown = showAll ? wall : wall.slice(0, 4);
  const currency = wallCurrency(wall);
  return (
    <View style={{ gap: 18 }}>
      {me ? (
        <Section title="Your progress">
          <GamePanel padding={16}>
            <View style={{ gap: 10 }}>
              <View style={styles.levelRow}>
                <Text style={styles.levelTitle}>{`Level ${me.standing.level}`}</Text>
                <Text style={styles.levelRank}>{me.standing.rank}</Text>
                <View style={{ flex: 1 }} />
                {me.faction ? <Chip text={me.faction_name ?? me.faction} color={factionVeilColor(me.faction, null)} /> : null}
              </View>
              <XPBar progress={me.standing.max_level ? 1 : me.standing.into_level / Math.max(1, me.standing.level_span)} />
              <Text style={styles.xpLine}>{xpToNext(me)}</Text>
            </View>
          </GamePanel>
          <View style={styles.pair}>
            <Stat value={String(me.coins)} label="Coins" icon="disc" color={ACCENT.coin.edge} />
            <Stat value={String(me.streak.best)} label="Best streak" icon="flame" color={ACCENT.berry.fill} />
          </View>
          <View style={styles.pair}>
            <Stat value={String(me.faction_points)} label="Points for your faction" icon="flag" color={factionVeilColor(me.faction, null)} />
          </View>
        </Section>
      ) : null}
      <Section title="Your events">
        <View style={styles.pair}>
          <Stat value={String(profile?.games_played ?? 0)} label="Played" icon="game-controller" color={ACCENT.sky.fill} />
          <Stat value={String(profile?.games_won ?? 0)} label="Won" icon="trophy" color={ACCENT.coin.edge} />
        </View>
        <View style={styles.pair}>
          <GamePanel padding={12} style={{ flex: 1 }}>
            <View accessible accessibilityLabel={`Tokens, ${profile?.tokens_total ?? 0}`} style={styles.statRow}>
              <GameCoin size={32} />
              <View>
                <Text style={styles.statValue}>{profile?.tokens_total ?? 0}</Text>
                <Text style={styles.statLabel}>Tokens</Text>
              </View>
            </View>
          </GamePanel>
          {/* Prizes are shown even at zero: "you have won nothing yet" is information a player wants. */}
          <Stat value={moneyText(profile?.prizes_cents ?? 0, currency)} label="Prizes" icon="ribbon" color={ACCENT.sun.edge} />
        </View>
      </Section>
      {profile?.in_progress.length ? (
        <Section title="Playing now">
          <GamePanel padding={14}>
            <View style={{ gap: 10 }}>
              {profile.in_progress.map((g) => (
                <View key={g.game_id} accessible accessibilityLabel={`Live, ${g.title}, ${g.tokens} tokens`} style={styles.liveRow}>
                  <Chip text="Live" />
                  <Text style={styles.liveTitle} numberOfLines={1}>
                    {g.title}
                  </Text>
                  <GameCoin size={20} />
                  <Text style={styles.liveTitle}>{g.tokens}</Text>
                </View>
              ))}
            </View>
          </GamePanel>
        </Section>
      ) : null}
      {wall.length ? (
        <Section title="Your wall">
          <GamePanel padding={14}>
            <View style={{ gap: 12 }}>
              {shown.map((r) => (
                <View
                  key={r.game_id}
                  accessible
                  accessibilityLabel={`${r.title}${r.placing ? `, ${placed(r.placing)}` : ""}${r.prize_cents > 0 ? `, ${moneyText(r.prize_cents, r.currency)}` : ""}, ${wallSubtitle(r)}`}
                  style={{ gap: 4 }}>
                  <View style={styles.wallHead}>
                    <Text style={styles.wallTitle} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {r.title}
                    </Text>
                    {r.prize_cents > 0 ? <Text style={[styles.wallTitle, styles.prize]}>{moneyText(r.prize_cents, r.currency)}</Text> : null}
                  </View>
                  <View style={styles.wallMeta}>
                    {r.placing ? <Chip text={placed(r.placing)} color={r.placing === 1 ? ACCENT.coin.fill : ACCENT.sky.fill} /> : null}
                    {r.faction ? <Text style={styles.wallFaction}>{r.faction.charAt(0).toUpperCase() + r.faction.slice(1)}</Text> : null}
                    <GameCoin size={16} />
                    <Text style={styles.wallTokens}>{r.tokens}</Text>
                  </View>
                </View>
              ))}
              {!showAll && wall.length > 4 ? <GameButton title={`All ${wall.length} results`} size="small" color={ACCENT.sky.fill} onPress={onShowAll} style={{ alignSelf: "flex-start" }} /> : null}
            </View>
          </GamePanel>
          <Text style={styles.note}>Every event you finish stays here, even after the event is gone.</Text>
        </Section>
      ) : null}
    </View>
  );
}

// ---------- Settings ----------

/** A switch: a pill track with a knob, Mint when on. */
function OnOff({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable
      onPressIn={pressFeedback}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={[styles.switch, on && styles.switchOn]}>
      <View style={[styles.knob, on && styles.knobOn]} />
    </Pressable>
  );
}

function SettingsTab({ handle, avatar, onEdit }: { handle: string; avatar: ProfileAvatar; onEdit: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const me = useGame((s) => s.me);
  const haptics = useHapticsOn();
  const muted = useWardenMuted();
  const clock = useWorldClock();
  const reveal = useFightReveal();
  const revealShown = revealSettingShown({ platform: Platform.OS, nativeView: CostQuestSummonView !== null, arSupported: summonARSupported, islandOff: REVEAL_ISLAND_OFF });
  const version = `${Constants.expoConfig?.version ?? "?"} (${Application.nativeBuildVersion ?? "?"})`;
  const look = useLook();
  return (
    <View style={{ gap: 18 }}>
      <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={handle ? `${handle}, level ${me?.standing.level ?? 1}. Edit name and emblem.` : "Set up your profile"}>
        <GamePanel padding={16}>
          <View style={styles.identity}>
            <PlayerAvatar stage size={72} fallback={<AvatarView avatar={avatar} size={72} />} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.identityName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {handle || "Set up your profile"}
              </Text>
              <View style={styles.identityMeta}>
                <Chip text={`Level ${me?.standing.level ?? 1}`} color={ACCENT.sky.fill} />
                <Text style={styles.identityHint} numberOfLines={2}>
                  {handle ? "Name and emblem" : "Pick a name and an emblem"}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={look.textMuted} />
          </View>
        </GamePanel>
      </Pressable>

      <Section title="The world">
        <GamePanel padding={14}>
          <View style={{ gap: 14 }}>
            <Text style={styles.prefTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Time in town
            </Text>
            <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Time in town">
              {WORLD_CLOCKS.map((c) => {
                const on = c.id === clock;
                return (
                  <Pressable
                    key={c.id}
                    onPressIn={pressFeedback}
                    onPress={() => setWorldClock(c.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={c.label}
                    style={[styles.choice, on && styles.choiceOn]}>
                    <Text style={[styles.choiceText, on && styles.choiceTextOn]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.prefRow}>
              <Text style={styles.prefTitle}>Haptics</Text>
              <OnOff
                on={haptics}
                label="Haptics"
                onPress={() => {
                  const next = !haptics;
                  setHapticsOn(next);
                  // Feel the setting you just chose.
                  if (next) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }}
              />
            </View>
            {revealShown ? (
              <View style={styles.prefRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.prefTitle}>AR reveal before fights</Text>
                  <Text style={styles.prefNote}>The Guardian appears through your camera for a few seconds, then the fight begins.</Text>
                </View>
                <OnOff on={reveal} label="AR reveal before fights" onPress={() => setFightReveal(!reveal)} />
              </View>
            ) : null}
            <View style={styles.prefRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.prefTitle}>The Warden speaks</Text>
                <Text style={styles.prefNote}>Its lines are written on your phone either way.</Text>
              </View>
              <OnOff on={!muted} label="The Warden speaks" onPress={() => wardenVoice.setMuted(!muted)} />
            </View>
          </View>
        </GamePanel>
        <Text style={styles.note} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          The town follows your clock. Pick an hour to see it at dusk any time of day.
        </Text>
      </Section>

      <View style={{ paddingBottom: 26 }}>
        <GamePanel padding={14}>
          <View accessible accessibilityLabel={`Version, ${version}`} style={styles.prefRow}>
            <Text style={styles.prefTitle}>Version</Text>
            <Text style={styles.version}>{version}</Text>
          </View>
        </GamePanel>
      </View>
    </View>
  );
}

// ---------- the editor ----------

/** Name and emblem, on its own screen (ProfileEditor): its own Cancel and Save. */
function ProfileEditor({
  initialHandle,
  initialAvatar,
  onCancel,
  onSaved,
}: {
  initialHandle: string;
  initialAvatar: ProfileAvatar;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const [handle, setHandle] = useState(initialHandle);
  const [avatar, setAvatar] = useState<ProfileAvatar>(initialAvatar);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canSave = !saving && validHandle(handle);
  const look = useLook();

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await gameStore.saveProfile(cleanHandle(handle), avatar);
      notify(Haptics.NotificationFeedbackType.Success);
      await onSaved();
    } catch {
      setMessage("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.editorPage]} accessibilityViewIsModal>
      <GameBackdrop />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.editor, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 30 }]}>
        <View style={styles.editorHead}>
          <GameIconButton icon="close" diameter={40} onPress={onCancel} accessibilityLabel="Cancel, keep your profile as it was" />
          <View style={{ flex: 1 }}>
            <GameHeading text="Name and emblem" />
          </View>
        </View>

        <GamePanel padding={16}>
          <View style={{ gap: 14, alignItems: "center" }}>
            <AvatarView avatar={avatar} size={104} />
            <TextInput
              value={handle}
              onChangeText={setHandle}
              maxLength={24}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="Your name"
              placeholderTextColor={look.textMuted}
              accessibilityLabel="Your name"
              style={styles.nameInput}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            />
          </View>
        </GamePanel>

        <Text style={styles.sectionLabel} accessibilityRole="header">
          Emblem
        </Text>
        <GamePanel padding={14}>
          <View style={styles.flow}>
            {AVATAR_MARKS.map((icon, i) => {
              const on = avatar.mark === i;
              return (
                <GameIconButton
                  key={icon}
                  icon={icon}
                  color={on ? safe(avatar.tint) : look.textMuted}
                  solid={on}
                  diameter={50}
                  onPress={() => setAvatar({ ...avatar, mark: i })}
                  accessibilityLabel={on ? `${AVATAR_MARK_NAMES[i]}, selected` : AVATAR_MARK_NAMES[i]}
                />
              );
            })}
          </View>
        </GamePanel>

        <Text style={styles.sectionLabel} accessibilityRole="header">
          Colour
        </Text>
        <GamePanel padding={14}>
          <View style={[styles.flow, { gap: 14 }]}>
            {AVATAR_PALETTE.map((hex) => {
              const on = avatar.tint.toLowerCase() === hex.toLowerCase();
              return (
                <Pressable
                  key={hex}
                  onPressIn={pressFeedback}
                  onPress={() => setAvatar({ ...avatar, tint: hex })}
                  accessibilityRole="button"
                  accessibilityLabel={on ? `Colour ${hex}, selected` : `Colour ${hex}`}
                  hitSlop={4}
                  style={[styles.swatchRing, on && { borderColor: look.text }]}>
                  <View style={[styles.swatch, { backgroundColor: hex }]}>{on ? <Ionicons name="checkmark" size={20} color={hex === "#F4F4F5" ? GP.ink : "#FFFFFF"} /> : null}</View>
                </Pressable>
              );
            })}
          </View>
        </GamePanel>

        {message ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
        <GameButton title={saving ? "Saving" : "Save"} color={ACCENT.mint.fill} disabled={!canSave} onPress={save} accessibilityLabel="Save your name and emblem" />
      </ScrollView>
    </Animated.View>
  );
}

const safe = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_AVATAR.tint);

const STYLE_PAIR = themedStyles(
  {
    top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 4 },
    coinPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 7, paddingRight: 12, height: 36, borderRadius: RADIUS.pill, backgroundColor: L.surface, borderWidth: 1, borderColor: L.hairline },
    coinPillText: { fontFamily: GF.display, fontSize: 17, lineHeight: 21, color: L.text, fontVariant: ["tabular-nums"] },
    // One segmented control, as the Collection's: a well with the chosen tab lifted on paper.
    tabs: { flexDirection: "row", gap: 4, marginHorizontal: 18, marginTop: 8, marginBottom: 6, padding: 3, borderRadius: RADIUS.button, backgroundColor: L.surfaceAlt },
    tab: { flex: 1, minHeight: 36, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    tabOn: { backgroundColor: L.surface, ...ELEVATION.low },
    tabText: { fontFamily: GF.body, fontSize: 15, lineHeight: 19, color: L.textMuted },
    tabTextOn: { fontFamily: GF.bold, color: L.text },
    pad: { paddingHorizontal: 18 },
    heroCard: {
      gap: 14,
      padding: 20,
      marginTop: -2,
      borderTopLeftRadius: RADIUS.sheet,
      borderTopRightRadius: RADIUS.sheet,
      backgroundColor: L.surface,
      ...ELEVATION.low,
    },
    nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    nameButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
    heroName: { flexShrink: 1, fontFamily: GF.display, fontSize: 34, lineHeight: 40, color: L.text },
    powerRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
    powerLabel: { fontFamily: GF.body, fontSize: 13, color: L.textMuted },
    powerValue: { fontFamily: GF.display, fontSize: 26, lineHeight: 30, color: ACCENT.sun.edge, fontVariant: ["tabular-nums"] },
    rule: { height: 1, backgroundColor: L.hairline },
    heroTitle: { fontFamily: GF.body, fontSize: 15, lineHeight: 20, color: L.textMuted },
    equipLabel: { fontFamily: GF.bold, fontSize: 13, lineHeight: 16, letterSpacing: 0.2, color: L.textMuted },
    slots: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    sectionLabel: { paddingLeft: 4, fontFamily: GF.display, fontSize: 20, lineHeight: 24, color: L.text },
    pair: { flexDirection: "row", gap: 10 },
    statRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    statValue: { fontFamily: GF.display, fontSize: 24, lineHeight: 28, color: L.text, fontVariant: ["tabular-nums"] },
    statLabel: { fontFamily: GF.body, fontSize: 12, lineHeight: 16, color: L.textMuted },
    levelRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
    levelTitle: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text },
    levelRank: { fontFamily: GF.body, fontSize: 16, color: L.textMuted },
    xpLine: { fontFamily: GF.regular, fontSize: 14, color: L.textMuted },
    liveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    liveTitle: { flex: 1, fontFamily: GF.bold, fontSize: 17, color: L.text },
    wallHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    wallTitle: { flexShrink: 1, fontFamily: GF.bold, fontSize: 17, lineHeight: 22, color: L.text },
    prize: { fontFamily: GF.display, color: TEXT_ON_LIGHT.warning },
    wallMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
    wallFaction: { fontFamily: GF.regular, fontSize: 13, color: L.textMuted },
    wallTokens: { fontFamily: GF.body, fontSize: 13, color: L.textMuted },
    note: { fontFamily: GF.regular, fontSize: 13, lineHeight: 18, color: L.textMuted, paddingHorizontal: 4 },
    identity: { flexDirection: "row", alignItems: "center", gap: 14 },
    identityName: { fontFamily: GF.display, fontSize: 26, lineHeight: 30, color: L.text },
    identityMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
    identityHint: { flexShrink: 1, fontFamily: GF.regular, fontSize: 13, color: L.textMuted },
    choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    choice: { paddingHorizontal: 14, minHeight: 36, justifyContent: "center", borderRadius: RADIUS.chip, backgroundColor: L.surfaceAlt },
    choiceOn: { backgroundColor: ACCENT.sky.fill },
    choiceText: { fontFamily: GF.body, fontSize: 14, color: L.text },
    choiceTextOn: { fontFamily: GF.bold, color: "#FFFFFF" },
    prefRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    prefTitle: { fontFamily: GF.bold, fontSize: 17, lineHeight: 22, color: L.text },
    prefNote: { fontFamily: GF.regular, fontSize: 13, lineHeight: 17, color: L.textMuted },
    version: { fontFamily: GF.regular, fontSize: 15, color: L.textMuted, fontVariant: ["tabular-nums"] },
    switch: { width: 52, height: 32, borderRadius: 16, padding: 3, backgroundColor: "#CFC6B6", justifyContent: "center" },
    switchOn: { backgroundColor: ACCENT.mint.fill },
    knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF", ...ELEVATION.low },
    knobOn: { alignSelf: "flex-end" },
    editorPage: { backgroundColor: L.screen },
    editor: { paddingHorizontal: 18, gap: 16 },
    editorHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    nameInput: {
      alignSelf: "stretch",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: RADIUS.button,
      borderWidth: 1.5,
      borderColor: "rgba(28,43,58,0.25)",
      backgroundColor: L.surfaceAlt,
      fontFamily: GF.display,
      fontSize: 22,
      color: L.text,
      textAlign: "center",
    },
    flow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    swatchRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
    swatch: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
    error: { fontFamily: GF.body, fontSize: 14, lineHeight: 19, color: "#FFFFFF", padding: 12, borderRadius: 14, backgroundColor: ACCENT.berry.fill, overflow: "hidden" },
  },
  {
    // The dusk map: ink paper, hairlines instead of shadows.
    coinPill: { backgroundColor: D.surface, borderColor: D.hairline },
    coinPillText: { color: D.text },
    tabs: { backgroundColor: D.surfaceAlt },
    tabOn: { backgroundColor: D.surface, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    tabText: { color: D.textMuted },
    tabTextOn: { color: D.text },
    heroCard: { backgroundColor: D.surface, shadowOpacity: 0, elevation: 0, boxShadow: "none", borderTopWidth: 1, borderColor: D.hairline },
    heroName: { color: D.text },
    powerLabel: { color: D.textMuted },
    powerValue: { color: ACCENT.sun.fill },
    rule: { backgroundColor: D.hairline },
    heroTitle: { color: D.textMuted },
    equipLabel: { color: D.textMuted },
    sectionLabel: { color: D.text },
    statValue: { color: D.text },
    statLabel: { color: D.textMuted },
    levelTitle: { color: D.text },
    levelRank: { color: D.textMuted },
    xpLine: { color: D.textMuted },
    liveTitle: { color: D.text },
    wallTitle: { color: D.text },
    prize: { color: TEXT_ON_DARK.warning },
    wallFaction: { color: D.textMuted },
    wallTokens: { color: D.textMuted },
    note: { color: D.textMuted },
    identityName: { color: D.text },
    identityHint: { color: D.textMuted },
    choice: { backgroundColor: D.surfaceAlt },
    choiceText: { color: D.text },
    prefTitle: { color: D.text },
    prefNote: { color: D.textMuted },
    version: { color: D.textMuted },
    switch: { backgroundColor: "#3A4766" },
    editorPage: { backgroundColor: D.screen },
    nameInput: { backgroundColor: D.surfaceAlt, borderColor: D.hairline, color: D.text },
  },
);
