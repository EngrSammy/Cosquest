// Weapons in hand (cq 234): which bone of a character holds a weapon, where
// the hand closes, and how each class of weapon sits in it. One answer for
// the Godot fight (a BoneAttachment3D on the hand bone, the matrix below as
// its child's transform) and the Filament previews (the weapon's nodes put
// under the hand bone's node of the character's GLB: mergeWeaponGlb), so a
// sword sits the same way in the bag, on the versus card and in the fight.
//
// Pure: no React, no files. The cast's answers are precomputed into
// app/game3d/data/attach.json by app/game3d/tools/weapons/make_attach.ts with
// these same functions; a character the manifest doesn't know (a new Forge
// hero) gets them computed from its own GLB at run time.
// Docs: docs/game3d/WEAPONS.md. Tested in __tests__/attach.test.ts.

/** 4x4 matrix, column-major (glTF's `matrix` layout). */
export type Mat4 = number[];
export type Vec3 = [number, number, number];

// ---------- the weapon's hand pose class ----------

/** How a weapon is held. A weapon's class is its pack's grip (bundled set), else read from its name and kind. */
export type GripClass = "sword" | "greatsword" | "dagger" | "axe" | "hammer" | "staff" | "crossbow" | "rifle" | "shield";
export const GRIP_CLASSES: readonly GripClass[] = ["sword", "greatsword", "dagger", "axe", "hammer", "staff", "crossbow", "rifle", "shield"];

/** Name words first (a "Crossbow" is not a bow held like a sword), then the backend kind (blade, axe, hammer, gauntlet, staff, bow). */
export function gripClassOf(name: string | null | undefined, kind: string | null | undefined): GripClass {
  const n = (name ?? "").toLowerCase();
  const words: [string, GripClass][] = [
    ["shield", "shield"],
    ["buckler", "shield"],
    ["crossbow", "crossbow"],
    ["rifle", "rifle"],
    ["repeater", "rifle"],
    ["blaster", "rifle"],
    ["gun", "rifle"],
    ["greatsword", "greatsword"],
    ["claymore", "greatsword"],
    ["dagger", "dagger"],
    ["knife", "dagger"],
    ["hammer", "hammer"],
    ["mace", "hammer"],
    ["staff", "staff"],
    ["wand", "staff"],
    ["spear", "staff"],
    ["axe", "axe"],
    ["bow", "crossbow"],
  ];
  for (const [w, c] of words) if (n.includes(w)) return c;
  switch (kind) {
    case "axe":
      return "axe";
    case "hammer":
      return "hammer";
    case "staff":
      return "staff";
    case "bow":
      return "crossbow";
    case "gauntlet":
      return "shield";
    default:
      return "sword";
  }
}

/**
 * A class's pose in the hand, in words the hand understands: where the
 * weapon's tip (+Y) and its edge (+Z) point, as mixes of the hand's own
 * directions. f: forward (where the thumb points in the rest pose), u: up
 * the forearm, o: away from the body, w: world up. `offset` moves the grip
 * (metres, same directions), `hand` is the hand that holds it.
 */
export type Dir = { f?: number; u?: number; o?: number; w?: number };
export type GripPose = { hand: "r" | "l"; tip: Dir; edge: Dir; offset?: Dir; note?: string };

// ---------- the hand ----------

export type HandFrame = {
  /** The bone's node index in the GLB, and its name. */
  node: number;
  bone: string;
  /** Where the hand closes, model space (metres). */
  palm: Vec3;
  /** The hand's directions in model space (unit vectors). */
  f: Vec3;
  u: Vec3;
  o: Vec3;
  /** The hand bone's rest transform, model space. */
  bone_matrix: Mat4;
};

