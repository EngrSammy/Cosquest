// React Native's Text with the app's text size cap (./cap.ts). Metro hands
// this file to anything that imports react-native's Text on Android and iOS.
import { withTextCap } from "./cap";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNText = require("react-native/Libraries/Text/Text").default;

function Text(props: any) {
  "use no memo";
  // Called, not rendered: the same component as before, no extra layer per Text.
  return RNText(withTextCap(props));
}
Text.displayName = "Text";

export default Text;
