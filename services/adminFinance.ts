// Finance approvers: the second person for money changes (payment brief 6.6).
// A finance approver only uses Ledger & approvals (see, approve, reject).
// Backend: finance-role-backend.
import { useEffect, useState } from "react";

import { adminRequest } from "./admin";

export type AdminRole = "admin" | "finance";
export type FinanceApprover = { id: string; name: string; username: string | null; since: string | null };

let cached: AdminRole | null = null;

export async function getMyAdminRole(): Promise<AdminRole> {
  if (cached) return cached;
  const { role } = await adminRequest<{ role: AdminRole }>("/auth/role");
  cached = role;
  return role;
}

/** Forget the cached role (on sign-out). */
export function forgetAdminRole() {
  cached = null;
}

/** "admin", "finance", or null while loading (or before the backend has the role). */
export function useAdminRole(): AdminRole | null {
  const [role, setRole] = useState<AdminRole | null>(cached);
  useEffect(() => {
    let alive = true;
    getMyAdminRole()
      .then((r) => alive && setRole(r))
      .catch(() => alive && setRole("admin"));
    return () => {
      alive = false;
    };
  }, []);
  return role;
}

export const listFinanceApprovers = () => adminRequest<{ approvers: FinanceApprover[] }>("/finance-approvers");
export const addFinanceApprover = (username: string, reason: string) =>
  adminRequest<{ approver: FinanceApprover; auditEvent: string }>("/finance-approvers", { method: "POST", body: { username, reason } });
export const removeFinanceApprover = (userId: string, reason: string) =>
  adminRequest<{ removed: boolean; auditEvent: string }>(`/finance-approvers/${userId}`, { method: "DELETE", body: { reason } });