type GltfNode = { name?: string; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; mesh?: number; skin?: number };
export type Gltf = {
  nodes?: GltfNode[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  skins?: { joints: number[] }[];
  [k: string]: unknown;
};

const RIGHT = [/^(mixamorig[:_]?)?righthand$/i, /^hand[._]?r$/i, /^r[._]?hand$/i, /^hand[._]?right$/i, /^bip\d*[ _]r[ _]hand$/i, /righthand$/i, /hand.*[._]r$/i];
const LEFT = [/^(mixamorig[:_]?)?lefthand$/i, /^hand[._]?l$/i, /^l[._]?hand$/i, /^hand[._]?left$/i, /^bip\d*[ _]l[ _]hand$/i, /lefthand$/i, /hand.*[._]l$/i];

/** The hand bones of a skinned GLB: Mixamo names first, then the common rig spellings. Only joints count. */
export function findHandBones(g: Gltf): { r: number | null; l: number | null } {
  const joints = new Set((g.skins ?? []).flatMap((s) => s.joints));
  const nodes = g.nodes ?? [];
  const find = (pats: RegExp[]) => {
    for (const p of pats) {
      const i = nodes.findIndex((n, k) => joints.has(k) && !!n.name && p.test(n.name));
      if (i >= 0) return i;
    }
    return null;
  };
  return { r: find(RIGHT), l: find(LEFT) };
}

// ---------- matrices ----------

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

/** glTF TRS (or matrix) of a node as a matrix. */
export function nodeMatrix(n: GltfNode): Mat4 {
  if (n.matrix && n.matrix.length === 16) return [...n.matrix];
  const [tx, ty, tz] = (n.translation ?? [0, 0, 0]) as number[];
  const [x, y, z, w] = (n.rotation ?? [0, 0, 0, 1]) as number[];
  const [sx, sy, sz] = (n.scale ?? [1, 1, 1]) as number[];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** General 4x4 inverse (affine with scale is all we meet). */
export function invert(m: Mat4): Mat4 {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return [...IDENTITY];
  const d = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
};
const col = (m: Mat4, c: number): Vec3 => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];

/** Every node's model-space rest matrix (the default scene's hierarchy). */
export function globalMatrices(g: Gltf): Map<number, Mat4> {
  const out = new Map<number, Mat4>();
  const nodes = g.nodes ?? [];
  const walk = (i: number, parent: Mat4) => {
    const m = mul(parent, nodeMatrix(nodes[i] ?? {}));
    out.set(i, m);
    for (const c of nodes[i]?.children ?? []) walk(c, m);
  };
  const roots = g.scenes?.[g.scene ?? 0]?.nodes;
  if (roots) for (const r of roots) walk(r, IDENTITY);
  else {
    const child = new Set(nodes.flatMap((n) => n.children ?? []));
    nodes.forEach((_, i) => !child.has(i) && walk(i, IDENTITY));
  }
  return out;
}

const parentOf = (g: Gltf, i: number) => (g.nodes ?? []).findIndex((n) => (n.children ?? []).includes(i));

/**
 * The hand's frame in its rest pose. The model faces +Z with +Y up (glTF, as
 * every Forge character). The hand points from the forearm joint to the hand
 * joint (and on along the bone); the grip is half a hand length past the hand
 * joint; f is the model's forward made square to the hand, u is up the
 * forearm, o is away from the body.
 */
export function handFrame(g: Gltf, node: number, side: "r" | "l"): HandFrame | null {
  const gm = globalMatrices(g);
  const H = gm.get(node);
  if (!H) return null;
  const h = col(H, 3);
  const p = parentOf(g, node);
  const P = p >= 0 ? gm.get(p) : undefined;
  const fore = P ? sub(h, col(P, 3)) : ([0, -0.26, 0] as Vec3);
  let d = norm(fore);
  const boneY = norm(col(H, 1));
  // The rig's own bone axis when it agrees with the arm (Blender bones point down their length).
  if (dot(boneY, d) > 0.5) d = norm(add(scale(d, 0.5), scale(boneY, 0.5)));
  const handLen = Math.min(0.12, Math.max(0.06, len(fore) * 0.38));
  const palm = add(h, scale(d, handLen * 0.5));
  const fwd: Vec3 = [0, 0, 1];
  let f = norm(sub(fwd, scale(d, dot(fwd, d))));
  if (len(f) < 0.5) f = [0, 0, 1];
  const u = scale(d, -1);
  // away from the body: the side the hand is on (right hand: -X)
  let o = side === "r" ? cross(f, u) : cross(u, f);
  if ((side === "r" && o[0] > 0) || (side === "l" && o[0] < 0)) o = scale(o, -1);
  const name = (g.nodes ?? [])[node]?.name ?? String(node);
  return { node, bone: name, palm: palm.map((x) => +x.toFixed(5)) as Vec3, f, u, o: norm(o), bone_matrix: H };
}

const dirOf = (fr: Pick<HandFrame, "f" | "u" | "o">, d: Dir): Vec3 =>
  add(add(scale(fr.f, d.f ?? 0), scale(fr.u, d.u ?? 0)), add(scale(fr.o, d.o ?? 0), scale([0, 1, 0], d.w ?? 0)));

/**
 * Where a weapon of this class sits, as a matrix in the hand bone's own
 * space: the transform of the weapon's root (its grip) under the hand bone.
 * The weapon keeps its real size: the bone's scale is taken out.
 */
export function gripMatrix(fr: HandFrame, pose: GripPose): Mat4 {
  const y = norm(dirOf(fr, pose.tip));
  let z = dirOf(fr, pose.edge);
  z = norm(sub(z, scale(y, dot(z, y))));
  if (len(z) < 0.5) z = norm(cross(y, fr.o));
  const x = cross(y, z);
  const at = add(fr.palm, dirOf(fr, pose.offset ?? {}));
  const W: Mat4 = [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, at[0], at[1], at[2], 1];
  return mul(invert(fr.bone_matrix), W).map((v) => +v.toFixed(6));
}

// ---------- the manifest ----------

export type CharacterAttach = {
  name: string;
  rig: string;
  bone_r: string | null;
  bone_l: string | null;
  palm_r?: Vec3;
  palm_l?: Vec3;
  /** class -> {bone, matrix} */
  grips: Partial<Record<GripClass, { bone: string; matrix: Mat4 }>>;
  /** class -> {bone, matrix} for the cast clips (cq 012): what the 3D fight holds with (fight.gd). */
  clip_grips?: Partial<Record<GripClass, { bone: string; matrix: Mat4 }>>;
  default_weapon?: string | null;
  /** "l" when the model's right hand is already full (its own staff): one-handed weapons go left. */
  main_hand?: "r" | "l";
  note?: string;
};
export type WeaponInfo = { name: string; grip: GripClass; kind: string; file: string; thumb: string; length_m: number };
export type AttachManifest = {
  version: number;
  classes: Record<GripClass, GripPose>;
  characters: Record<string, CharacterAttach>;
  weapons: Record<string, WeaponInfo>;
};

/** A character's key in the manifest from its name: "Nebul-X" -> "nebulx", "Cat-Boy" -> "catboy". */
export const characterKey = (name: string | null | undefined): string => (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The GLB as it stands in the first frame of a clip (idle by default): the
 * rigs' rest pose is an A-pose with the arms out, but a fighter spends its
 * time in idle with the arms down, so the grip is fitted to idle; the clip
 * then moves the weapon with the hand. Only float keyframes are read (what
 * Blender writes); anything else leaves the node at rest.
 */
export function poseAt(g: Gltf, bin: Uint8Array | null, clip = "idle"): Gltf {
  const anims = Array.isArray(g.animations) ? (g.animations as { name?: string; channels: { sampler: number; target: { node?: number; path: string } }[]; samplers: { output: number }[] }[]) : [];
  const a = anims.find((x) => (x.name ?? "").toLowerCase().includes(clip)) ?? null;
  if (!a || !bin) return g;
  const accessors = (g.accessors as { bufferView?: number; byteOffset?: number; componentType: number; type: string }[]) ?? [];
  const views = (g.bufferViews as { byteOffset?: number; byteStride?: number }[]) ?? [];
  const first = (acc: number, n: number): number[] | null => {
    const ac = accessors[acc];
    if (!ac || ac.componentType !== 5126 || ac.bufferView === undefined) return null;
    const v = views[ac.bufferView];
    const off = bin.byteOffset + (v?.byteOffset ?? 0) + (ac.byteOffset ?? 0);
    const dv = new DataView(bin.buffer, off, n * 4);
    return Array.from({ length: n }, (_, i) => dv.getFloat32(i * 4, true));
  };
  const nodes = (g.nodes ?? []).map((n) => ({ ...n }));
  for (const ch of a.channels) {
    const i = ch.target.node;
    if (i === undefined || !nodes[i]) continue;
    const s = a.samplers[ch.sampler];
    const path = ch.target.path;
    const n = path === "rotation" ? 4 : path === "translation" || path === "scale" ? 3 : 0;
    if (!n || !s) continue;
    const v = first(s.output, n);
    if (!v) continue;
    const node = nodes[i] as GltfNode;
    if (node.matrix) {
      // TRS channels replace a matrix node's transform
      delete node.matrix;
    }
    (node as Record<string, unknown>)[path] = v;
  }
  return { ...g, nodes };
}

/**
 * Every class's grip for one character's GLB (what make_attach writes, and
 * the run-time fallback), fitted to the first frame of its idle clip when
 * the binary is given. `mainHand: "l"` swaps the hands: for a character
 * whose model already holds something in its right hand (Nebul-X's own staff).
 */
export function computeAttach(g: Gltf, name: string, classes: Record<GripClass, GripPose>, rig = "glb", bin: Uint8Array | null = null, mainHand: "r" | "l" = "r"): CharacterAttach | null {
  const bones = findHandBones(g);
  if (bones.r === null) return null;
  const posed = poseAt(g, bin);
  const fr = handFrame(posed, bones.r, "r");
  const fl = bones.l !== null ? handFrame(posed, bones.l, "l") : null;
  if (!fr) return null;
  const grips: CharacterAttach["grips"] = {};
  for (const c of GRIP_CLASSES) {
    const pose = classes[c];
    const side = mainHand === "r" ? pose.hand : pose.hand === "r" ? "l" : "r";
    const frame = side === "l" ? fl : fr;
    if (!frame) continue;
    grips[c] = { bone: frame.bone, matrix: gripMatrix(frame, pose) };
  }
  return { name, rig, bone_r: fr.bone, bone_l: fl?.bone ?? null, palm_r: fr.palm, palm_l: fl?.palm, grips, ...(mainHand === "l" ? { main_hand: "l" as const } : {}) };
}

/**
 * A character with no skeleton (a static model) still holds a weapon: its
 * hand is a point in model space, read off the model by eye, and the weapon
 * goes on the model's root ("bone" is "", meaning the scene root).
 */
export function staticAttach(name: string, palm: Vec3, classes: Record<GripClass, GripPose>, dirs: { f?: Vec3; u?: Vec3; o?: Vec3 } = {}): CharacterAttach {
  const fr: HandFrame = { node: -1, bone: "", palm, f: dirs.f ?? [0, 0, 1], u: dirs.u ?? [0, 1, 0], o: dirs.o ?? (palm[0] < 0 ? [-1, 0, 0] : [1, 0, 0]), bone_matrix: IDENTITY };
  const grips: CharacterAttach["grips"] = {};
  for (const c of GRIP_CLASSES) if (classes[c].hand === "r") grips[c] = { bone: "", matrix: gripMatrix(fr, classes[c]) };
  return { name, rig: "static", bone_r: "", bone_l: null, palm_r: palm, grips };
}

/**
 * The grip for a 3D preview (the Collection, the Wear list, the avatar): the
 * one the fight holds with (clip_grips, fight.gd _finish_load) when it is on
 * the same hand bone, else gripFor's. Until build 18 the previews used the
 * idle-fitted grip (tip forward AND up the forearm), which in the front-on
 * preview put a long blade like the Ember Blade (1 m) up past the head, while
 * the fight showed it held forward in the hand.
 */
export function previewGripFor(m: AttachManifest, characterName: string | null | undefined, cls: GripClass, glb?: Gltf | null): { bone: string; matrix: Mat4 } | null {
  const base = gripFor(m, characterName, cls, glb);
  const clip = m.characters[characterKey(characterName)]?.clip_grips?.[cls];
  return clip && base && clip.bone === base.bone ? clip : base;
}

/** The grip to use: the manifest's for a known character, else computed from the GLB (null when it has no hand bone). */
export function gripFor(m: AttachManifest, characterName: string | null | undefined, cls: GripClass, glb?: Gltf | null): { bone: string; matrix: Mat4 } | null {
  const known = m.characters[characterKey(characterName)];
  if (known) return known.grips[cls] ?? null;
  if (!glb) return null;
  return computeAttach(glb, characterName ?? "", m.classes)?.grips[cls] ?? null;
}

// ---------- GLB files ----------

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

export function readGlb(bytes: Uint8Array): { json: Gltf; bin: Uint8Array } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a GLB");
  let off = 12;
  let json: Gltf | null = null;
  let bin: Uint8Array = new Uint8Array(0);
  while (off + 8 <= bytes.byteLength) {
    const n = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const body = bytes.subarray(off + 8, off + 8 + n);
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(body)) as Gltf;
    else if (type === BIN_CHUNK) bin = body;
    off += 8 + n;
  }
  if (!json) throw new Error("GLB without JSON");
  return { json, bin };
}

