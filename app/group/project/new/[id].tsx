// ==========================================
// NEW PROJECT (opened from "New project" in the Projects tab)
// ==========================================
// Same look as Sammy's "Schedule a call" form: a name, what it's for, an
// optional place and day, and its first subjects.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChoiceSheet, useChatTitle, useMyPerson, type Choice } from "@/components/calls/scheduled/ChoiceSheet";
import { Card, FieldLabel, PrimaryButton, TextField, UI } from "@/components/chat/ui";
import { GroupScreen } from "@/components/groups/GroupUi";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { formatLongDate } from "@/services/scheduledCalls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createProjectThunk } from "@/store/thunks/projectThunks";
import { safeBack } from "@/utils/safeBack";

const DAYS_AHEAD = 120;
const MAX_SUBJECTS = 8;

function dayDate(day: number) {
  const date = new Date();
  date.setDate(date.getDate() + day);
  date.setHours(12, 0, 0, 0);
  return date;
}

export default function NewProject() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const me = useMyPerson();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(id) ? id[0] : id;
  const token = useAppSelector((state) => state.auth.token);
  const chatTitle = useChatTitle(conversationId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  const [day, setDay] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<string[]>(["", ""]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const back = () => safeBack({ pathname: "/chat/[id]", params: { id: conversationId } });
  const nameError = name.trim() ? "" : "Give the project a name.";

  const dayChoices: Choice<number | null>[] = [
    { value: null, label: "No date" },
    ...Array.from({ length: DAYS_AHEAD }, (_, index) => ({ value: index, label: formatLongDate(dayDate(index)) })),
  ];

  const create = async () => {
    setTried(true);
    if (nameError || !token || saving) return;
    setSaving(true);
    try {
      const project = await dispatch(
        createProjectThunk({
          conversationId,
          me,
          token,
          input: {
            name: name.trim(),
            description: description.trim(),
            place: place.trim(),
            date: day === null ? null : dayDate(day).toISOString(),
            subjects: subjects.map((subject) => subject.trim()).filter(Boolean),
          },
        }),
      ).unwrap();
      router.replace({ pathname: "/group/project/[projectId]", params: { projectId: project.id } } as any);
    } catch (message) {
      Alert.alert("New project", String(message || "Couldn't create the project."));
      setSaving(false);
    }
  };

  return (
    <GroupScreen title={chatTitle || "Group"} onBack={back}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <Text style={styles.title}>New project</Text>
            <Pressable onPress={back} hitSlop={10}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>A shared space for a plan: its files and Sparks, by subject.</Text>

          <Card style={styles.card}>
            <FieldLabel>Name</FieldLabel>
            <TextField value={name} onChangeText={setName} placeholder="Next CosQuest" maxLength={80} />
            {tried && nameError ? <Text style={styles.error}>{nameError}</Text> : null}

            <FieldLabel>What's it for?</FieldLabel>
            <TextField
              value={description}
              onChangeText={setDescription}
              placeholder="Planning Saturday at Chicano Park."
              multiline
              maxLength={500}
              style={styles.tall}
            />

            <FieldLabel>Where (optional)</FieldLabel>
            <TextField value={place} onChangeText={setPlace} placeholder="Chicano Park" maxLength={80} />

            <FieldLabel>When (optional)</FieldLabel>
            <Pressable style={styles.select} onPress={() => setPicking(true)} accessibilityRole="button">
              <Text style={[styles.selectText, day === null && styles.placeholder]}>
                {day === null ? "No date" : formatLongDate(dayDate(day))}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={ink.text(UI.MUTED)} />
            </Pressable>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Subjects</Text>
            <Text style={styles.hint}>Each subject keeps its own files and Sparks. You can add more later.</Text>
            {subjects.map((subject, index) => (
              <View key={index} style={styles.subjectRow}>
                <Ionicons name="folder-outline" size={20} color={ink.text(UI.PINK)} />
                <TextField
                  value={subject}
                  onChangeText={(value) => setSubjects((list) => list.map((item, i) => (i === index ? value : item)))}
                  placeholder={index === 0 ? "Route & meetup" : index === 1 ? "Costumes" : "Another subject"}
                  maxLength={80}
                  style={styles.flex}
                />
                {subjects.length > 1 ? (
                  <Pressable onPress={() => setSubjects((list) => list.filter((_, i) => i !== index))} hitSlop={8} accessibilityLabel="Remove">
                    <Ionicons name="close" size={20} color={ink.text(UI.MUTED)} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {subjects.length < MAX_SUBJECTS ? (
              <Pressable onPress={() => setSubjects((list) => [...list, ""])} hitSlop={6}>
                <Text style={styles.link}>+ Add another subject</Text>
              </Pressable>
            ) : null}
          </Card>

          <PrimaryButton label="Create project" onPress={create} loading={saving} style={styles.button} />
          <Text style={styles.footnote}>Everyone in {chatTitle || "the group"} can see it.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <ChoiceSheet
        visible={picking}
        title="When"
        choices={dayChoices}
        selected={day}
        onSelect={(value) => {
          setDay(value);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </GroupScreen>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    content: { paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 720, alignSelf: "center" },
    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontFamily: FONTS.bold, fontSize: 30, lineHeight: 38, color: UI.INK },
    cancel: { fontFamily: FONTS.semibold, fontSize: 16, color: UI.PINK },
    subtitle: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 15, color: UI.MUTED },
    card: { marginTop: 18, gap: 4 },
    cardTitle: { fontFamily: FONTS.semibold, fontSize: 18, color: UI.INK },
    hint: { marginBottom: 6, fontFamily: FONTS.regular, fontSize: 13, color: UI.MUTED },
    tall: { minHeight: 90, textAlignVertical: "top" },
    select: { height: 52, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F3F5F9" },
    selectText: { fontFamily: FONTS.regular, fontSize: 15.5, color: UI.INK },
    placeholder: { color: UI.PLACEHOLDER },
    error: { fontFamily: FONTS.regular, fontSize: 12.5, color: "#C0394B" },
    subjectRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
    link: { marginTop: 10, fontFamily: FONTS.semibold, fontSize: 15, color: UI.PINK },
    button: { marginTop: 22 },
    footnote: { marginTop: 10, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: UI.MUTED },
  },
  {
    title: { color: "#F4F5FA" },
    cancel: { color: "#F29BD3" },
    subtitle: { color: "#B5BBCB" },
    cardTitle: { color: "#F4F5FA" },
    hint: { color: "#9AA1B4" },
    select: { backgroundColor: "#2A2C3B" },
    selectText: { color: "#F4F5FA" },
    link: { color: "#F29BD3" },
    footnote: { color: "#9AA1B4" },
  },
);
