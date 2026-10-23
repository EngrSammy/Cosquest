// ==========================================
// JOINING & PRIVACY (from Group settings, M27 "Joining & privacy ›")
// ==========================================
// Admins choose how people join (instantly or with admin approval), the
// group size limit, who sees the member list and who can add people. The
// same choices as step 4 of Create a group (M23), saved with updateGroup.
// Faction groups: everyone in the faction is in automatically, so the
// joining choice is replaced by a note. Light and dark via AdminUi.
import { useLocalSearchParams } from "expo-router";
import { useContext, useEffect, useState } from "react";
import { Alert, Text } from "react-native";

import { UI } from "@/components/chat/ui";
import { AdminEmbedded, AdminScreen, Card, Chip, Note, Pills, PrimaryButton, Section } from "@/components/groups/AdminUi";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import {
  getGroup,
  updateGroup,
  type Group,
  type GroupAudience,
  type GroupJoinMode,
} from "@/services/groups";
import { useAppSelector } from "@/store/hooks";
import { safeBack } from "@/utils/safeBack";

const JOIN_OPTIONS: { value: GroupJoinMode; label: string }[] = [
  { value: "approval", label: "Admin approval" },
  { value: "instant", label: "Anyone with the link" },
];

const AUDIENCE_OPTIONS: { value: GroupAudience; label: string }[] = [
  { value: "members", label: "Members" },
  { value: "admins", label: "Admins only" },
];

const SIZE_CHOICES = [25, 50, 100, 250, 500];

export default function JoiningPrivacy() {
  const inline = !!useContext(AdminEmbedded);
  const styles = useThemedStyles(STYLE_PAIR);
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const token = useAppSelector((state) => state.auth.token);

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [joinMode, setJoinMode] = useState<GroupJoinMode>("approval");
  const [sizeLimit, setSizeLimit] = useState("100");
  const [listVisibility, setListVisibility] = useState<GroupAudience>("members");
  const [whoCanAdd, setWhoCanAdd] = useState<GroupAudience>("admins");

  useEffect(() => {
    if (!token || !groupId) return;
    getGroup(groupId, token)
      .then(({ group: loaded }) => {
        if (!loaded) return;
        setGroup(loaded);
        setJoinMode(loaded.joinMode);
        setSizeLimit(String(loaded.sizeLimit));
        setListVisibility(loaded.memberListVisibility);
        setWhoCanAdd(loaded.whoCanAdd);
      })
      .catch((error) =>
        Alert.alert("Joining & privacy", error instanceof Error ? error.message : "Couldn't load the group."),
      )
      .finally(() => setLoading(false));
  }, [token, groupId]);

  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";
  const faction = group?.kind === "faction";

  // The current limit is always one of the choices, even if it's unusual.
  const sizeOptions = [...new Set([...SIZE_CHOICES, Number(group?.sizeLimit) || 100])]
    .sort((a, b) => a - b)
    .map((value) => ({ value: String(value), label: String(value) }));

  const changed =
    !!group &&
    (joinMode !== group.joinMode ||
      Number(sizeLimit) !== group.sizeLimit ||
      listVisibility !== group.memberListVisibility ||
      whoCanAdd !== group.whoCanAdd);

  const tooSmall = !!group && Number(sizeLimit) < group.memberCount;

  const save = async () => {
    if (!token || !groupId || !group || !changed) return;
    try {
      setSaving(true);
      const updated = await updateGroup(
        groupId,
        {
          ...(faction ? {} : { joinMode }),
          sizeLimit: Number(sizeLimit),
          memberListVisibility: listVisibility,
          whoCanAdd,
        },
        null,
        token,
      );
      setGroup(updated);
      if (!inline) safeBack();
    } catch (error) {
      Alert.alert("Joining & privacy", error instanceof Error ? error.message : "Couldn't save the changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminScreen title="Joining & privacy" subtitle={group?.name} loading={loading}>
      <Chip>Admin only</Chip>

      {!isAdmin && group ? <Note>Only the group&apos;s admins can change these settings.</Note> : null}

      {/* WHO CAN JOIN */}
      <Section>WHO CAN JOIN WITH THE INVITE LINK</Section>
      <Card padded>
        {faction ? (
          <>
            <Text style={styles.title}>Faction members</Text>
            <Text style={styles.hint}>
              Everyone in {group?.factionName || "this faction"} is in this group automatically. People from other
              factions can ask to join with the invite link.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>{joinMode === "approval" ? "Admin approval" : "Join instantly"}</Text>
            <Text style={styles.hint}>
              {joinMode === "approval"
                ? "People who open the link write an introduction and ask to join. An admin approves each request."
                : "Anyone who opens the invite link joins straight away."}
            </Text>
            {isAdmin ? <Pills options={JOIN_OPTIONS} value={joinMode} onChange={setJoinMode} /> : null}
          </>
        )}
      </Card>

      {/* SIZE LIMIT */}
      <Section>GROUP SIZE LIMIT</Section>
      <Card padded>
        <Text style={styles.title}>Up to {sizeLimit} members</Text>
        <Text style={styles.hint}>
          {group ? `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"} now.` : ""} New people can&apos;t
          join once the group is full.
        </Text>
        {isAdmin ? <Pills options={sizeOptions} value={sizeLimit} onChange={setSizeLimit} /> : null}
        {tooSmall ? <Text style={styles.warning}>The limit can&apos;t be below the current number of members.</Text> : null}
      </Card>

      {/* MEMBER LIST */}
      <Section>MEMBER LIST VISIBLE TO</Section>
      <Card padded>
        <Text style={styles.hint}>
          {listVisibility === "members"
            ? "Everyone in the group can see who else is in it."
            : "Only admins can see the full member list."}
        </Text>
        {isAdmin ? <Pills options={AUDIENCE_OPTIONS} value={listVisibility} onChange={setListVisibility} /> : null}
      </Card>

      {/* WHO CAN ADD */}
      <Section>WHO CAN ADD PEOPLE</Section>
      <Card padded>
        <Text style={styles.hint}>
          {whoCanAdd === "members" ? "Any member can add people they know." : "Only admins can add people."}
        </Text>
        {isAdmin ? (
          <Pills
            options={[
              { value: "members" as GroupAudience, label: "Members" },
              { value: "admins" as GroupAudience, label: "Admins" },
            ]}
            value={whoCanAdd}
            onChange={setWhoCanAdd}
          />
        ) : null}
      </Card>

      {isAdmin ? (
        <PrimaryButton label="Save changes" onPress={save} busy={saving} disabled={!changed || tooSmall} />
      ) : null}
    </AdminScreen>
  );
}

const STYLE_PAIR = themedStyles(
  {
    title: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.INK },
    hint: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: UI.MUTED },
    warning: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 12.5, color: "#C0394B" },
  },
  {
    title: { color: "#F4F5FA" },
    hint: { color: "#B5BBCB" },
    warning: { color: "#F07A8A" },
  },
);