export function writeGlb(json: Gltf, bin: Uint8Array): Uint8Array {
  const pad = (n: number) => (4 - (n % 4)) % 4;
  let jb = new TextEncoder().encode(JSON.stringify(json));
  const jp = pad(jb.length);
  if (jp) {
    const t = new Uint8Array(jb.length + jp);
    t.set(jb);
    t.fill(0x20, jb.length);
    jb = t;
  }
  const bp = pad(bin.length);
  const total = 12 + 8 + jb.length + (bin.length ? 8 + bin.length + bp : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true);
  dv.setUint32(16, JSON_CHUNK, true);
  out.set(jb, 20);
  if (bin.length) {
    const o = 20 + jb.length;
    dv.setUint32(o, bin.length + bp, true);
    dv.setUint32(o + 4, BIN_CHUNK, true);
    out.set(bin, o + 8);
  }
  return out;
}

type Arr = Record<string, unknown>[];
const arr = (j: Gltf, k: string): Arr => (Array.isArray(j[k]) ? (j[k] as Arr) : []);

/**
 * The rest-pose box of a glTF's meshes, from the accessors' min/max and the
 * nodes' transforms: what Filament's FilamentAsset.getBoundingBox() gives
 * and what the previews' transformToUnitCube fits into the view.
 */
