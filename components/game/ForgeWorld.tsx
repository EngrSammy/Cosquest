// Forge in the world (cq 056): the screens that put published Forge elements
// into play, all driven by the catalogue's contract (type, role, gameplay),
// never by a name. Behind the server's switch (features.forge_world in /me):
// with it off, every piece here renders nothing and the game is as before.
//
// - ForgeDropsLayer: Forge finds on the map (GET v1/roam/forge/drops), as pins
//   with the element's own thumbnail and a rarity ring.
// - ForgeClaim: walk up, see it in 3D, claim it (POST .../claim), the reward
//   moment, equip it.
// - ForgeBagPanel: what you own (equip a weapon: it changes your duels) and
//   the characters you may wear as your avatar (idle / walk / celebrate), the
//   Forge tab of the Collection (CollectionSheet.tsx).
// - PlayerAvatar / ForgeCelebrate: your Forge avatar on the map
//   marker, the profile, and dancing on a reward.
// - ForgePointScene: a point's Forge station (instead of the built-in shrine)
//   standing in its Forge environment.
// - ForgeFighterArt: the Forge weapon you hold, or the Forge character a
//   Guardian or boss is, on the versus card.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { distanceM, distanceText, toLocal, type LatLng } from "@/features/game/geo";
import {
  avatarChoices,
  type ForgeClaim as ClaimResult,
  type ForgeDrop,
  type ForgeEntry,
  fighterCharacter,
  fighterWeapon,
  pointForge,
  rarityRank,
  refusalText,
} from "@/features/game/forgeWorld";
import { claim, equip, figureUrl, refreshInventory, startForgeWorld, thumbUrl, absUrl, useEquipped, useForgeWorld } from "@/features/game/forgeWorldDevice";
import type { QuestPoint } from "@/features/game/wire";
import { gameStore, useGame } from "@/features/game/runtime";

import { bagItems, dropShown, STARTER } from "@/features/game3d/held";
import { MANIFEST, setLocalPick, useCatalogueOn, useLocalPick } from "@/features/game3d/heldDevice";

import ForgeModel, { thumbSource, useForgeEntry } from "./ForgeModel";
import { GameBackdrop } from "./GameBackdrop";
import { GameButton, MAX_FONT_SCALE } from "./kit";
import { SummonButton } from "./SummonAR";
import { MapPin, PIN_SPOT } from "./mapCamera";
import { playSound } from "./sound";
import { ACCENT, ELEVATION, RADIUS, RARITY, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { rarityInk } from "./RelicArt";
import { GF, GP } from "./theme";

/** How close a find must be to claim it; the server has the last word (its own reach). */
export const CLAIM_REACH_M = 40;

/** By rank (common, rare, epic, legendary): the art direction's one rarity set (lookTokens.ts). */
const RARITY_COLOR = [RARITY.common, RARITY.rare, RARITY.epic, RARITY.legendary];
/** The bag stage's bottom band for the name, under the model's feet. */
const NAME_BAND = 40;
/** A bag tile that is neither looked at nor worn. */
const TILE_EDGE = "transparent";
export const rarityColor = (r: string | null | undefined) => RARITY_COLOR[Math.max(0, rarityRank(r))] ?? RARITY_COLOR[0];

/** Whether the server has Forge in the world switched on for this player. */
export function useForgeOn(): boolean {
  return useForgeWorld((s) => s.on);
}

/** Keeps the catalogue, the drops and the bag fresh while the game is up. */
export function useForgeWorldPolling(active: boolean) {
  const me = useGame((s) => s.me);
  const fix = useGame((s) => s.fix);
  useEffect(() => {
    if (!active) return;
    return startForgeWorld();
  }, [active, me?.device_key]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new fix far from the last ask: the poller picks it up on its next beat.
  void fix;
}

// ---------- the map ----------

/**
 * The finds on the map. `place` turns a spot into board pixels (WorldMap's
 * own projection), so the pins slide with the streets; MapPin keeps each one
 * upright and screen-sized as the map turns and zooms.
 */
export function ForgeDropsLayer({ place, onOpen }: { place: (p: LatLng) => { left: number; top: number }; onOpen: (d: ForgeDrop) => void }) {
  const on = useForgeOn();
  const drops = useForgeWorld((s) => s.drops);
  // With the catalogue link on, a placeholder weapon never drops (cq 234).
  const linkOn = useCatalogueOn();
  const entries = useForgeWorld((s) => s.entries);
  if (!on) return null;
  return (
    <>
      {drops
        .filter((d) => dropShown(d, entries, linkOn))
        .map((d) => {
          const at = place(d);
          return (
            <MapPin key={d.id} left={at.left} top={at.top} zIndex={4}>
              <DropPin drop={d} left={PIN_SPOT.left} top={PIN_SPOT.top} onPress={onOpen} />
            </MapPin>
          );
        })}
    </>
  );
}

function DropPin({ drop, left, top, onPress }: { drop: ForgeDrop; left: number; top: number; onPress: (d: ForgeDrop) => void }) {
  const ring = rarityColor(drop.rarity);
  const bob = useSharedValue(0);
  useEffect(() => {
    // A slow 1.6 s glow and bob in the find's rarity colour (art direction 6.4).
    bob.set(withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0, { duration: 800 })), -1));
  }, [bob]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * bob.get() }, { rotate: "45deg" }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.18 + 0.22 * bob.get(), transform: [{ translateY: -4 * bob.get() }, { rotate: "45deg" }, { scale: 1.1 + 0.12 * bob.get() }] }));
  // The drop's own clear-background thumbnail: an opaque cream portrait would cover the diamond's rarity edge.
  const url = absUrl(drop.thumbnail_url);
  return (
    <Pressable
      onPress={() => onPress(drop)}
      hitSlop={6}
      style={[styles.dropPin, { left: left - 24, top: top - 52 }]}
      accessibilityRole="button"
      accessibilityLabel={`Forge find: ${drop.name}, ${drop.rarity ?? "common"}`}
      testID={`forge-drop-${drop.element_id.slice(0, 8)}`}>
      <Animated.View pointerEvents="none" style={[styles.dropGlow, { backgroundColor: ring }, glow]} />
      <Animated.View style={[styles.dropDiamond, { borderColor: ring }, style]}>
        <View style={{ transform: [{ rotate: "-45deg" }], width: 40, height: 40 }}>
          {url ? <Image source={{ uri: url }} style={{ width: 40, height: 40 }} contentFit="contain" /> : <Ionicons name="flash" size={26} color={ring} style={{ margin: 7 }} />}
        </View>
      </Animated.View>
      <View style={styles.dropShadow} />
    </Pressable>
  );
}

