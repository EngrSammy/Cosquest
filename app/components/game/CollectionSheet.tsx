// The Collection: everything the player holds, in one sheet behind one rail
// button. Two tabs:
// - Relics, the Relicdex: every Relic in the game by faction (your own
//   first), the ones you have found with their level, the one in your hand;
//   tap one for its card, where you equip it or spend shards on a level.
//   costquest-ios Features/RelicsFeature.swift (RelicdexSheet, RelicDetail).
// - Forge: the Forge finds you own and the characters you may wear, on the 3D
//   turntable, with one equip button (ForgeWorld.tsx ForgeBagPanel). It used
//   to be a separate sheet behind a chip under the profile.
// Which tab an opener lands on: features/game/collection.ts.
//
// The server decides what you own, what a level costs and whether you can
// have it (app/roam_relics.py): a refusal ("Needs 20 shards") is shown in its
// own words. Nothing here is bought with money.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type ReactNode, useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSheetMotion } from "./sheetMotion";

import {
  abilityIcon,
  abilityLine,
  abilityName,
  canLevel,
  catalogueOf,
  equippedRelic,
  factionLabel,
  factionsInOrder,
  isMaxed,
  kindName,
  levelCost,
  levelNow,
  lockedHint,
  ownedRelic,
  powerNow,
  rarityName,
  type RelicFull,
  type RelicsPayload,
  type RelicStub,
  totalShards,
} from "@/features/game/relics";
import { forgeStore, relicsStore, useRelics } from "@/features/game/relicsLive";
import { useGame } from "@/features/game/runtime";
import { SPRING_RELIC_DETAIL, SPRING_SHARD_BAR } from "@/features/game/spring";

import type { CollectionTab } from "@/features/game/collection";