export function sceneBox(g: Gltf): { lo: Vec3; hi: Vec3 } | null {
  const gm = globalMatrices(g);
  const meshes = arr(g, "meshes");
  const acc = arr(g, "accessors");
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  (g.nodes ?? []).forEach((n, i) => {
    const M = gm.get(i);
    if (n.mesh === undefined || !M) return;
    for (const pr of (meshes[n.mesh]?.primitives as { attributes?: Record<string, number> }[] | undefined) ?? []) {
      const a = acc[pr.attributes?.POSITION ?? -1] as { min?: number[]; max?: number[] } | undefined;
      if (!a?.min || !a.max) continue;
      for (const x of [a.min[0], a.max[0]])
        for (const y of [a.min[1], a.max[1]])
          for (const z of [a.min[2], a.max[2]])
            for (let k = 0; k < 3; k++) {
              const v = M[k] * x + M[4 + k] * y + M[8 + k] * z + M[12 + k];
              lo[k] = Math.min(lo[k], v);
              hi[k] = Math.max(hi[k], v);
            }
    }
  });
  return lo[0] <= hi[0] ? { lo, hi } : null;
}

/**
 * A held weapon widens the model's box, and the previews fit the whole box
 * into the view, so the character would shrink a little and slide off
 * centre (up to a tenth of its height for a rifle held forward). An
 * invisible, zero-area triangle at the weapon's reach mirrored about the
 * character's centre keeps the box centred on the character, across and in
 * depth, as far as it can without making the box's longest side longer (a
 * weapon above the head still widens the box upwards: it is shown).
 */