/**
 * Your worn Forge hero standing on the map marker's puck (art direction 6.4):
 * the full-body 3/4 render from the catalogue, or null when the server has not
 * rendered one yet (the marker then shows AvatarBadge's face).
 */
export function AvatarFigure() {
  const on = useForgeOn();
  const { avatar } = useEquipped();
  const entry = useForgeEntry(avatar);
  const url = on ? figureUrl(entry, 128) : null;
  if (!url) return null;
  return <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="contain" contentPosition="bottom" accessibilityLabel={`You, as ${entry?.name ?? "your hero"}`} />;
}

/** Whether the worn hero has a standing figure (so the marker can choose figure or face). */
export function useHasAvatarFigure(): boolean {
  const on = useForgeOn();
  const { avatar } = useEquipped();
  const entry = useForgeEntry(avatar);
  return on && !!figureUrl(entry, 128);
}

/**
 * The map's Guardian pins (art direction 6.4): for a point a fight is fought
 * at, the 3/4 portrait of the character the server says guards it
 * (point.forge.guardian). Only a rendered portrait: the build's concept
 * thumbnail is a grey T-pose that reads as nothing at pin size. Undefined
 * while Forge in the world is off, so the map keeps its glyph pins.
 */
export function usePinPortraits(): ((p: QuestPoint) => string | null) | undefined {
  const on = useForgeOn();
  const entries = useForgeWorld((s) => s.entries);
  return useMemo(() => {
    if (!on) return undefined;
    const byId = new Map(entries.map((e) => [e.id, e]));
    return (p: QuestPoint) => {
      const g = pointForge(p).guardian;
      const e = g ? byId.get(g.element_id) : undefined;
      return e?.portrait ? thumbUrl(e, 128) : null;
    };
  }, [on, entries]);
}

/** One point's Guardian portrait at a card size (the pre-fight briefing), or null. */
export function useGuardianPortrait(point: QuestPoint | null | undefined, width: 256 | 512 = 512): { url: string; name: string } | null {
  const on = useForgeOn();
  const id = on && point ? (pointForge(point).guardian?.element_id ?? null) : null;
  const entry = useForgeEntry(id);
  const url = entry?.portrait ? thumbUrl(entry, width) : null;
  return url && entry ? { url, name: entry.name } : null;
}

