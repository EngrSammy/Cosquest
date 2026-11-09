// ==========================================
// SUPER ADMIN DASHBOARD - Tickets & Payments
// ==========================================
// Revenue (last 7 days), every order with its full history, and refunds
// (always with a reason). Card payments are Stripe's; a "Test mode" badge
// shows while the sandbox keys are in use.
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { ConfirmBox, Divider, DoneNote, Field, Pager, ReasonBox, SearchBox, Tabs } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { type AdminOrder, getOrder, getPaymentStats, listOrders, money, refundOrder } from "@/services/adminPayments";

type Tab = "all" | "paid" | "pending" | "refunded" | "expired" | "free";

const STATUS: Record<AdminOrder["status"], { label: string; tone: "green" | "blue" | "grey" | "red" | "amber" | "pink" }> = {
  paid: { label: "Paid", tone: "green" },
  free: { label: "Free", tone: "blue" },
  pending: { label: "Paying…", tone: "amber" },
  expired: { label: "Expired", tone: "grey" },
  failed: { label: "Failed", tone: "red" },
  refunded: { label: "Refunded", tone: "pink" },
  cancelled: { label: "Cancelled", tone: "grey" },
};
const EVENT_LABEL: Record<string, string> = {
  created: "Checkout started",
  checkout_opened: "Stripe payment page opened",
  paid: "Paid (confirmed by Stripe)",
  free_ticket: "Free ticket issued",
  expired: "Expired, seat released",
  failed: "Could not start",
  card_declined: "Card declined (they could try again)",
  refunded: "Refunded",
  auto_refund: "Refunded automatically",
  amount_mismatch: "Amount did not match",
  cancelled: "Cancelled",
};

function OrderPanel({ orderId, onChanged }: { orderId: string; onChanged: () => void }) {
  const t = useAdminTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof getOrder>> | null>(null);
  const [error, setError] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getOrder(orderId));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load the order.");
    }
  }, [orderId]);
  useEffect(() => {
    setData(null);
    setRefunding(false);
    setReason("");
    setDone("");
    load();
  }, [load]);

  if (error) return <Notice tone="red" text={error} />;
  if (!data) return <Loading />;
  const { order, ticket } = data;
  const canRefund = order.status === "paid" || order.status === "free";

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await refundOrder(order.id, reason.trim());
      setDone(`${result.order.status === "refunded" ? "Refunded" : "Cancelled"}. Recorded as ${result.auditEvent}.`);
      setRefunding(false);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't refund.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 16, color: t.text }}>{order.number}</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{order.quest.title}</Text>
        </View>
        <Pill label={STATUS[order.status].label} tone={STATUS[order.status].tone} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 }}>
        <Initials name={order.user?.name} size={36} />
        <View>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13.5, color: t.text }}>{order.user?.name}</Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
            @{order.user?.username}
            {order.email ? ` · ${order.email}` : ""}
          </Text>
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <Field label="Ticket">{order.ticketType || "—"}</Field>
        <Field label="Amount">{order.status === "free" ? "Free" : money(order.amount)}</Field>
        <Field label="Ticket status">{ticket ? `${ticket.status.replace("_", " ")}${ticket.checkedInAt ? ` · ${new Date(ticket.checkedInAt).toLocaleString()}` : ""}` : "No ticket"}</Field>
        {order.refundReason ? <Field label="Refund reason">{order.refundReason}</Field> : null}
        {order.stripe.paymentIntentId ? <Field label="Stripe payment">{order.stripe.paymentIntentId}</Field> : null}
      </View>
      {data.stripeDashboard ? (
        <Text style={{ marginTop: 6, fontFamily: FONTS.medium, fontSize: 12.5, color: t.pinkText }} onPress={() => (window as any).open(data.stripeDashboard!, "_blank")}>
          Open in Stripe ↗
        </Text>
      ) : null}

      <Divider />
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>History</Text>
      {order.history.map((h, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: h.event === "paid" || h.event === "free_ticket" ? t.green : h.event.includes("refund") ? t.pink : t.border }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{EVENT_LABEL[h.event] || h.event}</Text>
            <Text style={{ marginTop: 1, fontFamily: FONTS.regular, fontSize: 11, color: t.muted }}>
              {new Date(h.at).toLocaleString()}
              {h.detail && !h.detail.startsWith("cs_") ? ` · ${h.detail}` : ""}
            </Text>
          </View>
        </View>
      ))}

      {canRefund ? (
        <>
          <Divider />
          {!refunding ? (
            <View style={{ flexDirection: "row" }}>
              <Button label={order.status === "paid" ? "Refund…" : "Cancel ticket…"} icon="return-down-back-outline" onPress={() => { setRefunding(true); setDone(""); }} />
            </View>
          ) : (
            <>
              <ReasonBox value={reason} onChange={setReason} placeholder="e.g. Couldn't attend due to illness - support request." />
              <ConfirmBox
                title={order.status === "paid" ? `Refund ${money(order.amount)}?` : "Cancel this free ticket?"}
                text={`${order.status === "paid" ? "The money goes back to their card (5-10 days). " : ""}The ticket stops working and the seat goes back on sale. Recorded in the audit log.`}
                confirmLabel={order.status === "paid" ? "Confirm refund" : "Confirm cancel"}
                onConfirm={confirm}
                onCancel={() => setRefunding(false)}
                busy={busy}
                disabled={reason.trim().length < 3}
              />
            </>
          )}
        </>
      ) : null}
      {done ? <DoneNote text={done} /> : null}
    </View>
  );
}

