// ==========================================
// A SUBJECT (Figma · Projects · Route & meetup files)
// ==========================================
// Its files (upload PDFs, images and documents up to 25 MB) and the Sparks
// about it, together.
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { personName, useChatTitle, useMyPerson } from "@/components/calls/scheduled/ChoiceSheet";
import { UI } from "@/components/chat/ui";
import { GroupScreen } from "@/components/groups/GroupUi";
import { FileRow, SparkCard } from "@/components/projects/ProjectParts";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { countsLine, formatBytes, formatWhen, MAX_FILE_BYTES, type ProjectFile } from "@/services/projects";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectProject, selectSubjectDetail } from "@/store/slices/projectSlice";
import { fetchProject, fetchSubject, uploadProjectFileThunk } from "@/store/thunks/projectThunks";
import { safeBack } from "@/utils/safeBack";

export default function SubjectScreen() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const me = useMyPerson();
  const params = useLocalSearchParams<{ projectId: string; subjectId: string }>();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const subjectId = Array.isArray(params.subjectId) ? params.subjectId[0] : params.subjectId;
  const token = useAppSelector((state) => state.auth.token);
  const project = useAppSelector((state) => selectProject(state, projectId));
  const detail = useAppSelector((state) => selectSubjectDetail(state, projectId, subjectId));
  const chatTitle = useChatTitle(project?.conversationId || "");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(0);
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => {
    if (!token || !projectId || !subjectId) return;
    if (!project) dispatch(fetchProject({ projectId, token }));
    dispatch(fetchSubject({ projectId, subjectId, token }))
      .unwrap()
      .catch((message) => setError(String(message || "Couldn't load this subject.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId, subjectId, dispatch]);

  const back = () => safeBack(projectId ? ({ pathname: "/group/project/[projectId]", params: { projectId } } as any) : undefined);

  if (!detail || !project) {
    return (
      <GroupScreen title={chatTitle || "Group"} onBack={back}>
        {error ? <Text style={styles.empty}>{error}</Text> : <ActivityIndicator color={UI.PINK} style={styles.center} />}
      </GroupScreen>
    );
  }

  const { subject, sparks } = detail;
  const files = [...detail.files].sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return newestFirst ? diff : -diff;
  });

  const upload = async () => {
    if (!token) return;
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const tooBig = result.assets.filter((asset) => (asset.size || 0) > MAX_FILE_BYTES);
    if (tooBig.length) Alert.alert("Upload files", `${tooBig.map((asset) => asset.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over 25 MB.`);
    const ok = result.assets.filter((asset) => (asset.size || 0) <= MAX_FILE_BYTES);
    setUploading((n) => n + ok.length);
    for (const asset of ok) {
      try {
        await dispatch(
          uploadProjectFileThunk({
            projectId: project.id,
            subjectId: subject.id,
            picked: { name: asset.name, sizeBytes: asset.size || 0, mimeType: asset.mimeType, uri: asset.uri },
            me,
            token,
          }),
        ).unwrap();
      } catch (message) {
        Alert.alert("Upload files", String(message || `Couldn't upload ${asset.name}.`));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    // Counts on the project page.
    dispatch(fetchProject({ projectId: project.id, token }));
  };

  const openFile = (file: ProjectFile) => {
    if (!file.url) {
      Alert.alert(file.name, "Opening files works once Projects is connected to the server.");
      return;
    }
    Linking.openURL(file.url).catch(() => Alert.alert(file.name, "Couldn't open this file."));
  };

  const fileMenu = (file: ProjectFile) =>
    Alert.alert(file.name, `${formatBytes(file.sizeBytes)} · ${personName(file.uploadedBy)}`, [
      { text: "Open", onPress: () => openFile(file) },
      { text: "Cancel", style: "cancel" },
    ]);

  const startSpark = () =>
    Alert.alert("Start a Spark", "Long-press any message in the group chat and choose Start a Spark.", [
      { text: "Not now", style: "cancel" },
      { text: "Open chat", onPress: () => router.push({ pathname: "/chat/[id]", params: { id: project.conversationId } }) },
    ]);

  return (
    <GroupScreen title={chatTitle || "Group"} onBack={back}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.crumbRow} onPress={back} hitSlop={6} accessibilityRole="link">
          <Ionicons name="folder-outline" size={18} color={ink.text(UI.PINK)} />
          <Text style={styles.crumb} numberOfLines={1}>
            Projects / {project.name}
          </Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {subject.name}
          </Text>
          <Pressable
            onPress={() =>
              Alert.alert(subject.name, undefined, [
                { text: "Upload files", onPress: upload },
                { text: "Start Spark", onPress: startSpark },
                { text: "Cancel", style: "cancel" },
              ])
            }
            hitSlop={10}
            accessibilityLabel="Subject options">
            <Ionicons name="ellipsis-horizontal" size={24} color={ink.text(UI.PINK)} />
          </Pressable>
        </View>
        {subject.description ? <Text style={styles.description}>{subject.description}</Text> : null}

        <View style={styles.metaRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{countsLine({ fileCount: files.length, sparkCount: sparks.length })}</Text>
          </View>
          <Text style={styles.metaText}>Shared with the project</Text>
        </View>

        {/* Upload */}
        {!project.archived ? (
          <View style={styles.drop}>
            <View style={styles.dropIcon}>
              <Ionicons name="cloud-upload-outline" size={26} color={ink.text(UI.PINK)} />
            </View>
            <Text style={styles.dropTitle}>Add something for the group</Text>
            <Pressable style={styles.uploadButton} onPress={upload} disabled={uploading > 0} accessibilityRole="button">
              {uploading > 0 ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="add" size={26} color="#FFFFFF" />
                  <Text style={styles.uploadText}>Upload files</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.dropHint}>PDF, images & documents · Up to 25 MB each</Text>
          </View>
        ) : null}

        {/* Files */}
        <View style={styles.sectionRow}>
          <Text style={styles.section}>Files · {files.length}</Text>
          {files.length > 1 ? (
            <Pressable onPress={() => setNewestFirst((value) => !value)} hitSlop={8} style={styles.sortRow}>
              <Text style={styles.link}>{newestFirst ? "Newest first" : "Oldest first"}</Text>
              <Ionicons name={newestFirst ? "arrow-down" : "arrow-up"} size={16} color={ink.text(UI.PINK)} />
            </Pressable>
          ) : null}
        </View>
        {files.length ? (
          <View style={styles.filesCard}>
            {files.map((file, index) => (
              <View key={file.id}>
                {index ? <View style={styles.divider} /> : null}
                <FileRow
                  file={file}
                  meta={`${formatBytes(file.sizeBytes)} · ${personName(file.uploadedBy)} · ${formatWhen(file.createdAt)}`}
                  onPress={() => openFile(file)}
                  onMore={() => fileMenu(file)}
                />
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No files yet.</Text>
        )}

        {/* Sparks */}
        <View style={styles.sectionRow}>
          <Text style={styles.section}>Related Sparks · {sparks.length}</Text>
          <Pressable onPress={startSpark} hitSlop={8}>
            <Text style={styles.link}>+ Start Spark</Text>
          </Pressable>
        </View>
        {sparks.length ? (
          <View style={styles.list}>
            {sparks.map((spark) => (
              <SparkCard
                key={spark.id}
                spark={spark}
                onPress={() => router.push({ pathname: "/chat/[id]", params: { id: project.conversationId } })}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No Sparks about this yet.</Text>
        )}

        <Text style={styles.footnote}>
          Files and Sparks stay together in {subject.name}.{"\n"}Also accessible from the {project.name} project.
        </Text>
      </ScrollView>
    </GroupScreen>
  );
}

const STYLE_PAIR = themedStyles(
  {
    content: { paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 720, alignSelf: "center" },
    center: { paddingVertical: 40 },
    crumbRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    crumb: { flex: 1, fontFamily: FONTS.medium, fontSize: 15, color: UI.PINK },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
    title: { flex: 1, fontFamily: FONTS.bold, fontSize: 30, lineHeight: 38, color: UI.INK },
    description: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 15.5, lineHeight: 23, color: UI.MUTED },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
    chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "#F7E4F0" },
    chipText: { fontFamily: FONTS.medium, fontSize: 13.5, color: UI.PINK },
    metaText: { fontFamily: FONTS.regular, fontSize: 13.5, color: UI.MUTED },
    drop: {
      marginTop: 22,
      paddingHorizontal: 22,
      paddingVertical: 22,
      alignItems: "center",
      borderRadius: 22,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: "rgba(195,77,156,0.45)",
      backgroundColor: "rgba(255,255,255,0.55)",
    },
    dropIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#F7E4F0" },
    dropTitle: { marginTop: 12, fontFamily: FONTS.medium, fontSize: 16, color: UI.INK },
    uploadButton: { marginTop: 14, width: "100%", height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: UI.PINK },
    uploadText: { fontFamily: FONTS.semibold, fontSize: 17, color: "#FFFFFF" },
    dropHint: { marginTop: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: UI.MUTED },
    sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 },
    section: { fontFamily: FONTS.semibold, fontSize: 19, color: UI.INK },
    sortRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    link: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.PINK },
    filesCard: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 22, backgroundColor: "#FFFFFF" },
    divider: { height: 1, marginVertical: 4, backgroundColor: "rgba(36,40,60,0.08)" },
    list: { gap: 14 },
    empty: { marginTop: 8, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, color: UI.MUTED },
    footnote: { marginTop: 26, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13.5, lineHeight: 20, color: UI.MUTED },
  },
  {
    crumb: { color: "#F29BD3" },
    title: { color: "#F4F5FA" },
    description: { color: "#B5BBCB" },
    chip: { backgroundColor: "rgba(195,77,156,0.18)" },
    chipText: { color: "#F29BD3" },
    metaText: { color: "#9AA1B4" },
    drop: { backgroundColor: "rgba(31,33,48,0.6)" },
    dropIcon: { backgroundColor: "rgba(195,77,156,0.18)" },
    dropTitle: { color: "#F4F5FA" },
    dropHint: { color: "#9AA1B4" },
    section: { color: "#F4F5FA" },
    link: { color: "#F29BD3" },
    filesCard: { backgroundColor: "#1F2130" },
    divider: { backgroundColor: "rgba(255,255,255,0.08)" },
    empty: { color: "#B5BBCB" },
    footnote: { color: "#9AA1B4" },
  },
);