/**
 * The Guardian standing, full body on a clear page (the same render as its pin
 * portrait), for the pre-fight briefing; null when it has none (then the portrait card).
 */
export function useGuardianFigure(point: QuestPoint | null | undefined): { url: string; name: string } | null {
  const on = useForgeOn();
  const id = on && point ? (pointForge(point).guardian?.element_id ?? null) : null;
  const entry = useForgeEntry(id);
  const url = entry ? figureUrl(entry, 512) : null;
  return url && entry ? { url, name: entry.name } : null;
}

/** Your Forge avatar's face for the map marker and chips: its portrait (or thumbnail), or nothing. */
export function AvatarBadge({ size = 30 }: { size?: number }) {
  const on = useForgeOn();
  const { avatar } = useEquipped();
  const entry = useForgeEntry(avatar);
  const url = on ? thumbUrl(entry, 128) : null;
  if (!url) return null;
  return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,255,255,0.85)" }} contentFit="cover" accessibilityLabel={`${entry?.name ?? "Avatar"}`} />;
}

/**
 * The player's avatar: the Forge character they wear (thumbnail on chips, live
 * 3D on the profile stage), or the game's own avatar when they wear none.
 */
export function PlayerAvatar({ fallback, size, stage }: { fallback: ReactNode; size: number; stage?: boolean }) {
  const on = useForgeOn();
  const { avatar } = useEquipped();
  const entry = useForgeEntry(avatar);
  if (!on || !entry) return <>{fallback}</>;
  if (stage) {
    return <ForgeModel entry={entry} animation="idle" purpose="closeup" style={{ width: size, height: size * 1.4 }} size={size} distance={2.6} />;
  }
  const url = thumbUrl(entry, 128);
  return url ? (
    <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GP.cream }} contentFit="cover" accessibilityLabel={`Avatar: ${entry.name}`} />
  ) : (
    <>{fallback}</>
  );
}

/**
 * The profile's hero stage when you wear a Forge hero: that hero, idling (its
 * thumbnail until the model is on the phone), where the house-colour
 * placeholder figure would stand. Null when none is worn, so the caller keeps
 * its own stage (cq 076: one identity on the HUD, the profile and the fight).
 */
export function ForgeHeroStage({ tint, height }: { tint: string; height: number }) {
  const on = useForgeOn();
  const { avatar } = useEquipped();
  const entry = useForgeEntry(avatar);
  if (!on || !entry) return null;
  return (
    <View style={{ height, alignItems: "center", justifyContent: "flex-end" }} accessible accessibilityLabel={`Your hero, ${entry.name}`}>
      <View style={[hero.floor, { backgroundColor: tint }]} pointerEvents="none" />
      <ForgeModel entry={entry} purpose="closeup" animation={entry.rigged ? "idle" : null} style={{ width: "100%", height: height * 0.94 }} size={height * 0.8} distance={2.5} />
    </View>
  );
}

const hero = StyleSheet.create({
  floor: { position: "absolute", bottom: 8, width: 240, height: 46, borderRadius: 120, opacity: 0.28 },
});

/** On a reward: the avatar (if any) plays its celebrate clip once. */
export function ForgeCelebrate({ size = 150 }: { size?: number }) {
  const on = useForgeOn();
  const { avatar } = useEquipped();
  const entry = useForgeEntry(avatar);
  if (!on || !entry) return null;
  return (
    <Animated.View entering={ZoomIn.delay(250)} style={{ width: size, height: size * 1.3, alignSelf: "center" }} pointerEvents="none">
      <ForgeModel entry={entry} animation={entry.rigged ? "celebrate" : null} purpose="scene" style={StyleSheet.absoluteFill} size={size} distance={2.6} />
    </Animated.View>
  );
}

// ---------- claiming a find ----------

type ClaimPhase = { kind: "look" } | { kind: "claiming" } | { kind: "won"; got: ClaimResult } | { kind: "refused"; reason: string };

