import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createSparks } from '@cosquest/sparks-sdk';

// Sparks on the phone: the on-device AI SDK (@cosquest/sparks-sdk) wired to
// the app's existing Socket.IO connection. The backend half is in
// cosquest-backend/src/sparks (see cosquest-backend/SPARKS_INTEGRATION.md).
// Needs a development build (expo-dev-client); Expo Go cannot load the SDK.

let sdk = null;
let starting = null;
let detachSocket = null;
const readyListeners = new Set();

const announce = () => readyListeners.forEach((listener) => listener(sdk));

// The SDK for the signed-in user, or null (not started, or unsupported here).
export function getSparks() {
  return sdk;
}

// Call once after login, when the socket exists (it may still be connecting).
// One SDK per login: calling again returns the same one. sessionId must change
// on every new login (it scopes the SDK's encrypted local store).
export async function startSparks({ socket, userId, sessionId, apiBaseUrl, getToken, onError }) {
  if (sdk) return sdk;
  if (starting) return starting;

  // Listen BEFORE creating the SDK: the backend answers device.register
  // straight away, often before createSparks has resolved. Buffer and replay.
  const early = [];
  const onFrame = (msg) => (sdk ? sdk.receive(msg) : early.push(msg));
  socket.on('sparks', onFrame);
  detachSocket = () => socket.off('sparks', onFrame);

  starting = createSparks({
    userId,
    sessionId,
    modelManifestUrl: `${apiBaseUrl.replace(/\/$/, '')}/v1/model`,
    getAuthToken: async () => (await getToken()) || '',
    transport: {
      // Resolve when the backend accepted the frame; reject so the SDK retries
      // with backoff. An ack with `error` is a refusal, not a transport
      // failure: retrying would not help, so it resolves.
      async send(msg) {
        const reply = await socket.timeout(10_000).emitWithAck('sparks', msg);
        if (reply?.error) onError?.(new Error(`sparks: ${reply.error}`));
      },
    },
  })
    .then((created) => {
      sdk = created;
      for (const msg of early.splice(0)) sdk.receive(msg);
      sdk.on('error', (error) => onError?.(error));
      announce();
      return sdk;
    })
    .catch((error) => {
      // E_TRANSPORT: the socket never delivered device.register; call startSparks again after reconnecting.
      detachSocket?.();
      detachSocket = null;
      onError?.(error);
      return null;
    })
    .finally(() => {
      starting = null;
    });
  return starting;
}

// Logout: wipe deletes the encrypted local store and the device key (the model
// files stay). App terminating: wipe = false just releases leases and unloads.
export async function stopSparks({ wipe = true } = {}) {
  const current = sdk;
  sdk = null;
  detachSocket?.();
  detachSocket = null;
  announce();
  if (!current) return;
  await (wipe ? current.wipe() : current.shutdown()).catch(() => {});
}

// ---------------------------------------------------------------------------
// Feeding chats
// ---------------------------------------------------------------------------

// Backend message kinds -> the SDK's five (same table as cosquest-backend/src/sparks/messageRow.js).
const KIND = { text: 'text', image: 'media', video: 'media', file: 'media', sticker: 'media', album: 'media', audio: 'voice', call: 'system' };

// A message as the REST API / message:new returns it -> the SDK's ChatMessage.
// Messages without a seq (sent before the backend had Sparks) are skipped.
export function toChatMessage(conversationId, message) {
  if (typeof message?.seq !== 'number') return null;
  const deleted = Boolean(message.deleted);
  const text = deleted ? '' : message.kind === 'audio' ? message.media?.transcript || message.content || '' : message.kind === 'call' ? '' : message.content || '';
  return {
    messageId: message.id,
    chatId: conversationId,
    seq: message.seq,
    senderId: message.sender?.id,
    kind: KIND[message.kind] || 'text',
    text,
    sentAt: new Date(message.createdAt).toISOString(),
    ...(message.replyTo?.id ? { replyToMessageId: message.replyTo.id } : {}),
    sparkId: message.spark?.id || null,
    ...(message.spark ? { sparkRevivalIndex: message.spark.era } : {}),
    ...(message.spark?.postedInSpark ? { postedInSpark: true } : {}),
    ...(deleted ? { deleted: true } : {}),
  };
}

