// ==========================================
// SPARKS SDK (Subomi's on-phone AI) - PHONES ONLY
// ==========================================
// The website uses services/sparksSdk.ts instead (it can't run the SDK).
// OFF unless EXPO_PUBLIC_SPARKS_ENGINE=module (and the backend has SPARKS_ENGINE=module).
//
// What it does on a phone:
//  - starts the SDK once per login, over our existing socket ("sparks" channel),
//    and wipes it on logout (Subomi: sdk.wipe(); the model files stay)
//  - feeds it each open chat's members and messages (it does AI work for the group)
//  - downloads the model by itself after login, Wi-Fi only (about 1 GB full,
//    336 MB lite); the "Sparks AI on this phone" screen shows progress
// Sparks themselves are still shown by our own screens, from our backend.
import { AppState } from "react-native";

import { getSocket } from "@/services/socket";
import { store } from "@/store/store";

import type {
  BackendToSdk,
  ChatMember as SparksMember,
  ChatMessage as SparksMessage,
  DeviceCapabilities,
  ModelStatus,
  SparksSdk,
} from "@cosquest/sparks-sdk";

export type { ModelStatus, DeviceCapabilities };

// "module" (the backend's name for it) or "qlm": on. Anything else: off.
const ENABLED = ["module", "qlm"].includes(String(process.env.EXPO_PUBLIC_SPARKS_ENGINE || ""));

// Our backend (it redirects /v1/model to the model list Subomi publishes, so
// moving the model to our own domain later needs no app update).
const API = (process.env.EXPO_PUBLIC_API_URL || "https://cosquest-1.onrender.com").replace(/\/$/, "");

// The model list, through our backend (override with EXPO_PUBLIC_SPARKS_MODEL_MANIFEST).
export const SPARKS_MODEL_MANIFEST = process.env.EXPO_PUBLIC_SPARKS_MODEL_MANIFEST || `${API}/v1/model`;

let sdk: SparksSdk | null = null;
let sdkUserId: string | null = null;
let starting: Promise<SparksSdk | null> | null = null;
let listeningOn: unknown = null;
const early: BackendToSdk[] = [];
const fedMembers = new Set<string>();

export function sparksEnabled() {
  return ENABLED;
}

export function getSparksSdk() {
  return sdk;
}

