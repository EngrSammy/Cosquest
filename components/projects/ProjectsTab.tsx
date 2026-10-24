// ==========================================
// GROUP PROJECTS TAB (Figma · Projects · Overview)
// ==========================================
// "Projects - Keep your plans, Sparks and files in one place."
// New project, search, Active / Archived, the most recent project in full,
// then "More from your group".
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenGradient, UI } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { Project } from "@/services/projects";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { makeSelectChatProjects } from "@/store/slices/projectSlice";
import { fetchProjects } from "@/store/thunks/projectThunks";

import { ProjectCard } from "./ProjectParts";

const recent = (a: Project, b: Project) =>
  new Date(b.lastActivity?.at || b.createdAt).getTime() - new Date(a.lastActivity?.at || a.createdAt).getTime();

export default function ProjectsTab({ conversationId, title }: { conversationId: string; title: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const selectProjects = useMemo(() => makeSelectChatProjects(), []);
  const projects = useAppSelector((state) => selectProjects(state, conversationId));
  const loaded = useAppSelector((state) => !!state.projects.loadedChats[conversationId]);
  const error = useAppSelector((state) => state.projects.errorByChat[conversationId] || "");
  const [view, setView] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (token) dispatch(fetchProjects({ conversationId, token }));
    }, [conversationId, token, dispatch]),
  );

  const active = projects.filter((project) => !project.archived);
  const archived = projects.filter((project) => project.archived);
  const text = query.trim().toLowerCase();
  const shown = (view === "active" ? active : archived)
    .filter((project) => !text || `${project.name} ${project.description}`.toLowerCase().includes(text))
    .sort(recent);
  const [featured, ...more] = shown;

  const open = (project: Project) =>
    router.push({ pathname: "/group/project/[projectId]", params: { projectId: project.id } } as any);

  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Projects</Text>
        <Text style={styles.subtitle}>Keep your plans, Sparks and files in one place.</Text>

        <Pressable
          style={styles.newButton}
          onPress={() => router.push({ pathname: "/group/project/new/[id]", params: { id: conversationId } })}
          accessibilityRole="button">
          <Ionicons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.newText}>New project</Text>
        </Pressable>

        <View style={styles.search}>
          <Ionicons name="search" size={20} color={ink.text(UI.MUTED)} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search projects"
            placeholderTextColor={ink.text(UI.PLACEHOLDER)}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={ink.text(UI.MUTED)} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filters}>
          <Pressable onPress={() => setView("active")} hitSlop={6}>
            <Text style={[styles.filter, view === "active" && styles.filterOn]}>Active{active.length ? ` · ${active.length}` : ""}</Text>
          </Pressable>
          <Pressable onPress={() => setView("archived")} hitSlop={6}>
            <Text style={[styles.filter, view === "archived" && styles.filterOn]}>
              Archived{archived.length ? ` · ${archived.length}` : ""}
            </Text>
          </Pressable>
        </View>

        {!loaded && !error ? (
          <ActivityIndicator color={UI.PINK} style={styles.center} />
        ) : error && !projects.length ? (
          <Text style={styles.empty}>{error}</Text>
        ) : !featured ? (
          <Text style={styles.empty}>
            {text
              ? "No projects match your search."
              : view === "active"
                ? "No projects yet. Start one to keep a plan's files and Sparks together."
                : "No archived projects."}
          </Text>
        ) : (
          <>
            <ProjectCard project={featured} featured onPress={() => open(featured)} />
            {more.length ? (
              <>
                <Text style={styles.section}>More from your group</Text>
                <View style={styles.list}>
                  {more.map((project) => (
                    <ProjectCard key={project.id} project={project} onPress={() => open(project)} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}

        {title ? <Text style={styles.footnote}>Shared with {title}</Text> : null}
      </ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, width: "100%", maxWidth: 720, alignSelf: "center" },
    title: { fontFamily: FONTS.bold, fontSize: 30, lineHeight: 38, color: UI.INK },
    subtitle: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 15, color: UI.MUTED },
    newButton: { marginTop: 22, height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: UI.PINK },
    newText: { fontFamily: FONTS.semibold, fontSize: 17, color: "#FFFFFF" },
    search: { marginTop: 16, height: 52, borderRadius: 26, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, backgroundColor: "rgba(255,255,255,0.85)" },
    searchInput: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 15.5,
      color: UI.INK,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
    },
    filters: { flexDirection: "row", gap: 28, marginTop: 22, marginBottom: 16 },
    filter: { fontFamily: FONTS.medium, fontSize: 16, color: UI.MUTED },
    filterOn: { fontFamily: FONTS.semibold, color: UI.PINK },
    section: { marginTop: 26, marginBottom: 12, fontFamily: FONTS.semibold, fontSize: 18, color: UI.INK },
    list: { gap: 14 },
    center: { paddingVertical: 32 },
    empty: { marginTop: 24, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: UI.MUTED },
    footnote: { marginTop: 26, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: UI.MUTED },
  },
  {
    title: { color: "#F4F5FA" },
    subtitle: { color: "#B5BBCB" },
    search: { backgroundColor: "#252837" },
    searchInput: { color: "#F4F5FA" },
    filter: { color: "#9AA1B4" },
    filterOn: { color: "#F29BD3" },
    section: { color: "#F4F5FA" },
    empty: { color: "#B5BBCB" },
    footnote: { color: "#9AA1B4" },
  },
);
