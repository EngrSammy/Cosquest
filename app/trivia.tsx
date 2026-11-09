// cosquest://trivia: CosQuest trivia with no location and no sign-up (the
// trivia front door, components/game/TriviaFrontDoor.tsx). A screen of its
// own, outside the sign-in flow, so a guest can open it from the welcome
// screen or a shared link.
import TriviaFrontDoor from "@/components/game/TriviaFrontDoor";

export default function TriviaScreen() {
  return <TriviaFrontDoor />;
}
