// WEBSITE - browsers can't schedule a notification for later, so the
// website skips the local reminder (the backend's invitation still arrives).
import type { ScheduledCall } from "@/services/scheduledCalls";

export const REMINDER_MINUTES = 10;

export async function scheduleCallReminder(_call: ScheduledCall) {}

export async function cancelCallReminder(_callId: string) {}
