// ==========================================
// SPARKS LAYOUT (Figma M03-M05 · "Layout choice pending · Adewale")
// ==========================================
// "rail"   - Option A: circles down the right side of the chat
// "orbit"  - Option B: a strip of circles under the pinned bar (default)
// "inline" - Option C: Spark cards inside the conversation
//
// Change this one word to switch layouts; everything else stays the same.
// Default "orbit": on phones it keeps messages full width (the rail
// squeezes every bubble), keeps Sparks in one predictable place at the top
// (inline cards scroll away and push messages apart), and still shows
// pulsing, quiet and revived Sparks at a glance.
export type SparkLayout = "rail" | "orbit" | "inline";

export const SPARK_LAYOUT: SparkLayout = "orbit";
