// The call itself now lives in components/calls/ActiveCallOverlay (mounted
// once for the whole app), so it keeps going while you use the app.
// This route only exists so old links to /call/<id> still work: it shows
// the call full screen and steps back out of the way.
import { router } from "expo-router";
import { useEffect } from "react";

import { setCallMinimized } from "@/components/calls/callUi";
import { safeBack } from "@/utils/safeBack";

export default function CallRoute() {
  useEffect(() => {
    setCallMinimized(false);

    if (router.canGoBack()) {
      safeBack();
    } else {
      router.replace("/");
    }
  }, []);

  return null;
}
