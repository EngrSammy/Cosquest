// ==========================================
// JOIN REQUESTS (Figma M29 · Join request moderation)
// ==========================================
// "Admin only · 2 pending requests". Each request: name, when, how they
// asked (invite link / asked to join), their introduction, Approve / Deny.
// Approve opens "Approve Ana Torres?" with "24 members -> 25 members".
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import {
  A,
  AdminScreen,
  Chip,
  ConfirmCard,
  Note,
  PrimaryButton,
  SoftButton,
  adminStyles,
} from "@/components/groups/AdminUi";
import { FONTS } from "@/constants/fonts";
import { answerJoinRequest, getGroup, getJoinRequests, type Group, type JoinRequest } from "@/services/groups";
import { useAppSelector } from "@/store/hooks";

function whenLabel(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString([], { month: "long", day: "numeric" })} · ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function JoinRequests() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const token = useAppSelector((state) => state.auth.token);

  const [group, setGroup] = useState<Group | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JoinRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const [info, list] = await Promise.all([getGroup(groupId, token), getJoinRequests(groupId, token)]);
      setGroup(info.group);
      setRequests(list);
    } catch (error) {
      Alert.alert("Join requests", error instanceof Error ? error.message : "Couldn't load requests.");
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const answer = async (request: JoinRequest, approve: boolean) => {
    if (!token || !groupId) return;
    try {
      setBusy(request.id);
      await answerJoinRequest(groupId, request.id, approve, token);
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setSelected(null);
      if (approve && group) setGroup({ ...group, memberCount: group.memberCount + 1 });
    } catch (error) {
      Alert.alert("Join requests", error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  const deny = (request: JoinRequest) => {
    const name = request.user.name || request.user.username;
    Alert.alert(`Deny ${name}?`, "Their request will be declined.", [
      { text: "Keep pending", style: "cancel" },
      { text: "Deny", style: "destructive", onPress: () => answer(request, false) },
    ]);
  };

  return (
    <AdminScreen title="Join requests" subtitle={group?.name} loading={loading}>
      <Chip>
        Admin only · {requests.length} pending {requests.length === 1 ? "request" : "requests"}
      </Chip>

      {requests.length === 0 ? <Note>No one is waiting right now.</Note> : null}

      {requests.map((request) => {
        const name = request.user.name || request.user.username;
        const isSelected = selected?.id === request.id;
        const note = (request as any).message as string | undefined;

        return (
          <View key={request.id} style={styles.card}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.meta}>
              {whenLabel(request.createdAt)} · {request.via === "link" ? "group invitation link" : "asked to join"}
            </Text>
            {note ? <Text style={styles.intro}>“{note}”</Text> : <Text style={styles.noIntro}>@{request.user.username}</Text>}

            <View style={adminStyles.twoButtons}>
              {isSelected ? (
                <View style={styles.flex}>
                  <View style={styles.denyWrap}>
                    <SoftButton label="Approval selected" onPress={() => setSelected(null)} />
                  </View>
                </View>
              ) : (
                <View style={styles.flex}>
                  <PrimaryButton label="Approve" onPress={() => setSelected(request)} disabled={!!busy} />
                </View>
              )}
              <View style={styles.flex}>
                <View style={styles.denyWrap}>
                  <SoftButton label="Deny" onPress={() => deny(request)} disabled={!!busy} />
                </View>
              </View>
            </View>
          </View>
        );
      })}

      {selected ? (
        <ConfirmCard
          title={`Approve ${selected.user.name || selected.user.username}?`}
          text={`Add ${(selected.user.name || selected.user.username).split(" ")[0]} to ${
            group?.name || "the group"
          } as a member and notify them that their request is approved.`}
          extraText={group ? `${group.memberCount} members → ${group.memberCount + 1} members` : undefined}
          confirmLabel="Confirm approval"
          onConfirm={() => answer(selected, true)}
          cancelLabel="Keep pending"
          onCancel={() => setSelected(null)}
          busy={busy === selected.id}
        />
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: A.line,
  },

  name: { fontFamily: FONTS.semibold, fontSize: 17, color: A.ink },

  meta: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 12, color: A.muted },

  intro: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: A.ink },

  noIntro: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 13, color: A.muted },

  // Line the Deny button up with the 52-tall Approve button.
  denyWrap: { marginTop: 14 },
});
