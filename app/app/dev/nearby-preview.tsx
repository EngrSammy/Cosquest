// TEST BUILDS ONLY (EXPO_PUBLIC_E2E=1, or a dev build): the world map with a
// fixed set of Quest Points round Westminster and the Nearby tray over it, so
// the tray's design can be looked at (and screenshotted) without a location,
// a server or a signed-in player.   cosquest://dev/nearby-preview
// Every other build sends this route home.
import { Redirect } from "expo-router";
import { useState } from "react";
import { useSharedValue } from "react-native-reanimated";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NearbyTray } from "@/components/game/NearbyTray";
import WorldMap from "@/components/game/WorldMap";
import { bearingDeg, distanceM, fromLocal } from "@/features/game/geo";
import type { QuestPoint } from "@/features/game/wire";

const ON = process.env.EXPO_PUBLIC_E2E === "1" || __DEV__;

const ME = { lat: 51.50092, lng: -0.12424, accuracy: 8 };
const at = (x: number, z: number) => fromLocal(ME, { x, z });
const soon = (min: number) => new Date(Date.now() + min * 60000).toISOString();

const POINTS: QuestPoint[] = [
  { id: "a", name: "Westminster Bridge", ...at(40, 25), source: "landmark", place_kind: "bridge", tier: "rare", realm: "marvel", challenge: "trivia" },
  { id: "b", name: "Big Ben Guardian", ...at(-120, 160), source: "landmark", place_kind: "tower", tier: "epic", realm: "dc", challenge: "duel", extra: { guardian: "The Clockwarden" } },
  { id: "c", name: "Parliament Square", ...at(-260, 40), source: "landmark", place_kind: "square", tier: "common", realm: "marvel", challenge: "sequence", cooling_until: soon(6) },
  { id: "d", name: "The London Eye", ...at(330, 120), source: "raid", place_kind: "wheel", tier: "epic", realm: "dc", challenge: "duel", extra: { expires_at: soon(14) } },
  { id: "e", name: "Whitehall Gardens", ...at(90, 380), source: "landmark", place_kind: "park", tier: "common", realm: "dc", challenge: "rebus", extra: { holder: "dc", holder_name: "DC" } },
  { id: "f", name: "St Thomas' Steps", ...at(220, -300), source: "signal", place_kind: "steps", tier: "common", realm: "marvel", challenge: "blitz" },
  { id: "g", name: "Lambeth Palace Gate", ...at(60, -520), source: "landmark", place_kind: "gate", tier: "rare", realm: "dc", challenge: "trivia" },
];

export default function NearbyPreview() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; n: number } | null>(null);
  const mapRot = useSharedValue(0);
  const mapBusy = useSharedValue(false);
  if (!ON) return <Redirect href="/" />;
  const near = [...POINTS].sort((p, q) => distanceM(ME, p) - distanceM(ME, q));
  const inReach = (p: QuestPoint) => distanceM(ME, p) < 60;
  const cooling = (p: QuestPoint) => !!p.cooling_until && Date.parse(p.cooling_until) > Date.now();
  return (
    <View style={StyleSheet.absoluteFill}>
      <WorldMap
        ground={null}
        centre={ME}
        fix={ME}
        points={near}
        reachM={60}
        selectedId={selected}
        inReach={inReach}
        cooling={cooling}
        factionColor="#E5484D"
        onSelect={(p) => setSelected(p.id)}
        camRot={mapRot}
        mapBusy={mapBusy}
        flyTo={flyTo}
      />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 10 }} pointerEvents="box-none">
        <NearbyTray
          points={near}
          suggested="a"
          distanceOf={(p) => distanceM(ME, p)}
          bearingOf={(p) => bearingDeg(ME, p)}
          inReach={inReach}
          cooling={cooling}
          newCard={(p) => p.id === "f"}
          onSelect={(p) => {
            setFlyTo((f) => ({ lat: p.lat, lng: p.lng, n: (f?.n ?? 0) + 1 }));
            setSelected(p.id);
          }}
          mapRot={mapRot}
          mapBusy={mapBusy}
        />
      </View>
    </View>
  );
}