// Call with EVERY message the app renders, in every chat including DMs:
// history pages, message:new / message:edited, and the user's own sends (the
// REST response already carries seq). Order and duplicates do not matter.
export function ingestMessages(conversationId, messages) {
  if (!sdk) return Promise.resolve(null);
  const list = (messages || []).map((m) => toChatMessage(conversationId, m)).filter(Boolean);
  if (!list.length) return Promise.resolve(null);
  return sdk.sparks.ingest(conversationId, list).catch(() => null);
}

// Call when a chat opens (and after member changes). The first call for a chat
// also makes the SDK fetch that chat's Sparks and recent history (sealed to
// this phone), so a fresh install catches up by itself.
export async function openChatForSparks(api, conversationId) {
  if (!sdk) return;
  const { members } = await api.getSparkMembers(conversationId);
  await sdk.sparks.setMembers(conversationId, members);
}

// ---------------------------------------------------------------------------
// Showing Sparks
// ---------------------------------------------------------------------------

// Live Sparks of one chat from the SDK's mirror (active and dormant, newest
// first; the SDK's Spark type: subject, state, pinned, revivalIndex, summary,
// seams, messageCount...). `available` is false without the SDK (Expo Go,
// before login, unsupported build): fall back to api.listSparks then.
export function useSparks(conversationId) {
  const [state, setState] = useState(() => ({ available: Boolean(sdk), sparks: sdk ? sdk.sparks.getSparks(conversationId) : [] }));

  useEffect(() => {
    let offs = [];
    const attach = (current) => {
      offs.forEach((off) => off());
      offs = [];
      if (!current) {
        setState({ available: false, sparks: [] });
        return;
      }
      const redraw = () => setState({ available: true, sparks: current.sparks.getSparks(conversationId) });
      offs = [
        current.sparks.onTopic((event) => event.chatId === conversationId && redraw()),
        current.on('sparks.synced', (event) => event.chatId === conversationId && redraw()),
      ];
      redraw();
    };
    attach(sdk);
    readyListeners.add(attach);
    return () => {
      readyListeners.delete(attach);
      offs.forEach((off) => off());
    };
  }, [conversationId]);

  return state;
}

// ---------------------------------------------------------------------------
// Game state and the model
// ---------------------------------------------------------------------------

// Background AI work only runs while the player is not busy. Call on every
// change: 'idle' (menus, chat, social), 'map', 'battle', 'ar', 'trivia', 'background'.
export function setSparksGameState(gameState) {
  sdk?.setGameState(gameState);
}

// Mount once near the app root: backgrounding the app pauses Sparks work,
// coming back restores whatever the game screen reports (default 'idle').
export function useSparksAppState(currentGameState = 'idle') {
  useEffect(() => {
    setSparksGameState(AppState.currentState === 'active' ? currentGameState : 'background');
    const sub = AppState.addEventListener('change', (next) => setSparksGameState(next === 'active' ? currentGameState : 'background'));
    return () => sub.remove();
  }, [currentGameState]);
}

// The model (about 1 GB) and the call speech files (142 MB) are downloaded on
// demand, Wi-Fi only (the SDK waits for Wi-Fi itself unless allowCellular).
// Call when it suits the UX, e.g. after onboarding. Updates of the model come
// from the manifest by themselves; no app update is needed for them.
export async function ensureSparksModel({ onStatus, allowCellular = false } = {}) {
  if (!sdk) return null;
  const off = onStatus ? sdk.on('model.status', onStatus) : null;
  try {
    return await sdk.model.ensure({ allowCellular });
  } finally {
    off?.();
  }
}
