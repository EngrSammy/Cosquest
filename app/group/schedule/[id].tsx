// ==========================================
// SCHEDULE A CALL (Figma · Calls · Schedule a call)
// ==========================================
// Topic, linked Spark, date / start time / duration, repeat, who's
// invited, and the video & meeting-access settings. On "Schedule call"
// the call is saved, the reminder is set and the details page opens.
// (id = the group chat's conversation id)
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ChoiceSheet,
  MembersSheet,
  PersonAvatar,
  personName,
  useChatTitle,
  useMyPerson,
  type Choice,
} from "@/components/calls/scheduled/ChoiceSheet";
import { SparkChip } from "@/components/calls/scheduled/ScheduledCallCard";
import { Card, FieldLabel, PrimaryButton, TextField, UI } from "@/components/chat/ui";
import { GroupScreen } from "@/components/groups/GroupUi";
import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { GroupPerson } from "@/services/groups";
import {
  messageOf,
  deviceTimeZone,
  formatClock,
  formatDuration,
  formatLongDate,
  REPEAT_LABELS,
  timeZoneLabel,
  type CallAudience,
  type CallRepeat,
  type ScheduledCallInput,
} from "@/services/scheduledCalls";
import { listSparks } from "@/services/sparks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectScheduledCall } from "@/store/slices/scheduledCallSlice";
import { createScheduledCallThunk, fetchScheduledCall, updateScheduledCallThunk } from "@/store/thunks/scheduledCallThunks";
import { cancelCallReminder, scheduleCallReminder } from "@/utils/callReminders";
import { safeBack } from "@/utils/safeBack";

type LinkedSpark = { id: string; subject: string } | null;

type Form = {
  topic: string;
  description: string;
  spark: LinkedSpark;
  // Days from today (0 = today) and minutes after midnight, local time.
  day: number;
  minutes: number;
  durationMin: number;
  repeat: CallRepeat;
  participants: GroupPerson[];
  hostVideo: boolean;
  participantVideo: boolean;
  whoCanJoin: CallAudience;
  waitingRoom: boolean;
};

type Picker = "date" | "time" | "duration" | "repeat" | "spark" | "audience" | null;

const DAYS_AHEAD = 60;
const DURATIONS = [15, 30, 45, 60, 90, 120];

