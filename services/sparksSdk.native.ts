// ==========================================
// SPARKS SDK (Subomi's on-phone AI) - PHONES ONLY
// ==========================================
// The website uses services/sparksSdk.ts instead (it can't run the SDK).
// OFF unless EXPO_PUBLIC_SPARKS_ENGINE=qlm (and the backend has it on too).
//
// What it does on a phone:
//  - starts the SDK once per login, over our existing socket ("sparks" channel)
//  - feeds it each open chat's members and messages (it does AI work for the group)
//  - downloads the model on request (about 1 GB, Wi-Fi) on capable phones
// Sparks themselves are still shown by our own screens, from our backend.
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

import { getSocket } from "@/services/socket";

import type {
  BackendToSdk,
  ChatMember as SparksMember,
  ChatMessage as SparksMessage,
  DeviceCapabilities,
  ModelStatus,
  SparksSdk,
} from "@cosquest/sparks-sdk";

export type { ModelStatus, DeviceCapabilities };

const ENABLED = process.env.EXPO_PUBLIC_SPARKS_ENGINE === "qlm";

// Subomi's published model list (see HANDOVER: "the model is live").
export const SPARKS_MODEL_MANIFEST =
  process.env.EXPO_PUBLIC_SPARKS_MODEL_MANIFEST || "https://cosquest-models.204.168.162.79.sslip.io/v1/model";

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

// One local store per login (a new session id opens a fresh store).
async function sessionIdFor(userId: string) {
  const key = `sparks_session_${userId}`;
  let id = await SecureStore.getItemAsync(key).catch(() => null);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(key, id).catch(() => {});
  }
  return id;
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
export async function startSparks(userId: string | null | undefined): Promise<SparksSdk | null> {
  if (!ENABLED || !userId) return null;
  if (sdk && sdkUserId === userId) return sdk;
  if (sdk && sdkUserId !== userId) await stopSparks({ wipe: true });
  if (starting) return starting;

  starting = (async () => {
    const socket: any = getSocket();
    if (!socket) return null;
    listen(socket);

    const { createSparks } = await import("@cosquest/sparks-sdk");
    const created = await createSparks({
      userId,
      sessionId: await sessionIdFor(userId),
      modelManifestUrl: SPARKS_MODEL_MANIFEST,
      // Through our socket; a rejection makes the SDK retry with backoff.
      transport: {
        send: async (msg) => {
          const reply = await socket.timeout(10_000).emitWithAck("sparks", msg);
          if (reply?.error && reply.error !== "schema") throw new Error(reply.error);
        },
      },
    });

    sdk = created;
    sdkUserId = userId;
    for (const msg of early.splice(0)) created.receive(msg);

    // Background AI work only while the player isn't busy.
    created.setGameState(AppState.currentState === "active" ? "idle" : "background");
    AppState.addEventListener("change", (state) => {
      sdk?.setGameState(state === "active" ? "idle" : "background");
    });

    // A phone with the model already downloaded loads it straight away.
    const status = created.model.status();
    if (status.phase === "ready") created.model.load().catch(() => {});
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

/** Logout: delete this phone's Sparks store and key (model files stay). */
export async function stopSparks({ wipe = false } = {}) {
  const current = sdk;
  const userId = sdkUserId;
  sdk = null;
  sdkUserId = null;
  fedMembers.clear();
  if (!current) return;
  try {
    if (wipe) {
      await current.wipe();
      if (userId) await SecureStore.deleteItemAsync(`sparks_session_${userId}`).catch(() => {});
    } else {
      await current.shutdown();
    }
  } catch {}
}

// ---------------------------------------------------------------------
// Feeding chats
// ---------------------------------------------------------------------
const EXPERTISE_KEY = (label?: string | null) =>
  label ? label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "") : null;

export function toSparksMember(person: any): SparksMember {
  const role = person.role || person.groupRole;
  const expertise = EXPERTISE_KEY(person.expertise);
  return {
    userId: String(person.id ?? person._id),
    displayName: person.name || person.username || "Member",
    ...(person.rank?.key || person.rank?.name ? { rank: String(person.rank.key || person.rank.name).toLowerCase() } : {}),
    roles: expertise ? [expertise] : [],
    isAdmin: role === "owner" || role === "admin",
  };
}

function wireKind(kind?: string): SparksMessage["kind"] {
  if (kind === "audio") return "voice";
  if (kind === "image" || kind === "video" || kind === "album" || kind === "file" || kind === "sticker") return "media";
  if (kind === "poll") return "poll";
  if (kind === "call") return "system";
  return "text";
}

export function toSparksMessage(chatId: string, message: any): SparksMessage | null {
  const id = String(message?.id ?? message?._id ?? "");
  // Only messages the server has numbered (temporary local copies are skipped).
  if (!id || id.startsWith("local") || typeof message?.seq !== "number") return null;
  const text =
    message.kind === "poll"
      ? [message.poll?.question, ...(message.poll?.options || []).map((o: any) => o.text)].filter(Boolean).join(" · ")
      : message.kind === "audio"
        ? message.media?.transcript || ""
        : message.content || "";
  return {
    messageId: id,
    chatId,
    seq: message.seq,
    senderId: String(message.sender?.id ?? message.sender?._id ?? message.senderId ?? ""),
    kind: wireKind(message.kind),
    text,
    sentAt: new Date(message.createdAt || Date.now()).toISOString(),
    ...(message.replyTo?.id ? { replyToMessageId: String(message.replyTo.id) } : {}),
    ...(message.deleted ? { deleted: true } : {}),
  };
}

/** Members of a chat (first time per chat also asks the backend to catch up). */
export async function feedMembers(chatId: string, people: any[]) {
  if (!sdk || !people.length) return;
  const key = `${chatId}:${people.length}`;
  if (fedMembers.has(key)) return;
  fedMembers.add(key);
  await sdk.sparks.setMembers(chatId, people.map(toSparksMember)).catch(() => fedMembers.delete(key));
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
