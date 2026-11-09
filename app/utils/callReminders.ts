// PHONES - "We'll remind you 10 minutes before each call": a local
// notification per scheduled call, remembered by call id so cancelling or
// declining removes it. The website version is callReminders.web.ts.
import * as Notifications from "expo-notifications";

import type { ScheduledCall } from "@/services/scheduledCalls";
import { getPref, setPref } from "@/utils/prefsStorage";

export const REMINDER_MINUTES = 10;

const keyFor = (callId: string) => `callReminder.${callId}`;

export async function scheduleCallReminder(call: ScheduledCall) {
  await cancelCallReminder(call.id);

  const fireAt = new Date(new Date(call.startsAt).getTime() - REMINDER_MINUTES * 60_000);
  if (call.status !== "scheduled" || fireAt <= new Date()) return;

  try {
    // Only when notifications were allowed during onboarding: no surprise prompt.
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: call.topic,
        body: `Starts in ${REMINDER_MINUTES} minutes`,
        data: { scheduledCallId: call.id, conversationId: call.conversationId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await setPref(keyFor(call.id), id);
  } catch {
    // No reminder is better than a failed schedule.
  }
}

export async function cancelCallReminder(callId: string) {
  const id = await getPref(keyFor(callId));
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or cleared.
  }
  await setPref(keyFor(callId), null);
}
