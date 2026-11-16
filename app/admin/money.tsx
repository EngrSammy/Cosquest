// ==========================================
// SUPER ADMIN - Ledger & approvals (payment brief 6.1, 6.4, 6.6)
// ==========================================
// Ledger: every money movement, double-entry and append-only; the books check
// (debits = credits); corrections are reversals (never edits); CSV export.
// Regions: where paid quests are allowed (US states); changes are requests.
// Approvals: money settings change only when a SECOND admin approves.
import { useCallback, useEffect, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import { ConfirmBox, Field, ReasonBox, Select, Tabs } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Loading, Notice, PageHeader, Pill } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import {
  type ApprovalRequest,
  type ApprovalStatus,
  type LedgerCheck,
  type LedgerTx,
  type RegionRule,
  type RegionStatus,
  amount,
  decideApproval,
  downloadLedgerCsv,
  getLedgerCheck,
  getRegions,
  listApprovals,
  listLedger,
  requestRegionChanges,
  reverseTx,
  withdrawApproval,
} from "@/services/adminMoney";

type TabKey = "ledger" | "regions" | "approvals";
const STATUS_LABEL: Record<RegionStatus, string> = { allowed: "Allowed", blocked: "Blocked", needs_license: "Needs licence" };
const STATUS_TONE: Record<RegionStatus, "green" | "red" | "amber"> = { allowed: "green", blocked: "red", needs_license: "amber" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function MoneyAdmin() {
  const [tab, setTab] = useState<TabKey>("ledger");
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    listApprovals("pending").then((r) => setPending(r.pending)).catch(() => setPending(null));
  }, [tab]);
  return (
    <View style={{ gap: 20 }}>
      <PageHeader title="Ledger & approvals" subtitle="Every money movement, where paid quests are allowed, and changes waiting for a second admin." />
      <Tabs<TabKey>
        tabs={[
          { key: "ledger", label: "Ledger" },
          { key: "regions", label: "Regions" },
          { key: "approvals", label: "Approvals", count: pending },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "ledger" ? <LedgerTab /> : tab === "regions" ? <RegionsTab onRequested={() => setTab("approvals")} /> : <ApprovalsTab onChanged={() => listApprovals("pending").then((r) => setPending(r.pending)).catch(() => {})} />}
    </View>
  );
}

// ---------- Ledger ----------

