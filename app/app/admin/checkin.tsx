// ==========================================
// SUPER ADMIN DASHBOARD - Check-in
// ==========================================
// At the venue: pick the quest, then scan the member's QR code (camera,
// where the browser supports it) or type the code. Each ticket gets in
// ONCE: a copied code shows "Already checked in at 7:42 pm".
import { Ionicons } from "@expo/vector-icons";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import { Select } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Notice, PageHeader } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { checkIn, getCheckins } from "@/services/adminPayments";
import { type AdminQuest, listAdminQuests } from "@/services/adminQuests";

type Result = { ok: boolean; title: string; text: string; name?: string | null };

const canScan = () => Platform.OS === "web" && typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

export default function AdminCheckin() {
  const t = useAdminTheme();
  const [quests, setQuests] = useState<AdminQuest[]>([]);
  const [questId, setQuestId] = useState("");
  const [count, setCount] = useState<{ checkedIn: number; tickets: number } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [scanning, setScanning] = useState(false);
  const video = useRef<any>(null);
  const stream = useRef<MediaStream | null>(null);
  const lastCode = useRef("");

  useEffect(() => {
    Promise.all([listAdminQuests({ tab: "live" }), listAdminQuests({ tab: "upcoming" })])
      .then(([live, upcoming]) => {
        const all = [...live.quests, ...upcoming.quests];
        setQuests(all);
        setQuestId((current) => current || all[0]?.id || "");
      })
      .catch(() => {});
  }, []);

  const refreshCount = useCallback(() => {
    if (questId) getCheckins(questId).then(setCount).catch(() => {});
  }, [questId]);
  useEffect(refreshCount, [refreshCount]);

  const submit = useCallback(
    async (value: string) => {
      const c = value.trim();
      if (!c || busy) return;
      setBusy(true);
      const r = await checkIn(c, questId || undefined);
      if (r.ok) {
        setResult({ ok: true, title: "Checked in", text: r.result.quest?.title || "", name: r.result.person?.name });
        refreshCount();
      } else {
        const when = r.checkedInAt ? ` at ${new Date(r.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
        setResult({ ok: false, title: r.code === "already_checked_in" ? `Already checked in${when}` : "Not valid", text: r.error, name: r.person?.name });
      }
      setCode("");
      setBusy(false);
    },
    [busy, questId, refreshCount],
  );

  // Camera scanning (Chrome / Edge on computers and Android).
  const stopScan = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setScanning(false);
  }, []);
  useEffect(() => stopScan, [stopScan]);
  useEffect(() => {
    if (!scanning) return;
    let alive = true;
    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) {
          video.current.srcObject = stream.current;
          await video.current.play();
        }
        while (alive) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          if (!video.current || video.current.readyState < 2) continue;
          const found = await detector.detect(video.current).catch(() => []);
          const value = found?.[0]?.rawValue;
          if (value && value !== lastCode.current) {
            lastCode.current = value;
            setTimeout(() => (lastCode.current = ""), 4000);
            await submit(value);
          }
        }
      } catch {
        setResult({ ok: false, title: "Camera unavailable", text: "Allow the camera, or type the code instead." });
        stopScan();
      }
    })();
    return () => {
      alive = false;
    };
  }, [scanning, submit, stopScan]);

  const input = {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: t.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  };

  return (
    <View>
      <PageHeader title="Check-in" subtitle="Scan or type ticket codes at the venue. Each ticket gets in once." />
      <View style={{ maxWidth: 720, gap: 20 }}>
        <Card>
          <CardHeader title="Quest or event" subtitle={count ? `${count.checkedIn} of ${count.tickets} checked in` : "Live and upcoming"} />
          {quests.length ? (
            <View style={{ zIndex: 30 }}>
              <Select value={questId} onChange={setQuestId} options={quests.map((q) => ({ value: q.id, label: `${q.title} · ${new Date(q.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` }))} minWidth={360} />
            </View>
          ) : (
            <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>No live or upcoming quests.</Text>
          )}
        </Card>

        <Card>
          <CardHeader title="Ticket code" subtitle="The code under the member's QR code (CQT-…)" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput value={code} onChangeText={setCode} autoFocus autoCapitalize="none" placeholder="CQT-…" placeholderTextColor={t.faint} style={input} onSubmitEditing={() => submit(code)} />
            <Button label="Check in" variant="primary" onPress={() => submit(code)} loading={busy} disabled={!code.trim()} />
          </View>
          {canScan() ? (
            <View style={{ marginTop: 14 }}>
              {scanning ? (
                <>
                  {createElement("video", { ref: video, muted: true, playsInline: true, style: { width: "100%", maxHeight: 340, borderRadius: 12, background: "#000", objectFit: "cover" } })}
                  <View style={{ flexDirection: "row", marginTop: 10 }}>
                    <Button label="Stop camera" onPress={stopScan} />
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: "row" }}>
                  <Button label="Scan with camera" icon="camera-outline" onPress={() => setScanning(true)} />
                </View>
              )}
            </View>
          ) : (
            <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Camera scanning works in Chrome or Edge. A USB/Bluetooth QR scanner also works: it types the code into the box.</Text>
          )}
        </Card>

        {result ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 20, borderRadius: 16, backgroundColor: result.ok ? t.greenSoft : t.redSoft }}>
            <Ionicons name={result.ok ? "checkmark-circle" : "close-circle"} size={48} color={result.ok ? t.green : t.red} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 20, color: t.text }}>{result.title}</Text>
              <Text style={{ marginTop: 4, fontFamily: FONTS.regular, fontSize: 13.5, color: t.muted }}>{result.text}</Text>
            </View>
            {result.name ? (
              <View style={{ alignItems: "center", gap: 6 }}>
                <Initials name={result.name} size={44} />
                <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{result.name}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Notice text="Green = let them in. Red = the code is wrong, refunded, for another event, or already used." />
        )}
      </View>
    </View>
  );
}