import { ForgeArmourySection, ForgeWeaponDetail } from "./ForgeArmoury";
import { ForgeBagPanel } from "./ForgeWorld";
import { GameBackdrop } from "./GameBackdrop";
import { announce, Chip, GameButton, GameHeading, GameIconButton, GamePanel, MAX_FONT_SCALE, pressFeedback } from "./kit";
import { RelicArt, RelicPips, RelicSunburst, rarityColor, rarityInk, SHARD } from "./RelicArt";
import { SheetHeader } from "./SheetHeader";
import { playSound } from "./sound";
import { ACCENT, ELEVATION, labelOn, RADIUS, RARITY, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { GF, realmColor } from "./theme";
import { useOnScreen } from "./useOnScreen";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { ErrorState } from "@/components/kit";

type Picked = { kind: "relic"; id: string } | { kind: "forge"; id: string } | null;

const TAB_NAMES: Record<CollectionTab, string> = { relics: "Relics", forge: "Forge" };

export default function CollectionSheet({ onClose, initial, tabs }: { onClose: () => void; initial: CollectionTab; tabs: CollectionTab[] }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [tab, setTab] = useState<CollectionTab>(tabs.includes(initial) ? initial : (tabs[0] ?? "relics"));
  const insets = useSafeAreaInsets();
  const motion = useSheetMotion();
  const me = useGame((s) => s.me);
  const relics = useRelics();
  const [picked, setPicked] = useState<Picked>(null);

  useEffect(() => {
    if (tabs.includes("relics")) void relicsStore.refresh();
    void forgeStore.refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back closes the card first (this listener is newer than the game's).
  const onScreen = useOnScreen();
  useEffect(() => {
    if (!picked || !onScreen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setPicked(null);
      return true;
    });
    return () => sub.remove();
  }, [picked, onScreen]);

  const close = () => {
    relicsStore.clearProblem();
    setPicked(null);
  };
  const p = relics.payload;

  return (
    <Animated.View entering={motion.entering} exiting={motion.exiting} style={[styles.sheet, { top: insets.top + 40 }]}>
      <GameBackdrop tint={RARITY.epic} />
      <View style={styles.head}>
        <SheetHeader title="Collection" onClose={onClose} closeLabel="Close the Collection" />
      </View>
      {tabs.length > 1 ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                if (t === tab) return;
                Haptics.selectionAsync().catch(() => {});
                setPicked(null);
                setTab(t);
              }}
              style={[styles.tab, tab === t && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              accessibilityLabel={TAB_NAMES[t]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextOn]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {TAB_NAMES[t]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {tab === "forge" ? (
        <ForgeBagPanel />
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {p ? (
            <>
              <View style={styles.chips}>
                <Chip text={`${p.owned.length} of ${p.catalogue_size} found`} color={ACCENT.sky.fill} />
                {totalShards(p) > 0 ? <Chip text={`${totalShards(p)} shards`} color={SHARD} /> : null}
              </View>
              <Hero payload={p} onPick={(id) => setPicked({ kind: "relic", id })} />
              {tabs.includes("forge") ? null : <ForgeArmourySection onPick={(id) => setPicked({ kind: "forge", id })} />}
              {factionsInOrder(me?.faction).map((f) => (
                <FactionSection key={f} faction={f} payload={p} mine={f === me?.faction} onPick={(id) => setPicked({ kind: "relic", id })} />
              ))}
            </>
          ) : relics.failed ? (
            <>
              {/* Task 059: the shared kit's error state, in the game's tone. */}
              <ErrorState tone="game" compact title="Couldn't load your Relics" onRetry={() => void relicsStore.refresh()} />
              {tabs.includes("forge") ? null : <ForgeArmourySection onPick={(id) => setPicked({ kind: "forge", id })} />}
            </>
          ) : (
            <RelicsSkeleton />
          )}
        </ScrollView>
      )}

      {picked ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, styles.scrim]} accessibilityViewIsModal>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close the card" accessibilityRole="button" />
          <Pop key={`${picked.kind}:${picked.id}`}>
            {picked.kind === "relic" ? (
              <RelicDetail id={picked.id} stub={p?.catalogue.find((s) => s.id === picked.id) ?? null} onClose={close} />
            ) : (
              <ForgeWeaponDetail id={picked.id} onClose={close} />
            )}
          </Pop>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** A card popping in: scale from 0.88 with a fade, `.spring(response: 0.35, dampingFraction: 0.78)`; a fade under Reduce Motion. */
function Pop({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduced = useReducedMotion();
  const k = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    k.set(reduced ? withTiming(1, { duration: 150 }) : withSpring(1, SPRING_RELIC_DETAIL));
  }, [k, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, k.get() * 1.4)),
    transform: [{ scale: reduced ? 1 : 0.88 + 0.12 * k.get() }],
  }));
  return (
    <Animated.View style={[styles.cardWrap, style]} pointerEvents="box-none">
      {children}
    </Animated.View>
  );
}

/** The Relic in hand, big, because it is the one that goes into a siege. */
function Hero({ payload, onPick }: { payload: RelicsPayload; onPick: (id: string) => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const r = equippedRelic(payload);
  if (!r) return null;
  return (
    <Pressable
      onPressIn={pressFeedback}
      onPress={() => onPick(r.id)}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
      accessibilityRole="button"
      accessibilityLabel={`Equipped: ${r.name}, power ${powerNow(r)}. Shows the Relic.`}
    >
      <GamePanel padding={14}>
        <View style={styles.hero}>
          <RelicArt kind={r.kind} rarity={r.rarity} size={86} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={[styles.kicker, { color: rarityInk(r.rarity) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              EQUIPPED
            </Text>
            <Text style={styles.heroName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {r.name}
            </Text>
            <View style={styles.row}>
              <Ionicons name="flame" size={15} color={ACCENT.berry.fill} />
              <Text style={styles.power} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {powerNow(r)}
              </Text>
              <Ionicons name={abilityIcon(r.ability)} size={15} color={ACCENT.sky.fill} />
              <Text style={styles.ability} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {abilityName(r.ability)}
              </Text>
            </View>
            <RelicPips level={levelNow(r)} tint={rarityColor(r.rarity)} />
          </View>
        </View>
      </GamePanel>
    </Pressable>
  );
}

function FactionSection({ faction, payload, mine, onPick }: { faction: string; payload: RelicsPayload; mine: boolean; onPick: (id: string) => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const config = useGame((s) => s.config);
  const all = catalogueOf(payload, faction);
  if (!all.length) return null;
  const have = all.filter((s) => ownedRelic(payload, s.id)).length;
  const colour = realmColor(faction);
  const name = factionLabel(config?.factions, faction);
  return (
    <View style={{ gap: 10 }}>
      <View
        style={styles.row}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${name}${mine ? ", yours" : ""}: ${have} of ${all.length}`}
        importantForAccessibility="yes"
      >
        <View style={[styles.mark, { backgroundColor: colour }]} />
        <GameHeading text={name} size={22} inHeader />
        {mine ? <Chip text="Yours" color={colour} /> : null}
        <View style={{ flex: 1 }} />
        <Text style={styles.count} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`${have}/${all.length}`}</Text>
      </View>
      <View style={styles.grid}>
        {all.map((s) => (
          <Tile key={s.id} stub={s} relic={ownedRelic(payload, s.id)} equipped={payload.equipped === s.id} onPress={() => onPick(s.id)} />
        ))}
      </View>
    </View>
  );
}

function Tile({ stub: s, relic: r, equipped, onPress }: { stub: RelicStub; relic: RelicFull | null; equipped: boolean; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const owned = r !== null;
  return (
    <Pressable
      onPressIn={pressFeedback}
      onPress={onPress}
      style={({ pressed }) => [styles.tileWrap, { transform: [{ scale: pressed ? 0.95 : 1 }], opacity: pressed ? 0.94 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={owned ? `${s.name}, ${s.rarity}, level ${levelNow(r)}${equipped ? ", equipped" : ""}` : `Not found yet, ${s.rarity}`}
    >
      <View>
        <View
          style={[
            styles.tile,
            owned ? styles.tileOwned : styles.tileLocked,
            owned && !look.dark && ELEVATION.low,
            { borderColor: equipped ? ACCENT.mint.fill : owned ? rarityColor(s.rarity) : "transparent", borderWidth: equipped ? 3 : 1.5 },
          ]}
        >
          <RelicArt kind={r?.kind ?? s.kind ?? "blade"} rarity={s.rarity} owned={owned} size={54} />
          {r ? (
            <RelicPips level={levelNow(r)} tint={rarityColor(s.rarity)} size={4} />
          ) : (
            <Text style={styles.lockedRarity} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {rarityName(s.rarity).toUpperCase()}
            </Text>
          )}
        </View>
      </View>
      {equipped ? (
        <View style={[styles.corner, { backgroundColor: ACCENT.mint.fill }]}>
          <Ionicons name="checkmark" size={11} color="#FFF" />
        </View>
      ) : r && canLevel(r) ? (
        <View style={[styles.corner, { backgroundColor: ACCENT.sun.fill }]}>
          <Ionicons name="arrow-up" size={11} color={ACCENT.sun.label} />
        </View>
      ) : null}
    </Pressable>
  );
}

// ---------- the card ----------

function RelicDetail({ id, stub, onClose }: { id: string; stub: RelicStub | null; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const { payload, busy, problem, levelled } = useRelics();
  const look = useLook();
  const config = useGame((s) => s.config);
  const reduced = useReducedMotion();
  const r = ownedRelic(payload, id);
  const bump = useSharedValue(1);
  const lastLevelled = levelled?.id === id ? levelled.serial : 0;
  // Only a level bought while this card is open: not one from before it.
  const [openedAt] = useState(lastLevelled);
  useEffect(() => {
    if (!lastLevelled || lastLevelled === openedAt || reduced) return;
    // keyframeAnimator: SpringKeyframe(1.25, 0.18 s) then SpringKeyframe(1.0, 0.4 s).
    bump.set(withSequence(withSpring(1.25, { duration: 180 }), withSpring(1, { duration: 400 })));
  }, [lastLevelled, openedAt, bump, reduced]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.get() }] }));
  // iOS has no live regions: say a refusal when it arrives.
  useEffect(() => {
    if (problem) announce(problem);
  }, [problem]);

  if (!r) return <LockedDetail stub={stub} onClose={onClose} />;
  const tint = rarityColor(r.rarity);
  const isEquipped = payload?.equipped === r.id;

  return (
    <View style={styles.panelWrap}>
      <GamePanel padding={18}>
        <View style={styles.stack}>
          <View style={styles.row}>
            <Chip text={rarityName(r.rarity)} color={tint} />
            <Chip text={r.faction_name ?? factionLabel(config?.factions, r.faction)} color={realmColor(r.faction)} />
            <View style={{ flex: 1 }} />
            <GameIconButton icon="close" diameter={36} onPress={onClose} accessibilityLabel="Close the Relic card" />
          </View>
          <View style={styles.artStage}>
            {/* Sunburst, 260 wide at half strength, masked to a 200 circle. */}
            <View style={styles.burst} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <RelicSunburst color={tint} size={260} />
            </View>
            <Animated.View style={bumpStyle}>
              <RelicArt kind={r.kind} rarity={r.rarity} size={130} />
            </Animated.View>
          </View>
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text style={styles.detailName} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {r.name}
            </Text>
            <Text style={styles.detailSub} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`${kindName(r.kind)} · Level ${levelNow(r)}`}</Text>
          </View>
          <View style={[styles.row, { justifyContent: "center", gap: 10 }]}>
            <View style={styles.stat} accessible accessibilityLabel={`Power ${powerNow(r)}`}>
              <Ionicons name="flame" size={18} color={ACCENT.berry.fill} />
              <Text style={styles.statValue} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {powerNow(r)}
              </Text>
              <Text style={styles.statTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Power
              </Text>
            </View>
            <View style={styles.stat} accessible accessibilityLabel={abilityName(r.ability)}>
              <Ionicons name={abilityIcon(r.ability)} size={18} color={ACCENT.sky.fill} />
              <Text style={styles.statTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {abilityName(r.ability)}
              </Text>
            </View>
          </View>
          <Text style={styles.abilityText}>{r.ability_text ?? abilityLine(r.ability)}</Text>
          {r.lore ? <Text style={styles.lore}>{`“${r.lore}”`}</Text> : null}
          <View style={{ alignItems: "center" }}>
            <RelicPips level={levelNow(r)} tint={tint} size={10} />
          </View>
          {!isMaxed(r) ? <ShardBar relic={r} /> : null}
          {problem ? <Text style={styles.problem}>{problem}</Text> : null}
          <View style={styles.actions}>
            {!isMaxed(r) ? (
              <GameButton
                title="Level up"
                color={ACCENT.sun.fill}
                size="medium"
                style={{ flex: 1 }}
                icon={<Ionicons name="arrow-up-circle" size={20} color={canLevel(r) && !busy ? labelOn(ACCENT.sun.fill) : "#5A6878"} />}
                disabled={!canLevel(r) || busy}
                accessibilityLabel={canLevel(r) ? `Level up for ${levelCost(r)} shards` : `Level up: needs ${levelCost(r)} shards`}
                onPress={async () => {
                  // RelicsModel.levelUp: fanfare and success on a level, an error buzz when refused.
                  const got = await relicsStore.levelUp(r.id);
                  if (got) {
                    playSound("fanfare");
                    announce(`${got.name} is level ${levelNow(got)}`);
                  }
                  Haptics.notificationAsync(got ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
                }}
              />
            ) : null}
            {isEquipped ? (
              <View style={styles.equippedTag} accessible accessibilityLabel={`${r.name} is in your hand`}>
                <Ionicons name="checkmark-circle" size={20} color={look.dark ? TEXT_ON_DARK.success : TEXT_ON_LIGHT.success} />
                <Text style={styles.equippedText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  Equipped
                </Text>
              </View>
            ) : (
              <GameButton
                title="Equip"
                color={ACCENT.mint.fill}
                size="medium"
                style={{ flex: 1 }}
                icon={<Ionicons name="hand-left" size={18} color="#FFFFFF" />}
                disabled={busy}
                accessibilityLabel={`Equip ${r.name}`}
                onPress={async () => {
                  // RelicsModel.equip: a medium impact once the server has taken it (no sound: a button press is quiet).
                  const ok = await relicsStore.equip(r.id);
                  if (!ok) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  announce(`${r.name} equipped`);
                }}
              />
            )}
          </View>
        </View>
      </GamePanel>
    </View>
  );
}

function ShardBar({ relic: r }: { relic: RelicFull }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduced = useReducedMotion();
  const have = r.shards ?? 0;
  const cost = levelCost(r);
  const frac = have / Math.max(1, cost);
  const full = frac >= 1;
  const width = useSharedValue(Math.min(1, frac));
  useEffect(() => {
    // `.spring(response: 0.4, dampingFraction: 0.7)` on the shard count.
    const to = Math.min(1, frac);
    width.set(reduced ? withTiming(to, { duration: 150 }) : withSpring(to, SPRING_SHARD_BAR));
  }, [frac, reduced, width]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, width.get())) * 100}%` }));
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`Shards ${have} of ${cost}`}>
      <View style={styles.row}>
        <Ionicons name="diamond" size={13} color={SHARD} />
        <Text style={styles.shardLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          Shards
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.shardCount} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`${have} / ${cost}`}</Text>
      </View>
      <View style={styles.track}>
        {/* Shards in the epic colour; Sun once there are enough for a level. */}
        <Animated.View style={[styles.fill, { minWidth: 12, backgroundColor: full ? ACCENT.sun.fill : SHARD }, fill]} />
      </View>
      <Text style={styles.shardNote} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {full ? "Enough shards: level up for +8% power." : "Every duplicate you find breaks into shards."}
      </Text>
    </View>
  );
}

function LockedDetail({ stub, onClose }: { stub: RelicStub | null; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.lockedWrap}>
      <GamePanel padding={18}>
        <View style={[styles.stack, { alignItems: "center" }]}>
          <View style={[styles.row, { alignSelf: "stretch" }]}>
            {stub ? <Chip text={rarityName(stub.rarity)} color={rarityColor(stub.rarity)} /> : null}
            <View style={{ flex: 1 }} />
            <GameIconButton icon="close" diameter={36} onPress={onClose} accessibilityLabel="Close the Relic card" />
          </View>
          <RelicArt kind={stub?.kind ?? "blade"} rarity={stub?.rarity ?? "common"} owned={false} size={120} />
          <Text style={styles.detailName} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {stub?.name ?? "Unknown Relic"}
          </Text>
          <Text style={styles.lockedTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Not found yet
          </Text>
          <Text style={styles.abilityText}>{lockedHint(stub?.rarity)}</Text>
        </View>
      </GamePanel>
    </View>
  );
}

/** While the Relicdex loads: its shape in the paper's well (the equipped card, a heading, a row of tiles), not a spinner. */
function RelicsSkeleton() {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={{ gap: 16 }} accessible accessibilityLabel="Loading your Relics">
      <View style={[styles.skel, { height: 116, borderRadius: RADIUS.card }]} />
      <View style={[styles.skel, { width: 150, height: 22 }]} />
      <View style={styles.grid}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <View key={i} style={[styles.skel, styles.tileWrap, { height: 86, borderRadius: RADIUS.button }]} />
        ))}
      </View>
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: RADIUS.sheet,
      borderTopRightRadius: RADIUS.sheet,
      backgroundColor: L.screen,
      elevation: 18,
      overflow: "hidden",
    },
    head: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10 },
    // One segmented control across the sheet: a well, the chosen tab lifted on paper (Profile uses the same).
    tabs: { flexDirection: "row", gap: 4, marginHorizontal: 16, marginBottom: 10, padding: 3, borderRadius: RADIUS.button, backgroundColor: L.surfaceAlt },
    tab: { flex: 1, minHeight: 36, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    tabOn: { backgroundColor: L.surface, ...ELEVATION.low },
    tabText: { fontFamily: GF.body, fontSize: 15, lineHeight: 19, color: L.textMuted },
    tabTextOn: { fontFamily: GF.bold, color: L.text },
    body: { paddingHorizontal: 18, gap: 18 },
    chips: { flexDirection: "row", gap: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    hero: { flexDirection: "row", alignItems: "center", gap: 14 },
    kicker: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 0.8 },
    heroName: { fontFamily: GF.display, fontSize: 22, lineHeight: 26, color: L.text },
    power: { fontFamily: GF.display, fontSize: 17, lineHeight: 21, color: L.text, marginRight: 8, fontVariant: ["tabular-nums"] },
    ability: { fontFamily: GF.body, fontSize: 15, color: TEXT_ON_LIGHT.info },
    // A faction's colour as a short rule beside its name (no icon-in-a-circle).
    mark: { width: 4, height: 22, borderRadius: 2 },
    count: { fontFamily: GF.display, fontSize: 17, lineHeight: 21, color: L.textMuted, fontVariant: ["tabular-nums"] },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tileWrap: { width: "22.5%", paddingTop: 4 },
    tile: { alignItems: "center", gap: 4, paddingVertical: 6, borderRadius: RADIUS.button, minHeight: 82 },
    tileOwned: { backgroundColor: L.surface },
    tileLocked: { backgroundColor: L.surfaceAlt },
    lockedRarity: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 0.4, color: L.textMuted },
    corner: {
      position: "absolute",
      top: 0,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: L.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    skel: { backgroundColor: L.surfaceAlt, borderRadius: 8 },
    scrim: { backgroundColor: L.scrim, alignItems: "center", justifyContent: "center", padding: 20 },
    cardWrap: { width: "100%", alignItems: "center" },
    panelWrap: { width: "100%", maxWidth: 380 },
    lockedWrap: { width: "100%", maxWidth: 360 },
    stack: { gap: 12 },
    artStage: { height: 160, alignItems: "center", justifyContent: "center" },
    // 260 square at half strength, masked to a 200 circle.
    burst: {
      position: "absolute",
      width: 200,
      height: 200,
      borderRadius: 100,
      overflow: "hidden",
      opacity: 0.5,
      alignItems: "center",
      justifyContent: "center",
    },
    detailName: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text, textAlign: "center" },
    detailSub: { fontFamily: GF.regular, fontSize: 14, color: L.textMuted },
    stat: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.chip, backgroundColor: L.surfaceAlt },
    statValue: { fontFamily: GF.display, fontSize: 20, lineHeight: 24, color: L.text, fontVariant: ["tabular-nums"] },
    statTitle: { fontFamily: GF.body, fontSize: 15, color: L.text },
    abilityText: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.text, textAlign: "center" },
    lore: { fontFamily: GF.regular, fontStyle: "italic", fontSize: 14, lineHeight: 20, color: L.textMuted, textAlign: "center" },
    shardLabel: { fontFamily: GF.bold, fontSize: 13, color: "#6A3FC4" },
    shardCount: { fontFamily: GF.display, fontSize: 15, color: L.text, fontVariant: ["tabular-nums"] },
    track: { height: 12, borderRadius: 6, backgroundColor: "rgba(28,43,58,0.10)", overflow: "hidden" },
    fill: { height: 12, borderRadius: 6 },
    shardNote: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
    problem: { fontFamily: GF.bold, fontSize: 14, color: TEXT_ON_LIGHT.danger, textAlign: "center" },
    actions: { flexDirection: "row", gap: 10 },
    equippedTag: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 50,
      borderRadius: RADIUS.button,
      backgroundColor: L.surfaceAlt,
    },
    equippedText: { fontFamily: GF.display, fontSize: 18, lineHeight: 22, color: TEXT_ON_LIGHT.success },
    lockedTitle: { fontFamily: GF.bold, fontSize: 15, color: L.textMuted },
  },
  {
    // The dusk map: ink paper; the chosen tab lifts by colour, hairlines instead of shadows.
    sheet: { backgroundColor: D.screen },
    tabs: { backgroundColor: D.surfaceAlt },
    tabOn: { backgroundColor: D.surface, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    tabText: { color: D.textMuted },
    tabTextOn: { color: D.text },
    heroName: { color: D.text },
    power: { color: D.text },
    ability: { color: TEXT_ON_DARK.info },
    count: { color: D.textMuted },
    tileOwned: { backgroundColor: D.surface },
    tileLocked: { backgroundColor: D.surfaceAlt },
    lockedRarity: { color: D.textMuted },
    corner: { borderColor: D.surface },
    skel: { backgroundColor: D.surfaceAlt },
    scrim: { backgroundColor: D.scrim },
    detailName: { color: D.text },
    detailSub: { color: D.textMuted },
    stat: { backgroundColor: D.surfaceAlt },
    statValue: { color: D.text },
    statTitle: { color: D.text },
    abilityText: { color: D.text },
    lore: { color: D.textMuted },
    shardLabel: { color: "#C3A6FF" },
    shardCount: { color: D.text },
    track: { backgroundColor: "rgba(255,255,255,0.12)" },
    shardNote: { color: D.textMuted },
    problem: { color: TEXT_ON_DARK.danger },
    equippedTag: { backgroundColor: D.surfaceAlt },
    equippedText: { color: TEXT_ON_DARK.success },
    lockedTitle: { color: D.textMuted },
  },
);
