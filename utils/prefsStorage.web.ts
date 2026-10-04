// WEBSITE - small app settings saved in this browser (e.g. chat wallpapers).
export async function getPref(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
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
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }

    return true;
  } catch {
    // Storage full or blocked (e.g. a very large photo) - not remembered.
    return false;
  }
}
