// TEST BUILDS ONLY (EXPO_PUBLIC_E2E=1): throws while drawing, so the error
// boundary journey can see the restart screen (components/ErrorBoundary.tsx).
// Every other build sends this route home.
import { Redirect } from "expo-router";

const E2E = process.env.EXPO_PUBLIC_E2E === "1";

function Boom(): never {
  throw new Error("Test crash (cosquest://dev/crash)");
}

export default function DevCrash() {
  if (!E2E) return <Redirect href="/" />;
  return <Boom />;
}
