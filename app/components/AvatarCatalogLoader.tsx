// Loads the full avatar list from the backend once, when the app starts,
// and adds it to constants/avatars (AVATARS). Renders nothing.
import { useEffect } from "react";

import { addRemoteAvatars } from "@/constants/avatars";
import { getAvatarCatalog } from "@/services/meta";

let loaded = false;

export default function AvatarCatalogLoader() {
  useEffect(() => {
    if (loaded) {
      return;
    }

    let attempts = 0;

    const load = async () => {
      try {
        addRemoteAvatars(await getAvatarCatalog());
        loaded = true;
      } catch {
        // The server may be waking up - try again a few times.
        attempts += 1;

        if (attempts < 4) {
          setTimeout(load, 5000 * attempts);
        }
      }
    };

    load();
  }, []);

  return null;
}
