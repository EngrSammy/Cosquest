// ==========================================
// A PROJECT (Figma · Projects · Next CosQuest workspace)
// ==========================================
// Name, description, who it's shared with, counts, the linked scheduled
// call, then each subject (newest file and Spark) and "Start a project Spark".
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useChatTitle, useMyPerson } from "@/components/calls/scheduled/ChoiceSheet";
import { UI } from "@/components/chat/ui";
import { GroupScreen } from "@/components/groups/GroupUi";
import { AddSubjectSheet, Chip, Faces, SubjectCard } from "@/components/projects/ProjectParts";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { plural } from "@/services/projects";
import { formatShortDate, formatTimeRange, formatDuration } from "@/services/scheduledCalls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectProject } from "@/store/slices/projectSlice";
import { makeSelectChatCalls } from "@/store/slices/scheduledCallSlice";
import { addSubjectThunk, archiveProjectThunk, fetchProject } from "@/store/thunks/projectThunks";
import { safeBack } from "@/utils/safeBack";

export default function ProjectWorkspace() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const me = useMyPerson();
  const { projectId: param } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Array.isArray(param) ? param[0] : param;
  const token = useAppSelector((state) => state.auth.token);
  const project = useAppSelector((state) => selectProject(state, projectId));
  const chatTitle = useChatTitle(project?.conversationId || "");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // The next scheduled call linked to this project (scheduled calls carry projectId).
  const selectCalls = useMemo(() => makeSelectChatCalls(), []);
  const calls = useAppSelector((state) => selectCalls(state, project?.conversationId || ""));
  const linkedCall = calls
    .filter((call: any) => call.projectId === projectId && call.status !== "cancelled" && new Date(call.startsAt) > new Date())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];

  useEffect(() => {
    if (!token || !projectId) return;
    dispatch(fetchProject({ projectId, token }))
      .unwrap()
      .catch((message) => setError(String(message || "Couldn't load this project.")));
  }, [token, projectId, dispatch]);

  const back = () => safeBack(project ? { pathname: "/chat/[id]", params: { id: project.conversationId } } : undefined);

  if (!project) {
    return (
      <GroupScreen title={chatTitle || "Group"} onBack={back}>
        {error ? <Text style={styles.empty}>{error}</Text> : <ActivityIndicator color={UI.PINK} style={styles.center} />}
      </GroupScreen>
    );
  }

  const saveSubject = async (input: { name: string; description: string }) => {
    if (!token || !input.name) return;
    setSaving(true);
    try {
      await dispatch(addSubjectThunk({ projectId: project.id, input, me, token })).unwrap();
      setAdding(false);
    } catch (message) {
      Alert.alert("Add subject", String(message || "Couldn't add the subject."));
    } finally {
      setSaving(false);
    }
  };

  const menu = () =>
    Alert.alert(project.name, undefined, [
      {
        text: project.archived ? "Restore project" : "Archive project",
        onPress: () => token && dispatch(archiveProjectThunk({ projectId: project.id, archived: !project.archived, token })),
      },
      { text: "Cancel", style: "cancel" },
    ]);

  const startSpark = () =>
    Alert.alert(
      "Start a project Spark",
      "Long-press any message in the group chat and choose Start a Spark. Sparks about this project show up in its subjects.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open chat", onPress: () => router.push({ pathname: "/chat/[id]", params: { id: project.conversationId } }) },
      ],
    );

  return (
    <GroupScreen title={chatTitle || "Group"} onBack={back}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {project.name}
          </Text>
          <Pressable onPress={menu} hitSlop={10} accessibilityLabel="Project options">
            <Ionicons name="ellipsis-horizontal" size={24} color={ink.text(UI.PINK)} />
          </Pressable>
        </View>
        <Text style={styles.crumb}>Projects / {project.name}</Text>
        {project.archived ? <Text style={styles.archived}>Archived</Text> : null}
        {project.description ? <Text style={styles.description}>{project.description}</Text> : null}

        <View style={styles.shared}>
          <Faces people={project.members} size={32} />
          <Text style={styles.sharedText} numberOfLines={1}>
            {plural(project.memberCount, "group member")} · Shared project
          </Text>
        </View>

        <View style={styles.chips}>
          <Chip label={plural(project.subjects.length, "subject")} />
          <Chip label={plural(project.fileCount, "file")} />
          <Chip label={plural(project.sparkCount, "Spark")} />
        </View>

        {linkedCall ? (
          <Pressable
            style={styles.call}
            onPress={() => router.push({ pathname: "/group/scheduled-call/[callId]", params: { callId: linkedCall.id } })}
            accessibilityRole="button">
            <Ionicons name="videocam-outline" size={24} color={ink.text(UI.PINK)} />
            <View style={styles.flex}>
              <Text style={styles.callTitle} numberOfLines={1}>
                {linkedCall.topic}
              </Text>
              <Text style={styles.callMeta}>
                {formatShortDate(new Date(linkedCall.startsAt))} · {formatTimeRange(linkedCall).split("–")[0]} · {formatDuration(linkedCall.durationMin)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={ink.text(UI.PINK)} />
          </Pressable>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={styles.section}>Subjects</Text>
          {!project.archived ? (
            <Pressable onPress={() => setAdding(true)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>+ Add subject</Text>
            </Pressable>
          ) : null}
        </View>

        {project.subjects.length ? (
          <View style={styles.list}>
            {project.subjects.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                onPress={() =>
                  router.push({
                    pathname: "/group/project/[projectId]/subject/[subjectId]",
                    params: { projectId: project.id, subjectId: subject.id },
                  })
                }
              />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No subjects yet. Add one to start collecting files and Sparks.</Text>
        )}
      </ScrollView>

      {!project.archived ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
          <Pressable style={styles.sparkButton} onPress={startSpark} accessibilityRole="button">
            <Ionicons name="sparkles-outline" size={22} color="#FFFFFF" />
            <Text style={styles.sparkButtonText}>Start a project Spark</Text>
          </Pressable>
        </View>
      ) : null}

      <AddSubjectSheet visible={adding} saving={saving} onClose={() => setAdding(false)} onSave={saveSubject} />
    </GroupScreen>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    content: { paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 720, alignSelf: "center" },
    center: { paddingVertical: 40 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    title: { flex: 1, fontFamily: FONTS.bold, fontSize: 30, lineHeight: 38, color: UI.INK },
    crumb: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 15, color: UI.MUTED },
    archived: { marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: "hidden", fontFamily: FONTS.medium, fontSize: 12, color: UI.MUTED, backgroundColor: "#EEF1F6" },
    description: { marginTop: 16, fontFamily: FONTS.regular, fontSize: 16, lineHeight: 24, color: UI.INK },
    shared: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
    sharedText: { flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: UI.MUTED },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
    call: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 22, padding: 18, borderRadius: 22, backgroundColor: "#F7E4F0" },
    callTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: UI.INK },
    callMeta: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 14, color: UI.MUTED },
    sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 14 },
    section: { fontFamily: FONTS.semibold, fontSize: 19, color: UI.INK },
    link: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.PINK },
    list: { gap: 16 },
    empty: { marginTop: 16, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: UI.MUTED },
    footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, alignItems: "center" },
    sparkButton: {
      width: "100%",
      maxWidth: 688,
      height: 58,
      borderRadius: 29,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: UI.PINK,
      shadowColor: UI.PINK,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    sparkButtonText: { fontFamily: FONTS.semibold, fontSize: 17, color: "#FFFFFF" },
  },
  {
    title: { color: "#F4F5FA" },
    crumb: { color: "#9AA1B4" },
    archived: { color: "#C9CEDA", backgroundColor: "#2A2C3B" },
    description: { color: "#E3E6EE" },
    sharedText: { color: "#9AA1B4" },
    call: { backgroundColor: "rgba(195,77,156,0.18)" },
    callTitle: { color: "#F4F5FA" },
    callMeta: { color: "#C9CEDA" },
    section: { color: "#F4F5FA" },
    link: { color: "#F29BD3" },
    empty: { color: "#B5BBCB" },
  },
);
