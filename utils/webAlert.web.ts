// WEB ONLY - on the website, React Native's Alert.alert does NOTHING (a
// known react-native-web limitation). So every "Copied", "Shared" and
// error message in the app silently disappeared in the browser.
// This makes Alert.alert show the browser's own popups instead:
//   - message only / one button  -> alert()
//   - one choice + Cancel        -> confirm()  (OK runs the choice)
//   - several choices + Cancel   -> asks about each choice in turn
// Loaded once from app/_layout.tsx. Phones are not affected.
import { Alert, type AlertButton } from "react-native";

function text(title?: string, message?: string) {
  return [title, message].filter(Boolean).join("\n\n");
}

Alert.alert = (title?: string, message?: string, buttons?: AlertButton[]) => {
  if (typeof window === "undefined") {
    return;
  }

  const list = buttons || [];
  const choices = list.filter((button) => button.style !== "cancel");
  const cancel = list.find((button) => button.style === "cancel");

  // No real choice to make: just show the message.
  if (choices.length <= 1 && !cancel) {
    window.alert(text(title, message));
    choices[0]?.onPress?.();
    return;
  }

  // One choice (plus Cancel): OK / Cancel.
  if (choices.length === 1) {
    if (window.confirm(text(title, message))) {
      choices[0].onPress?.();
    } else {
      cancel?.onPress?.();
    }
    return;
  }

  // Several choices: ask about each one until one is accepted.
  for (const choice of choices) {
    if (
      window.confirm(
        text(title, `${message ? `${message}\n\n` : ""}${choice.text}?`),
      )
    ) {
      choice.onPress?.();
      return;
    }
  }

  cancel?.onPress?.();
};

export { };

