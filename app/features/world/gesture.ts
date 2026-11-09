// SWIPE BETWEEN WORLDS: the gesture rules, as plain functions.
//
// The app is two pages side by side: the chat (page 0) and the game (page 1).
// These functions decide WHEN the world swipe may start, WHERE it may start,
// and WHERE it lands when the finger lifts. They have no React or native
// imports so they run in plain Node tests (features/world/__tests__) and in
// Reanimated worklets alike. docs/merged-app-ux.md explains every number.

import { BUBBLE_HEIGHT, bubbleTop } from "./bubbleZone.ts";

export type WorldPage = "chat" | "game";

/** How wide the edge zones are, in points. */
export const EDGE_WIDTH = 22;
/** Past this share of the screen, a slow release commits to the other page. */
export const COMMIT_FRACTION = 0.35;
/** A flick this fast (points/second) commits whatever the distance... */
export const FLICK_VELOCITY = 650;
/** ...as long as it travelled at least this share of the screen. */
export const FLICK_MIN_FRACTION = 0.08;
/** Horizontal travel before the pan activates (lets taps through). */
export const ACTIVATE_OFFSET_X = 10;
/** Vertical travel that cancels the pan (it was a scroll). */
export const FAIL_OFFSET_Y = 18;
/** Parallax: the chat drifts this share of the screen while the game slides in. */
export const PARALLAX = 0.28;
/** How far the chat shrinks back at full travel. */
export const CHAT_SCALE_AT_GAME = 0.94;
/** How dark the chat gets at full travel. */
export const CHAT_DIM_AT_GAME = 0.55;

/** What is going on in the app that might forbid starting the world swipe. */
export type SwipeContext = {
  page: WorldPage;
  /** The native game is present (not web, not Expo Go). */
  gameAvailable: boolean;
  /** The software keyboard is up: the user is typing. */
  keyboardVisible: boolean;
  /** The call screen is full screen (it covers everything anyway). */
  callFullscreen: boolean;
  /** A settle animation is still running. */
  settling: boolean;
};

/**
 * May the world swipe start at all right now?
 * (Chat screens pushed on top of the tabs, sheets and modals cover the edge
 * zones, so they never need a rule here: the zone is simply not reachable.)
 */
export function worldSwipeAllowed(ctx: SwipeContext): boolean {
  "worklet";
  if (ctx.settling) return false;
  if (ctx.callFullscreen) return false;
  if (ctx.page === "chat") {
    return ctx.gameAvailable && !ctx.keyboardVisible;
  }
  // Leaving the game is always allowed (Android Back and the bubble too).
  return true;
}

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The strip where the world swipe may begin.
 * Chat: the RIGHT edge (the game is to the right), between the top bar and the
 * floating tab bar, so the header buttons and tabs near the edge keep their taps.
 * Game: the LEFT edge, between the game's top bar and its bottom cards.
 */
export function edgeZone(opts: {
  page: WorldPage;
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
}): Rect {
  const { page, width, height, topInset, bottomInset } = opts;
  if (page === "chat") {
    // Header (~64) under the status bar; tab bar is 68 tall, 24 off the bottom.
    const top = topInset + 64;
    const bottom = Math.max(bottomInset, 0) + 24 + 68 + 8;
    return { x: width - EDGE_WIDTH, y: top, width: EDGE_WIDTH, height: Math.max(0, height - top - bottom) };
  }
  // Game: below its top bar (the player chip sits top left, ~56 tall) and
  // above its bottom card area, so the game's own buttons keep their taps.
  const top = topInset + 64;
  const bottom = Math.max(bottomInset, 0) + 96;
  return { x: 0, y: top, width: EDGE_WIDTH, height: Math.max(0, height - top - bottom) };
}

