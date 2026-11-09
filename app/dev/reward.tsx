// TEST BUILDS ONLY (EXPO_PUBLIC_E2E=1): the real reward screen after a 3D fight, built by the same
// functions GameRoot uses, from a fight's result and (when judged) the server's verdict. A recording
// can then show what a fight paid without the fight on this device (cq 019: practice beside judged).
//   cosquest://dev/reward?d=<base64url JSON {fight, point, before, outcome?}>
// fight: Godot's result; point: {name, realm}; before: the standing at the fight's start;
// outcome: /v1/duel/finish's answer (absent = the practice reward). Every other build sends this route home.
import { Redirect, router, useLocalSearchParams } from "expo-router";

import Reward, { rewardFromDuel } from "@/components/game/Reward";
import type { DuelOutcome, QuestPoint, RoamStanding } from "@/features/game/wire";
import { fightStats, parseFightResult, rewardFrom3D } from "@/features/game3d/fight3d";

const E2E = process.env.EXPO_PUBLIC_E2E === "1";

type Shot = { fight: unknown; point: { name: string; realm: string }; before: RoamStanding | null; outcome?: DuelOutcome };

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

export default function DevReward() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  if (!E2E) return <Redirect href="/" />;
  const shot = decode(d);
  const r = shot ? parseFightResult(shot.fight) : null;
  if (!shot || !r) return <Redirect href="/" />;
  const o = shot.outcome;
  const reward = o
    ? { ...rewardFromDuel(o, shot.point as QuestPoint, o.point?.before ?? shot.before, o.point?.after ?? null), stats: fightStats(r) }
    : rewardFrom3D(r, shot.point, shot.before);
  return <Reward reward={reward} onDone={() => router.replace("/")} />;
}