export default function AdminPayments() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getPaymentStats>> | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AdminOrder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getPaymentStats());
    } catch {}
  }, []);
  const loadList = useCallback(async () => {
    try {
      const result = await listOrders({ status: tab === "all" ? undefined : tab, q: q.trim() || undefined, offset });
      setRows(result.orders);
      setTotal(result.total);
      setError("");
      setSelected((current) => current || result.orders[0]?.id || null);
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "Tickets & Payments isn't deployed on the server yet." : e?.message || "Couldn't load orders.");
    }
  }, [tab, q, offset]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const timer = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, q]);

  const usd = (n?: number) => (n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n));

  return (
    <View>
      <PageHeader
        title="Tickets & Payments"
        subtitle="Ticket sales, orders and refunds. Card payments are handled by Stripe."
        badge={stats ? <Pill label={stats.mode === "live" ? "Live payments" : "Test mode (sandbox)"} tone={stats.mode === "live" ? "green" : "amber"} dot /> : undefined}
      />
      {stats && !stats.paymentsConfigured ? (
        <View style={{ marginBottom: 16 }}>
          <Notice tone="amber" title="Stripe isn't set up on the server" text="Free tickets work; paid tickets need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Render." />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Ticket sales" icon="cash-outline" value={usd(stats?.gross)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>{formatNumber(stats?.paidOrders)} paid orders · last 7 days</Text>} />
        <StatCard title="Refunded" icon="return-down-back-outline" value={usd(stats?.refunded)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>{formatNumber(stats?.refundedOrders)} refunds</Text>} />
        <StatCard title="Net" icon="trending-up-outline" value={usd(stats?.net)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Before Stripe's fees</Text>} />
        <StatCard title="Tickets issued" icon="ticket-outline" value={formatNumber(stats?.ticketsIssued)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>{formatNumber(stats?.pendingCheckouts)} paying right now</Text>} />
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <Card style={{ flex: 1.55, alignSelf: "stretch" }}>
          <CardHeader title="Orders" subtitle="Newest first" />
          <Tabs<Tab>
            value={tab}
            onChange={(key) => {
              setTab(key);
              setOffset(0);
              setSelected(null);
            }}
            tabs={[
              { key: "all", label: "All" },
              { key: "paid", label: "Paid" },
              { key: "pending", label: "Paying", count: stats?.pendingCheckouts },
              { key: "refunded", label: "Refunded" },
              { key: "free", label: "Free" },
              { key: "expired", label: "Expired" },
            ]}
          />
          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <SearchBox value={q} onChange={(text) => { setQ(text); setOffset(0); }} placeholder="Search ORD number, @member, email or pi_…" />
          </View>
          {error ? (
            <Notice tone="amber" text={error} />
          ) : !rows ? (
            <Loading />
          ) : rows.length ? (
            rows.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => setSelected(o.id)}
                style={({ hovered }: any) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 10,
                  borderTopWidth: 1,
                  borderTopColor: t.line,
                  borderLeftWidth: 2,
                  borderLeftColor: o.id === selected ? t.pink : "transparent",
                  backgroundColor: o.id === selected ? t.pinkSoft : hovered ? t.cardSoft : "transparent",
                })}>
                <View style={{ flex: 1.1 }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{o.number}</Text>
                  <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, color: t.muted }}>{timeAgo(o.createdAt)}</Text>
                </View>
                <View style={{ flex: 1.6, minWidth: 0 }}>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }} numberOfLines={1}>
                    {o.user?.name}
                  </Text>
                  <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, color: t.muted }} numberOfLines={1}>
                    {o.quest.title}
                  </Text>
                </View>
                <Text style={{ flex: 0.8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{o.status === "free" ? "Free" : money(o.amount)}</Text>
                <View style={{ flex: 0.9 }}>
                  <Pill label={STATUS[o.status].label} tone={STATUS[o.status].tone} />
                </View>
              </Pressable>
            ))
          ) : (
            <View style={{ paddingVertical: 40, alignItems: "center", gap: 6 }}>
              <Ionicons name="receipt-outline" size={26} color={t.faint} />
              <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>No orders here yet.</Text>
            </View>
          )}
          {rows ? <Pager shown={rows.length} total={total} offset={offset} onPage={setOffset} noun="orders" /> : null}
          <View style={{ marginTop: 14 }}>
            <Notice text="An order only turns Paid when Stripe confirms it (a signed message to the server). Unfinished payments expire after 31 minutes and the seat goes back on sale." />
          </View>
        </Card>
        <Card style={{ flex: 1, alignSelf: "stretch" }}>
          {selected ? (
            <OrderPanel orderId={selected} onChanged={() => { loadStats(); loadList(); }} />
          ) : (
            <Text style={{ paddingVertical: 60, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick an order to see its history.</Text>
          )}
        </Card>
      </View>
    </View>
  );
}
