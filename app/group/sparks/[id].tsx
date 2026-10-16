// ==========================================
// MANAGE SPARKS (Figma M31 · Proposed Sparks admin panel)
// ==========================================
// "Concept - requirements pending" (Mark Jones to specify the full panel).
// The approved admin powers work today: pin (keep visible through quiet
// periods), delete, and merge two selected Sparks - "No automatic merge.
// This requires your confirmation." Any member can start a Spark; only
// admins pin, delete or merge them - everyone else just sees a short note.
// Pin, delete and merge each ask before acting.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  A,
  AdminScreen,
  Card,
  ConceptBanner,
  ConfirmCard,
  Note,
  Section,
} from "@/components/groups/AdminUi";
import { FONTS } from "@/constants/fonts";
import { getGroup, type Group } from "@/services/groups";
import { deleteSpark, listSparks, mergeSpark, pinSpark, type Spark } from "@/services/sparks";
import { useAppSelector } from "@/store/hooks";

function stateLabel(spark: Spark) {
  if (spark.active) return `Active · ${spark.participantCount} ${spark.participantCount === 1 ? "person" : "people"}`;
  return `Quiet · ${spark.messageCount} ${spark.messageCount === 1 ? "message" : "messages"}${spark.revived ? " · revived" : ""}`;
}

