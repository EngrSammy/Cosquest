// ==========================================
// SUPER ADMIN DASHBOARD - Roles & permissions (Figma)
// ==========================================
// Admin status is the source of moderation authority; game faction rank
// never grants it. The permission matrix, the super admins, inviting one
// (it grants nothing until they accept), pending invitations, revoking,
// and access reviews.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";

import { ConfirmBox, Divider, DoneNote, Field, ReasonBox } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { type AdminEntry, type Invitation, getRoles, inviteAdmin, recordAccessReview, resendInvitation, revokeAdmin, revokeInvitation } from "@/services/adminSettings";

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

const CELL: Record<string, { label: string; tone: "green" | "muted" | "amber" }> = {
  allowed: { label: "✓ Allowed", tone: "green" },
  any_message: { label: "Any message", tone: "green" },
  own_messages: { label: "Own messages only", tone: "muted" },
  own_posts: { label: "Own posts only", tone: "muted" },
  not_allowed: { label: "Not allowed", tone: "muted" },
  not_available: { label: "Not available", tone: "muted" },
  no_access: { label: "No access", tone: "muted" },
  no_extra_access: { label: "No extra access", tone: "muted" },
  no_rank_required: { label: "No rank required", tone: "muted" },
  pending: { label: "Pending requirements", tone: "amber" },
};

type Data = Awaited<ReturnType<typeof getRoles>>;