function balanceBox(j: Gltf, before: { lo: Vec3; hi: Vec3 } | null, bin: Uint8Array): Uint8Array {
  const after = sceneBox(j);
  if (!before || !after) return bin;
  const c = [0, 1, 2].map((k) => (before.lo[k] + before.hi[k]) / 2);
  // Across and in depth only (a staff above the head stays in the picture),
  // and never past the box's longest side, so nothing gets smaller for it.
  const longest = Math.max(...[0, 1, 2].map((k) => after.hi[k] - after.lo[k]));
  const lo = [...after.lo];
  const hi = [...after.hi];
  for (const k of [0, 2]) {
    lo[k] = Math.max(Math.min(after.lo[k], 2 * c[k] - after.hi[k]), after.hi[k] - longest);
    hi[k] = Math.min(Math.max(after.hi[k], 2 * c[k] - after.lo[k]), after.lo[k] + longest);
  }
  if ([0, 1, 2].every((k) => Math.abs(lo[k] - after.lo[k]) < 1e-4 && Math.abs(hi[k] - after.hi[k]) < 1e-4)) return bin;
  const at = bin.length + ((4 - (bin.length % 4)) % 4);
  const out = new Uint8Array(at + 72);
  out.set(bin, 0);
  new Float32Array(out.buffer, at, 18).set([...lo, ...hi, ...hi, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const f32 = (v: number[]) => [...new Float32Array(v)];
  const bv = arr(j, "bufferViews").length;
  j.bufferViews = [...arr(j, "bufferViews"), { buffer: 0, byteOffset: at, byteLength: 36 }, { buffer: 0, byteOffset: at + 36, byteLength: 36 }];
  const ac = arr(j, "accessors").length;
  j.accessors = [
    ...arr(j, "accessors"),
    { bufferView: bv, componentType: 5126, count: 3, type: "VEC3", min: f32(lo), max: f32(hi) },
    { bufferView: bv + 1, componentType: 5126, count: 3, type: "VEC3" },
  ];
  j.meshes = [...arr(j, "meshes"), { name: "weapon_balance", primitives: [{ attributes: { POSITION: ac, NORMAL: ac + 1 }, mode: 4, ...(arr(j, "materials").length ? { material: 0 } : {}) }] }];
  j.nodes = [...(j.nodes ?? []), { name: "weapon_balance", mesh: arr(j, "meshes").length - 1 }];
  const scenes = j.scenes && j.scenes.length ? j.scenes : [{ nodes: [] }];
  const si = j.scene ?? 0;
  scenes[si] = { ...scenes[si], nodes: [...(scenes[si]?.nodes ?? []), j.nodes.length - 1] };
  j.scenes = scenes;
  return out;
}

/**
 * One GLB holding the character with the weapon in its hand: the weapon's
 * meshes, materials, textures and buffers appended, its scene put under the
 * hand bone's node with `matrix` (gripMatrix). The character's clips move
 * the bone and the weapon goes with it, so the 3D view needs no per-frame
 * work. Throws on a GLB it can't read; the caller then shows the character
 * alone.
 */
export function mergeWeaponGlb(character: Uint8Array, weapon: Uint8Array, bone: string, matrix: Mat4): Uint8Array {
  const c = readGlb(character);
  const w = readGlb(weapon);
  const j: Gltf = JSON.parse(JSON.stringify(c.json));
  const wj = w.json;
  // bone "" = a static model: the weapon goes on the scene root
  const hand = bone === "" ? -1 : (j.nodes ?? []).findIndex((n) => n.name === bone);
  if (bone !== "" && hand < 0) throw new Error(`no node ${bone}`);
  const pad = (4 - (c.bin.length % 4)) % 4;
  const binOffset = c.bin.length + pad;
  const base = (k: string) => arr(j, k).length;
  const off = {
    bufferViews: base("bufferViews"),
    accessors: base("accessors"),
    images: base("images"),
    samplers: base("samplers"),
    textures: base("textures"),
    materials: base("materials"),
    meshes: base("meshes"),
    nodes: (j.nodes ?? []).length,
  };
  const push = (k: string, items: Arr) => {
    j[k] = [...arr(j, k), ...items];
  };
  push("bufferViews", arr(wj, "bufferViews").map((v) => ({ ...v, buffer: 0, byteOffset: (Number(v.byteOffset) || 0) + binOffset })));
  push("accessors", arr(wj, "accessors").map((a) => ({ ...a, ...(a.bufferView !== undefined ? { bufferView: Number(a.bufferView) + off.bufferViews } : {}) })));
  push("images", arr(wj, "images").map((im) => ({ ...im, ...(im.bufferView !== undefined ? { bufferView: Number(im.bufferView) + off.bufferViews } : {}) })));
  push("samplers", arr(wj, "samplers"));
  push("textures", arr(wj, "textures").map((t) => ({
    ...t,
    ...(t.source !== undefined ? { source: Number(t.source) + off.images } : {}),
    ...(t.sampler !== undefined ? { sampler: Number(t.sampler) + off.samplers } : {}),
  })));
  const retex = (t: unknown) => (t && typeof t === "object" && "index" in (t as object) ? { ...(t as object), index: Number((t as { index: number }).index) + off.textures } : t);
  push("materials", arr(wj, "materials").map((m) => {
    const out: Record<string, unknown> = { ...m };
    for (const k of ["normalTexture", "occlusionTexture", "emissiveTexture"]) if (out[k]) out[k] = retex(out[k]);
    const pbr = m.pbrMetallicRoughness as Record<string, unknown> | undefined;
    if (pbr) out.pbrMetallicRoughness = { ...pbr, ...(pbr.baseColorTexture ? { baseColorTexture: retex(pbr.baseColorTexture) } : {}), ...(pbr.metallicRoughnessTexture ? { metallicRoughnessTexture: retex(pbr.metallicRoughnessTexture) } : {}) };
    return out;
  }));
  push("meshes", arr(wj, "meshes").map((m) => ({
    ...m,
    primitives: ((m.primitives as Record<string, unknown>[]) ?? []).map((p) => {
      const attrs: Record<string, number> = {};
      for (const [k, v] of Object.entries((p.attributes as Record<string, number>) ?? {})) attrs[k] = v + off.accessors;
      return {
        ...p,
        attributes: attrs,
        ...(p.indices !== undefined ? { indices: Number(p.indices) + off.accessors } : {}),
        ...(p.material !== undefined ? { material: Number(p.material) + off.materials } : {}),
      };
    }),
  })));
  const wnodes = (wj.nodes ?? []).map((n) => ({
    ...n,
    ...(n.children ? { children: n.children.map((ch) => ch + off.nodes) } : {}),
    ...(n.mesh !== undefined ? { mesh: n.mesh + off.meshes } : {}),
  }));
  const wroots = wj.scenes?.[wj.scene ?? 0]?.nodes ?? [];
  const holder: GltfNode = { name: "weapon_attach", matrix, children: wroots.map((r) => r + off.nodes) };
  j.nodes = [...(j.nodes ?? []), ...wnodes, holder];
  const holderIndex = j.nodes.length - 1;
  if (hand >= 0) j.nodes[hand] = { ...j.nodes[hand], children: [...(j.nodes[hand].children ?? []), holderIndex] };
  else {
    const scenes = j.scenes && j.scenes.length ? j.scenes : [{ nodes: [] }];
    const si = j.scene ?? 0;
    scenes[si] = { ...scenes[si], nodes: [...(scenes[si]?.nodes ?? []), holderIndex] };
    j.scenes = scenes;
  }
  let bin: Uint8Array = new Uint8Array(binOffset + w.bin.length);
  bin.set(c.bin, 0);
  bin.set(w.bin, binOffset);
  bin = balanceBox(j, sceneBox(c.json), bin);
  const buffers = arr(j, "buffers");
  j.buffers = [{ ...(buffers[0] ?? {}), byteLength: bin.length }];
  const used = new Set([...(Array.isArray(j.extensionsUsed) ? (j.extensionsUsed as string[]) : []), ...(Array.isArray(wj.extensionsUsed) ? (wj.extensionsUsed as string[]) : [])]);
  if (used.size) j.extensionsUsed = [...used];
  return writeGlb(j, bin);
}
