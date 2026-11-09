// The top bar's search: members, groups, posts, reports and Sparks at once.
// Ctrl+K / ⌘K jumps to it; Escape closes the results.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import { type SearchResults, searchAdmin } from "@/services/adminExtras";

import { useAdminTheme } from "./theme";

type Hit = { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; go: () => void };

export default function AdminSearch() {
  const t = useAdminTheme();
  const input = useRef<TextInput>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Ctrl+K / ⌘K
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      searchAdmin(q.trim())
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const go = (pathname: string, params?: Record<string, string>) => () => {
    setOpen(false);
    setQ("");
    router.navigate((params ? { pathname, params } : pathname) as any);
  };

  const sections: { title: string; hits: Hit[] }[] = results
    ? [
        { title: "Members", hits: results.members.map((m) => ({ key: `m${m.id}`, icon: "person-outline" as const, title: m.name, sub: `@${m.username || "—"}${m.email ? ` · ${m.email}` : ""}`, go: go("/admin/members", { member: m.id }) })) },
        { title: "Groups", hits: results.groups.map((g) => ({ key: `g${g.id}`, icon: "albums-outline" as const, title: g.name, sub: `${g.kind}${g.archived ? " · archived" : ""}`, go: go("/admin/groups", { group: g.id }) })) },
        { title: "Reports", hits: results.reports.map((r) => ({ key: `r${r.id}`, icon: "flag-outline" as const, title: r.number, sub: `${r.reason} · ${r.status.replace("_", " ")}${r.text ? ` · ${r.text}` : ""}`, go: go("/admin/moderation", { report: r.id }) })) },
        { title: "Posts", hits: results.posts.map((p) => ({ key: `p${p.id}`, icon: "newspaper-outline" as const, title: p.text || p.label, sub: `${p.label} · @${p.author?.username || "member"}${p.removed ? " · removed" : ""}`, go: go("/admin/feeds", { post: p.id }) })) },
        { title: "Sparks", hits: results.sparks.map((s) => ({ key: `s${s.id}`, icon: "flash-outline" as const, title: s.subject, sub: "Spark", go: go("/admin/sparks", { spark: s.id }) })) },
      ].filter((s) => s.hits.length)
    : [];

  return (
    <View style={{ width: 300, zIndex: 40 }}>
      <View style={{ height: 38, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.cardSoft }}>
        <Ionicons name="search-outline" size={16} color={t.faint} />
        <TextInput
          ref={input}
          value={q}
          onChangeText={(text) => {
            setQ(text);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search members, content, groups…"
          placeholderTextColor={t.faint}
          style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) }}
        />
        <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: t.faint }}>{Platform.OS === "web" && /Mac/.test(String((globalThis as any).navigator?.platform || "")) ? "⌘ K" : "Ctrl K"}</Text>
      </View>
      {open && q.trim().length >= 2 ? (
        <View style={{ position: "absolute", top: 44, left: 0, right: -120, maxHeight: 460, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
          {loading && !results ? (
            <Text style={{ padding: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Searching…</Text>
          ) : sections.length ? (
            sections.map((section) => (
              <View key={section.title} style={{ marginBottom: 4 }}>
                <Text style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>{section.title.toUpperCase()}</Text>
                {section.hits.map((hit) => (
                  <Pressable key={hit.key} onPress={hit.go} style={({ hovered }: any) => ({ flexDirection: "row", alignItems: "center", gap: 10, padding: 9, borderRadius: 8, backgroundColor: hovered ? t.cardSoft : "transparent" })}>
                    <Ionicons name={hit.icon} size={16} color={t.muted} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }} numberOfLines={1}>
                        {hit.title}
                      </Text>
                      <Text style={{ marginTop: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
                        {hit.sub}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))
          ) : (
            <Text style={{ padding: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Nothing found for “{q.trim()}”.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
