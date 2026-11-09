// Report, block and delete account (task 059; the backend routes are in
// cosquest-backend/src/routes/safetyRoutes.js, docs/polish/BACKEND-PORT.md).
import { apiRequest } from "./api";
import { blockUser as blockByUsername } from "./publicProfile";

export type ReportTarget = "user" | "post" | "comment" | "message" | "group";

export const REPORT_REASONS: { key: string; label: string }[] = [
  { key: "spam", label: "Spam or scam" },
  { key: "harassment", label: "Bullying or harassment" },
  { key: "hate", label: "Hate speech or symbols" },
  { key: "nudity", label: "Nudity or sexual content" },
  { key: "violence", label: "Violence or threats" },
  { key: "self_harm", label: "Self-harm or suicide" },
  { key: "impersonation", label: "Pretending to be someone else" },
  { key: "underage", label: "Someone under 13" },
  { key: "other", label: "Something else" },
];

export async function sendReport(
  token: string,
  report: { targetType: ReportTarget; targetId: string; reason: string; details?: string; snapshot?: string; conversationId?: string },
) {
  return apiRequest<{ report: { id: string; status: string }; updated: boolean }>("/api/reports", {
    method: "POST",
    token,
    body: report,
  });
}

/**
 * Block someone from anywhere. By username on every server (the existing
 * route); by id where the server has POST /api/blocks (a member list or a
 * message that only knows the id). A "you already blocked" answer counts.
 */
export async function blockPerson(token: string, who: { username?: string | null; userId?: string | null }, blockAnywhere: boolean) {
  try {
    if (who.username) {
      await blockByUsername(who.username, token);
      return;
    }
    if (who.userId && blockAnywhere) {
      await apiRequest("/api/blocks", { method: "POST", token, body: { userId: who.userId } });
      return;
    }
  } catch (error) {
    if ((error as any)?.status === 409) return;
    throw error;
  }
  throw new Error("Can't block this person from here.");
}

export async function deleteMyAccount(token: string, proof: { password?: string; confirm?: "DELETE" }) {
  return apiRequest<{ deleted: boolean }>("/api/users/me", { method: "DELETE", token, body: proof });
}