export default function ManageSparks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const token = useAppSelector((state) => state.auth.token);

  const [group, setGroup] = useState<Group | null>(null);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const [info, list] = await Promise.all([getGroup(groupId, token), listSparks(groupId, token)]);
      setGroup(info.group);
      setSparks(list.sparks);
      setCanManage(list.canManage);
    } catch (error) {
      Alert.alert("Manage Sparks", error instanceof Error ? error.message : "Couldn't load Sparks.");
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePin = (spark: Spark) => {
    if (!token || !groupId) return;
    const pinning = !spark.pinned;
    Alert.alert(
      pinning ? `Pin the "${spark.subject}" Spark?` : `Unpin the "${spark.subject}" Spark?`,
      pinning ? "It stays visible to everyone through quiet periods." : "It can fade out again when it goes quiet.",
      [
        { text: "Cancel", style: "cancel" },
        { text: pinning ? "Pin Spark" : "Unpin Spark", onPress: () => applyPin(spark) },
      ],
    );
  };

  const applyPin = async (spark: Spark) => {
    if (!token || !groupId) return;
    try {
      setBusy(`pin-${spark.id}`);
      const updated = await pinSpark(groupId, spark.id, !spark.pinned, token);
      setSparks((current) => current.map((item) => (item.id === spark.id ? updated : item)));
    } catch (error) {
      Alert.alert("Pin Spark", error instanceof Error ? error.message : "Couldn't change the pin.");
    } finally {
      setBusy(null);
    }
  };

  const remove = (spark: Spark) => {
    if (!token || !groupId) return;
    Alert.alert(`Delete the "${spark.subject}" Spark?`, "This is an admin-only action. Its messages stay in the main chat.", [
      { text: "Keep Spark", style: "cancel" },
      {
        text: "Delete Spark",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSpark(groupId, spark.id, token);
            setSparks((current) => current.filter((item) => item.id !== spark.id));
            setPicked((current) => current.filter((item) => item !== spark.id));
          } catch (error) {
            Alert.alert("Delete Spark", error instanceof Error ? error.message : "Couldn't delete it.");
          }
        },
      },
    ]);
  };

  const togglePick = (spark: Spark) => {
    setPicked((current) =>
      current.includes(spark.id)
        ? current.filter((item) => item !== spark.id)
        : current.length >= 2
          ? [current[1], spark.id]
          : [...current, spark.id],
    );
  };

  // The first one ticked is kept; the second is merged into it.
  const into = sparks.find((spark) => spark.id === picked[0]);
  const from = sparks.find((spark) => spark.id === picked[1]);

  const merge = async () => {
    if (!token || !groupId || !into || !from) return;
    try {
      setBusy("merge");
      await mergeSpark(groupId, from.id, into.id, token);
      setPicked([]);
      await load();
    } catch (error) {
      Alert.alert("Merge Sparks", error instanceof Error ? error.message : "Couldn't merge.");
    } finally {
      setBusy(null);
    }
  };

  // Keep the other one instead.
  const swap = () => setPicked((current) => (current.length === 2 ? [current[1], current[0]] : current));

  if (!loading && !canManage) {
    return (
      <AdminScreen title="Manage Sparks" subtitle={group ? `${group.name} · Admin only` : "Admin only"}>
        <ConceptBanner title="Concept — requirements pending" text="Panel requirements to be specified by Mark Jones." />
        <Note>Only group admins can pin, delete or merge Sparks.</Note>
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Manage Sparks" subtitle={group ? `${group.name} · Admin only` : "Admin only"} loading={loading}>
      <ConceptBanner title="Concept — requirements pending" text="Panel requirements to be specified by Mark Jones." />

      {sparks.length === 0 ? <Note>No Sparks in this group yet.</Note> : null}

      {/* APPROVED ADMIN POWERS */}
      {sparks.length > 0 ? <Section>APPROVED ADMIN POWERS</Section> : null}
      {sparks.map((spark) => (
        <View key={spark.id} style={styles.sparkCard}>
          <Text style={styles.sparkTitle}>{spark.subject}</Text>
          <Text style={styles.sparkState}>{stateLabel(spark)}</Text>

          <Pressable
            style={styles.actionRow}
            disabled={busy === `pin-${spark.id}`}
            onPress={() => togglePin(spark)}>
            <View style={styles.flex}>
              <Text style={styles.actionTitle}>{spark.pinned ? "Unpin Spark" : "Pin Spark"}</Text>
              <Text style={styles.actionHint}>Keep visible through quiet periods</Text>
            </View>
            <Ionicons name={spark.pinned ? "pin" : "pin-outline"} size={22} color={spark.pinned ? A.pink : A.muted} />
          </Pressable>

          <Pressable style={[styles.actionRow, styles.actionLast]} onPress={() => remove(spark)}>
            <Text style={[styles.actionTitle, styles.danger, styles.flex]}>Delete Spark</Text>
            <Ionicons name="trash-outline" size={22} color={A.pink} />
          </Pressable>
        </View>
      ))}

      {/* MERGE SELECTION */}
      {sparks.length > 1 ? (
        <>
          <Section>MERGE SELECTION · PROPOSED PANEL</Section>
          <Card padded>
            <Text style={styles.pickedCount}>{picked.length} Sparks selected</Text>
            {sparks.map((spark) => {
              const on = picked.includes(spark.id);
              // With two ticked: the first is kept, the second merges into it.
              const tag = picked.length === 2 ? (spark.id === picked[0] ? "Kept" : spark.id === picked[1] ? "Merges in" : null) : null;
              return (
                <Pressable key={spark.id} style={styles.pickRow} onPress={() => togglePick(spark)}>
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.pickTitle}>{spark.subject}</Text>
                    <Text style={styles.actionHint}>{stateLabel(spark)}</Text>
                  </View>
                  {tag ? <Text style={[styles.tag, tag === "Kept" && styles.tagKept]}>{tag}</Text> : null}
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}

      {into && from ? (
        <ConfirmCard
          title={`Merge into ${into.subject}?`}
          text={`Combine the ${into.subject} and ${from.subject} conversation histories in this group.`}
          extraText="No automatic merge. This requires your confirmation."
          confirmLabel="Confirm merge"
          onConfirm={merge}
          onCancel={() => setPicked([])}
          busy={busy === "merge"}>
          <Text style={styles.keptNote}>
            {into.subject} is kept; {from.subject} merges into it.{" "}
            <Text style={styles.swap} onPress={swap}>
              Keep {from.subject} instead
            </Text>
          </Text>
        </ConfirmCard>
      ) : null}

      <Note>Any member can start a Spark. Only admins can pin, delete or merge them.</Note>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },

  sparkCard: {
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: A.line,
  },

  sparkTitle: { fontFamily: FONTS.semibold, fontSize: 18, color: A.ink },

  sparkState: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: A.muted },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: A.line,
  },

  actionLast: { borderBottomWidth: 0 },

  actionTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: A.ink },

  actionHint: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: A.muted },

  danger: { color: A.pink },

  tag: { fontFamily: FONTS.semibold, fontSize: 11, color: A.muted },

  tagKept: { color: A.pink },

  keptNote: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: A.muted },

  swap: { fontFamily: FONTS.semibold, color: A.pink },

  pickedCount: { fontFamily: FONTS.regular, fontSize: 12.5, color: A.muted, marginBottom: 4 },

  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },

  pickTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: A.ink },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#C9CFDB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  checkboxOn: { backgroundColor: A.pink, borderColor: A.pink },
});