export function ForgeClaim({ drop, onClose, onOpenBag }: { drop: ForgeDrop; onClose: () => void; onOpenBag: () => void }) {
  const insets = useSafeAreaInsets();
  const fix = useGame((s) => s.fix);
  const entry = useForgeEntry(drop.element_id);
  const [phase, setPhase] = useState<ClaimPhase>({ kind: "look" });
  const away = fix ? distanceM(fix, drop) : null;
  const near = away !== null && away <= CLAIM_REACH_M;
  const ring = rarityColor(drop.rarity);
  const stats = entry?.gameplay;
  const look = useLook();
  const ink = look.dark ? ring : rarityInk(drop.rarity);

  const doClaim = async () => {
    setPhase({ kind: "claiming" });
    try {
      const got = await claim(drop);
      playSound("fanfare");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPhase({ kind: "won", got });
    } catch (e) {
      playSound("hit");
      setPhase({ kind: "refused", reason: refusalText(e) });
    }
  };
  const doEquip = async () => {
    try {
      await equip("weapon", drop.element_id);
      playSound("coin");
      onClose();
    } catch (e) {
      setPhase({ kind: "refused", reason: refusalText(e) });
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.claimRoot, { backgroundColor: look.screen, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <GameBackdrop tint={ring} />
      <View style={styles.claimTop}>
        <Text style={[styles.kicker, { color: ink }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {phase.kind === "won" ? (phase.got.duplicate ? "ANOTHER ONE" : "YOURS NOW") : `FORGE FIND · ${(drop.rarity ?? "common").toUpperCase()}`}
        </Text>
        <Text style={[styles.claimName, { color: look.text }]} numberOfLines={2} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header">
          {drop.name}
        </Text>
      </View>
      <View style={styles.claimStage}>
        {phase.kind === "won" ? <Sunburst color={ring} /> : null}
        <ForgeModel id={drop.element_id} purpose="closeup" spin style={StyleSheet.absoluteFill} size={320} distance={phase.kind === "won" ? 2.3 : 2.6} />
      </View>
      {stats && (stats.damage || stats.range_m) ? (
        <View style={styles.statRow}>
          <Stat label="Damage" value={stats.damage} />
          <Stat label="Range" value={stats.range_m} unit="m" />
          <Stat label="Cooldown" value={stats.cooldown_s} unit="s" />
          {stats.class ? <Stat label="Fights as" text={stats.class} /> : null}
        </View>
      ) : null}
      <View style={styles.claimActions}>
        {phase.kind === "look" || phase.kind === "claiming" ? (
          <>
            <Text style={[styles.claimHint, { color: look.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {near ? "It's right here. Claim it." : away !== null ? `${distanceText(away)} away. Walk closer to claim it.` : "Finding you…"}
            </Text>
            <GameButton title={phase.kind === "claiming" ? "Claiming…" : "Claim"} color={ring} disabled={!near || phase.kind === "claiming"} onPress={() => void doClaim()} accessibilityLabel="Claim this Forge find" />
            <SummonButton entry={entry} />
          </>
        ) : phase.kind === "won" ? (
          <Animated.View entering={FadeInDown} style={{ gap: 10, width: "100%", alignItems: "center" }}>
            <Text style={[styles.claimHint, { color: look.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {phase.got.duplicate ? `You had one already: +${phase.got.coins} coins.` : "It's in your Collection, under Forge."}
            </Text>
            {drop.type === "weapon" ? <GameButton title="Equip it" color={ACCENT.mint.fill} onPress={() => void doEquip()} accessibilityLabel="Equip this weapon" /> : null}
            <SummonButton entry={entry} />
            <GameButton
              title="Open Collection"
              small
              color={ACCENT.sky.fill}
              onPress={() => {
                onClose();
                onOpenBag();
              }}
            />
          </Animated.View>
        ) : (
          <>
            <Text style={[styles.claimHint, { color: look.dark ? TEXT_ON_DARK.danger : TEXT_ON_LIGHT.danger }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {phase.reason}
            </Text>
            <GameButton title="Try again" small color={ACCENT.sky.fill} onPress={() => setPhase({ kind: "look" })} />
          </>
        )}
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Leave it and go back to the map">
          <Text style={[styles.claimClose, { color: look.textMuted }]}>Back to the map</Text>
        </Pressable>
      </View>
      {phase.kind === "won" ? (
        <View style={styles.claimAvatar} pointerEvents="none">
          <ForgeCelebrate size={110} />
        </View>
      ) : null}
    </Animated.View>
  );
}

function Sunburst({ color }: { color: string }) {
  const spin = useSharedValue(0);
  const still = useReducedMotion();
  useEffect(() => {
    if (!still) spin.set(withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1));
  }, [spin, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  return (
    <Animated.View style={[styles.burst, style]} pointerEvents="none">
      {Array.from({ length: 12 }, (_, i) => (
        <View key={i} style={[styles.ray, { backgroundColor: color, transform: [{ rotate: `${i * 30}deg` }, { translateY: -110 }] }]} />
      ))}
    </Animated.View>
  );
}

function Stat({ label, value, unit, text }: { label: string; value?: number | null; unit?: string; text?: string }) {
  const look = useLook();
  if (text === undefined && (value === null || value === undefined)) return null;
  return (
    <View style={[styles.stat, { backgroundColor: look.surface }, look.dark ? { borderWidth: 1, borderColor: look.hairline } : ELEVATION.low]}>
      <Text style={[styles.statValue, { color: look.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {text ?? `${Math.round((value as number) * 10) / 10}${unit ?? ""}`}
      </Text>
      <Text style={[styles.statLabel, { color: look.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {label}
      </Text>
    </View>
  );
}

// ---------- the bag ----------

/**
 * The Forge's half of the Collection (CollectionSheet.tsx, Forge tab): what
 * you own (equip a weapon: it changes your duels) and the characters you may
 * wear, on the settled 3D turntable. It used to be its own sheet, the Forge
 * bag, opened from a chip under the profile.
 */
export function ForgeBagPanel({ initial = "items" }: { initial?: "items" | "avatar" }) {
  const insets = useSafeAreaInsets();
  const look = useLook();
  const [tab, setTab] = useState<"items" | "avatar">(initial);
  const inventory = useForgeWorld((s) => s.inventory);
  const entries = useForgeWorld((s) => s.entries);
  const stored = useEquipped();
  const [pick, setPick] = useState<string | null>(null);
  const [clip, setClip] = useState<string>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  // Wear / Equip shows at once (the tick, the border, "Take off"), not when
  // the server answers; a refusal puts it back (cq 076).
  const [pending, setPending] = useState<{ slot: "weapon" | "avatar"; id: string | null } | null>(null);
  const equipped = pending ? { ...stored, [pending.slot]: pending.id } : stored;
  useEffect(() => {
    void refreshInventory();
  }, []);
  // The catalogue link (cq 234: EXPO_PUBLIC_FORGE_CATALOGUE and the server's
  // forge_world): placeholder weapons hidden, and the app's starter set
  // listed after what you own, so the bag always has real weapons. Off: as before.
  const linkOn = useCatalogueOn();
  const localPick = useLocalPick();
  const bag = useMemo(() => bagItems(MANIFEST, { entries, owned: inventory?.owned ?? [], linkOn }), [entries, inventory, linkOn]);
  const all = useMemo(() => (bag.starters.length ? [...entries, ...bag.starters] : entries), [entries, bag]);
  const heroes = useMemo(() => avatarChoices(entries), [entries]);
  const list: { id: string; count?: number }[] = tab === "items" ? bag.list : heroes.map((h) => ({ id: h.id }));
  const selected = pick && list.some((x) => x.id === pick) ? pick : (list[0]?.id ?? null);
  const sel = all.find((e) => e.id === selected) ?? null;
  const slot = tab === "items" ? "weapon" : "avatar";
  const starterSlug = sel?.id.startsWith(STARTER) ? sel.id.slice(STARTER.length) : null;
  const isOn = sel ? (starterSlug ? localPick === starterSlug && !equipped.weapon : equipped[slot] === sel.id) : false;

  const toggle = async () => {
    if (!sel || pending) return;
    if (starterSlug) {
      // A starter weapon is held on this phone (the server never sees it); a
      // Forge weapon equipped on the server comes off so this one shows.
      setProblem(null);
      setLocalPick(isOn ? null : starterSlug);
      if (!isOn && equipped.weapon) await equip("weapon", null).catch(() => undefined);
      return;
    }
    if (slot === "weapon" && !isOn) setLocalPick(null);
    const next = isOn ? null : sel.id;
    setProblem(null);
    setPending({ slot, id: next });
    if (slot === "avatar" && next) setClip("celebrate");
    try {
      await equip(slot, next);
    } catch (e) {
      setProblem(refusalText(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        {(["items", "avatar"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setTab(t);
            }}
            style={[styles.tab, { backgroundColor: tab === t ? look.text : look.surfaceAlt }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}>
            <Text style={[styles.tabText, { color: tab === t ? look.surface : look.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t === "items" ? `Weapons (${bag.list.length})` : "Characters"}</Text>
          </Pressable>
        ))}
      </View>
      {sel ? (
        <View style={[styles.bagStage, { backgroundColor: look.surfaceAlt }]}>
          {/* The model stands above the name band, so the name never covers its feet. */}
          <ForgeModel
            entry={sel}
            purpose="closeup"
            animation={sel.type === "character" ? clip : null}
            onAnimationEnd={() => setClip("idle")}
            spin={sel.type !== "character"}
            style={styles.bagModel}
            size={230}
            distance={sel.type === "character" ? 2.7 : 2.6}
          />
          <View style={[styles.bagNameBand, { backgroundColor: look.dark ? "rgba(18,26,38,0.72)" : "rgba(255,253,248,0.88)" }]}>
            <Text style={[styles.bagName, { color: look.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {sel.name}
            </Text>
            {isOn ? (
              <View style={styles.wornChip}>
                <Ionicons name="checkmark-circle" size={14} color="#FFF" />
                <Text style={styles.wornText} maxFontSizeMultiplier={1.2}>
                  {slot === "avatar" ? "Worn" : starterSlug ? "Held" : "Equipped"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={[styles.bagStage, styles.centre, { backgroundColor: look.surfaceAlt }]}>
          <Ionicons name={tab === "items" ? "map" : "person"} size={28} color={look.textMuted} />
          <Text style={[styles.empty, { color: look.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {tab === "items"
              ? "No weapons yet. Forge finds glow on the map: walk up to one and claim it, then equip it here to fight with it."
              : "No heroes to wear yet. New ones arrive from the Forge."}
          </Text>
        </View>
      )}
      {sel ? (
        <View style={styles.bagActions}>
          {sel.type === "character" && sel.rigged
            ? (["idle", "walk", "celebrate"] as const).map((c) => <GameButton key={c} title={c[0].toUpperCase() + c.slice(1)} small color={clip === c ? ACCENT.sky.fill : look.surfaceAlt} onPress={() => setClip(c)} accessibilityLabel={`Play ${c}`} />)
            : null}
          <GameButton title={isOn ? (slot === "avatar" ? "Take off" : starterSlug ? "Put down" : "Unequip") : slot === "avatar" ? "Wear" : starterSlug ? "Hold" : "Equip"} small color={isOn ? ACCENT.berry.fill : ACCENT.mint.fill} onPress={() => void toggle()} />
          {/* "See it here": in the room through the camera (iOS; Android later). */}
          <SummonButton entry={sel} />
        </View>
      ) : null}
      {problem ? <Text style={[styles.empty, { color: look.dark ? TEXT_ON_DARK.danger : TEXT_ON_LIGHT.danger, marginTop: 8 }]}>{problem}</Text> : null}
      <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}>
        {list.map(({ id, count }) => {
          const e = all.find((x) => x.id === id);
          if (!e) return null;
          const src = thumbSource(e, 256);
          const on = id.startsWith(STARTER) ? localPick === id.slice(STARTER.length) && !equipped.weapon : equipped[slot] === id;
          // One meaning per colour: navy is the one you are looking at, mint
          // the one you wear; rarity is the small dot, not the border (cq 076).
          const border = id === selected ? look.text : on ? ACCENT.mint.fill : TILE_EDGE;
          return (
            <Pressable
              key={id}
              onPress={() => {
                setPick(id);
                setClip("idle");
              }}
              style={[styles.tile, { borderColor: border, backgroundColor: look.surface }, !look.dark && ELEVATION.low]}
              accessibilityRole="button"
              accessibilityState={{ selected: id === selected }}
              accessibilityLabel={`${e.name}${on ? ", equipped" : ""}`}>
              {src ? <Image source={src} style={styles.tileImg} contentFit="contain" /> : <Ionicons name="cube" size={34} color={look.textMuted} />}
              <Text style={[styles.tileName, { color: look.text }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                {e.name}
              </Text>
              <View style={[styles.tileRarity, { backgroundColor: rarityColor(e.rarity) }]} />
              {on ? <Ionicons name="checkmark-circle" size={20} color={ACCENT.mint.fill} style={styles.tileBadge} /> : count && count > 1 ? <Text style={[styles.tileCount, { color: look.text }]}>×{count}</Text> : null}
            </Pressable>
          );
        })}

      </ScrollView>
    </View>
  );
}

// ---------- points: station and environment ----------

/** The Forge entries a point is dressed with, when the catalogue has them. */
export function usePointForge(point: unknown): { station: ForgeEntry | null; environment: ForgeEntry | null } {
  const on = useForgeOn();
  const refs = pointForge(point);
  const station = useForgeEntry(on ? refs.station?.element_id : null);
  const environment = useForgeEntry(on ? refs.environment?.element_id : null);
  return { station, environment };
}

/**
 * The point's Forge scene: its station where the shrine would stand, its
 * environment around it (a backdrop behind, or ground under), and your avatar
 * beside it. Null when the point has neither, so the caller keeps its shrine.
 */
export function ForgePointScene({ point, style, celebrate }: { point: unknown; style?: object; celebrate?: boolean }) {
  const { station, environment } = usePointForge(point);
  const { avatar } = useEquipped();
  const me = useForgeEntry(avatar);
  if (!station && !environment) return null;
  const backdrop = environment?.gameplay.placement === "backdrop";
  // Layers, each its own small 3D view with a transparent background: the
  // environment behind (or a prop at the back), the station forward and to
  // the right, your avatar at the left. One model per view is the pattern
  // measured to hold up on the emulator (see ForgeStage). The backdrop's
  // camera stands far enough back that the whole of it fits its view (a
  // closer one cut it off in a hard rectangle at the view's edges), and the
  // three views do not cover each other's middles, so all three read (cq 076).
  return (
    <View style={[{ width: "100%", height: 300 }, style]} pointerEvents="none">
      {environment ? (
        <ForgeModel
          entry={environment}
          purpose="scene"
          style={backdrop ? SCENE.backdrop : SCENE.prop}
          size={300}
          distance={backdrop ? 3.1 : 2.6}
        />
      ) : null}
      {station ? <ForgeModel entry={station} purpose="scene" style={SCENE.station} size={220} distance={2.1} /> : null}
      {me ? <ForgeModel entry={me} purpose="scene" animation={celebrate ? "celebrate" : "idle"} style={SCENE.avatar} size={150} distance={2.4} /> : null}
    </View>
  );
}

/** Where each layer of a point's Forge scene stands, as parts of the scene's box. */
const SCENE = StyleSheet.create({
  // The whole box; its camera distance keeps the model inside it.
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  // A prop environment at the back, between the avatar and the station.
  prop: { position: "absolute", left: "30%", right: "30%", top: 0, height: "55%" },
  // Forward (lower on screen, over the backdrop's floor) and to the right.
  station: { position: "absolute", right: "3%", width: "42%", top: "16%", bottom: 0 },
  // At the left, clear of the station.
  avatar: { position: "absolute", left: "2%", bottom: 0, width: "34%", height: "64%" },
});

// ---------- duels ----------

/** The 3D art for a fighter on the versus card, or null to keep the icon. */
export function ForgeFighterArt({ fighter, size = 72 }: { fighter: unknown; size?: number }) {
  const on = useForgeOn();
  const weapon = fighterWeapon(fighter);
  const character = fighterCharacter(fighter);
  const id = on ? (character?.element_id ?? weapon?.element_id ?? null) : null;
  const entry = useForgeEntry(id);
  if (!entry) return null;
  // The versus card is up for 1.8 s: a 3D view that size could not start in
  // time (the Guardian's slot stayed empty, cq 056), so it shows the
  // element's own thumbnail, which is cached and on screen at once (cq 076).
  // 3D stays where people linger: claim, bag, encounter, the 3D fight.
  const url = thumbUrl(entry, 256);
  return (
    <View style={{ width: size, height: size, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(30,58,76,0.85)" }}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={entry.name} />
      ) : (
        <ForgeModel entry={entry} purpose="thumb" animation={entry.type === "character" ? "idle" : null} style={StyleSheet.absoluteFill} size={size} distance={entry.type === "character" ? 2.5 : 2.4} />
      )}
    </View>
  );
}

/** The map pins' board projection, for WorldMap's overlay (same maths as its own pins). */
export function boardPlacer(origin: LatLng, extent: number, scale: number) {
  return (p: LatLng) => {
    const local = toLocal(origin, p);
    return { left: (local.x + extent) * scale, top: (extent - local.z) * scale };
  };
}

/** The live counter for the More tile badge. */
export function useForgeOwnedCount(): number {
  // With the catalogue link on, a hidden placeholder is not counted (cq 234).
  const linkOn = useCatalogueOn();
  return useForgeWorld((s) => (linkOn ? bagItems(MANIFEST, { entries: s.entries, owned: s.inventory?.owned ?? [], linkOn }).owned.length : (s.inventory?.owned.length ?? 0)));
}

export const forgePlayerName = () => gameStore.playerName();

const styles = StyleSheet.create({
  dropPin: { position: "absolute", width: 48, height: 60, alignItems: "center", zIndex: 4 },
  dropGlow: { position: "absolute", top: 0, width: 44, height: 44, borderRadius: 12 },
  dropDiamond: { width: 44, height: 44, borderRadius: 10, borderWidth: 3, backgroundColor: SURFACES.light.surface, alignItems: "center", justifyContent: "center", ...ELEVATION.low },
  dropShadow: { width: 18, height: 6, borderRadius: 9, marginTop: 6, backgroundColor: "rgba(16,24,40,0.2)" },
  claimRoot: { alignItems: "center", paddingHorizontal: 20, zIndex: 50 },
  claimTop: { alignItems: "center", gap: 4 },
  kicker: { fontFamily: GF.bold, fontSize: 13, lineHeight: 16, letterSpacing: 1 },
  claimName: { fontFamily: GF.display, fontSize: 40, lineHeight: 44, textAlign: "center" },
  claimStage: { width: "100%", flex: 1, maxHeight: 420, alignItems: "center", justifyContent: "center" },
  burst: { position: "absolute", width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  ray: { position: "absolute", width: 18, height: 160, borderRadius: 9, opacity: 0.18 },
  statRow: { flexDirection: "row", gap: 10, marginVertical: 8 },
  stat: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.chip },
  statValue: { fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
  statLabel: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16 },
  claimActions: { width: "100%", alignItems: "center", gap: 10 },
  claimHint: { fontFamily: GF.body, fontSize: 15, lineHeight: 21, textAlign: "center" },
  claimClose: { fontFamily: GF.bold, fontSize: 15, padding: 8 },
  claimAvatar: { position: "absolute", left: 8, bottom: 90 },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 18, marginTop: 4 },
  // Weapons / Characters: small filter chips under the Collection's own tabs (ink when chosen).
  tab: { paddingHorizontal: 14, minHeight: 34, justifyContent: "center", borderRadius: RADIUS.chip },
  tabText: { fontFamily: GF.body, fontSize: 14, lineHeight: 18 },
  // The paper's well, warm by day and ink by dusk (no navy void behind the model).
  bagStage: { height: 270, marginHorizontal: 18, marginTop: 10, borderRadius: RADIUS.card, overflow: "hidden" },
  bagModel: { position: "absolute", left: 0, right: 0, top: 0, bottom: NAME_BAND },
  bagNameBand: { position: "absolute", left: 0, right: 0, bottom: 0, height: NAME_BAND, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 },
  bagName: { flexShrink: 1, fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
  wornChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.chip, backgroundColor: ACCENT.mint.fill },
  wornText: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, color: "#FFFFFF" },
  bagActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 18, paddingTop: 10, justifyContent: "center" },
  centre: { alignItems: "center", justifyContent: "center", padding: 20, gap: 10 },
  empty: { fontFamily: GF.body, fontSize: 15, lineHeight: 21, textAlign: "center", paddingHorizontal: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 18 },
  tile: { width: 100, height: 132, borderRadius: RADIUS.button, borderWidth: 2, alignItems: "center", justifyContent: "center", padding: 6 },
  tileImg: { width: 72, height: 72 },
  tileName: { fontFamily: GF.body, fontSize: 12, lineHeight: 15, textAlign: "center" },
  tileRarity: { position: "absolute", top: 7, left: 7, width: 10, height: 10, borderRadius: 5 },
  tileBadge: { position: "absolute", top: 4, right: 4 },
  tileCount: { position: "absolute", top: 4, right: 6, fontFamily: GF.display, fontSize: 13 },
});

/** Whether the player wears a Forge avatar the catalogue can show (for the map marker). */
export function useHasForgeAvatar(): boolean {
  const on = useForgeOn();
  const { avatar } = useEquipped();
  const entry = useForgeEntry(avatar);
  return on && !!entry;
}


