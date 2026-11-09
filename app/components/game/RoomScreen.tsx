// One Room, entered: the lobby (what this Room is, your side, your name),
// then the fight, then how it went. Owns the Room's session for as long as
// it is on screen and closes the live link when it goes. costquest-ios
// CostQuestApp.swift onRoom → UI/EntryView.swift (presetSide, presetHandle)
// → UI/PlayView.swift → UI/ResultsView.swift.
import { useEffect, useRef, useState } from "react";
import { Alert, BackHandler, StyleSheet, View } from "react-native";

import { isTerminal } from "@/features/game/rooms";
import { newRoomSession, useRoomSession } from "@/features/game/roomsRuntime";

import RoomFight from "./RoomFight";
import RoomLobby from "./RoomLobby";
import { useOnScreen } from "./useOnScreen";

export default function RoomScreen({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const [session] = useState(() => newRoomSession(gameId));
  const state = useRoomSession(session);
  const onScreen = useOnScreen();

  useEffect(() => {
    void session.load();
    return () => session.leave();
  }, [session]);

  const inFight = state.joined && !isTerminal(state.fight.gameStatus);
  const confirmLeave = () => {
    if (!inFight) return onClose();
    Alert.alert("Leave the game?", "You can rejoin while it's live.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          session.leave();
          onClose();
        },
      },
    ]);
  };

  // Android Back: out of the lobby at once; out of a fight only after asking,
  // because it is the one thing that should never happen by accident mid fight.
  // Only while the game is the page showing: Back on the chat is the chat's.
  // Registered once (not on every render), so the fight's own listeners (a
  // chest's question) stay newer and take Back first.
  const leaveRef = useRef(confirmLeave);
  useEffect(() => {
    leaveRef.current = confirmLeave;
  });
  useEffect(() => {
    if (!onScreen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leaveRef.current();
      return true;
    });
    return () => sub.remove();
  }, [onScreen]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {state.joined ? <RoomFight session={session} state={state} parked={!onScreen} onLeave={confirmLeave} onDone={onClose} /> : <RoomLobby session={session} state={state} onClose={onClose} />}
    </View>
  );
}
