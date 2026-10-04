// PHONES - small app settings saved on the phone (e.g. chat wallpapers).
// Uses the same secure storage as the saved login (expo-secure-store).
// The website version is prefsStorage.web.ts.
import * as SecureStore from "expo-secure-store";

// Secure storage keys may only contain letters, numbers, ".", "-" and "_".
function safeKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function getPref(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(safeKey(key));
  } catch {
    return null;
  }
}

// Returns true when it was saved.
export async function setPref(
  key: string,
  value: string | null,
): Promise<boolean> {
  try {
    if (value === null) {
      await SecureStore.deleteItemAsync(safeKey(key));
    } else {
      await SecureStore.setItemAsync(safeKey(key), value);
    }

    return true;
  } catch {
    // Couldn't save - the setting just won't be remembered.
    return false;
  }
}
