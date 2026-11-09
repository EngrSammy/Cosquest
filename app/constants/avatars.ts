import { useSyncExternalStore } from "react";
import type { ImageSourcePropType } from "react-native";

export type Avatars = {
  id: string;
  source: ImageSourcePropType;
  label?: string;
};

// The 25 avatars built into the app: they show instantly, even offline.
// The rest of the backend's avatars (GET /api/meta/avatars) are ADDED to
// this same list when the app starts (components/AvatarCatalogLoader), so
// every screen that already does AVATARS.find(...) by avatarKey shows the
// new avatars too, without changing those screens.
export const AVATARS: Avatars[] = [
  {
    id: "adventurer",
    source: require("@/assets/images/avatars/avatar_01.png"),
  },
  {
    id: "sky-guardian",
    source: require("@/assets/images/avatars/avatar_02.png"),
  },
  {
    id: "neon-racer",
    source: require("@/assets/images/avatars/avatar_03.png"),
  },
  {
    id: "pink-idol",
    source: require("@/assets/images/avatars/avatar_04.png"),
  },
  {
    id: "visor-ranger",
    source: require("@/assets/images/avatars/avatar_05.png"),
  },
  {
    id: "goggle-scout",
    source: require("@/assets/images/avatars/avatar_06.png"),
  },
  {
    id: "purple-critter",
    source: require("@/assets/images/avatars/avatar_07.png"),
  },
  {
    id: "shadow-agent",
    source: require("@/assets/images/avatars/avatar_08.png"),
  },
  {
    id: "tactical-scout",
    source: require("@/assets/images/avatars/avatar_09.png"),
  },
  {
    id: "pearl-princess",
    source: require("@/assets/images/avatars/avatar_10.png"),
  },
  {
    id: "old-detective",
    source: require("@/assets/images/avatars/avatar_11.png"),
  },
  {
    id: "bowtie-bot",
    source: require("@/assets/images/avatars/avatar_12.png"),
  },
  {
    id: "young-wanderer",
    source: require("@/assets/images/avatars/avatar_13.png"),
  },
  {
    id: "green-knight",
    source: require("@/assets/images/avatars/avatar_14.png"),
  },
  {
    id: "caped-champion",
    source: require("@/assets/images/avatars/avatar_15.png"),
  },
  {
    id: "beat-gamer",
    source: require("@/assets/images/avatars/avatar_16.png"),
  },
  {
    id: "tech-tinkerer",
    source: require("@/assets/images/avatars/avatar_17.png"),
  },
  {
    id: "grey-wanderer",
    source: require("@/assets/images/avatars/avatar_18.png"),
  },
  {
    id: "crowned-king",
    source: require("@/assets/images/avatars/avatar_19.png"),
  },
  {
    id: "classic-hero",
    source: require("@/assets/images/avatars/avatar_20.png"),
  },
  {
    id: "armored-agent",
    source: require("@/assets/images/avatars/avatar_21.png"),
  },
  {
    id: "bronze-warrior",
    source: require("@/assets/images/avatars/avatar_22.png"),
  },
  {
    id: "silver-android",
    source: require("@/assets/images/avatars/avatar_23.png"),
  },
  {
    id: "violet-hero",
    source: require("@/assets/images/avatars/avatar_24.png"),
  },
  {
    id: "night-ninja",
    source: require("@/assets/images/avatars/avatar_25.png"),
  },
];

// ==========================================
// BACKEND AVATARS
// ==========================================

// Ask Cloudinary for a small copy (the avatars are shown small) - much
// faster to load than the full-size PNG.
export function smallAvatarUrl(url: string, width = 240) {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) {
    return url;
  }

  return url.replace("/upload/", `/upload/w_${width},c_limit,f_auto,q_auto/`);
}

let version = 0;
const listeners = new Set<() => void>();

// Adds the backend's avatars that aren't built in. Built-in ones keep their
// instant local picture (just gain the backend's label).
export function addRemoteAvatars(
  remote: { key: string; label?: string; imageUrl: string }[],
) {
  let changed = false;

  for (const avatar of remote) {
    if (!avatar?.key || !avatar?.imageUrl) {
      continue;
    }

    const existing = AVATARS.find((item) => item.id === avatar.key);

    if (existing) {
      if (avatar.label && !existing.label) {
        existing.label = avatar.label;
      }
      continue;
    }

    AVATARS.push({
      id: avatar.key,
      label: avatar.label,
      source: { uri: smallAvatarUrl(avatar.imageUrl) },
    });

    changed = true;
  }

  if (changed) {
    version += 1;
    listeners.forEach((listener) => listener());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

// For screens that SHOW the whole list (e.g. the avatar picker): re-renders
// when the backend's avatars arrive.
export function useAvatarList(): Avatars[] {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );

  return [...AVATARS];
}
