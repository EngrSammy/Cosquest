// WEB — nothing to set up. Browsers have WebRTC built in, and the phone
// LiveKit package (@livekit/react-native) must never be loaded here: it
// crashes the website ("requireNativeComponent is not a function").
// The web call screen (app/call/[id].web.tsx) uses livekit-client directly.
export { };

