// React Native's TextInput with the app's text size cap (./cap.ts). Metro
// hands this file to anything that imports react-native's TextInput on
// Android and iOS. TextInput.State (used by scroll views and keyboard code)
// is carried over.
import { withTextCap } from "./cap";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNTextInput = require("react-native/Libraries/Components/TextInput/TextInput").default;

function TextInput(props: any) {
  "use no memo";
  return RNTextInput(withTextCap(props));
}
TextInput.displayName = "TextInput";
TextInput.State = RNTextInput.State;

export default TextInput;
