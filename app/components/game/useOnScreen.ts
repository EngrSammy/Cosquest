// Is the game the page showing? The game stays mounted while the chat is in
// front (warm, then parked after 15 s), so anything that listens to Android
// Back, ticks or streams must stop as soon as the pager settles on the chat,
// not 15 s later: Back on the chat belongs to the chat.
import { useWorldSelector } from "@/components/world/useWorld";

export function useOnScreen(): boolean {
  return useWorldSelector((s) => s.page === "game");
}
