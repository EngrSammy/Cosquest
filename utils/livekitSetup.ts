// PHONES (Android / iOS) — LiveKit needs its WebRTC "globals" registered
// once, before any call screen opens. Without this every call fails with
// "Connection lost".
//
// The web version of this file (livekitSetup.web.ts) does nothing: the
// phone LiveKit package crashes in a browser, and browsers already have
// WebRTC built in. Expo picks the right file automatically.
import { registerGlobals } from "@livekit/react-native";

registerGlobals();