function LedgerTab() {
  const t = useAdminTheme();
  const [book, setBook] = useState<"money" | "costcoin">("money");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ transactions: LedgerTx[]; total: number; pageSize: number } | null>(null);
  const [books, setBooks] = useState<LedgerCheck | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<LedgerTx | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(() => {
    setError("");
    listLedger({ book, offset }).then(setData).catch((e) => setError(e?.message || "Couldn't load the ledger."));
    getLedgerCheck().then(setBooks).catch(() => setBooks(null));
  }, [book, offset]);
  useEffect(load, [load]);

  const reverse = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const result = await reverseTx(picked.id, reason.trim());
      setDone(`${picked.number} was reversed by ${result.transaction.number}. Recorded as ${result.auditEvent}.`);
      setPicked(null);
      setReason("");
      load();
    } catch (e: any) {
      setError(e?.message || "Couldn't reverse it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      {books ? (
        books.ok ? (
          <Notice icon="checkmark-circle-outline" tone="green" title="The books balance" text={books.books.length ? books.books.map((b) => `${b.book} ${b.currency}: ${b.transactions} transactions, debits = credits`).join(" · ") : "No entries yet."} />
        ) : (
          <Notice icon="alert-circle-outline" tone="red" title="The books don't balance" text="Debits and credits differ. Tell the backend team at once; the details are in the server log." />
        )
      ) : null}
      {done ? <Notice icon="checkmark-circle-outline" tone="green" text={done} /> : null}
      {error ? <Notice icon="alert-circle-outline" tone="red" text={error} /> : null}
      <Card>
        <CardHeader
          title="Transactions"
          subtitle="Append-only: a mistake is corrected by a reversal, never edited."
          right={
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Select value={book} options={[{ value: "money", label: "Money (USD)" }, { value: "costcoin", label: "Costcoin" }]} onChange={(v) => { setBook(v); setOffset(0); }} />
              {Platform.OS === "web" ? <Button label="Export CSV" icon="download-outline" onPress={() => downloadLedgerCsv(book).catch((e) => setError(e.message))} /> : null}
            </View>
          }
        />
        {!data ? (
          <Loading />
        ) : !data.transactions.length ? (
          <Text style={{ marginTop: 16, fontFamily: FONTS.regular, fontSize: 14, color: t.muted }}>No transactions in this book yet. Paid tickets appear here automatically.</Text>
        ) : (
          <View style={{ marginTop: 14, gap: 8 }}>
            {data.transactions.map((tx) => (
              <View key={tx.id} style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: picked?.id === tx.id ? t.pink : t.border, backgroundColor: t.cardSoft, gap: 6 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: t.text }}>{tx.number}</Text>
                  <Pill label={tx.kind} tone={tx.kind === "reversal" ? "amber" : tx.kind.endsWith("refund") ? "red" : "blue"} />
                  <Text style={{ flex: 1, minWidth: 160, fontFamily: FONTS.regular, fontSize: 13, color: t.muted }} numberOfLines={1}>{tx.memo}</Text>
                  <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: t.text }}>{amount(tx.total, tx.currency)}</Text>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.faint }}>{when(tx.createdAt)}</Text>
                </View>
                {tx.lines.map((l, i) => (
                  <Text key={i} style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>
                    {l.debit ? `Debit  ${l.account}  ${amount(l.debit, tx.currency)}` : `Credit ${l.account}  ${amount(l.credit, tx.currency)}`}
                  </Text>
                ))}
                {tx.kind !== "reversal" ? (
                  <View style={{ flexDirection: "row" }}>
                    <Button label="Correct (reverse)…" variant="ghost" icon="return-up-back-outline" onPress={() => { setPicked(tx); setReason(""); setDone(""); }} />
                  </View>
                ) : null}
              </View>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>
                {offset + 1}–{Math.min(offset + data.pageSize, data.total)} of {data.total}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Previous" disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - data.pageSize))} />
                <Button label="Next" disabled={offset + data.pageSize >= data.total} onPress={() => setOffset(offset + data.pageSize)} />
              </View>
            </View>
          </View>
        )}
      </Card>
      {picked ? (
        <Card>
          <CardHeader title={`Correct ${picked.number}`} subtitle="A new transaction with debits and credits swapped. The original stays, both are in the export." />
          <View style={{ marginTop: 14, gap: 12 }}>
            <ReasonBox value={reason} onChange={setReason} placeholder="e.g. Booked twice by mistake." />
            <ConfirmBox
              title={`Reverse ${picked.number}?`}
              text={`${amount(picked.total, picked.currency)} goes back the other way. This can't be undone, only corrected again.`}
              confirmLabel="Record the reversal"
              onConfirm={reverse}
              onCancel={() => setPicked(null)}
              busy={busy}
              disabled={reason.trim().length < 3}
            />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

// ---------- Regions ----------

function RegionsTab({ onRequested }: { onRequested: () => void }) {
  const t = useAdminTheme();
  const [data, setData] = useState<{ mode: "test" | "live"; regions: RegionRule[] } | null>(null);
  const [error, setError] = useState("");
  const [region, setRegion] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<RegionStatus>("allowed");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getRegions().then(setData).catch((e) => setError(e?.message || "Couldn't load the regions."));
  }, []);
  useEffect(load, [load]);

  const input = { height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.cardSoft, fontFamily: FONTS.regular, fontSize: 14, color: t.text, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await requestRegionChanges([{ region: region.trim(), name: name.trim(), status, note: note.trim() }], reason.trim());
      setRegion("");
      setName("");
      setNote("");
      setReason("");
      onRequested();
    } catch (e: any) {
      setError(e?.message || "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      {data?.mode === "test" ? (
        <Notice icon="flask-outline" tone="amber" title="Test mode" text="Payments use Stripe's sandbox, and the region rules are not applied yet (the team tests from anywhere). They apply in live mode. Paid quests are 18+ in both." />
      ) : null}
      {error ? <Notice icon="alert-circle-outline" tone="red" text={error} /> : null}
      <Card>
        <CardHeader title="Where paid quests are allowed" subtitle="Set from legal advice. In live mode, a region that isn't listed as allowed is blocked." />
        {!data ? (
          <Loading />
        ) : !data.regions.length ? (
          <Text style={{ marginTop: 16, fontFamily: FONTS.regular, fontSize: 14, color: t.muted }}>No regions yet. Add them below when legal sends the list.</Text>
        ) : (
          <View style={{ marginTop: 14, gap: 8 }}>
            {data.regions.map((r) => (
              <View key={r.region} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.cardSoft }}>
                <Text style={{ width: 70, fontFamily: FONTS.semibold, fontSize: 14, color: t.text }}>{r.region}</Text>
                <Text style={{ flex: 1, minWidth: 120, fontFamily: FONTS.regular, fontSize: 14, color: t.text }}>{r.name || "—"}</Text>
                <Pill label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />
                {r.note ? <Text style={{ width: "100%", fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{r.note}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </Card>
      <Card>
        <CardHeader title="Request a change" subtitle="Another admin must approve it before it applies. You can't approve your own request." />
        <View style={{ marginTop: 14, gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ width: 160 }}>
              <Field label="Region code">
                <TextInput value={region} onChangeText={setRegion} placeholder="US-CA" autoCapitalize="characters" placeholderTextColor={t.faint} style={input} />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Field label="Name">
                <TextInput value={name} onChangeText={setName} placeholder="California" placeholderTextColor={t.faint} style={input} />
              </Field>
            </View>
            <View>
              <Field label="Status">
                <Select<RegionStatus> value={status} options={[{ value: "allowed", label: "Allowed" }, { value: "blocked", label: "Blocked" }, { value: "needs_license", label: "Needs licence" }]} onChange={setStatus} minWidth={170} />
              </Field>
            </View>
          </View>
          <Field label="Note (optional)">
            <TextInput value={note} onChangeText={setNote} placeholder="e.g. Allowed for skill contests; age 18+" placeholderTextColor={t.faint} style={input} />
          </Field>
          <ReasonBox value={reason} onChange={setReason} placeholder="e.g. Legal advice of 20 Nov (Peter)." />
          <View style={{ flexDirection: "row" }}>
            <Button label="Send for approval" variant="primary" icon="send-outline" loading={busy} disabled={!/^[A-Za-z]{2}(-[A-Za-z0-9]{1,3})?$/.test(region.trim()) || reason.trim().length < 3} onPress={submit} />
          </View>
        </View>
      </Card>
    </View>
  );
}

// ---------- Approvals ----------

function ApprovalsTab({ onChanged }: { onChanged: () => void }) {
  const t = useAdminTheme();
  const [status, setStatus] = useState<ApprovalStatus>("pending");
  const [data, setData] = useState<{ requests: ApprovalRequest[]; me: string } | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState("");

  const load = useCallback(() => {
    listApprovals(status).then(setData).catch((e) => setError(e?.message || "Couldn't load approvals."));
  }, [status]);
  useEffect(load, [load]);

  const act = async (r: ApprovalRequest, what: "approve" | "reject" | "withdraw") => {
    setBusy(r.id + what);
    setError("");
    try {
      if (what === "withdraw") await withdrawApproval(r.id);
      else {
        const result = await decideApproval(r.id, what === "approve", (notes[r.id] || "").trim());
        setDone(`${r.number} ${what === "approve" ? "approved and applied" : "rejected"}. Recorded as ${result.auditEvent}.`);
      }
      load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <Tabs<ApprovalStatus>
        tabs={[
          { key: "pending", label: "Waiting" },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
          { key: "withdrawn", label: "Withdrawn" },
        ]}
        value={status}
        onChange={setStatus}
      />
      {done ? <Notice icon="checkmark-circle-outline" tone="green" text={done} /> : null}
      {error ? <Notice icon="alert-circle-outline" tone="red" text={error} /> : null}
      {!data ? (
        <Loading />
      ) : !data.requests.length ? (
        <Card>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: t.muted }}>{status === "pending" ? "Nothing waiting for approval." : "Nothing here."}</Text>
        </Card>
      ) : (
        data.requests.map((r) => {
          const mine = r.requestedBy.id === data.me;
          return (
            <Card key={r.id}>
              <CardHeader title={`${r.number} · ${r.title}`} subtitle={`Requested by ${mine ? "you" : r.requestedBy.name} · ${when(r.createdAt)}`} right={<Pill label={r.status} tone={r.status === "approved" ? "green" : r.status === "pending" ? "amber" : "red"} />} />
              <View style={{ marginTop: 12, gap: 6 }}>
                {r.changes.map((c) => (
                  <Text key={c.region} style={{ fontFamily: FONTS.regular, fontSize: 14, color: t.text }}>
                    {c.region}{c.name ? ` (${c.name})` : ""} → {STATUS_LABEL[c.status]}{c.note ? ` · ${c.note}` : ""}
                  </Text>
                ))}
                <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Reason: {r.reason}</Text>
                {r.decidedBy ? <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>{r.status === "approved" ? "Approved" : "Rejected"} by {r.decidedBy.name}{r.decisionNote ? `: ${r.decisionNote}` : ""}</Text> : null}
              </View>
              {r.status === "pending" ? (
                mine ? (
                  <View style={{ marginTop: 14, gap: 10 }}>
                    <Notice icon="people-outline" text="Another admin must approve this. You can withdraw it." />
                    <View style={{ flexDirection: "row" }}>
                      <Button label="Withdraw" loading={busy === r.id + "withdraw"} onPress={() => act(r, "withdraw")} />
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 14, gap: 10 }}>
                    <ReasonBox label="Note · needed to reject" value={notes[r.id] || ""} onChange={(text) => setNotes((n) => ({ ...n, [r.id]: text }))} placeholder="e.g. Checked against Peter's list." />
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Button label="Approve and apply" variant="primary" icon="checkmark-outline" loading={busy === r.id + "approve"} onPress={() => act(r, "approve")} />
                      <Button label="Reject" loading={busy === r.id + "reject"} disabled={(notes[r.id] || "").trim().length < 3} onPress={() => act(r, "reject")} />
                    </View>
                  </View>
                )
              ) : null}
            </Card>
          );
        })
      )}
    </View>
  );
}
