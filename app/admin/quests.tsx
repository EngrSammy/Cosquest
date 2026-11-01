// ==========================================
// SUPER ADMIN DASHBOARD - Quests & Events
// ==========================================
// Create, edit, publish, duplicate and cancel quests (game activities,
// often live) and events (scheduled, with an entry fee and prize pool).
// Status follows the clock: upcoming -> live -> completed; only draft and
// cancelled are decisions. Prices are in USD. Tickets & payments (Stripe)
// come next.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { createElement, useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";

import { ConfirmBox, Divider, DoneNote, Field, Pager, ReasonBox, SearchBox, Select, Tabs, Toggle } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import {
  type AdminQuest,
  type Place,
  type QuestInput,
  type QuestStatus,
  cancelQuest,
  createQuest,
  getAdminQuest,
  getQuestStats,
  listAdminQuests,
  pickAndUploadCover,
  questAction,
  searchPlaces,
  updateQuest,
} from "@/services/adminQuests";
import { type AdminTicketType, createTicketType, getCheckins, getTicketTypes, money as formatMoney, updateTicketType } from "@/services/adminPayments";
import { router } from "expo-router";

type Tab = "all" | "live" | "upcoming" | "draft" | "completed" | "cancelled";

const money = (m?: { amount: number; currency: string } | null) =>
  !m || !m.amount ? "Free" : new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency || "USD", maximumFractionDigits: m.amount % 1 ? 2 : 0 }).format(m.amount);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// <input type="datetime-local"> <-> ISO
const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : "");

function StatusPill({ status }: { status: QuestStatus }) {
  if (status === "live") return <Pill label="Live" tone="green" dot />;
  if (status === "upcoming") return <Pill label="Upcoming" tone="blue" />;
  if (status === "draft") return <Pill label="Draft" tone="grey" />;
  if (status === "cancelled") return <Pill label="Cancelled" tone="red" />;
  return <Pill label="Completed" tone="grey" />;
}

// ---------- the form ----------
const EMPTY = (): QuestInput => {
  const start = new Date(Date.now() + 24 * 3600e3);
  start.setMinutes(0, 0, 0);
  return {
    title: "",
    kind: "event",
    description: "",
    coverImageUrl: "",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3 * 3600e3).toISOString(),
    location: { name: "", address: "", city: "", country: "", lat: NaN, lng: NaN },
    // Every ticket is paid (Stripe's minimum is $0.50).
    entryFee: { amount: 10 },
    prizePool: { amount: 0 },
    maxParticipants: 50,
    requireAtVenue: false,
    venueRadiusMeters: 200,
  };
};

function fromQuest(q: AdminQuest): QuestInput {
  return {
    title: q.title,
    kind: q.kind,
    description: q.description || "",
    coverImageUrl: q.coverImageUrl || "",
    startsAt: q.startsAt,
    endsAt: q.endsAt,
    location: { name: q.location.name, address: q.location.address || "", city: q.location.city || "", country: q.location.country || "", lat: q.location.lat, lng: q.location.lng },
    entryFee: { amount: q.entryFee?.amount || 0 },
    prizePool: { amount: q.prizePool?.amount || 0 },
    maxParticipants: q.maxParticipants,
    requireAtVenue: Boolean(q.requireAtVenue),
    venueRadiusMeters: q.venueRadiusMeters || 200,
  };
}

