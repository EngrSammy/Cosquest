// "From the Forge": the weapons the Forge portal has published, in the
// Relicdex next to the player's Relics, and one weapon's card.
// costquest-ios Features/ForgeFeature.swift (ForgeArmourySection,
// ForgeWeaponDetail), read from GET v1/catalogue (features/game/forge.ts).
//
// A first look only, as on iOS: the server has no route for a player to get,
// equip or trade a Forge weapon, so nothing here offers to.
// The weapon's 3D model (iOS: a GLB turning on a small stage, RealityKit, the
// native CostQuestModelView island) shows on its card when the build has the
// view, the island is not turned off (EXPO_PUBLIC_GAME_2D) and the weapon has
// a model, downloaded and checked by features/game/forgeDevice.ts. Otherwise,
// and on Android, the card shows the server's own thumbnail of that model when
// the build made one, and else draws it in 2D: the shape read from its name,
// the colour from its rarity.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { type ForgeElement, forgeDetailSubtitle, forgeKind, forgeNumber, forgeThumbnailUrl, forgeTileTag } from "@/features/game/forge";
import { ensureForgeModel, FORGE_3D_AVAILABLE, syncForgeModels, useForgeModels, weaponHas3d } from "@/features/game/forgeDevice";
import { factionLabel, rarityName } from "@/features/game/relics";
import { useForge } from "@/features/game/relicsLive";
import { GAME_SERVER, useGame } from "@/features/game/runtime";
import { CostQuestModelView } from "@/modules/costquest-game/src";

import { Chip, GameHeading, GameIconButton, GamePanel, MAX_FONT_SCALE, pressFeedback } from "./kit";
import { ELEVATION, labelOn, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { RelicArt, RelicSunburst, rarityColor, rarityInk } from "./RelicArt";
import { GF, GP, realmColor } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** ForgeLook.accent. */
export const FORGE_ACCENT = "#F57329";

/** The weapon's picture: the server's thumbnail if it has one and it loads, else drawn. */
function ForgeArt({ weapon, size, width }: { weapon: ForgeElement; size: number; width: 256 | 512 }) {
  const [broken, setBroken] = useState(false);
  const url = forgeThumbnailUrl(GAME_SERVER, weapon, width);
  if (url && !broken) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size }}
        contentFit="contain"
        cachePolicy="disk"
        onError={() => setBroken(true)}
        accessible={false}
      />
    );
  }
  return <RelicArt kind={forgeKind(weapon.name)} rarity={weapon.rarity ?? "common"} size={size * 0.9} />;
}

export function ForgeArmourySection({ onPick }: { onPick: (id: string) => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const { weapons, source } = useForge();
  const models = useForgeModels();
  // ForgeCatalogueModel.refresh: bring the models down once the catalogue is in.
  useEffect(() => {
    if (weapons.length) void syncForgeModels(weapons, source === "network");
  }, [weapons, source]);
  if (!weapons.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head} accessible accessibilityRole="header" accessibilityLabel={`From the Forge, ${weapons.length} weapons`}>
        <View style={[styles.mark, { backgroundColor: FORGE_ACCENT }]} />
        <GameHeading text="From the Forge" size={22} />
        <View style={{ flex: 1 }} />
        <Text style={styles.count} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {weapons.length}
        </Text>
      </View>
      <Text style={styles.blurb} maxFontSizeMultiplier={MAX_FONT_SCALE}>{"Fresh from the Forge. Look, don't touch: these can't be equipped yet."}</Text>
      <View style={styles.grid}>
        {weapons.map((w) => (
          <ForgeTile key={w.id} weapon={w} has3d={FORGE_3D_AVAILABLE && !!models[w.id]} onPress={() => onPick(w.id)} />
        ))}
      </View>
    </View>
  );
}

