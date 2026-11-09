// ==========================================
// MODERATION & STAGE on the orbit screen
// ==========================================
// The orbit screen gets one `moderation` source from the call screen:
//   { kind: "voice", room, canModerate, canManageStage, onRemoved }
//   { kind: "call", call, onRemoved }
// and this hook works out the rest:
//   - people with listener / raised hand / muted-by-admin marks
//   - the actions on a person's card (Mute, Remove, Make speaker...)
//   - whether I'm a listener (Raise hand instead of Mic), or muted by an admin
//   - the stage switch (voice chats)
//   - the socket events to me: muted, removed, role changed
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";

import { updateVoiceRoom } from "@/components/voice/voiceUi";
import type { Call } from "@/services/calls";
import { moderateCall, moderateVoice, setVoiceHand, setVoiceRole, setVoiceStage, type ModerationAction } from "@/services/moderation";
import { getSocket } from "@/services/socket";
import { normalizeVoiceRoom, type VoiceRoom } from "@/services/voiceRooms";
import { useAppSelector } from "@/store/hooks";

import type { OrbitPerson } from "./OrbitCall";

export type ModerationSource =
  | { kind: "voice"; room: VoiceRoom; canModerate: boolean; canManageStage: boolean; onRemoved: () => void }
  | { kind: "call"; call: Call; onRemoved: () => void };

export type PersonAction = { key: string; label: string; icon: string; destructive?: boolean; onPress: () => void };

function messageOf(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) return String((error as any).message || "") || fallback;
  return fallback;
}

const first = (person: OrbitPerson) => person.name.split(" ")[0];

