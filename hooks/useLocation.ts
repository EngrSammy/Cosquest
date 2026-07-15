import * as Location from "expo-location";
import { useEffect, useState } from "react";

export function useLocation() {
  const [position, setPosition] = useState<Location.LocationObject | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      // TODO 1: ask permission with Location.requestForegroundPermissionsAsync()
      //         if status is not "granted", setErrorMsg and return early
      // TODO 2: start watching with Location.watchPositionAsync(options, callback)
      //         options: { accuracy: Location.Accuracy.High, distanceInterval: 2 }
      //         callback: receives the new position — put it in state
      //         IMPORTANT: watchPositionAsync returns a promise of a subscription —
      //         await it and store it in the `subscription` variable
    })();

    return () => {
      // TODO 3: cleanup — if subscription exists, call its .remove()
    };
  }, []);

  return { position, errorMsg };
}