function QuestForm({ editing, onClose, onSaved }: { editing: AdminQuest | null; onClose: () => void; onSaved: (quest: AdminQuest, message: string) => void }) {
  const t = useAdminTheme();
  const [form, setForm] = useState<QuestInput>(editing ? fromQuest(editing) : EMPTY());
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | "save" | null>(null);
  const [error, setError] = useState("");

  const set = <K extends keyof QuestInput>(key: K, value: QuestInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setLoc = (patch: Partial<QuestInput["location"]>) => setForm((f) => ({ ...f, location: { ...f.location, ...patch } }));

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
  const label = (text: string) => <Text style={{ marginTop: 14, marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{text}</Text>;
  // The browser's own date-and-time picker (website).
  const dateInput = (value: string, onChange: (iso: string) => void) =>
    createElement("input", {
      type: "datetime-local",
      value: toLocalInput(value),
      onChange: (e: any) => onChange(fromLocalInput(e.target.value)),
      style: { height: 42, padding: "0 12px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontFamily: "inherit", fontSize: 13 },
    });

  const findPlaces = async () => {
    if (placeQuery.trim().length < 3) return;
    setSearching(true);
    setError("");
    try {
      setPlaces((await searchPlaces(placeQuery.trim())).places);
    } catch (e: any) {
      setError(e?.message || "The address search isn't available. Enter the coordinates by hand.");
    } finally {
      setSearching(false);
    }
  };

  const upload = async () => {
    setUploading(true);
    setError("");
    try {
      const url = await pickAndUploadCover();
      if (url) set("coverImageUrl", url);
    } catch (e: any) {
      setError(e?.message || "Couldn't upload the image.");
    } finally {
      setUploading(false);
    }
  };

  const save = async (mode: "draft" | "publish" | "save") => {
    setSaving(mode);
    setError("");
    try {
      const body = { ...form, title: form.title.trim(), description: form.description.trim() };
      if (editing) {
        const result = await updateQuest(editing.id, body);
        onSaved(result.quest, `Saved.${result.auditEvent ? ` Recorded as ${result.auditEvent}.` : ""}`);
      } else {
        const result = await createQuest({ ...body, publish: mode === "publish" });
        onSaved(result.quest, `${mode === "publish" ? "Published" : "Saved as a draft"}. Recorded as ${result.auditEvent}.`);
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't save.");
    } finally {
      setSaving(null);
    }
  };

  const hasPin = Number.isFinite(form.location.lat) && Number.isFinite(form.location.lng);
  const ready = form.title.trim().length >= 3 && form.location.name.trim() && hasPin && form.startsAt && form.endsAt && form.entryFee.amount >= 0.5;

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title={editing ? `Edit “${editing.title}”` : "Create a quest or event"} subtitle="Times are in your computer's time zone. Prices in USD." right={<Button label="Close" onPress={onClose} />} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(["event", "quest"] as const).map((k) => (
          <Pressable key={k} onPress={() => set("kind", k)} style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: form.kind === k ? t.pink : t.border, backgroundColor: form.kind === k ? t.pinkSoft : t.card }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{k === "event" ? "Event" : "Quest"}</Text>
            <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{k === "event" ? "Scheduled, with an entry fee and prizes" : "A game activity at a place, often live"}</Text>
          </Pressable>
        ))}
      </View>

      {label("Title")}
      <TextInput value={form.title} onChangeText={(v) => set("title", v)} maxLength={120} placeholder="e.g. Waterfront Glow Hunt" placeholderTextColor={t.faint} style={input} />
      {label("Description")}
      <TextInput value={form.description} onChangeText={(v) => set("description", v)} maxLength={2000} multiline placeholder="What happens, what to bring, who it's for." placeholderTextColor={t.faint} style={[input, { minHeight: 84, height: undefined, paddingVertical: 10, textAlignVertical: "top" }]} />

      {label("Cover image")}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {form.coverImageUrl ? (
          <Image source={{ uri: form.coverImageUrl }} style={{ width: 96, height: 64, borderRadius: 8 }} contentFit="cover" />
        ) : (
          <View style={{ width: 96, height: 64, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: t.cardSoft }}>
            <Ionicons name="image-outline" size={22} color={t.faint} />
          </View>
        )}
        <Button label={form.coverImageUrl ? "Change image" : "Upload image"} icon="cloud-upload-outline" onPress={upload} loading={uploading} />
        {form.coverImageUrl ? <Button label="Remove" variant="ghost" onPress={() => set("coverImageUrl", "")} /> : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <View>
          {label("Starts")}
          {dateInput(form.startsAt, (v) => set("startsAt", v))}
        </View>
        <View>
          {label("Ends")}
          {dateInput(form.endsAt, (v) => set("endsAt", v))}
        </View>
      </View>

      <Divider />
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Venue</Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <SearchBox value={placeQuery} onChange={setPlaceQuery} placeholder="Search an address or place…" />
        </View>
        <Button label="Find" icon="location-outline" onPress={findPlaces} loading={searching} disabled={placeQuery.trim().length < 3} />
      </View>
      {places ? (
        <View style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: t.border }}>
          {places.length ? (
            places.map((p, i) => (
              <Pressable
                key={`${p.lat},${p.lng},${i}`}
                onPress={() => {
                  setLoc({ name: form.location.name || p.name, address: p.address, city: p.city, country: p.country, lat: p.lat, lng: p.lng });
                  setPlaces(null);
                }}
                style={({ hovered }: any) => ({ padding: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: hovered ? t.cardSoft : "transparent" })}>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }} numberOfLines={2}>
                  {p.label}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={{ padding: 10, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>No places found. Try a fuller address.</Text>
          )}
          <Text style={{ padding: 8, fontFamily: FONTS.regular, fontSize: 10.5, color: t.faint }}>© OpenStreetMap contributors</Text>
        </View>
      ) : null}
      {label("Venue name (shown on the pin)")}
      <TextInput value={form.location.name} onChangeText={(v) => setLoc({ name: v })} maxLength={120} placeholder="e.g. Waterfront Plaza" placeholderTextColor={t.faint} style={input} />
      {label("Address")}
      <TextInput value={form.location.address} onChangeText={(v) => setLoc({ address: v })} maxLength={300} placeholderTextColor={t.faint} style={input} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {(
          [
            ["City", "city", 160],
            ["Country", "country", 160],
          ] as const
        ).map(([text, key, w]) => (
          <View key={key} style={{ width: w }}>
            {label(text)}
            <TextInput value={form.location[key]} onChangeText={(v) => setLoc({ [key]: v } as any)} style={input} />
          </View>
        ))}
        {(
          [
            ["Latitude", "lat"],
            ["Longitude", "lng"],
          ] as const
        ).map(([text, key]) => (
          <View key={key} style={{ width: 140 }}>
            {label(text)}
            <TextInput
              value={Number.isFinite(form.location[key]) ? String(form.location[key]) : ""}
              onChangeText={(v) => setLoc({ [key]: v.trim() === "" ? NaN : Number(v) } as any)}
              placeholder={key === "lat" ? "32.7157" : "-117.1611"}
              placeholderTextColor={t.faint}
              style={input}
            />
          </View>
        ))}
      </View>
      {hasPin ? (
        <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
          Pin set.{" "}
          <Text
            style={{ color: t.pinkText }}
            onPress={() => (window as any).open(`https://www.openstreetmap.org/?mlat=${form.location.lat}&mlon=${form.location.lng}#map=17/${form.location.lat}/${form.location.lng}`, "_blank")}>
            Check it on the map ↗
          </Text>
        </Text>
      ) : (
        <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 11.5, color: t.amber }}>Search the address (or type the coordinates) so it shows to people nearby.</Text>
      )}
      <Toggle value={form.requireAtVenue} onChange={(v) => set("requireAtVenue", v)} label="People must be at the venue" hint="Joining and check-in only work near the venue (used once Join and check-in arrive)." />
      {form.requireAtVenue ? (
        <View style={{ width: 200 }}>
          {label("Venue radius (metres)")}
          <TextInput value={String(form.venueRadiusMeters)} onChangeText={(v) => set("venueRadiusMeters", Number(v) || 0)} style={input} />
        </View>
      ) : null}

      <Divider />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {(
          [
            ["Places", "maxParticipants"],
            ["Entry fee (USD, at least 0.50)", "entryFee"],
            ["Prize pool (USD)", "prizePool"],
          ] as const
        ).map(([text, key]) => (
          <View key={key} style={{ width: 200 }}>
            {label(text)}
            <TextInput
              value={String(key === "maxParticipants" ? form.maxParticipants : form[key].amount)}
              onChangeText={(v) => {
                const n = Number(v.replace(/[^0-9.]/g, "")) || 0;
                if (key === "maxParticipants") set("maxParticipants", Math.round(n));
                else set(key, { amount: n });
              }}
              style={input}
            />
          </View>
        ))}
      </View>
      {form.entryFee.amount < 0.5 ? (
        <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>Every ticket is paid: the entry fee must be at least $0.50.</Text>
      ) : (
        <View style={{ marginTop: 14 }}>
          <Notice text="People pay by card on Stripe's secure page. You can add more ticket types (e.g. VIP) after saving." />
        </View>
      )}

      {error ? <Text style={{ marginTop: 14, fontFamily: FONTS.regular, fontSize: 12.5, color: t.red }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
        {editing ? (
          <Button label="Save changes" variant="primary" onPress={() => save("save")} loading={saving === "save"} disabled={!ready} />
        ) : (
          <>
            <Button label="Publish" variant="primary" onPress={() => save("publish")} loading={saving === "publish"} disabled={!ready} />
            <Button label="Save as draft" onPress={() => save("draft")} loading={saving === "draft"} disabled={!ready} />
          </>
        )}
        <Button label="Cancel" onPress={onClose} />
      </View>
      {editing && editing.registrationCount > 0 ? (
        <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
          {editing.registrationCount} registered {editing.registrationCount === 1 ? "person is" : "people are"} told if the time or venue changes.
        </Text>
      ) : null}
    </Card>
  );
}

// ---------- tickets for one quest ----------
function QuestTickets({ questId, editable }: { questId: string; editable: boolean }) {
  const t = useAdminTheme();
  const [types, setTypes] = useState<AdminTicketType[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [count, setCount] = useState<{ checkedIn: number; tickets: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("10");
  const [quantity, setQuantity] = useState("50");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [res, c] = await Promise.all([getTicketTypes(questId), getCheckins(questId).catch(() => null)]);
      setTypes(res.ticketTypes);
      setConfigured(res.paymentsConfigured);
      setCount(c);
      setError("");
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "Tickets aren't deployed on the server yet." : e?.message || "Couldn't load tickets.");
    }
  }, [questId]);
  useEffect(() => {
    load();
  }, [load]);

  const input = {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: t.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  };

  const add = async () => {
    setBusy("add");
    setError("");
    try {
      await createTicketType(questId, { name: name.trim(), price: { amount: Number(price) || 0 }, quantity: Math.round(Number(quantity) || 0) });
      setAdding(false);
      setName("");
      setPrice("10");
      setQuantity("50");
      await load();
    } catch (e: any) {
      setError(e?.message || "Couldn't add it.");
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (tt: AdminTicketType) => {
    setBusy(tt.id);
    try {
      await updateTicketType(tt.id, { active: !tt.active });
      await load();
    } catch (e: any) {
      setError(e?.message || "Couldn't change it.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Tickets</Text>
        {count ? <Pill label={`${count.checkedIn}/${count.tickets} checked in`} tone="green" /> : null}
      </View>
      {!configured ? <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 11.5, color: t.amber }}>Stripe isn't set up on the server: only free tickets can be issued.</Text> : null}
      {error ? <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 12, color: t.red }}>{error}</Text> : null}
      {(types || []).map((tt) => (
        <View key={tt.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: t.cardSoft, opacity: tt.active ? 1 : 0.6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>
              {tt.name} · {formatMoney(tt.price)}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
              {tt.sold} sold{tt.held ? ` · ${tt.held} paying now` : ""} · {tt.remaining} left of {tt.quantity}
              {tt.active ? "" : " · sales stopped"}
            </Text>
          </View>
          {editable ? <Button label={tt.active ? "Stop sales" : "Resume"} loading={busy === tt.id} onPress={() => toggle(tt)} /> : null}
        </View>
      ))}
      {editable ? (
        adding ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. VIP" placeholderTextColor={t.faint} maxLength={60} style={input} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={price} onChangeText={setPrice} placeholder="Price (USD, at least 0.50)" placeholderTextColor={t.faint} style={[input, { flex: 1 }]} />
              <TextInput value={quantity} onChangeText={setQuantity} placeholder="How many" placeholderTextColor={t.faint} style={[input, { flex: 1 }]} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Add ticket type" variant="primary" onPress={add} loading={busy === "add"} disabled={name.trim().length < 2 || (Number(price) || 0) < 0.5} />
              <Button label="Cancel" onPress={() => setAdding(false)} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <Button label="Add ticket type" icon="add" onPress={() => setAdding(true)} />
            <Button label="Check-in" icon="qr-code-outline" onPress={() => router.navigate("/admin/checkin" as any)} />
            <Button label="Orders" icon="receipt-outline" onPress={() => router.navigate("/admin/payments" as any)} />
          </View>
        )
      ) : null}
    </View>
  );
}

// ---------- the details panel ----------
function QuestPanel({ questId, onEdit, onChanged }: { questId: string; onEdit: (q: AdminQuest) => void; onChanged: (newId?: string) => void }) {
  const t = useAdminTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminQuest>> | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getAdminQuest(questId));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load it.");
    }
  }, [questId]);

  useEffect(() => {
    setData(null);
    setCancelling(false);
    setReason("");
    setDone("");
    load();
  }, [load]);

  if (error) return <Notice tone="red" text={error} />;
  if (!data) return <Loading />;
  const { quest, counts, registrations } = data;
  const editable = quest.status !== "cancelled";

  const run = async (key: string, work: () => Promise<any>, message: (r: any) => string, newId?: (r: any) => string | undefined) => {
    setBusy(key);
    setError("");
    try {
      const result = await work();
      setDone(message(result));
      setCancelling(false);
      setReason("");
      const id = newId?.(result);
      onChanged(id);
      if (!id) await load();
    } catch (e: any) {
      setError(e?.message || "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      {quest.coverImageUrl ? <Image source={{ uri: quest.coverImageUrl }} style={{ width: "100%", height: 150, borderRadius: 12, marginBottom: 14 }} contentFit="cover" /> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 17, color: t.text }}>{quest.title}</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>
            {quest.kind === "event" ? "Event" : "Quest"} · {quest.hostName}
            {quest.isSeedData ? " · test data" : ""}
          </Text>
        </View>
        <StatusPill status={quest.status} />
      </View>
      {quest.description ? <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: t.muted }}>{quest.description}</Text> : null}

      <View style={{ marginTop: 12 }}>
        <Field label="When">{`${when(quest.startsAt)} → ${when(quest.endsAt)}`}</Field>
        <Field label="Venue">{[quest.location.name, quest.location.address].filter(Boolean).join(" · ")}</Field>
        <Field label="City">{[quest.location.city, quest.location.country].filter(Boolean).join(", ") || "—"}</Field>
        <Field label="Places">{`${formatNumber(quest.registrationCount)} / ${formatNumber(quest.maxParticipants)} · ${formatNumber(quest.spacesRemaining)} left`}</Field>
        <Field label="Entry">{money(quest.entryFee)}</Field>
        <Field label="Prize pool">{quest.prizePool?.amount ? money(quest.prizePool) : "—"}</Field>
        {quest.requireAtVenue ? <Field label="At the venue">{`Within ${quest.venueRadiusMeters} m`}</Field> : null}
        {quest.cancelReason ? <Field label="Cancelled">{quest.cancelReason}</Field> : null}
      </View>
      <Text
        style={{ marginTop: 6, fontFamily: FONTS.medium, fontSize: 12.5, color: t.pinkText }}
        onPress={() => (window as any).open(`https://www.openstreetmap.org/?mlat=${quest.location.lat}&mlon=${quest.location.lng}#map=17/${quest.location.lat}/${quest.location.lng}`, "_blank")}>
        Open the venue on the map ↗
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        {editable ? <Button label="Edit" icon="create-outline" onPress={() => onEdit(quest)} /> : null}
        {editable && quest.status === "draft" ? (
          <Button label="Publish" variant="primary" loading={busy === "publish"} onPress={() => run("publish", () => questAction(quest.id, "publish"), (r) => `Published. Recorded as ${r.auditEvent}.`)} />
        ) : null}
        {editable && quest.status !== "draft" && quest.registrationCount === 0 && quest.status !== "completed" ? (
          <Button label="Unpublish" loading={busy === "unpublish"} onPress={() => run("unpublish", () => questAction(quest.id, "unpublish"), (r) => `Back to draft. Recorded as ${r.auditEvent}.`)} />
        ) : null}
        <Button label="Duplicate" icon="copy-outline" loading={busy === "duplicate"} onPress={() => run("duplicate", () => questAction(quest.id, "duplicate"), () => "Copied as a new draft.", (r) => r.quest.id)} />
        {editable && quest.status !== "completed" ? <Button label="Cancel…" onPress={() => { setCancelling(true); setDone(""); }} /> : null}
      </View>
      {cancelling ? (
        <>
          <ReasonBox value={reason} onChange={setReason} placeholder="e.g. The venue is closed for repairs. We'll announce a new date soon." />
          <ConfirmBox
            title={`Cancel ${quest.title}?`}
            text={`${counts.registered ? `${counts.registered} registered ${counts.registered === 1 ? "person is" : "people are"} told, with this reason, and their registrations are cancelled. ` : ""}It disappears from the home page. Every paid ticket is refunded automatically.`}
            confirmLabel="Confirm cancel"
            onConfirm={() => run("cancel", () => cancelQuest(quest.id, reason.trim()), (r) => `Cancelled. ${r.registrantsNotified} told. Recorded as ${r.auditEvent}.`)}
            onCancel={() => setCancelling(false)}
            busy={busy === "cancel"}
            disabled={reason.trim().length < 3}
          />
        </>
      ) : null}
      {done ? <DoneNote text={done} /> : null}

      <Divider />
      <QuestTickets questId={quest.id} editable={editable && quest.status !== "completed"} />

      <Divider />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Registrations</Text>
        <Pill label={`${counts.registered} registered`} tone="blue" />
      </View>
      
      {registrations.length ? (
        registrations.slice(0, 12).map((r) => (
          <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
            <Initials name={r.user.name} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }} numberOfLines={1}>
                {r.user.name}
              </Text>
              <Text style={{ marginTop: 1, fontFamily: FONTS.regular, fontSize: 11, color: t.muted }} numberOfLines={1}>
                @{r.user.username} · {timeAgo(r.at)}
              </Text>
            </View>
            <Pill label={r.status} tone={r.status === "registered" ? "green" : "grey"} />
          </View>
        ))
      ) : (
        <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Nobody has registered yet.</Text>
      )}
      {error ? <View style={{ marginTop: 12 }}><Notice tone="red" text={error} /></View> : null}
    </View>
  );
}