export function useModeration(source: ModerationSource | undefined, rawPeople: OrbitPerson[]) {
  const token = useAppSelector((state) => state.auth.token);
  const meId = rawPeople.find((person) => person.isMe)?.id || "";
  const [mutedByAdminLocal, setMutedByAdminLocal] = useState<boolean | null>(null);

  const room = source?.kind === "voice" ? source.room : null;
  const call = source?.kind === "call" ? source.call : null;
  const sourceId = room?.id || call?.id || "";

  // ---------- members, by user id ----------
  const members = useMemo(() => {
    const map = new Map<string, any>();
    (room?.members || []).forEach((member: any) => map.set(String(member?.user?.id || ""), member));
    (call?.members || []).forEach((member: any) => map.set(String(member?.user?.id || ""), member));
    return map;
  }, [room, call]);

  const stageOn = Boolean((room as any)?.stage);
  // Faction in danger: the flare on the sender's circle until it expires.
  const alertInfo: any = (room as any)?.alert || (call as any)?.alert || null;
  const flareId = alertInfo && new Date(alertInfo.expiresAt).getTime() > Date.now() ? String(alertInfo.userId) : null;
  const people = useMemo(
    () =>
      rawPeople.map((person) => {
        const member = members.get(person.id);
        const flare = person.id === flareId;
        if (!member) return flare ? { ...person, flare } : person;
        return {
          ...person,
          flare,
          listener: stageOn && member.role === "listener",
          handRaised: stageOn && Boolean(member.handRaised),
          mutedByAdmin: Boolean(member.mutedByAdmin),
        };
      }),
    [rawPeople, members, stageOn, flareId],
  );

  const meMember = members.get(meId);
  const listener = stageOn && meMember?.role === "listener";
  const handRaised = listener && Boolean(meMember?.handRaised);
  const mutedByAdmin = mutedByAdminLocal ?? Boolean(meMember?.mutedByAdmin);
  useEffect(() => setMutedByAdminLocal(null), [meMember?.mutedByAdmin]);

  const canModerate = source?.kind === "voice" ? source.canModerate : Boolean(call && (call as any).moderatorId && String((call as any).moderatorId) === meId);
  const canManageStage = source?.kind === "voice" ? source.canManageStage : false;

  // ---------- socket events to me ----------
  useEffect(() => {
    if (!source || !sourceId) return;
    const socket: any = getSocket();
    if (!socket) return;
    const isMine = (payload: any) => String(payload?.roomId || payload?.callId || "") === sourceId;

    const onModerated = (payload: any) => {
      if (!isMine(payload)) return;
      const muted = payload?.action === "muted";
      setMutedByAdminLocal(muted);
      Alert.alert(
        muted ? "An admin muted you" : "You can talk again",
        muted ? "Your microphone is off. You can talk again when they allow it." : "Tap the mic when you want to talk.",
      );
    };
    const onRemoved = (payload: any) => {
      if (!isMine(payload)) return;
      source.onRemoved();
      Alert.alert(
        "You were removed",
        source.kind === "voice" ? "An admin removed you from this voice chat. You can join the next one." : "You were removed from this call.",
      );
    };
    const onRole = (payload: any) => {
      if (!isMine(payload)) return;
      Alert.alert(
        payload?.role === "speaker" ? "You can speak now" : "You're in the audience",
        payload?.role === "speaker" ? "Tap the mic when you want to talk." : "You can listen. Raise your hand to ask to speak.",
      );
    };
    // Keep the voice chat current even when its chat isn't open.
    const onVoiceUpdated = (payload: any) => {
      if (source.kind !== "voice" || String(payload?.voiceRoom?.id || "") !== sourceId) return;
      const next = normalizeVoiceRoom(payload?.voiceRoom);
      if (next) updateVoiceRoom(next);
    };

    const prefix = source.kind === "voice" ? "voice" : "call";
    socket.on(`${prefix}:moderated`, onModerated);
    socket.on(`${prefix}:removed`, onRemoved);
    if (source.kind === "voice") {
      socket.on("voice:role", onRole);
      socket.on("voice:updated", onVoiceUpdated);
    }
    return () => {
      socket.off(`${prefix}:moderated`, onModerated);
      socket.off(`${prefix}:removed`, onRemoved);
      socket.off("voice:role", onRole);
      socket.off("voice:updated", onVoiceUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.kind, sourceId]);

  // ---------- requests ----------
  const keepRoom = (reply: any) => {
    const next = normalizeVoiceRoom(reply?.voiceRoom);
    if (next) updateVoiceRoom(next);
  };

  const run = useCallback(
    async (what: string, request: () => Promise<any>) => {
      try {
        keepRoom(await request());
      } catch (error) {
        Alert.alert(what, messageOf(error, "That didn't work. Try again."));
      }
    },
    [],
  );

  const moderate = useCallback(
    (person: OrbitPerson, action: ModerationAction) => {
      if (!token || !sourceId) return;
      const request =
        source?.kind === "voice"
          ? () => moderateVoice(sourceId, person.id, action, token)
          : () => moderateCall(sourceId, person.id, action, token);
      run(action === "remove" ? "Remove" : action === "mute" ? "Mute" : "Allow to talk", request);
    },
    [token, sourceId, source?.kind, run],
  );

  const actionsFor = useCallback(
    (person: OrbitPerson): PersonAction[] => {
      if (!source || person.isMe || !token) return [];
      const actions: PersonAction[] = [];
      const member = members.get(person.id);
      if (canManageStage && stageOn && room) {
        actions.push(
          member?.role === "listener"
            ? { key: "speaker", label: "Make speaker", icon: "mic-outline", onPress: () => run("Make speaker", () => setVoiceRole(room.id, person.id, "speaker", token)) }
            : { key: "listener", label: "Move to audience", icon: "people-outline", onPress: () => run("Move to audience", () => setVoiceRole(room.id, person.id, "listener", token)) },
        );
      }
      if (canModerate) {
        actions.push(
          member?.mutedByAdmin
            ? { key: "unmute", label: "Allow to talk", icon: "mic-outline", onPress: () => moderate(person, "unmute") }
            : { key: "mute", label: "Mute", icon: "mic-off-outline", onPress: () => moderate(person, "mute") },
          {
            key: "remove",
            label: "Remove",
            icon: "person-remove-outline",
            destructive: true,
            onPress: () =>
              Alert.alert(
                `Remove ${first(person)}?`,
                source.kind === "voice" ? `They can't rejoin this voice chat. They can join the next one.` : `They can't rejoin this call.`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => moderate(person, "remove") },
                ],
              ),
          },
        );
      }
      return actions;
    },
    [source, token, members, canManageStage, stageOn, room, canModerate, run, moderate],
  );

  const toggleHand = useCallback(() => {
    if (!token || !room) return;
    run("Raise hand", () => setVoiceHand(room.id, !handRaised, token));
  }, [token, room, handRaised, run]);

  const stage =
    room && canManageStage
      ? {
          on: stageOn,
          speakerCount: Number((room as any).speakerCount) || 0,
          onToggle: () =>
            token &&
            run("Stage", () => setVoiceStage(room.id, !stageOn, token)),
        }
      : null;

  const micLock = listener
    ? "You're in the audience. Raise your hand to ask to speak."
    : mutedByAdmin
      ? "An admin muted you. You can talk again when they allow it."
      : null;

  // Where a danger alert is sent from (this call or voice chat).
  const alertTarget = source && sourceId ? { kind: source.kind === "voice" ? ("voice" as const) : ("call" as const), id: sourceId } : null;

  return { people, actionsFor, listener, handRaised, toggleHand, micLock, stage, alertTarget };
}
