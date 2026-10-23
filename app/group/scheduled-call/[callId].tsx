// ==========================================
// CALL DETAILS (Figma · Calls · Call details)
// ==========================================
// When and what, the invitation (link, call ID, passcode; share or copy),
// who's coming, and the meeting settings. Hosts can cancel; invited
// members accept or decline. Opened from the Calls tab, and right after
// scheduling ("Call scheduled · Invitations sent").
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PersonAvatar,
  personName,
  useChatTitle,
  useMyPerson,
} from "@/components/calls/scheduled/ChoiceSheet";
import { SparkChip } from "@/components/calls/scheduled/ScheduledCallCard";
import { Card, PrimaryButton, SecondaryButton, UI } from "@/components/chat/ui";
import { GroupScreen } from "@/components/groups/GroupUi";
import { useJoinVoice } from "@/components/voice/voiceUi";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import {
  callEnd,
  cancelScheduledCall,
  formatDuration,
  formatLongDate,
  formatTimeRange,
  getScheduledCall,
  isLiveCall,
  isPastCall,
  REPEAT_LABELS,
  respondToScheduledCall,
  timeZoneLabel,
  type RsvpStatus,
  type ScheduledCall,
} from "@/services/scheduledCalls";
import { useAppSelector } from "@/store/hooks";
import { cancelCallReminder, scheduleCallReminder } from "@/utils/callReminders";
import { safeBack } from "@/utils/safeBack";

const STATUS_LABELS: Record<RsvpStatus, string> = {
  accepted: "Accepted",
  pending: "Awaiting reply",
  declined: "Declined",
};

function inviteText(call: ScheduledCall) {
  const start = new Date(call.startsAt);
  return [
    `You're invited: ${call.topic}`,
    `${formatLongDate(start)}, ${formatTimeRange(call)} (${timeZoneLabel(undefined, start)})`,
    `Join: ${call.inviteUrl}`,
    `Call ID: ${call.meetingCode} · Passcode: ${call.passcode}`,
  ].join("\n");
}

// "20261009T010000Z"
const calendarStamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Google Calendar's "add event" page: works from phones and the website.
function calendarUrl(call: ScheduledCall) {
  const params = [
    "action=TEMPLATE",
    `text=${encodeURIComponent(call.topic)}`,
    `dates=${calendarStamp(new Date(call.startsAt))}/${calendarStamp(callEnd(call))}`,
    `details=${encodeURIComponent(`${call.description ? `${call.description}\n\n` : ""}${inviteText(call)}`)}`,
  ];
  if (call.repeat !== "none") params.push(`recur=RRULE:FREQ=${call.repeat.toUpperCase()}`);
  return `https://calendar.google.com/calendar/render?${params.join("&")}`;
}

