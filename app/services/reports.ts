// Members reporting content: POST /api/reports (backend: admin Phase 1).
// Reviewed by CosQuest's super admins (the admin dashboard's Moderation page).
import { apiRequest } from "./api";

export type ReportTarget = "post" | "comment" | "message" | "profile";
export type ReportReason = "spam" | "harassment" | "impersonation" | "creator_credit" | "off_topic" | "hate" | "violence" | "self_harm" | "other";

export function sendReport(body: { targetType: ReportTarget; targetId: string; reason: ReportReason; statement?: string }, token: string) {
  return apiRequest<{ report: { id: string; number: string; status: string }; alreadyReported: boolean }>("/api/reports", {
    method: "POST",
    token,
    body,
  });
}
