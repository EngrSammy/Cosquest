// The quest panel, once it has started: who came, who didn't (no-shows,
// admins only), and the results (winners chosen from people who were
// checked in; published once, which tells them).
import { useCallback, useEffect, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import { useAdminTheme } from "@/components/admin/theme";
import { Button, Notice, Pill } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { type Attendance, type Results, getAttendance, getResults, publishResults, saveResults } from "@/services/adminEvents";

const nameOf = (p: Attendance["attendees"][number]["person"]) => (p ? (p.username ? `${p.name} · @${p.username}` : p.name) : "Member");

export default function QuestAfterEvent({ questId, status }: { questId: string; status: string }) {
  const t = useAdminTheme();
  const [att, setAtt] = useState<Attendance | null>(null);
  const [res, setRes] = useState<Results | null>(null);
  const [places, setPlaces] = useState<Record<string, { place: string; note: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(() => {
    getAttendance(questId).then(setAtt).catch((e) => setError(e?.message || "Couldn't load attendance."));
    getResults(questId)
      .then((r) => {
        setRes(r);
        setPlaces(Object.fromEntries(r.winners.map((w) => [w.ticketId, { place: String(w.place), note: w.prizeNote }])));
      })
      .catch(() => setRes(null));
  }, [questId]);
  useEffect(load, [load]);

  if (status !== "live" && status !== "completed") return null;
  const input = { height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.cardSoft, fontFamily: FONTS.regular, fontSize: 13, color: t.text, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) };
  const published = !!res?.publishedAt;
  const chosen = Object.entries(places).filter(([, v]) => v.place.trim());

  const save = async (andPublish: boolean) => {
    setBusy(andPublish ? "publish" : "save");
    setError("");
    try {
      await saveResults(questId, chosen.map(([ticketId, v]) => ({ ticketId, place: Number(v.place), prizeNote: v.note.trim() })));
      if (andPublish) {
        const r = await publishResults(questId);
        setDone(`Results published: the winners were told. Recorded as ${r.auditEvent}.`);
      } else setDone("Draft saved. Nobody is told until you publish.");
      load();
    } catch (e: any) {
      setError(e?.message || "Couldn't save the results.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>{att?.virtual ? "Ticket holders" : "Attendance"}</Text>
        {att ? <Pill label={att.virtual ? `${att.attendees.length} with a ticket` : `${att.checkedIn} checked in`} tone="green" /> : null}
        {att?.ended && !att.virtual ? <Pill label={`${att.noShows.length} no-shows`} tone={att.noShows.length ? "amber" : "blue"} /> : null}
      </View>
      {att && att.ended && att.noShows.length ? (
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>No-shows (admins only; they aren't told):</Text>
          {att.noShows.slice(0, 50).map((r) => (
            <Text key={r.ticketId} style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.text }}>· {nameOf(r.person)}</Text>
          ))}
        </View>
      ) : att?.virtual ? (
        <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Virtual: there's no door, so everyone with a ticket counts (until the game reports who actually played).</Text>
      ) : att && !att.ended ? (
        <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{att.notYetIn.length} not checked in yet. After the end, they show as no-shows.</Text>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
        <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Results</Text>
        {published ? <Pill label="Published" tone="green" /> : <Pill label="Draft" tone="amber" />}
      </View>
      {error ? <Notice icon="alert-circle-outline" tone="red" text={error} /> : null}
      {done ? <Notice icon="checkmark-circle-outline" tone="green" text={done} /> : null}
      {status !== "completed" ? (
        <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>You can choose the winners once it has ended.</Text>
      ) : published ? (
        (res?.winners || []).map((w) => (
          <Text key={w.ticketId} style={{ fontFamily: FONTS.regular, fontSize: 13.5, color: t.text }}>
            🏆 {w.placeLabel} · {nameOf(w.person)}{w.prizeNote ? ` · ${w.prizeNote}` : ""}
          </Text>
        ))
      ) : !att?.attendees.length ? (
        <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{att?.virtual ? "Nobody has a ticket, so there are no winners to choose." : "Nobody was checked in, so there are no winners to choose."}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Give a place (1, 2, 3…) to each winner. {att.virtual ? "Anyone with a ticket can win." : "Only people who were checked in can win."} Prize money is handed out by the team.</Text>
          {att.attendees.map((r) => (
            <View key={r.ticketId} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, minWidth: 140, fontFamily: FONTS.regular, fontSize: 13, color: t.text }}>{nameOf(r.person)}</Text>
              <TextInput
                value={places[r.ticketId]?.place || ""}
                onChangeText={(v) => setPlaces((p) => ({ ...p, [r.ticketId]: { place: v.replace(/[^0-9]/g, "").slice(0, 3), note: p[r.ticketId]?.note || "" } }))}
                placeholder="Place"
                placeholderTextColor={t.faint}
                keyboardType="number-pad"
                accessibilityLabel={`Place for ${nameOf(r.person)}`}
                style={[input, { width: 70 }]}
              />
              <TextInput
                value={places[r.ticketId]?.note || ""}
                onChangeText={(v) => setPlaces((p) => ({ ...p, [r.ticketId]: { place: p[r.ticketId]?.place || "", note: v.slice(0, 200) } }))}
                placeholder="Prize note (optional)"
                placeholderTextColor={t.faint}
                accessibilityLabel={`Prize note for ${nameOf(r.person)}`}
                style={[input, { flex: 1, minWidth: 160 }]}
              />
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <Button label="Save draft" loading={busy === "save"} disabled={!chosen.length} onPress={() => save(false)} />
            <Button label="Publish results" variant="primary" icon="trophy-outline" loading={busy === "publish"} disabled={!chosen.length} onPress={() => save(true)} />
          </View>
        </View>
      )}
    </View>
  );
}