export default function ScheduledCallDetails() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ callId: string; created?: string }>();
  const callId = Array.isArray(params.callId) ? params.callId[0] : params.callId;
  const justCreated = params.created === "1";
  const token = useAppSelector((state) => state.auth.token);
  const me = useMyPerson();

  const [call, setCall] = useState<ScheduledCall | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"cancel" | "accepted" | "declined" | null>(null);
  const [copied, setCopied] = useState(false);

  const chatTitle = useChatTitle(call?.conversationId || "");
  const { join, joining } = useJoinVoice(call?.conversationId || "", chatTitle || "Voice chat");

  useEffect(() => {
    if (!token || !callId) return;
    let stale = false;
    getScheduledCall(callId, token)
      .then((result) => {
        if (!stale) setCall(result);
      })
      .catch((err) => {
        if (!stale) setError(err instanceof Error ? err.message : "Couldn't load this call.");
      });
    return () => {
      stale = true;
    };
  }, [token, callId]);

  const back = useCallback(() => {
    if (call) safeBack({ pathname: "/chat/[id]", params: { id: call.conversationId } });
    else safeBack();
  }, [call]);

  if (!call) {
    return (
      <GroupScreen title="Call details" onBack={back}>
        {error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : (
          <ActivityIndicator color={UI.PINK} style={styles.center} />
        )}
      </GroupScreen>
    );
  }

  const start = new Date(call.startsAt);
  const hosting = call.host.id === me.id;
  const cancelled = call.status === "cancelled";
  const live = isLiveCall(call);
  const over = isPastCall(call);
  const mine = call.participants.find((person) => person.id === me.id);
  const people = [{ ...call.host, status: "host" as const }, ...call.participants];

  const settings = [
    call.whoCanJoin === "invited" ? "Invited members only" : "Anyone in the group",
    `Waiting room ${call.waitingRoom ? "on" : "off"}`,
    `Host video ${call.hostVideo ? "on" : "off"}`,
    `Participant video ${call.participantVideo ? "on" : "off"}`,
  ].join(" · ");

  const copyInvite = async () => {
    await Clipboard.setStringAsync(inviteText(call));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    try {
      if (Platform.OS === "web" && !(navigator as any)?.share) {
        await copyInvite();
        return;
      }
      await Share.share({ message: inviteText(call), title: call.topic });
    } catch {
      // Closed the share sheet.
    }
  };

  const respond = async (status: "accepted" | "declined") => {
    if (!token) return;
    setBusy(status);
    try {
      const updated = await respondToScheduledCall(call.id, status, me, token);
      setCall(updated);
      if (status === "accepted") await scheduleCallReminder(updated);
      else await cancelCallReminder(updated.id);
    } catch (err) {
      Alert.alert("Call", err instanceof Error ? err.message : "Couldn't send your reply.");
    } finally {
      setBusy(null);
    }
  };

  const cancelCall = () => {
    Alert.alert("Cancel this call?", "Everyone invited will be told it's cancelled.", [
      { text: "Keep call", style: "cancel" },
      {
        text: "Cancel call",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          setBusy("cancel");
          try {
            const updated = await cancelScheduledCall(call.id, token);
            await cancelCallReminder(updated.id);
            setCall(updated);
          } catch (err) {
            Alert.alert("Call", err instanceof Error ? err.message : "Couldn't cancel the call.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <GroupScreen title={chatTitle || "Group"} onBack={back}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Call details</Text>

        {cancelled ? (
          <View style={[styles.banner, styles.bannerMuted]}>
            <Ionicons name="close-circle-outline" size={18} color={ink.text(UI.MUTED)} />
            <Text style={[styles.bannerText, styles.bannerTextMuted]}>This call was cancelled</Text>
          </View>
        ) : justCreated ? (
          <View style={styles.banner}>
            <Ionicons name="checkmark-circle-outline" size={18} color={ink.text(UI.PINK)} />
            <Text style={styles.bannerText}>
              Call scheduled{call.participants.length ? " · Invitations sent" : ""}
            </Text>
          </View>
        ) : null}

        {/* WHAT AND WHEN */}
        <Card style={styles.card}>
          {call.spark ? <SparkChip subject={call.spark.subject} /> : null}
          <Text style={[styles.topic, cancelled && styles.struck]}>{call.topic}</Text>
          {call.description ? <Text style={styles.description}>{call.description}</Text> : null}
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={ink.text(UI.PINK)} />
            <View style={styles.flex}>
              <Text style={styles.infoMain}>{formatLongDate(start)}</Text>
              <Text style={styles.infoSub}>
                {formatTimeRange(call)} · {timeZoneLabel(undefined, start)}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="repeat-outline" size={18} color={ink.text(UI.PINK)} />
            <Text style={[styles.infoMain, styles.flex]}>
              {call.repeat === "none" ? "One-time call" : REPEAT_LABELS[call.repeat]} ·{" "}
              {formatDuration(call.durationMin)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <PersonAvatar person={call.host} size={22} />
            <Text style={[styles.infoSub, styles.flex]}>
              {hosting ? `Hosted by you${me.name ? ` · ${me.name.split(" ")[0]}` : ""}` : `Hosted by ${personName(call.host)}`}
            </Text>
          </View>
        </Card>

        {live && !cancelled ? (
          <PrimaryButton label="Join call" onPress={join} loading={joining} />
        ) : null}

        {/* RSVP (invited members) */}
        {!hosting && mine && !cancelled && !over ? (
          <View style={styles.rsvpRow}>
            <Pressable
              style={[styles.rsvpButton, mine.status === "accepted" && styles.rsvpOn]}
              onPress={() => respond("accepted")}
              disabled={!!busy}>
              {busy === "accepted" ? (
                <ActivityIndicator size="small" color={UI.PINK} />
              ) : (
                <Text style={[styles.rsvpText, mine.status === "accepted" && styles.rsvpTextOn]}>
                  {mine.status === "accepted" ? "Going" : "Accept"}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.rsvpButton, mine.status === "declined" && styles.rsvpOn]}
              onPress={() => respond("declined")}
              disabled={!!busy}>
              {busy === "declined" ? (
                <ActivityIndicator size="small" color={UI.PINK} />
              ) : (
                <Text style={[styles.rsvpText, mine.status === "declined" && styles.rsvpTextOn]}>
                  {mine.status === "declined" ? "Not going" : "Decline"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {/* INVITATION */}
        {!cancelled ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Invitation</Text>
            <Pressable style={styles.linkBox} onPress={copyInvite} accessibilityLabel="Copy invitation">
              <Ionicons name="link-outline" size={16} color={ink.text(UI.PINK)} />
              <Text style={styles.linkText} numberOfLines={1}>
                {call.inviteUrl.replace(/^https?:\/\//, "")}
              </Text>
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={ink.text(UI.MUTED)} />
            </Pressable>
            <Text style={styles.codes}>
              Call ID: {call.meetingCode} · Passcode: {call.passcode}
            </Text>
            <View style={styles.inviteButtons}>
              <Pressable style={[styles.inviteButton, styles.shareButton]} onPress={share}>
                <Ionicons name="share-social-outline" size={17} color="#FFFFFF" />
                <Text style={styles.shareText}>Share invitation</Text>
              </Pressable>
              <Pressable style={[styles.inviteButton, styles.copyButton]} onPress={copyInvite}>
                <Text style={styles.copyText}>{copied ? "Copied" : "Copy invite"}</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {/* PARTICIPANTS */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Participants · {people.length}</Text>
          {people.map((person) => (
            <View key={person.id} style={styles.personRow}>
              <PersonAvatar person={person} size={30} />
              <Text style={[styles.personName, styles.flex]} numberOfLines={1}>
                {person.id === me.id ? "You" : personName(person)}
              </Text>
              <Text
                style={[
                  styles.status,
                  person.status === "accepted" && styles.statusAccepted,
                  person.status === "declined" && styles.statusDeclined,
                ]}>
                {person.status === "host" ? "Host" : STATUS_LABELS[person.status]}
              </Text>
            </View>
          ))}
        </Card>

        <View style={styles.settingsRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={ink.text(UI.MUTED)} />
          <Text style={styles.settingsText}>{settings}</Text>
        </View>

        {!cancelled && !over ? (
          <SecondaryButton label="Add to calendar" onPress={() => Linking.openURL(calendarUrl(call))} />
        ) : null}

        {hosting && !cancelled && !over ? (
          <Pressable style={styles.cancelCall} onPress={cancelCall} disabled={!!busy}>
            {busy === "cancel" ? (
              <ActivityIndicator size="small" color={UI.MUTED} />
            ) : (
              <Text style={styles.cancelText}>Cancel this call</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </GroupScreen>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1 },
    center: { paddingVertical: 40 },
    empty: {
      marginTop: 40,
      textAlign: "center",
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: UI.MUTED,
    },
    content: { paddingHorizontal: 16, paddingTop: 4 },
    title: { fontFamily: FONTS.bold, fontSize: 24, lineHeight: 30, color: UI.INK },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor: "#F7DDEE",
    },
    bannerMuted: { backgroundColor: "rgba(240,237,249,0.9)" },
    bannerText: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: UI.PINK },
    bannerTextMuted: { color: UI.MUTED },
    card: { marginTop: 16, padding: 16 },
    cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: UI.INK },
    topic: { marginTop: 10, fontFamily: FONTS.bold, fontSize: 20, lineHeight: 26, color: UI.INK },
    struck: { textDecorationLine: "line-through", color: UI.MUTED },
    description: {
      marginTop: 8,
      fontFamily: FONTS.regular,
      fontSize: 13,
      lineHeight: 19,
      color: UI.MUTED,
    },
    divider: { height: 1, marginVertical: 12, backgroundColor: UI.BORDER },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
    infoMain: { fontFamily: FONTS.medium, fontSize: 14, color: UI.INK },
    infoSub: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
    rsvpRow: { flexDirection: "row", gap: 10, marginTop: 16 },
    rsvpButton: {
      flex: 1,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: UI.BORDER,
      backgroundColor: "#FFFFFF",
    },
    rsvpOn: { borderColor: UI.PINK, backgroundColor: "#F7DDEE" },
    rsvpText: { fontFamily: FONTS.semibold, fontSize: 14, color: UI.INK },
    rsvpTextOn: { color: UI.PINK },
    linkBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: 12,
      backgroundColor: "rgba(240,237,249,0.7)",
    },
    linkText: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: UI.INK },
    codes: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
    inviteButtons: { flexDirection: "row", gap: 10, marginTop: 14 },
    inviteButton: {
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 23,
    },
    shareButton: { flex: 1.5, backgroundColor: UI.PINK },
    shareText: { fontFamily: FONTS.semibold, fontSize: 14, color: "#FFFFFF" },
    copyButton: { flex: 1, backgroundColor: "#F7DDEE" },
    copyText: { fontFamily: FONTS.semibold, fontSize: 14, color: UI.PINK },
    personRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
    personName: { fontFamily: FONTS.regular, fontSize: 14, color: UI.INK },
    status: { fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
    statusAccepted: { color: "#1F8A70" },
    statusDeclined: { color: "#D93A57" },
    settingsRow: { flexDirection: "row", gap: 8, marginTop: 16, paddingHorizontal: 4 },
    settingsText: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: UI.MUTED },
    cancelCall: { alignSelf: "center", marginTop: 16, padding: 8 },
    cancelText: { fontFamily: FONTS.medium, fontSize: 14, color: UI.MUTED },
  },
  {
    title: { color: "#F4F5FA" },
    banner: { backgroundColor: "#3A2740" },
    bannerMuted: { backgroundColor: "#2B2E40" },
    bannerText: { color: "#F0A6D7" },
    bannerTextMuted: { color: "#B5BBCB" },
    cardTitle: { color: "#F4F5FA" },
    topic: { color: "#F4F5FA" },
    description: { color: "#B5BBCB" },
    divider: { backgroundColor: "rgba(255,255,255,0.12)" },
    infoMain: { color: "#F4F5FA" },
    infoSub: { color: "#B5BBCB" },
    rsvpButton: { backgroundColor: "#252837", borderColor: "rgba(255,255,255,0.18)" },
    rsvpOn: { backgroundColor: "#3A2740", borderColor: UI.PINK },
    rsvpText: { color: "#F4F5FA" },
    rsvpTextOn: { color: "#F0A6D7" },
    linkBox: { backgroundColor: "#2B2E40" },
    linkText: { color: "#F4F5FA" },
    codes: { color: "#B5BBCB" },
    copyButton: { backgroundColor: "#3A2740" },
    copyText: { color: "#F0A6D7" },
    personName: { color: "#F4F5FA" },
    status: { color: "#B5BBCB" },
    settingsText: { color: "#B5BBCB" },
    cancelText: { color: "#B5BBCB" },
  },
);