export default function AdminQuests() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getQuestStats>> | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AdminQuest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing: AdminQuest | null } | null>(null);
  const [panelKey, setPanelKey] = useState(0);
  const [done, setDone] = useState("");

  const loadStats = useCallback(async () => {
    try {
      setStats(await getQuestStats());
    } catch {}
  }, []);
  const loadList = useCallback(async () => {
    try {
      const result = await listAdminQuests({ tab, q: q.trim() || undefined, kind: kind === "all" ? undefined : kind, offset });
      setRows(result.quests);
      setTotal(result.total);
      setError("");
      setSelected((current) => current || result.quests[0]?.id || null);
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "Quests & Events isn't deployed on the server yet." : e?.message || "Couldn't load quests.");
    }
  }, [tab, q, kind, offset]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const timer = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, q]);

  const refresh = (id?: string) => {
    loadStats();
    loadList();
    if (id) setSelected(id);
    setPanelKey((k) => k + 1);
  };

  return (
    <View>
      <PageHeader
        title="Quests & Events"
        subtitle="Create what members find on the home page: quests near them, and events they register for."
        right={<Button label="Create" icon="add" variant="primary" onPress={() => { setForm({ editing: null }); setDone(""); }} />}
      />
      {form ? (
        <QuestForm
          key={form.editing?.id || "new"}
          editing={form.editing}
          onClose={() => setForm(null)}
          onSaved={(quest, message) => {
            setForm(null);
            setDone(message);
            setTab(quest.status === "draft" ? "draft" : "all");
            refresh(quest.id);
          }}
        />
      ) : null}
      {done ? <View style={{ marginBottom: 16 }}><DoneNote text={done} /></View> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Live now" icon="radio-outline" value={formatNumber(stats?.live)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.green }}>Happening right now</Text>} />
        <StatCard title="Upcoming" icon="calendar-outline" value={formatNumber(stats?.upcoming)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Published, not started</Text>} />
        <StatCard title="Drafts" icon="document-outline" value={formatNumber(stats?.drafts)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Only admins see these</Text>} />
        <StatCard title="Registrations" icon="people-outline" value={formatNumber(stats?.registrationsThisWeek)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>In the last 7 days</Text>} />
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <Card style={{ flex: 1.55, alignSelf: "stretch" }}>
          <CardHeader title="All quests & events" subtitle="Status follows the clock: upcoming → live → completed" />
          <Tabs<Tab>
            value={tab}
            onChange={(key) => {
              setTab(key);
              setOffset(0);
              setSelected(null);
            }}
            tabs={[
              { key: "all", label: "All" },
              { key: "live", label: "Live", count: stats?.live },
              { key: "upcoming", label: "Upcoming", count: stats?.upcoming },
              { key: "draft", label: "Drafts", count: stats?.drafts },
              { key: "completed", label: "Completed" },
              { key: "cancelled", label: "Cancelled", count: stats?.cancelled },
            ]}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12, zIndex: 20 }}>
            <SearchBox value={q} onChange={(text) => { setQ(text); setOffset(0); }} placeholder="Search title, venue or city…" />
            <Select value={kind} onChange={(v) => { setKind(v); setOffset(0); }} options={[{ value: "all", label: "Quests & events" }, { value: "event", label: "Events" }, { value: "quest", label: "Quests" }]} minWidth={170} />
          </View>
          {error ? (
            <Notice tone="amber" text={error} />
          ) : !rows ? (
            <Loading />
          ) : rows.length ? (
            rows.map((quest) => (
              <Pressable
                key={quest.id}
                onPress={() => setSelected(quest.id)}
                style={({ hovered }: any) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 10,
                  borderTopWidth: 1,
                  borderTopColor: t.line,
                  borderLeftWidth: 2,
                  borderLeftColor: quest.id === selected ? t.pink : "transparent",
                  backgroundColor: quest.id === selected ? t.pinkSoft : hovered ? t.cardSoft : "transparent",
                })}>
                {quest.coverImageUrl ? (
                  <Image source={{ uri: quest.coverImageUrl }} style={{ width: 52, height: 52, borderRadius: 8 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: t.pinkSoft }}>
                    <Ionicons name={quest.kind === "event" ? "ticket-outline" : "flag-outline"} size={20} color={t.pink} />
                  </View>
                )}
                <View style={{ flex: 2.4, minWidth: 0 }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
                    {quest.title}
                  </Text>
                  <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
                    {quest.kind === "event" ? "Event" : "Quest"} · {quest.location.name}
                    {quest.location.city ? `, ${quest.location.city}` : ""}
                  </Text>
                </View>
                <Text style={{ flex: 1.3, fontFamily: FONTS.regular, fontSize: 12, color: t.text }}>{when(quest.startsAt)}</Text>
                <Text style={{ flex: 0.8, fontFamily: FONTS.regular, fontSize: 12, color: t.text }}>
                  {quest.registrationCount}/{quest.maxParticipants}
                </Text>
                <Text style={{ flex: 0.7, fontFamily: FONTS.regular, fontSize: 12, color: t.text }}>{money(quest.entryFee)}</Text>
                <View style={{ flex: 0.9 }}>
                  <StatusPill status={quest.status} />
                </View>
              </Pressable>
            ))
          ) : (
            <View style={{ paddingVertical: 40, alignItems: "center", gap: 10 }}>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>{tab === "all" && !q ? "Nothing yet. Create the first quest or event." : "Nothing here."}</Text>
              {tab === "all" && !q ? <Button label="Create" icon="add" variant="primary" onPress={() => setForm({ editing: null })} /> : null}
            </View>
          )}
          {rows ? <Pager shown={rows.length} total={total} offset={offset} onPage={setOffset} noun="quests & events" /> : null}
        </Card>

        <Card style={{ flex: 1, alignSelf: "stretch" }}>
          {selected ? (
            <QuestPanel key={`${selected}:${panelKey}`} questId={selected} onEdit={(quest) => { setForm({ editing: quest }); setDone(""); }} onChanged={refresh} />
          ) : (
            <Text style={{ paddingVertical: 60, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick a quest or event to see it.</Text>
          )}
        </Card>
      </View>
    </View>
  );
}
