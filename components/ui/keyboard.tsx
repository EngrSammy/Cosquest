// One keyboard approach for the whole app: react-native-keyboard-controller.
// Its views follow the keyboard frame by frame on both platforms, and on
// Android they work with edge-to-edge (Android 15+), where the old
// adjustResize / KeyboardAvoidingView "height" pattern left the keyboard over
// the input (F-21). KeyboardProvider wraps the app in app/_layout.tsx.
//
//   KeyboardAvoidingView     drop-in for React Native's; use behavior="padding"
//                            on both platforms (sheets, composers)
//   KeyboardAwareScrollView  a ScrollView that keeps the focused input above
//                            the keyboard (forms: onboarding, settings)
//
// Import from here, not from the library, so the app keeps one approach.
export {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardProvider,
  KeyboardStickyView,
  useKeyboardState,
} from "react-native-keyboard-controller";