export function inRect(rect: Rect, x: number, y: number): boolean {
  "worklet";
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * Finger travel -> world progress (0 = chat, 1 = game), following the finger
 * 1:1. From chat the finger moves LEFT (negative x); from the game, RIGHT.
 */
export function progressFor(from: WorldPage, translationX: number, width: number): number {
  "worklet";
  if (width <= 0) return from === "chat" ? 0 : 1;
  const travelled = from === "chat" ? -translationX / width : 1 - translationX / width;
  return Math.min(1, Math.max(0, travelled));
}

/** Where a release lands. Flicks win; otherwise the commit line decides. */
export function settleTarget(opts: {
  from: WorldPage;
  progress: number;
  velocityX: number;
}): WorldPage {
  "worklet";
  const { from, progress, velocityX } = opts;
  const travelled = from === "chat" ? progress : 1 - progress;
  // Toward the game is a leftward flick; toward the chat, rightward.
  const towardOther = from === "chat" ? -velocityX : velocityX;
  if (towardOther >= FLICK_VELOCITY && travelled >= FLICK_MIN_FRACTION) {
    return from === "chat" ? "game" : "chat";
  }
  if (towardOther <= -FLICK_VELOCITY) return from;
  if (travelled >= COMMIT_FRACTION) return from === "chat" ? "game" : "chat";
  return from;
}

/**
 * Did this drag step cross the commit line? Returns +1 when crossing toward
 * the other page (the haptic "it will go" tick), -1 crossing back, 0 neither.
 */
export function crossedCommit(from: WorldPage, before: number, after: number): -1 | 0 | 1 {
  "worklet";
  const line = from === "chat" ? COMMIT_FRACTION : 1 - COMMIT_FRACTION;
  const wasPast = from === "chat" ? before >= line : before <= line;
  const isPast = from === "chat" ? after >= line : after <= line;
  if (!wasPast && isPast) return 1;
  if (wasPast && !isPast) return -1;
  return 0;
}

/** Settle duration in ms: shorter for the rest of a long drag. */
export function settleDuration(progress: number, target: WorldPage, reduceMotion: boolean): number {
  "worklet";
  if (reduceMotion) return 160;
  const remaining = target === "game" ? 1 - progress : progress;
  // A full programmatic open (the handle, Join, a link) is 280 ms, inside the
  // 300 ms budget for "swipe to an interactive game" once it is warm.
  return Math.round(120 + 160 * Math.min(1, Math.max(0, remaining)));
}

/** The chat layer at a given progress: drift, shrink, dim (reduce motion: dim only). */
export function chatLayer(progress: number, width: number, reduceMotion: boolean) {
  "worklet";
  if (reduceMotion) {
    return { translateX: 0, scale: 1, dim: progress * CHAT_DIM_AT_GAME, radius: 0 };
  }
  return {
    translateX: -progress * width * PARALLAX,
    scale: 1 - (1 - CHAT_SCALE_AT_GAME) * progress,
    dim: progress * CHAT_DIM_AT_GAME,
    radius: 28 * progress,
  };
}

/**
 * The game layer at a given progress: slides in from the right (reduce motion:
 * cross-fades in place), under a veil of the player's faction colour that
 * lifts as it arrives, so the map "fades up" out of the faction colour.
 */
export function gameLayer(progress: number, width: number, reduceMotion: boolean) {
  "worklet";
  // Opaque for the first 55% of the travel, then lifting to nothing at rest.
  const veil = Math.min(1, Math.max(0, (1 - progress) / 0.45));
  if (reduceMotion) {
    return { translateX: 0, opacity: progress, veil };
  }
  return { translateX: (1 - progress) * width, opacity: 1, veil };
}

/** Android caps the system-gesture exclusion at this much height per screen edge (dp). */
export const ANDROID_EXCLUSION_MAX = 200;

/**
 * Android gesture navigation: the left and right screen edges belong to the
 * system Back gesture. Where the world swipe has its doorway (the handle on
 * the chat's right edge, the chat bubble on the game's left edge) the app
 * takes the edge back with View.systemGestureExclusionRects, so a drag there
 * follows the finger instead of firing Back. Android honours at most 200 dp
 * per edge, so the rect is the 200 dp centred on the doorway, inside the edge
 * zone. Everywhere else on the edge the system Back gesture still works, and
 * on the game page it does exactly what the swipe does: back to the chat.
 */
export function androidGestureExclusion(opts: {
  page: WorldPage;
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
}): Rect[] {
  const zone = edgeZone(opts);
  if (zone.height <= 0) return [];
  // The doorway's centre: the handle / bubble top (bubbleZone.ts) + half its height.
  const doorway = bubbleTop(opts.height, opts.topInset) + BUBBLE_HEIGHT / 2;
  const h = Math.min(ANDROID_EXCLUSION_MAX, zone.height);
  const top = Math.min(Math.max(doorway - h / 2, zone.y), zone.y + zone.height - h);
  // The bubble sticks out 60 pt from the game's left edge; the strip is 22.
  const w = opts.page === "game" ? 60 : Math.max(EDGE_WIDTH, 32);
  const x = opts.page === "game" ? 0 : opts.width - w;
  return [{ x, y: Math.round(top), width: w, height: Math.round(h) }];
}
