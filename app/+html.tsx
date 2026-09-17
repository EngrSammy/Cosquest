import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

// Web-only HTML shell wrapping every page. Native (iOS/Android) ignores this.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: webResetCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Remove the browser's default focus ring on inputs (the blue box) and the
// tap-highlight flash on press — RN Web maps TextInput to <input>/<textarea>.
const webResetCss = `
input, textarea, select, button { outline: none !important; }
* { -webkit-tap-highlight-color: transparent; }
`;