function ForgeTile({ weapon: w, has3d, onPress }: { weapon: ForgeElement; has3d: boolean; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const rarity = w.rarity ?? "common";
  return (
    <Pressable
      onPressIn={pressFeedback}
      onPress={onPress}
      style={({ pressed }) => [styles.tileWrap, { transform: [{ scale: pressed ? 0.95 : 1 }], opacity: pressed ? 0.94 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Forge weapon: ${w.name}, ${rarity}, damage ${forgeNumber(w.stats?.damage)}`}>
      <View>
        <View style={[styles.tile, { borderColor: rarityColor(rarity) }, !look.dark && ELEVATION.low]}>
          <ForgeArt weapon={w} size={46} width={256} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.tileName} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {w.name}
            </Text>
            <Text style={[styles.tileRarity, { color: rarityInk(rarity) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {rarityName(rarity).toUpperCase()}
            </Text>
            <View style={styles.dmg}>
              <Ionicons name="flame" size={12} color={GP.berry} />
              <Text style={styles.dmgText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {forgeNumber(w.stats?.damage)}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <Text style={[styles.tag, { color: labelOn(FORGE_ACCENT) }]} maxFontSizeMultiplier={1.2}>
        {forgeTileTag(has3d)}
      </Text>
    </Pressable>
  );
}

export function ForgeWeaponDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const { weapons } = useForge();
  const config = useGame((s) => s.config);
  const models = useForgeModels();
  const reduced = useReducedMotion();
  const w = weapons.find((x) => x.id === id);
  // Opened before the sync reached this weapon: fetch (or verify) its model now.
  const wanted = w && weaponHas3d(w) ? w : null;
  useEffect(() => {
    if (wanted && !models[wanted.id]) void ensureForgeModel(wanted).then((uri) => (uri ? syncForgeModels([wanted], false) : undefined));
  }, [wanted, models]);
  if (!w) return null;
  const rarity = w.rarity ?? "common";
  const tint = rarityColor(rarity);
  const modelUri = FORGE_3D_AVAILABLE ? models[w.id] : undefined;
  const show3d = !!modelUri && CostQuestModelView !== null;
  return (
    <View style={styles.panelWrap}>
      <GamePanel padding={18}>
        <View style={styles.stack}>
          <View style={styles.chips}>
            <Chip text={rarityName(rarity)} color={tint} />
            {w.realm ? <Chip text={factionLabel(config?.factions, w.realm)} color={realmColor(w.realm)} /> : null}
            <Chip text="Forge" color={FORGE_ACCENT} />
            <View style={{ flex: 1 }} />
            <GameIconButton icon="close" diameter={36} onPress={onClose} accessibilityLabel="Close the weapon card" />
          </View>
          <View style={styles.stage} accessible={!show3d} accessibilityLabel={`${w.name}, drawn`}>
            <View style={styles.burst} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <RelicSunburst color={tint} size={360} />
            </View>
            {show3d && CostQuestModelView ? (
              <CostQuestModelView
                style={styles.model}
                uri={modelUri}
                tint={tint}
                spin={!reduced}
                accessibilityLabel={`${w.name}, a 3D model. Drag to turn it.`}
              />
            ) : (
              <ForgeArt weapon={w} size={150} width={512} />
            )}
          </View>
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text style={styles.detailName} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {w.name}
            </Text>
            <Text style={styles.detailSub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {forgeDetailSubtitle(w.version, show3d)}
            </Text>
          </View>
          <View style={styles.stats}>
            <Stat title="Damage" value={forgeNumber(w.stats?.damage)} icon="flame" colour={GP.berry} />
            <Stat title="Range" value={`${forgeNumber(w.stats?.range_m)} m`} icon="locate" colour={GP.skyDeep} />
            <Stat title="Cooldown" value={`${forgeNumber(w.stats?.cooldown_s)} s`} icon="timer" colour={GP.mint} />
          </View>
          <Text style={styles.note} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {"A Forge first look. It isn't a Relic, so it can't be equipped yet."}
          </Text>
        </View>
      </GamePanel>
    </View>
  );
}

function Stat({ title, value, icon, colour }: { title: string; value: string; icon: keyof typeof Ionicons.glyphMap; colour: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${title} ${value}`}>
      <Ionicons name={icon} size={16} color={colour} />
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {value}
      </Text>
      <Text style={styles.statTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {title}
      </Text>
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    section: { gap: 10 },
    head: { flexDirection: "row", alignItems: "center", gap: 8 },
    // The section's colour as a short rule beside its title (no icon-in-a-circle).
    mark: { width: 4, height: 22, borderRadius: 2 },
    count: { fontFamily: GF.display, fontSize: 17, lineHeight: 22, color: L.textMuted, fontVariant: ["tabular-nums"] },
    blurb: { fontFamily: GF.regular, fontSize: 13, lineHeight: 18, color: L.textMuted },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tileWrap: { width: "48%", paddingTop: 8 },
    tile: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 8,
      borderRadius: RADIUS.button,
      borderWidth: 1.5,
      backgroundColor: L.surface,
    },
    tileName: { fontFamily: GF.bold, fontSize: 15, lineHeight: 18, color: L.text },
    tileRarity: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 0.4 },
    dmg: { flexDirection: "row", alignItems: "center", gap: 3 },
    dmgText: { fontFamily: GF.body, fontSize: 12, color: TEXT_ON_LIGHT.danger },
    tag: {
      position: "absolute",
      top: 0,
      right: -2,
      fontFamily: GF.bold,
      fontSize: 12,
      lineHeight: 15,
      letterSpacing: 0.4,
      backgroundColor: FORGE_ACCENT,
      paddingHorizontal: 7,
      paddingVertical: 1,
      borderRadius: RADIUS.chip,
      overflow: "hidden",
    },
    panelWrap: { width: "100%", maxWidth: 380 },
    stack: { gap: 12 },
    chips: { flexDirection: "row", alignItems: "center", gap: 6 },
    // 230 high, the paper's well with the rarity sunburst behind the model (no navy void).
    stage: { height: 230, borderRadius: RADIUS.card, overflow: "hidden", backgroundColor: L.surfaceAlt, alignItems: "center", justifyContent: "center" },
    burst: { position: "absolute", opacity: 0.35, alignItems: "center", justifyContent: "center" },
    model: { ...StyleSheet.absoluteFill },
    detailName: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text, textAlign: "center" },
    detailSub: { fontFamily: GF.regular, fontSize: 14, color: L.textMuted },
    stats: { flexDirection: "row", gap: 8 },
    stat: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 14, backgroundColor: L.surfaceAlt },
    statValue: { fontFamily: GF.display, fontSize: 18, lineHeight: 22, color: L.text },
    statTitle: { fontFamily: GF.body, fontSize: 12, color: L.textMuted },
    note: { fontFamily: GF.regular, fontSize: 13, lineHeight: 18, color: L.textMuted, textAlign: "center" },
  },
  {
    count: { color: D.textMuted },
    blurb: { color: D.textMuted },
    tile: { backgroundColor: D.surface },
    tileName: { color: D.text },
    dmgText: { color: TEXT_ON_DARK.danger },
    stage: { backgroundColor: D.surfaceAlt },
    detailName: { color: D.text },
    detailSub: { color: D.textMuted },
    stat: { backgroundColor: D.surfaceAlt },
    statValue: { color: D.text },
    statTitle: { color: D.textMuted },
    note: { color: D.textMuted },
  },
);
