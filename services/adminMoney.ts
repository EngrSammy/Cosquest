// Money admin: the ledger, regions (paid quests) and two-person approvals.
// Backend: ledger-backend (LEDGER.md).
import { adminRequest } from "./admin";

export type LedgerLine = { account: string; debit: number; credit: number };
export type LedgerTx = {
  id: string;
  number: string;
  kind: string;
  book: "money" | "costcoin";
  currency: string;
  lines: LedgerLine[];
  total: number;
  order: string | null;
  quest: string | null;
  user: string | null;
  processorRef: string | null;
  memo: string;
  reverses: string | null;
  createdAt: string;
};
export type LedgerCheck = { ok: boolean; books: { book: string; currency: string; debits: number; credits: number; transactions: number; balanced: boolean }[]; checkedAt: string };
export type AccountBalance = { account: string; book: string; currency: string; debits: number; credits: number; balance: number };
export type RegionStatus = "allowed" | "blocked" | "needs_license";
export type RegionRule = { region: string; name: string; status: RegionStatus; note: string; updatedAt: string };
export type ApprovalStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type ApprovalRequest = {
  id: string;
  number: string;
  kind: string;
  title: string;
  changes: { region: string; name: string; status: RegionStatus; note: string }[];
  reason: string;
  status: ApprovalStatus;
  requestedBy: { id: string; name: string };
  decidedBy: { id: string; name: string } | null;
  decisionNote: string;
  decidedAt: string | null;
  createdAt: string;
};

const qs = (params: Record<string, string | number | undefined | null>) => {
  const parts = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
};

export const listLedger = (filters: { book?: string; kind?: string; account?: string; offset?: number }) =>
  adminRequest<{ transactions: LedgerTx[]; total: number; offset: number; pageSize: number }>(`/ledger/transactions${qs(filters)}`);
export const getLedgerCheck = () => adminRequest<LedgerCheck>("/ledger/check");
export const getBalances = (book: string, prefix?: string) => adminRequest<{ balances: AccountBalance[] }>(`/ledger/balances${qs({ book, prefix })}`);
export const reverseTx = (txId: string, reason: string) => adminRequest<{ transaction: LedgerTx; auditEvent: string }>(`/ledger/transactions/${txId}/reverse`, { method: "POST", body: { reason } });
export const getRegions = () => adminRequest<{ mode: "test" | "live"; regions: RegionRule[] }>("/regions");
export const requestRegionChanges = (changes: { region: string; name?: string; status: RegionStatus; note?: string }[], reason: string) =>
  adminRequest<{ request: ApprovalRequest; auditEvent: string }>("/regions/requests", { method: "POST", body: { changes, reason } });
export const listApprovals = (status: ApprovalStatus) => adminRequest<{ requests: ApprovalRequest[]; pending: number; me: string }>(`/approvals${qs({ status })}`);
export const decideApproval = (id: string, approve: boolean, note: string) =>
  adminRequest<{ request: ApprovalRequest; auditEvent: string }>(`/approvals/${id}/${approve ? "approve" : "reject"}`, { method: "POST", body: { note } });
export const withdrawApproval = (id: string) => adminRequest<{ request: ApprovalRequest }>(`/approvals/${id}/withdraw`, { method: "POST" });

/** The ledger as a CSV file (one row per line), for the finance spreadsheets. */
export async function downloadLedgerCsv(book: string) {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem("cq_admin_session") : null;
  const token = raw ? JSON.parse(raw).token : null;
  const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/admin/ledger/export${qs({ book })}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Couldn't export the ledger.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cosquest-ledger-${book}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Cents (or whole Costcoin) for display. */
export const amount = (minor: number, currency: string) =>
  currency === "CQC" ? `${minor.toLocaleString("en-US")} Costcoin` : `${(minor / 100).toLocaleString("en-US", { style: "currency", currency })}`;
