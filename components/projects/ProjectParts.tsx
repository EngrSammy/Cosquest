// ==========================================
// PROJECTS - shared pieces (Figma · Projects)
// ==========================================
// Cards and rows used by the Projects tab, a project and a subject, in the
// same style as the Calls screens (UI colours, white cards, Poppins).
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PersonAvatar, personName } from "@/components/calls/scheduled/ChoiceSheet";
import { PrimaryButton, UI } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { GroupPerson } from "@/services/groups";
import {
  countsLine,
  fileBadge,
  formatBytes,
  formatWhen,
  type Project,
  type ProjectFile,
  type ProjectSpark,
  type ProjectSubject,
} from "@/services/projects";

const first = (person: GroupPerson) => personName(person).split(" ")[0];

// ---------- small pieces ----------

export function IconBox({ name, size = 52 }: { name: keyof typeof Ionicons.glyphMap; size?: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <View style={[styles.iconBox, { width: size, height: size, borderRadius: size * 0.27 }]}>
      <Ionicons name={name} size={size * 0.46} color={ink.text(UI.PINK)} />
    </View>
  );
}

export function Chip({ label }: { label: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function Faces({ people, size = 30 }: { people: GroupPerson[]; size?: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.faces}>
      {people.slice(0, 3).map((person, index) => (
        <View key={person.id || index} style={{ marginLeft: index ? -6 : 0 }}>
          <PersonAvatar person={person} size={size} />
        </View>
      ))}
    </View>
  );
}

export function FileBadge({ file, size = 52 }: { file: Pick<ProjectFile, "name" | "kind">; size?: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <View style={[styles.fileBadge, { width: size, height: size }]}>
      <Ionicons name={file.kind === "image" ? "image-outline" : "document-text-outline"} size={size * 0.4} color={ink.text(UI.PINK)} />
      <Text style={styles.fileBadgeText}>{fileBadge(file)}</Text>
    </View>
  );
}

// ---------- rows ----------

export function FileRow({ file, meta, onPress, onMore }: { file: ProjectFile; meta: string; onPress?: () => void; onMore?: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable style={styles.fileRow} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined}>
      <FileBadge file={file} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={10} accessibilityLabel={`More for ${file.name}`}>
          <Ionicons name="ellipsis-horizontal" size={18} color={ink.text("#B9C0CC")} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

// "Meet by the mural? · 9:31 AM / Maya: Yes! Meet by the mural at 10?"
export function SparkLine({ spark }: { spark: ProjectSpark }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <View style={styles.sparkLine}>
      <Ionicons name="sparkles-outline" size={18} color={ink.text(UI.PINK)} style={styles.sparkIcon} />
      <View style={styles.flex}>
        <View style={styles.sparkHead}>
          <Text style={styles.sparkTitle} numberOfLines={1}>
            {spark.subject}
          </Text>
          <Text style={styles.sparkTime}>{formatWhen(spark.lastActivityAt)}</Text>
        </View>
        {spark.lastMessage ? (
          <Text style={styles.sparkText} numberOfLines={1}>
            {first(spark.lastMessage.author)}: {spark.lastMessage.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// The bigger Spark card on a subject page ("Related Sparks").
export function SparkCard({ spark, onPress }: { spark: ProjectSpark; onPress?: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined}>
      <View style={styles.cardHead}>
        <Ionicons name="sparkles-outline" size={22} color={ink.text(UI.PINK)} />
        <Text style={[styles.cardTitle, styles.flex]} numberOfLines={1}>
          {spark.subject}
        </Text>
        <Ionicons name="chevron-forward" size={20} color={ink.text(UI.MUTED)} />
      </View>
      {spark.lastMessage ? (
        <View style={styles.quoteRow}>
          <PersonAvatar person={spark.lastMessage.author} size={30} />
          <Text style={[styles.quote, styles.flex]} numberOfLines={2}>
            {spark.lastMessage.text}
          </Text>
        </View>
      ) : null}
      <View style={styles.sparkFoot}>
        <Text style={styles.sparkFootText}>
          {spark.people} people · {spark.active ? "Active now" : formatWhen(spark.lastActivityAt)}
        </Text>
        {spark.fileName ? (
          <View style={styles.attach}>
            <Ionicons name="attach" size={14} color={ink.text(UI.MUTED)} />
            <Text style={styles.attachText} numberOfLines={1}>
              {spark.fileName}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------- cards ----------

// A subject on the project page: folder, counts, newest file, newest Spark.
export function SubjectCard({ subject, onPress }: { subject: ProjectSubject; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={subject.name}>
      <View style={styles.cardHead}>
        <IconBox name="folder-outline" size={50} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {subject.name}
          </Text>
          <Text style={styles.rowMeta}>{countsLine(subject)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={ink.text(UI.MUTED)} />
      </View>
      {subject.latestFile ? (
        <FileRow
          file={subject.latestFile}
          meta={`${fileBadge(subject.latestFile)} · ${formatBytes(subject.latestFile.sizeBytes)} · ${personName(subject.latestFile.uploadedBy)}`}
        />
      ) : (
        <Text style={styles.emptyLine}>No files yet. Tap to upload the first one.</Text>
      )}
      {subject.latestSpark ? (
        <>
          <View style={styles.divider} />
          <SparkLine spark={subject.latestSpark} />
        </>
      ) : null}
    </Pressable>
  );
}

const MAX_CHIPS = 2;

// The project card in the Projects tab. `featured`: the big first card.
export function ProjectCard({ project, featured, onPress }: { project: Project; featured?: boolean; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const when = [project.place, project.date ? new Date(project.date).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }) : null]
    .filter(Boolean)
    .join(" · ");

  if (!featured) {
    return (
      <Pressable style={[styles.card, styles.compact]} onPress={onPress} accessibilityRole="button" accessibilityLabel={project.name}>
        <View style={styles.cardHead}>
          <Ionicons name={project.icon} size={22} color={ink.text(UI.PINK)} />
          <Text style={[styles.cardTitle, styles.flex]} numberOfLines={1}>
            {project.name}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={ink.text(UI.MUTED)} />
        </View>
        {project.description ? (
          <Text style={styles.body} numberOfLines={2}>
            {project.description}
          </Text>
        ) : null}
        <Text style={styles.counts}>{countsLine(project)}</Text>
        {project.lastActivity ? (
          <Text style={styles.rowMeta}>
            {project.lastActivity.text} · {formatWhen(project.lastActivity.at)}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  const extra = project.subjects.length - MAX_CHIPS;
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={project.name}>
      <View style={styles.cardHead}>
        <IconBox name={project.icon} />
        <View style={styles.flex}>
          <Text style={styles.featuredTitle} numberOfLines={1}>
            {project.name}
          </Text>
          {when ? <Text style={styles.rowMeta}>{when}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={ink.text(UI.MUTED)} />
      </View>
      {project.description ? <Text style={styles.body}>{project.description}</Text> : null}
      {project.subjects.length ? (
        <View style={styles.chips}>
          {project.subjects.slice(0, MAX_CHIPS).map((subject) => (
            <Chip key={subject.id} label={subject.name} />
          ))}
          {extra > 0 ? <Chip label={`+${extra} subject${extra === 1 ? "" : "s"}`} /> : null}
        </View>
      ) : null}
      <Text style={styles.counts}>{countsLine(project)}</Text>
      <View style={styles.divider} />
      <View style={styles.footRow}>
        <Faces people={project.members} />
        {project.lastActivity ? (
          <Text style={[styles.rowMeta, styles.flex, styles.right]} numberOfLines={1}>
            {project.lastActivity.text} · {formatWhen(project.lastActivity.at)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------- "Add subject" (a small sheet) ----------

export function AddSubjectSheet({
  visible,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: { name: string; description: string }) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (visible) {
      setName("");
      setDescription("");
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Add subject</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={ink.text(UI.INK)} />
              </Pressable>
            </View>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Route & meetup"
              placeholderTextColor={ink.text(UI.PLACEHOLDER)}
              style={styles.input}
              maxLength={80}
              autoFocus
            />
            <Text style={styles.label}>What's it for? (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="The route, meeting point and getting there."
              placeholderTextColor={ink.text(UI.PLACEHOLDER)}
              style={[styles.input, styles.inputTall]}
              maxLength={300}
              multiline
            />
            <PrimaryButton
              label="Add subject"
              onPress={() => onSave({ name: name.trim(), description: description.trim() })}
              disabled={!name.trim()}
              loading={saving}
              style={styles.sheetButton}
            />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    right: { textAlign: "right" },
    iconBox: { alignItems: "center", justifyContent: "center", backgroundColor: "#F7E4F0" },
    chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "#F7E4F0" },
    chipText: { fontFamily: FONTS.medium, fontSize: 13, color: UI.PINK },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    faces: { flexDirection: "row", alignItems: "center" },
    fileBadge: { borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 1, backgroundColor: "#F7E4F0" },
    fileBadgeText: { fontFamily: FONTS.semibold, fontSize: 9.5, color: UI.PINK },
    fileRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 },
    rowTitle: { fontFamily: FONTS.medium, fontSize: 15.5, color: UI.INK },
    rowMeta: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 13, color: UI.MUTED },
    sparkLine: { flexDirection: "row", gap: 10, paddingTop: 4 },
    sparkIcon: { marginTop: 2 },
    sparkHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    sparkTitle: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15, color: UI.PINK },
    sparkTime: { fontFamily: FONTS.regular, fontSize: 12.5, color: UI.MUTED },
    sparkText: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 14, color: "#4A5063" },
    card: {
      padding: 18,
      borderRadius: 22,
      backgroundColor: "#FFFFFF",
      shadowColor: "#24283C",
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    compact: { backgroundColor: "#F7FBFF" },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    cardTitle: { fontFamily: FONTS.semibold, fontSize: 17, color: UI.INK },
    featuredTitle: { fontFamily: FONTS.bold, fontSize: 20, color: UI.INK },
    body: { marginTop: 12, fontFamily: FONTS.regular, fontSize: 14.5, lineHeight: 21, color: "#4A5063" },
    counts: { marginTop: 12, fontFamily: FONTS.regular, fontSize: 14, color: UI.INK },
    divider: { height: 1, marginVertical: 12, backgroundColor: "rgba(36,40,60,0.08)" },
    footRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    emptyLine: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13.5, color: UI.MUTED },
    quoteRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
    quote: { fontFamily: FONTS.regular, fontSize: 14.5, color: "#4A5063" },
    sparkFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
    sparkFootText: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: UI.PINK },
    attach: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "50%" },
    attachText: { fontFamily: FONTS.regular, fontSize: 13, color: UI.MUTED },
    backdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { width: "100%", maxWidth: 560, paddingHorizontal: 20, paddingTop: 18, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#FFFFFF" },
    sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    sheetTitle: { fontFamily: FONTS.bold, fontSize: 20, color: UI.INK },
    label: { marginTop: 12, marginBottom: 6, fontFamily: FONTS.medium, fontSize: 13.5, color: UI.MUTED },
    input: {
      minHeight: 50,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: "#F3F5F9",
      fontFamily: FONTS.regular,
      fontSize: 15,
      color: UI.INK,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
    },
    inputTall: { minHeight: 90, textAlignVertical: "top" },
    sheetButton: { marginTop: 18 },
  },
  {
    iconBox: { backgroundColor: "rgba(195,77,156,0.18)" },
    chip: { backgroundColor: "rgba(195,77,156,0.18)" },
    chipText: { color: "#F29BD3" },
    fileBadge: { backgroundColor: "rgba(195,77,156,0.18)" },
    fileBadgeText: { color: "#F29BD3" },
    rowTitle: { color: "#F4F5FA" },
    rowMeta: { color: "#9AA1B4" },
    sparkTitle: { color: "#F29BD3" },
    sparkTime: { color: "#9AA1B4" },
    sparkText: { color: "#C9CEDA" },
    card: { backgroundColor: "#1F2130" },
    compact: { backgroundColor: "#1B1D2B" },
    cardTitle: { color: "#F4F5FA" },
    featuredTitle: { color: "#F4F5FA" },
    body: { color: "#C9CEDA" },
    counts: { color: "#E3E6EE" },
    divider: { backgroundColor: "rgba(255,255,255,0.08)" },
    emptyLine: { color: "#9AA1B4" },
    quote: { color: "#C9CEDA" },
    sparkFootText: { color: "#F29BD3" },
    attachText: { color: "#9AA1B4" },
    sheet: { backgroundColor: "#1F2130" },
    sheetTitle: { color: "#F4F5FA" },
    label: { color: "#9AA1B4" },
    input: { backgroundColor: "#2A2C3B", color: "#F4F5FA" },
  },
);
