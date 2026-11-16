// Registering this phone for pushes (POST /api/users/me/devices).
//   registerThisPhone   the Expo push token (messages, activity)
//   registerVoipToken   the call token (expo-callkit-telecom: APNs VoIP on
//                       iPhones, FCM on Android) for the phone's own call screen
//   registerCallsNow    sends the call token as soon as the push token is saved
//
// "Already sent" is remembered for a day only, so a phone the server dropped
// (an expired token, a reset) registers again by itself. `force` sends now
// (the Notifications check screen).
import { Platform } from "react-native";

import { apiRequest } from "@/services/api";
import { getPref, setPref } from "@/utils/prefsStorage";

const KEY = "push:registeredToken";
const SENT = "push:registeredSent";
const VOIP_KEY = "push:registeredVoip";
const day = () => String(Math.floor(Date.now() / 86400000));

export async function registerThisPhone(pushToken: string, token: string, { force = false } = {}) {
  const sent = `${pushToken}|${day()}`;
  if (!force && (await getPref(SENT)) === sent) return;
  await apiRequest("/api/users/me/devices", { method: "POST", token, body: { pushToken, platform: Platform.OS } });
  await setPref(KEY, pushToken);
  await setPref(SENT, sent);
  // A (re)registered device starts without a call token: send it again.
  await setPref(VOIP_KEY, null);
  await registerCallsNow(token).catch(() => {});
}

export async function registerVoipToken(voip: { token: string; type: string }, token: string, { force = false } = {}): Promise<boolean> {
  const pushToken = await getPref(KEY);
  if (!pushToken) return false;
  const signature = `${pushToken}|${voip.type}|${voip.token}|${day()}`;
  if (!force && (await getPref(VOIP_KEY)) === signature) return true;
  await apiRequest("/api/users/me/devices", {
    method: "POST",
    token,
    body: { pushToken, platform: Platform.OS, voipToken: voip.token, voipType: voip.type },
  });
  await setPref(VOIP_KEY, signature);
  return true;
}

/** This phone's call token, if the call library has one. */
export function currentVoipToken(): { token: string; type: string } | null {
  if (Platform.OS === "web") return null;
  try {
    const Calls = require("expo-callkit-telecom");
    const voip = Calls.getVoIPPushToken?.();
    return voip?.token ? { token: voip.token, type: voip.type } : null;
  } catch {
    return null;
  }
}

/** Sends the call token now that the push token is saved (calls need both). */
export async function registerCallsNow(token: string, { force = false } = {}): Promise<boolean> {
  const voip = currentVoipToken();
  return voip ? registerVoipToken(voip, token, { force }) : false;
}

/** Sign-out: this phone stops getting this account's pushes. Never throws. */
export async function unregisterThisPhone(token: string | null | undefined) {
  if (Platform.OS === "web" || !token) return;
  try {
    const pushToken = await getPref(KEY);
    if (!pushToken) return;
    await apiRequest(`/api/users/me/devices/${encodeURIComponent(pushToken)}`, { method: "DELETE", token });
  } catch {
    // Signing out carries on either way.
  } finally {
    await setPref(KEY, null);
    await setPref(SENT, null);
    await setPref(VOIP_KEY, null);
  }
}
