// TEST BUILDS ONLY (EXPO_PUBLIC_E2E=1): the real fight result screen (DuelResult) for a verdict and a
// 3D fight's whole result, so a recording can show the result sheet without a fight on this device.
//   cosquest://dev/result?d=<base64url JSON {outcome, fight?, start?}>
// outcome: /v1/duel/finish's answer; fight: Godot's result (fight.gd result()); start: the duel's start.
// Every other build sends this route home.
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { ComponentType } from "react";
import { View } from "react-native";

import DuelResult from "@/components/game/DuelResult";
import type { DuelOutcome, DuelStart } from "@/features/game/wire";

const E2E = process.env.EXPO_PUBLIC_E2E === "1";

type Shot = { outcome: DuelOutcome; fight?: Record<string, unknown> | null; start?: DuelStart | null };

function decode(raw: string | string[] | undefined): Shot | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Shot;
  } catch {
    return null;
  }
}

export default function DevResult() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  if (!E2E) return <Redirect href="/" />;
  const shot = decode(d);
  if (!shot?.outcome) return <Redirect href="/" />;
  const Any = DuelResult as unknown as ComponentType<Record<string, unknown>>;
  return (
    <View style={{ flex: 1, backgroundColor: "#3a2340" }}>
      <Any outcome={shot.outcome} start={shot.start ?? null} fight={shot.fight ?? null} onDone={() => router.replace("/")} />
    </View>
  );
}