// A new session id for every login (Subomi): it opens a clean local store.
// Each login gets a new token, so the id is derived from it.
function sessionIdFor(userId: string, token: string | null | undefined) {
  let hash = 2166136261;
  for (const char of `${userId}:${token || ""}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `s_${userId.slice(-6)}_${hash.toString(36)}`;
}

// LOGOUT: when the login token goes away, wipe this user's Sparks data and
// device key from the phone (the model files stay, so no second download).
// A different token (a new login) closes the old session first.
let watching = false;
let lastToken: string | null = null;
function watchLogin() {
  if (watching) return;
  watching = true;
  lastToken = (store.getState() as any).auth?.token || null;
  store.subscribe(() => {
    const token = (store.getState() as any).auth?.token || null;
    if (token === lastToken) return;
    const previous = lastToken;
    lastToken = token;
    if (previous && !token) stopSparks({ wipe: true }).catch(() => {});
    else if (previous && token) stopSparks({ wipe: false }).catch(() => {});
  });
}

// Start the model download by itself on capable phones (Subomi: after login,
// Wi-Fi only; the SDK waits for Wi-Fi on its own), then load it.
async function autoDownload(created: SparksSdk) {
  try {
    const caps = await created.getCapabilities();
    if (!caps) return;
    // Phones too old for the model still note their owner's speech on calls:
    // ensure() fetches just the speech files for them.
    if (caps.tier === "none") return void (await created.model.ensure({ allowCellular: false }));
    const status = created.model.status();
    // ensure() also when the model is already here: it checks the speech
    // files too (call notes) and fetches any that are missing or were never
    // verified (SDK 1.2.1 could leave one unfinished). Files already verified
    // are not downloaded again.
    if (!["ready", "not_downloaded", "download_paused", "error"].includes(status.phase)) return;
    const done = await created.model.ensure({ allowCellular: false });
    if (done.phase === "ready" && sdk === created) await created.model.load();
  } catch (error: any) {
    console.warn("[sparks] model download:", error?.message || error);
  }
}

// Listen BEFORE creating the SDK: the backend answers device.register at once.
function listen(socket: any) {
  if (!socket || listeningOn === socket) return;
  listeningOn = socket;
  socket.on("sparks", (msg: BackendToSdk) => {
    if (sdk) sdk.receive(msg);
    else early.push(msg);
  });
}

/** Start the SDK for this user (once). Safe to call from many screens. */
export async function startSparks(
  userId: string | null | undefined,
  getToken?: () => string | null | undefined,
): Promise<SparksSdk | null> {
  if (!ENABLED || !userId) return null;
  if (sdk && sdkUserId === userId) return sdk;
  if (sdk && sdkUserId !== userId) await stopSparks({ wipe: true });
  if (starting) return starting;

  starting = (async () => {
    const socket: any = getSocket();
    if (!socket) return null;
    watchLogin();
    listen(socket);

    const { createSparks } = await import("@cosquest/sparks-sdk");
    const created = await createSparks({
      userId,
      sessionId: sessionIdFor(userId, getToken?.()),
      modelManifestUrl: SPARKS_MODEL_MANIFEST,
      getAuthToken: async () => getToken?.() || "",
      // Through our socket. No answer in 10 s: emitWithAck rejects and the SDK
      // retries with backoff. An answer with `error` is a refusal (retrying
      // wouldn't help), so it resolves (as in Subomi's sparks.js).
      transport: {
        send: async (msg) => {
          const reply = await socket.timeout(10_000).emitWithAck("sparks", msg);
          if (reply?.error) console.warn("[sparks] refused:", reply.error);
        },
      },
    });

    sdk = created;
    sdkUserId = userId;
    created.on("error", (error: any) => console.warn("[sparks]", error?.message || error));
    for (const msg of early.splice(0)) created.receive(msg);

    // Background AI work only while the player isn't busy.
    created.setGameState(AppState.currentState === "active" ? "idle" : "background");
    AppState.addEventListener("change", (state) => {
      sdk?.setGameState(state === "active" ? "idle" : "background");
    });

    // Load the model if it's already here, or download it (Wi-Fi only).
    autoDownload(created);
    return created;
  })()
    .catch((error) => {
      console.warn("[sparks] could not start:", error?.code || error?.message || error);
      return null;
    })
    .finally(() => {
      starting = null;
    });

  return starting;
}

/** Logout (wipe): delete this user's Sparks data and device key (model files stay). */
export async function stopSparks({ wipe = false } = {}) {
  const current = sdk;
  sdk = null;
  sdkUserId = null;
  fedMembers.clear();
  if (!current) return;
  try {
    if (wipe) {
      await current.wipe();
    } else {
      await current.shutdown();
    }
  } catch {}
}

// ---------------------------------------------------------------------
// Feeding chats (same mapping as Subomi's examples/expo-chat/sparks.js)
// ---------------------------------------------------------------------
// Backend message kinds -> the SDK's five (as the backend's messageRow.js).
const KIND: Record<string, SparksMessage["kind"]> = {
  text: "text",
  image: "media",
  video: "media",
  file: "media",
  sticker: "media",
  album: "media",
  audio: "voice",
  call: "system",
};

// A message as our API / message:new returns it -> the SDK's ChatMessage.
// Messages without a seq (sent before the backend had Sparks) are skipped.
export function toSparksMessage(chatId: string, message: any): SparksMessage | null {
  if (typeof message?.seq !== "number" || !message?.id) return null;
  const deleted = Boolean(message.deleted);
  const text = deleted
    ? ""
    : message.kind === "audio"
      ? message.media?.transcript || message.content || ""
      : message.kind === "call"
        ? ""
        : message.content || "";
  return {
    messageId: String(message.id),
    chatId,
    seq: message.seq,
    senderId: String(message.sender?.id ?? ""),
    kind: KIND[message.kind] || "text",
    text,
    sentAt: new Date(message.createdAt || Date.now()).toISOString(),
    ...(message.replyTo?.id ? { replyToMessageId: String(message.replyTo.id) } : {}),
    sparkId: message.spark?.id || null,
    ...(message.spark ? { sparkRevivalIndex: message.spark.era } : {}),
    ...(message.spark?.postedInSpark ? { postedInSpark: true } : {}),
    ...(deleted ? { deleted: true } : {}),
  } as SparksMessage;
}

/**
 * Members of a chat, as the backend's GET /api/chats/:id/sparks/members gives
 * them (already in the SDK's shape: roles, ranks, admin flags). The first
 * call for a chat also makes the SDK catch up on its Sparks and history.
 */
export async function feedMembers(chatId: string, members: SparksMember[]) {
  if (!sdk || !members?.length) return;
  const key = `${chatId}:${members.length}`;
  if (fedMembers.has(key)) return;
  fedMembers.add(key);
  await sdk.sparks.setMembers(chatId, members).catch(() => fedMembers.delete(key));
}

/** Every message the screen shows (order and repeats don't matter). */
export async function feedMessages(chatId: string, messages: any[]) {
  if (!sdk || !messages.length) return;
  const rows = messages.map((m) => toSparksMessage(chatId, m)).filter(Boolean) as SparksMessage[];
  if (rows.length) await sdk.sparks.ingest(chatId, rows).catch(() => {});
}

// ---------------------------------------------------------------------
// The model on this phone
// ---------------------------------------------------------------------
export async function getCapabilities(): Promise<DeviceCapabilities | null> {
  return sdk ? sdk.getCapabilities().catch(() => null) : null;
}

export function modelStatus(): ModelStatus | null {
  return sdk ? sdk.model.status() : null;
}

export function onModelStatus(listener: (status: ModelStatus) => void) {
  return sdk ? sdk.on("model.status", listener as any) : () => {};
}

/** Download (Wi-Fi unless allowed), verify, then load the model. */
export async function downloadModel(allowCellular = false) {
  if (!sdk) throw new Error("Sparks isn't running on this phone yet.");
  const status = await sdk.model.ensure({ allowCellular });
  if (status.phase === "ready") return sdk.model.load();
  return status;
}

export function cancelModelDownload() {
  sdk?.model.cancelDownload();
}

export async function deleteModel() {
  await sdk?.model.deleteFiles();
}
