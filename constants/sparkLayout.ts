// ==========================================
// SPARKS LAYOUT (Figma M03-M05 · "Layout choice pending · Adewale")
// ==========================================
// "rail"   - Option A: circles down the right side of the chat
// "orbit"  - Option B: a strip of circles under the pinned bar (default)
// "inline" - Option C: Spark cards inside the conversation
//
// The choice is still pending (Mark / the team), so all three are built and
// one setting picks between them: Settings > Appearance > "Sparks layout".
// It's saved on this phone/browser only. It is a preview switch for the
// team, not a group rule, so every member sees the same chat until a layout
// is chosen; then set DEFAULT_SPARK_LAYOUT and remove the switch.
//
// EXPO_PUBLIC_SPARK_LAYOUT=rail|orbit|inline changes the default for a build.
//
// Default "orbit": on phones it keeps messages full width (the rail
// squeezes every bubble), keeps Sparks in one predictable place at the top
// (inline cards scroll away and push messages apart), and still shows
// pulsing, quiet and revived Sparks at a glance.
import { useSyncExternalStore } from "react";

import { getPref, setPref } from "@/utils/prefsStorage";

export type SparkLayout = "rail" | "orbit" | "inline";

export const SPARK_LAYOUTS: { key: SparkLayout; option: string; title: string; detail: string }[] = [
  { key: "rail", option: "A", title: "Side rail", detail: "Spark circles down the right side" },
  { key: "orbit", option: "B", title: "Top orbit", detail: "A strip of Sparks under the pinned bar" },
  { key: "inline", option: "C", title: "Inline cards", detail: "Spark cards inside the conversation" },
];

function isLayout(value: unknown): value is SparkLayout {
  return value === "rail" || value === "orbit" || value === "inline";
}

const ENV_LAYOUT = process.env.EXPO_PUBLIC_SPARK_LAYOUT;

export const DEFAULT_SPARK_LAYOUT: SparkLayout = "rail";

const PREF_KEY = "sparks.layout";

let current: SparkLayout = DEFAULT_SPARK_LAYOUT;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function load() {
  if (loaded) return;
  loaded = true;
  getPref(PREF_KEY).then((saved) => {
    if (isLayout(saved) && saved !== current) {
      current = saved;
      emit();
    }
  });
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Decided: the side rail for everyone. A saved choice from the old preview
// switch, or EXPO_PUBLIC_SPARK_LAYOUT, no longer changes it.
export function getSparkLayout(): SparkLayout {
  return "rail";
}

export function setSparkLayout(layout: SparkLayout) {
  if (layout === current) return;
  current = layout;
  emit();
  setPref(PREF_KEY, layout);
}

export function useSparkLayout(): SparkLayout {
  return useSyncExternalStore(subscribe, getSparkLayout, getSparkLayout);
}