export default function AdminRoles() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  // Invite
  const [member, setMember] = useState("");
  const [inviteReason, setInviteReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  // Revoke an admin / invitation, record a review
  const [revoking, setRevoking] = useState<AdminEntry | null>(null);
  const [cancelling, setCancelling] = useState<Invitation | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getRoles());
      setError("");
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "Roles & permissions (Phase 5) isn't deployed yet." : e?.message || "Couldn't load roles.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, work: () => Promise<{ auditEvent?: string | null } | any>, message: string) => {
    setBusy(key);
    setActionError("");
    try {
      const result = await work();
      setDone(`${message}${result?.auditEvent ? ` Recorded as ${result.auditEvent}.` : ""}`);
      setRevoking(null);
      setCancelling(null);
      setReviewing(false);
      setReason("");
      await load();
    } catch (e: any) {
      setActionError(e?.message || "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  };

  const input = {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: t.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  };

  if (!data) {
    return (
      <View>
        <PageHeader title="Roles & permissions" subtitle="Control community administration access. Game faction rank never grants moderation powers." />
        {error ? <Notice tone="amber" text={error} /> : <Loading />}
      </View>
    );
  }

  const { admins, invitations, matrix, accessReview } = data;

  return (
    <View>
      <PageHeader
        title="Roles & permissions"
        subtitle="Control community administration access. Game faction rank never grants moderation powers."
        right={
          <>
            <Button label="View audit log" icon="time-outline" onPress={() => router.navigate({ pathname: "/admin/audit", params: { area: "roles" } } as any)} />
            <Button label="Review access" icon="shield-checkmark-outline" onPress={() => { setReviewing(true); setDone(""); }} />
          </>
        }
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Assigned administrators" icon="key-outline" value={formatNumber(admins.length)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }} numberOfLines={1}>{admins.map((a) => a.name.split(" ")[0]).join(" · ")}</Text>} />
        <StatCard title="Pending admin invitations" icon="mail-outline" value={formatNumber(invitations.length)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>Access begins only after acceptance</Text>} />
        <StatCard title="Community access levels" icon="layers-outline" value="2" footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Super admin and Member</Text>} />
        <StatCard title="Faction-based admin access" icon="ban-outline" value="0" footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Gameplay ranks grant no permissions</Text>} />
      </View>

      {reviewing ? (
        <Card style={{ marginTop: 20 }}>
          <CardHeader title="Review access" subtitle={`Confirm the ${admins.length} super admin${admins.length === 1 ? "" : "s"} still need their access.`} />
          {admins.map((a) => (
            <Text key={a.id} style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.text, marginBottom: 4 }}>
              • {a.name} · @{a.username} · last active {a.lastActiveAt ? timeAgo(a.lastActiveAt) : "—"}
            </Text>
          ))}
          <ReasonBox label="Note · optional" value={reason} onChange={setReason} placeholder="e.g. Monthly check: all three still moderate weekend events." />
          <ConfirmBox
            title="Record this access review?"
            text="It's added to the audit log; the next review is suggested in 30 days. To remove someone, use Revoke in the list below."
            confirmLabel="Record review"
            onConfirm={() => run("review", () => recordAccessReview(reason.trim()), "Access review recorded.")}
            onCancel={() => setReviewing(false)}
            busy={busy === "review"}
          />
        </Card>
      ) : null}
      {done ? <DoneNote text={done} /> : null}
      {actionError ? <View style={{ marginTop: 14 }}><Notice tone="red" text={actionError} /></View> : null}

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <View style={{ flex: 1.55, gap: 20, alignSelf: "stretch" }}>
          <Card>
            <CardHeader title="Community permission matrix" subtitle="Admin status is the source of moderation authority" right={<Pill label="Current policy" tone="blue" />} />
            <Notice text="Super admin is an assigned role. Private, Captain and other faction ranks are gameplay labels only; changing a rank doesn't change this matrix." />
            <View style={{ flexDirection: "row", marginTop: 16, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.cardSoft }}>
              {["CAPABILITY", "SUPER ADMIN", "MEMBER", "FACTION RANK ALONE"].map((label, i) => (
                <Text key={label} style={{ flex: [2.2, 1.2, 1.2, 1.2][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                  {label}
                </Text>
              ))}
            </View>
            {matrix.map((row) => (
              <View key={row.capability} style={{ flexDirection: "row", paddingVertical: 12, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: t.line }}>
                <Text style={{ flex: 2.2, fontFamily: FONTS.regular, fontSize: 13, color: t.text }}>{row.capability}</Text>
                {[row.admin, row.member, row.rank].map((value, i) => {
                  const cell = CELL[value] || { label: value, tone: "muted" as const };
                  return (
                    <Text key={i} style={{ flex: 1.2, fontFamily: FONTS.regular, fontSize: 12, color: cell.tone === "green" ? t.green : cell.tone === "amber" ? t.amber : t.muted }}>
                      {cell.label}
                    </Text>
                  );
                })}
              </View>
            ))}
            <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
              Removing, banning, muting and deleting always require an explicit confirmation and a contextual reason.
            </Text>
          </Card>

          <Card>
            <CardHeader title="Assigned administrators" subtitle={`${admins.length} active assignment${admins.length === 1 ? "" : "s"}${accessReview ? ` · reviewed ${day(accessReview.lastAt)}` : ""}`} />
            <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.cardSoft }}>
              {["ADMINISTRATOR", "ROLE", "ASSIGNED BY", "LAST ACTIVE", ""].map((label, i) => (
                <Text key={i} style={{ flex: [2.2, 1.2, 1.1, 1, 0.8][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                  {label}
                </Text>
              ))}
            </View>
            {admins.map((a) => (
              <View key={a.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: t.line }}>
                <View style={{ flex: 2.2, flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 8 }}>
                  <Initials name={a.name} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
                      {a.email || `@${a.username}`}
                      {a.you ? " · You" : ""}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1.2 }}>
                  <Pill label="Super admin" />
                </View>
                <Text style={{ flex: 1.1, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{a.assignedBy?.name || "Initial admin"}</Text>
                <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>{a.lastActiveAt ? timeAgo(a.lastActiveAt) : "—"}</Text>
                <View style={{ flex: 0.8 }}>
                  {a.you ? (
                    <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.faint }}>Your role</Text>
                  ) : (
                    <Pressable onPress={() => { setRevoking(a); setReason(""); setDone(""); }}>
                      <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.pinkText }}>Revoke…</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
            {revoking ? (
              <View style={{ marginTop: 6 }}>
                <ReasonBox value={reason} onChange={setReason} placeholder="Why this access is being removed." />
                <ConfirmBox
                  title={`Remove ${revoking.name}'s super admin access?`}
                  text="Their admin dashboard closes at once. Their CosQuest account is unaffected. This is recorded in the audit log."
                  confirmLabel="Confirm revoke"
                  onConfirm={() => run("revoke", () => revokeAdmin(revoking.id, reason.trim()), `${revoking.name} is no longer a super admin.`)}
                  onCancel={() => setRevoking(null)}
                  busy={busy === "revoke"}
                  disabled={reason.trim().length < 3}
                />
              </View>
            ) : null}
          </Card>
        </View>

        <View style={{ flex: 1, gap: 20, alignSelf: "stretch" }}>
          <Card>
            <CardHeader title="Invite an administrator" subtitle="Assign access to a trusted CosQuest member" />
            <Text style={{ marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Member or email</Text>
            <TextInput value={member} onChangeText={setMember} autoCapitalize="none" placeholder="@username or their account email" placeholderTextColor={t.faint} style={input} />
            <Field label="Community role">Super admin</Field>
            <ReasonBox label="Assignment reason · required" value={inviteReason} onChange={setInviteReason} placeholder="e.g. Help review reports and support community safety during weekend events." />
            <View style={{ marginTop: 14 }}>
              <Notice
                tone="pink"
                icon="information-circle-outline"
                title="Full community access"
                text="This invitation grants report review, member moderation, content management, settings and role assignment once they accept. It's independent of their faction rank."
              />
            </View>
            <Pressable onPress={() => setReviewed((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 }} accessibilityRole="checkbox" accessibilityState={{ checked: reviewed }}>
              <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: reviewed ? t.pink : t.faint, backgroundColor: reviewed ? t.pink : "transparent", alignItems: "center", justifyContent: "center" }}>
                {reviewed ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
              </View>
              <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>I have reviewed the access this invitation grants.</Text>
            </Pressable>
            <View style={{ flexDirection: "row", marginTop: 16 }}>
              <Button
                label="Send admin invitation"
                variant="primary"
                disabled={!reviewed || member.trim().length < 2 || inviteReason.trim().length < 3}
                loading={busy === "invite"}
                onPress={() =>
                  run(
                    "invite",
                    async () => {
                      const result = await inviteAdmin(member.trim(), inviteReason.trim());
                      setMember("");
                      setInviteReason("");
                      setReviewed(false);
                      return result;
                    },
                    "Invitation sent. They become a super admin only after accepting it.",
                  )
                }
              />
            </View>
            <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
              They get a notice in CosQuest and accept from the admin sign-in page. Invitations expire after 7 days.
            </Text>
          </Card>

          {invitations.map((inv) => (
            <Card key={inv.id}>
              <CardHeader title="Pending invitation" subtitle="No admin access granted yet" right={<Pill label={inv.status === "expired" ? "Expired" : "Pending"} tone={inv.status === "expired" ? "grey" : "amber"} />} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Initials name={inv.user?.name} size={34} />
                <View>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{inv.user?.name || "Member"}</Text>
                  <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{inv.email || `@${inv.user?.username}`}</Text>
                </View>
              </View>
              <View style={{ marginTop: 8 }}>
                <Field label="Invited by">{`${inv.invitedBy?.name || "An admin"} · ${day(inv.createdAt)}`}</Field>
                <Field label="Role">Super admin</Field>
                <Field label="Expires">{day(inv.expiresAt)}</Field>
                <Field label="Reason">{inv.reason}</Field>
              </View>
              {cancelling?.id === inv.id ? (
                <>
                  <ReasonBox value={reason} onChange={setReason} placeholder="Why this invitation is withdrawn." />
                  <ConfirmBox
                    title="Revoke this invitation?"
                    text="They won't be able to accept it. You can invite them again later."
                    confirmLabel="Confirm revoke"
                    onConfirm={() => run("cancel", () => revokeInvitation(inv.id, reason.trim()), "Invitation revoked.")}
                    onCancel={() => setCancelling(null)}
                    busy={busy === "cancel"}
                    disabled={reason.trim().length < 3}
                  />
                </>
              ) : (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Button label="Resend invitation" loading={busy === `r${inv.id}`} onPress={() => run(`r${inv.id}`, () => resendInvitation(inv.id), "Invitation resent for 7 more days.")} />
                  <Button label="Revoke…" onPress={() => { setCancelling(inv); setReason(""); setDone(""); }} />
                </View>
              )}
            </Card>
          ))}

          <Card>
            <CardHeader title="Access review" subtitle="Keep community authority intentional" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Ionicons name="shield-checkmark-outline" size={18} color={t.text} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>Admin role, not faction rank</Text>
                <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>A faction promotion can't grant or revoke admin access.</Text>
              </View>
            </View>
            <Divider />
            <Field label="Last review">{accessReview ? day(accessReview.lastAt) : "Not yet"}</Field>
            <Field label="Next review">{accessReview ? day(accessReview.nextAt) : "—"}</Field>
            <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Role changes are recorded in the audit log with the acting admin, the member and the reason.</Text>
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <Button label="Open role change history ↗" onPress={() => router.navigate({ pathname: "/admin/audit", params: { area: "roles" } } as any)} />
            </View>
          </Card>
        </View>
      </View>
    </View>
  );
}
