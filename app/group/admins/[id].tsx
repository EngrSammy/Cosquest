// ==========================================
// ADMINISTRATORS (Figma M28 · Promote administrator)
// ==========================================
// Current administrators, then choose a member and confirm "Make Diego an
// admin?" - "Faction rank stays the same: this changes chat powers only."
// Admins can promote members; only the owner can remove an admin.
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, TextInput } from "react-native";

import {
  A,
  AdminScreen,
  Card,
  Chip,
  ConfirmCard,
  Note,
  PersonRow,
  Section,
  firstName,
} from "@/components/groups/AdminUi";
import { FONTS } from "@/constants/fonts";
import { getGroup, getGroupMembers, setMemberRole, type Group, type GroupMember } from "@/services/groups";
import { useAppSelector } from "@/store/hooks";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

export default function Administrators() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const token = useAppSelector((state) => state.auth.token);

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<GroupMember | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const [info, list] = await Promise.all([getGroup(groupId, token), getGroupMembers(groupId, {}, token)]);
      setGroup(info.group);
      setMembers(list.members);
    } catch (error) {
      Alert.alert("Administrators", error instanceof Error ? error.message : "Couldn't load the group.");
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const admins = members.filter((member) => member.role === "owner" || member.role === "admin");
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(
      (member) =>
        member.role === "member" &&
        (!q || `${member.name || ""} ${member.username}`.toLowerCase().includes(q)),
    );
  }, [members, search]);

  const isOwner = group?.myRole === "owner";
  const promoting = selected?.role === "member";

  const confirm = async () => {
    if (!token || !groupId || !selected) return;
    try {
      setBusy(true);
      await setMemberRole(groupId, selected.id, promoting ? "admin" : "member", token);
      setSelected(null);
      await load();
    } catch (error) {
      Alert.alert("Administrators", error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const pick = (member: GroupMember) => {
    if (member.role === "owner") return;
    if (member.role === "admin" && !isOwner) {
      Alert.alert("Administrators", "Only the owner can remove an admin.");
      return;
    }
    setSelected(member);
  };

  return (
    <AdminScreen title="Administrators" subtitle={group?.name} loading={loading}>
      <Chip>
        {isOwner ? "Owner view" : "Admin view"} · {admins.length} {admins.length === 1 ? "administrator" : "administrators"}
      </Chip>

      <Section>CURRENT ADMINISTRATORS</Section>
      <Card>
        {admins.map((member, index) => (
          <PersonRow
            key={member.id}
            person={member}
            onPress={member.role === "admin" && isOwner ? () => pick(member) : undefined}
            selected={selected?.id === member.id}
            last={index === admins.length - 1}
          />
        ))}
      </Card>

      <Section>{selected ? "SELECTED MEMBER" : "CHOOSE A MEMBER TO PROMOTE"}</Section>
      {selected ? (
        <Card>
          <PersonRow
            person={selected}
            onPress={() => setSelected(null)}
            detail={`${firstName(selected)} is ${selected.rank ? `a ${selected.rank.name} and ` : ""}${
              selected.role === "admin" ? "an admin" : "a regular chat member"
            }.`}
            last
          />
        </Card>
      ) : (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find a member"
            placeholderTextColor={ink.text("#9AA3B5")}
            autoCapitalize="none"
            style={styles.search}
          />
          <Card>
            {candidates.slice(0, 30).map((member, index) => (
              <PersonRow
                key={member.id}
                person={member}
                onPress={() => pick(member)}
                last={index === Math.min(candidates.length, 30) - 1}
              />
            ))}
          </Card>
          {!candidates.length ? <Note>No members to promote.</Note> : null}
        </>
      )}

      {selected ? (
        promoting ? (
          <ConfirmCard
            title={`Make ${firstName(selected)} an admin?`}
            text="They'll be able to manage people, join requests, group details, messages, slow mode and Sparks in this group."
            extraTitle="Faction rank stays the same"
            extraText={`${firstName(selected)} remains ${selected.rank ? `a ${selected.rank.name}` : "the same rank"}. This changes chat powers only.`}
            confirmLabel="Confirm · promote to admin"
            onConfirm={confirm}
            onCancel={() => setSelected(null)}
            busy={busy}
          />
        ) : (
          <ConfirmCard
            title={`Remove ${firstName(selected)} as admin?`}
            text="They'll stay in the group as a regular member, without admin powers."
            extraTitle="Faction rank stays the same"
            extraText="This changes chat powers only."
            confirmLabel="Confirm · remove admin"
            onConfirm={confirm}
            onCancel={() => setSelected(null)}
            busy={busy}
            danger
          />
        )
      ) : null}
    </AdminScreen>
  );
}

const STYLE_PAIR = themedStyles({
  search: {
    height: 48,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: A.ink,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
});