function dateFor(day: number, minutes = 0) {
  const date = new Date();
  date.setDate(date.getDate() + day);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

// The next whole hour (tomorrow if that's past midnight).
function defaultSlot() {
  const hour = new Date().getHours() + 1;
  return hour >= 24 ? { day: 1, minutes: 9 * 60 } : { day: 0, minutes: hour * 60 };
}

function dayLabel(day: number) {
  const date = dateFor(day);
  if (day === 0) return `Today · ${formatLongDate(date)}`;
  if (day === 1) return `Tomorrow · ${formatLongDate(date)}`;
  return formatLongDate(date);
}

const DATE_CHOICES: Choice<number>[] = Array.from({ length: DAYS_AHEAD }, (_, day) => ({
  value: day,
  label: dayLabel(day),
}));

const TIME_CHOICES: Choice<number>[] = Array.from({ length: 96 }, (_, index) => ({
  value: index * 15,
  label: formatClock(dateFor(0, index * 15)),
}));

const DURATION_CHOICES: Choice<number>[] = DURATIONS.map((minutes) => ({
  value: minutes,
  label: formatDuration(minutes),
}));

const REPEAT_CHOICES: Choice<CallRepeat>[] = (Object.keys(REPEAT_LABELS) as CallRepeat[]).map((value) => ({
  value,
  label: REPEAT_LABELS[value],
}));

const AUDIENCE_LABELS: Record<CallAudience, string> = {
  invited: "Invited group members only",
  members: "Anyone in the group",
};

const AUDIENCE_CHOICES: Choice<CallAudience>[] = (Object.keys(AUDIENCE_LABELS) as CallAudience[]).map(
  (value) => ({ value, label: AUDIENCE_LABELS[value] }),
);

// A tappable "select" box: the value, with an icon on the right.
function SelectBox({ value, icon, onPress }: { value: string; icon: any; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable style={styles.select} onPress={onPress} accessibilityRole="button">
      <Text style={styles.selectText} numberOfLines={1}>
        {value}
      </Text>
      <Ionicons name={icon} size={18} color={ink.text(UI.MUTED)} />
    </Pressable>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <PinkSwitch value={value} onChange={onChange} />
    </View>
  );
}

export default function ScheduleCall() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const { id, callId: editParam } = useLocalSearchParams<{ id: string; callId?: string }>();
  // EDIT: opened from Call details' Edit (?callId=...).
  const editId = Array.isArray(editParam) ? editParam[0] : editParam;
  const editing = useAppSelector((state) => selectScheduledCall(state, editId));
  const conversationId = Array.isArray(id) ? id[0] : id;
  const token = useAppSelector((state) => state.auth.token);
  const dispatch = useAppDispatch();
  const chatTitle = useChatTitle(conversationId);
  const me = useMyPerson();

  const [form, setForm] = useState<Form>(() => ({
    topic: "",
    description: "",
    spark: null,
    ...defaultSlot(),
    durationMin: 30,
    repeat: "none",
    participants: [],
    hostVideo: true,
    participantVideo: false,
    whoCanJoin: "invited",
    waitingRoom: true,
  }));
  const [picker, setPicker] = useState<Picker>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [sparks, setSparks] = useState<{ id: string; subject: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const update = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  // EDIT: load the call if needed, then fill the form with it (once).
  useEffect(() => {
    if (editId && token && !editing) dispatch(fetchScheduledCall({ callId: editId, token }));
  }, [editId, token, editing, dispatch]);
  const prefilled = useRef(false);
  useEffect(() => {
    if (!editing || prefilled.current) return;
    prefilled.current = true;
    const at = new Date(editing.startsAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(at);
    day.setHours(0, 0, 0, 0);
    setForm({
      topic: editing.topic,
      description: editing.description || "",
      spark: editing.spark,
      day: Math.max(0, Math.round((day.getTime() - today.getTime()) / 86400000)),
      minutes: at.getHours() * 60 + at.getMinutes(),
      durationMin: editing.durationMin,
      repeat: editing.repeat,
      participants: editing.participants.map(({ status: _status, ...person }) => person),
      hostVideo: editing.hostVideo,
      participantVideo: editing.participantVideo,
      whoCanJoin: editing.whoCanJoin,
      waitingRoom: editing.waitingRoom,
    });
  }, [editing]);

  // The chat's Sparks, for "Linked Spark".
  useEffect(() => {
    if (!token || !conversationId) return;
    let stale = false;
    listSparks(conversationId, token)
      .then((result) => {
        if (!stale) setSparks(result.sparks.map((spark) => ({ id: spark.id, subject: spark.subject })));
      })
      .catch(() => {
        // No Sparks list: the call just can't be linked to one.
      });
    return () => {
      stale = true;
    };
  }, [token, conversationId]);

  const startsAt = useMemo(() => dateFor(form.day, form.minutes), [form.day, form.minutes]);

  const errors = {
    topic: form.topic.trim() ? "" : "Give the call a topic.",
    time: startsAt > new Date() ? "" : "Pick a time that hasn't passed yet.",
    participants:
      form.whoCanJoin === "invited" && !form.participants.length
        ? "Invite at least one member, or let anyone in the group join."
        : "",
  };
  const valid = !errors.topic && !errors.time && !errors.participants;

  const sparkChoices: Choice<LinkedSpark>[] = [
    { value: null, label: "No Spark" },
    ...sparks.map((spark) => ({ value: spark, label: spark.subject })),
  ];

  const submit = async () => {
    setTried(true);
    if (!valid || !token || saving) return;
    setSaving(true);
    try {
      // EDIT: send only what changed (time changes reset everyone's reply).
      if (editId && editing) {
        const changes: Partial<ScheduledCallInput> = {
          topic: form.topic.trim(),
          description: form.description.trim(),
          hostVideo: form.hostVideo,
          participantVideo: form.participantVideo,
          whoCanJoin: form.whoCanJoin,
          waitingRoom: form.waitingRoom,
        };
        if (Math.abs(new Date(editing.startsAt).getTime() - startsAt.getTime()) >= 60000) {
          changes.startsAt = startsAt.toISOString();
          changes.timeZone = deviceTimeZone();
        }
        if (form.durationMin !== editing.durationMin) changes.durationMin = form.durationMin;
        if (form.repeat !== editing.repeat) changes.repeat = form.repeat;
        if ((editing.spark?.id || null) !== (form.spark?.id || null)) changes.spark = form.spark;
        const ids = (people: { id: string }[]) => people.map((person) => person.id).sort().join(",");
        if (ids(editing.participants) !== ids(form.participants)) changes.participants = form.participants;
        const updated = await dispatch(updateScheduledCallThunk({ callId: editId, changes, token })).unwrap();
        await cancelCallReminder(updated.id);
        await scheduleCallReminder(updated);
        router.replace({ pathname: "/group/scheduled-call/[callId]", params: { callId: updated.id } });
        return;
      }
      const call = await dispatch(
        createScheduledCallThunk({
        conversationId,
        host: me,
        token,
        input: {
          topic: form.topic.trim(),
          description: form.description.trim(),
          spark: form.spark,
          startsAt: startsAt.toISOString(),
          durationMin: form.durationMin,
          timeZone: deviceTimeZone(),
          repeat: form.repeat,
          participants: form.participants,
          hostVideo: form.hostVideo,
          participantVideo: form.participantVideo,
          whoCanJoin: form.whoCanJoin,
          waitingRoom: form.waitingRoom,
        },
        }),
      ).unwrap();
      await scheduleCallReminder(call);
      router.replace({
        pathname: "/group/scheduled-call/[callId]",
        params: { callId: call.id, created: "1" },
      });
    } catch (error) {
      Alert.alert("Schedule a call", messageOf(error) || "Couldn't schedule the call.");
      setSaving(false);
    }
  };

  const back = () => safeBack({ pathname: "/chat/[id]", params: { id: conversationId } });

  return (
    <GroupScreen title={chatTitle || "Group"} onBack={back}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{editId ? "Edit call" : "Schedule a call"}</Text>
            <Pressable onPress={back} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>Bring your group together, wherever you are.</Text>

          {/* DETAILS */}
          <Card style={styles.card}>
            <FieldLabel>Topic</FieldLabel>
            <TextField
              value={form.topic}
              onChangeText={(topic) => update({ topic })}
              placeholder="What's the call about?"
              maxLength={80}
            />
            {tried && errors.topic ? <Text style={styles.error}>{errors.topic}</Text> : null}

            <FieldLabel>Description (optional)</FieldLabel>
            <TextField
              value={form.description}
              onChangeText={(description) => update({ description })}
              placeholder="Anything people should know or bring"
              multiline
              maxLength={300}
              style={styles.multiline}
            />

            <View style={styles.sparkRow}>
              <Text style={styles.smallLabel}>Linked Spark</Text>
              <Pressable onPress={() => setPicker("spark")} hitSlop={6}>
                {form.spark ? (
                  <SparkChip subject={form.spark.subject} />
                ) : (
                  <Text style={styles.link}>{sparks.length ? "Link a Spark" : "None"}</Text>
                )}
              </Pressable>
            </View>

            <FieldLabel>Date</FieldLabel>
            <SelectBox value={formatLongDate(startsAt)} icon="calendar-outline" onPress={() => setPicker("date")} />

            <View style={styles.pair}>
              <View style={styles.flex}>
                <FieldLabel>Start time</FieldLabel>
                <SelectBox value={formatClock(startsAt)} icon="time-outline" onPress={() => setPicker("time")} />
              </View>
              <View style={styles.flex}>
                <FieldLabel>Duration</FieldLabel>
                <SelectBox
                  value={formatDuration(form.durationMin)}
                  icon="chevron-down"
                  onPress={() => setPicker("duration")}
                />
              </View>
            </View>
            {tried && errors.time ? <Text style={styles.error}>{errors.time}</Text> : null}

            <FieldLabel>Time zone</FieldLabel>
            <View style={[styles.select, styles.readOnly]}>
              <Text style={styles.selectText} numberOfLines={1}>
                {timeZoneLabel(deviceTimeZone(), startsAt)}
              </Text>
            </View>
            <Text style={styles.hint}>Everyone sees the call in their own time zone.</Text>

            <FieldLabel>Repeat</FieldLabel>
            <SelectBox value={REPEAT_LABELS[form.repeat]} icon="chevron-down" onPress={() => setPicker("repeat")} />
          </Card>

          {/* PARTICIPANTS */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Participants</Text>
              <Pressable onPress={() => setShowMembers(true)} hitSlop={6}>
                <Text style={styles.link}>Add members</Text>
              </Pressable>
            </View>

            {form.participants.length ? (
              <View style={styles.people}>
                {form.participants.map((person) => (
                  <Pressable
                    key={person.id}
                    style={styles.person}
                    onPress={() =>
                      update({ participants: form.participants.filter((item) => item.id !== person.id) })
                    }
                    accessibilityLabel={`Remove ${personName(person)}`}>
                    <PersonAvatar person={person} size={40} />
                    <Text style={styles.personName} numberOfLines={1}>
                      {personName(person)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={styles.hint}>
              You{me.name ? ` (${me.name.split(" ")[0]})` : ""} are the host · {form.participants.length}{" "}
              {form.participants.length === 1 ? "member" : "members"} invited
              {form.participants.length ? " · tap someone to remove them" : ""}
            </Text>
            {tried && errors.participants ? <Text style={styles.error}>{errors.participants}</Text> : null}
          </Card>

          {/* VIDEO & MEETING ACCESS */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Video & meeting access</Text>
            <ToggleRow
              label="Host video"
              hint="Your camera starts on"
              value={form.hostVideo}
              onChange={(hostVideo) => update({ hostVideo })}
            />
            <ToggleRow
              label="Participant video"
              hint="Members can turn their cameras on"
              value={form.participantVideo}
              onChange={(participantVideo) => update({ participantVideo })}
            />
            <View style={styles.divider} />
            <FieldLabel>Who can join</FieldLabel>
            <SelectBox
              value={AUDIENCE_LABELS[form.whoCanJoin]}
              icon="chevron-down"
              onPress={() => setPicker("audience")}
            />
            <ToggleRow
              label="Waiting room"
              hint="Let participants in when you're ready"
              value={form.waitingRoom}
              onChange={(waitingRoom) => update({ waitingRoom })}
            />
            <View style={styles.passcodeRow}>
              <Ionicons name="lock-closed-outline" size={14} color={ink.text(UI.PINK)} />
              <Text style={styles.passcodeText}>A passcode is created and included in the invite</Text>
            </View>
          </Card>

          <PrimaryButton
            label={editId ? "Save changes" : "Schedule call"}
            onPress={submit}
            loading={saving}
            disabled={tried && !valid}
            style={styles.submit}
          />
          <Text style={styles.footer}>
            {form.participants.length
              ? `An invitation will be sent to ${form.participants.length === 1 ? "1 participant" : `all ${form.participants.length} participants`}.`
              : "The call will show in the group's Calls tab."}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <ChoiceSheet
        visible={picker === "date"}
        title="Date"
        choices={DATE_CHOICES}
        selected={form.day}
        onSelect={(day) => update({ day })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        visible={picker === "time"}
        title="Start time"
        choices={TIME_CHOICES}
        selected={form.minutes}
        onSelect={(minutes) => update({ minutes })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        visible={picker === "duration"}
        title="Duration"
        choices={DURATION_CHOICES}
        selected={form.durationMin}
        onSelect={(durationMin) => update({ durationMin })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        visible={picker === "repeat"}
        title="Repeat"
        choices={REPEAT_CHOICES}
        selected={form.repeat}
        onSelect={(repeat) => update({ repeat })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        visible={picker === "audience"}
        title="Who can join"
        choices={AUDIENCE_CHOICES}
        selected={form.whoCanJoin}
        onSelect={(whoCanJoin) => update({ whoCanJoin })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        visible={picker === "spark"}
        title="Linked Spark"
        choices={sparkChoices}
        selected={form.spark}
        isSame={(a, b) => (a?.id || null) === (b?.id || null)}
        onSelect={(spark) => update({ spark })}
        onClose={() => setPicker(null)}
      />
      {showMembers ? (
        <MembersSheet
          visible
          groupId={conversationId}
          myId={me.id}
          selected={form.participants}
          onDone={(participants) => update({ participants })}
          onClose={() => setShowMembers(false)}
        />
      ) : null}
    </GroupScreen>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 4 },
    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontFamily: FONTS.bold, fontSize: 24, lineHeight: 30, color: UI.INK },
    cancel: { fontFamily: FONTS.semibold, fontSize: 14, color: UI.PINK },
    subtitle: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 14, color: UI.MUTED },
    card: { marginTop: 16, padding: 16 },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: UI.INK },
    multiline: { minHeight: 72, paddingTop: 12, textAlignVertical: "top" } as any,
    sparkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
    smallLabel: { fontFamily: FONTS.regular, fontSize: 13, color: UI.MUTED },
    link: { fontFamily: FONTS.semibold, fontSize: 13, color: UI.PINK },
    pair: { flexDirection: "row", gap: 10 },
    select: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(102,115,138,0.3)",
    },
    readOnly: { backgroundColor: "rgba(240,237,249,0.6)" },
    selectText: { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: UI.INK },
    hint: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: UI.MUTED },
    error: { marginTop: 6, fontFamily: FONTS.medium, fontSize: 12, color: "#D93A57" },
    people: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 14 },
    person: { width: 64, alignItems: "center", gap: 6 },
    personName: { maxWidth: 64, fontFamily: FONTS.regular, fontSize: 12, color: UI.INK },
    toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
    toggleLabel: { fontFamily: FONTS.medium, fontSize: 14, color: UI.INK },
    toggleHint: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
    divider: { height: 1, marginTop: 16, backgroundColor: UI.BORDER },
    passcodeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
    passcodeText: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
    submit: { marginTop: 22 },
    footer: {
      marginTop: 10,
      textAlign: "center",
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: UI.MUTED,
    },
  },
  {
    title: { color: "#F4F5FA" },
    cancel: { color: "#F0A6D7" },
    subtitle: { color: "#B5BBCB" },
    cardTitle: { color: "#F4F5FA" },
    smallLabel: { color: "#B5BBCB" },
    link: { color: "#F0A6D7" },
    select: { backgroundColor: "#252837", borderColor: "rgba(255,255,255,0.18)" },
    readOnly: { backgroundColor: "#2B2E40" },
    selectText: { color: "#F4F5FA" },
    hint: { color: "#B5BBCB" },
    personName: { color: "#F4F5FA" },
    toggleLabel: { color: "#F4F5FA" },
    toggleHint: { color: "#B5BBCB" },
    divider: { backgroundColor: "rgba(255,255,255,0.12)" },
    passcodeText: { color: "#B5BBCB" },
    footer: { color: "#B5BBCB" },
  },
);
