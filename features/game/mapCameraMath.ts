// The world map's camera maths (components/game/WorldMap.tsx), pure so it can
// be tested. A board point p lands on screen at  anchor + R(rot) * zoom * (p - cam),
// where cam is the board point under the anchor. All are worklets: the
// gestures run them on the UI thread.

export type Cam = { x: number; y: number; zoom: number; rot: number };
export type Pt = { x: number; y: number };

/** Where a board point is on screen. */
export function toScreen(cam: Cam, anchor: Pt, p: Pt): Pt {
  "worklet";
  const c = Math.cos(cam.rot);
  const n = Math.sin(cam.rot);
  const dx = (p.x - cam.x) * cam.zoom;
  const dy = (p.y - cam.y) * cam.zoom;
  return { x: anchor.x + c * dx - n * dy, y: anchor.y + n * dx + c * dy };
}

/** The board point under a screen point. */
export function toBoard(cam: Cam, anchor: Pt, s: Pt): Pt {
  "worklet";
  const c = Math.cos(cam.rot);
  const n = Math.sin(cam.rot);
  const dx = s.x - anchor.x;
  const dy = s.y - anchor.y;
  return { x: cam.x + (c * dx + n * dy) / cam.zoom, y: cam.y + (-n * dx + c * dy) / cam.zoom };
}

/** The camera after a finger moved (dx, dy) on screen: the board moves with it. */
export function panned(cam: Cam, dx: number, dy: number): Pt {
  "worklet";
  const c = Math.cos(cam.rot);
  const n = Math.sin(cam.rot);
  return { x: cam.x - (c * dx + n * dy) / cam.zoom, y: cam.y - (-n * dx + c * dy) / cam.zoom };
}

/** The camera centre that keeps the board point under `focal` there after the zoom/turn changes to `next`. */
export function keepFocal(cam: Cam, anchor: Pt, focal: Pt, next: { zoom: number; rot: number }): Pt {
  "worklet";
  const w = toBoard(cam, anchor, focal);
  const c = Math.cos(next.rot);
  const n = Math.sin(next.rot);
  const dx = focal.x - anchor.x;
  const dy = focal.y - anchor.y;
  return { x: w.x - (c * dx + n * dy) / next.zoom, y: w.y - (-n * dx + c * dy) / next.zoom };
}

/** The same angle, in (-PI, PI]: the short way round to north. */
export function shortAngle(a: number): number {
  "worklet";
  const t = 2 * Math.PI;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}
