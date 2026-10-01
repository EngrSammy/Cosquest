// WEBSITE - small app settings saved in this browser (e.g. chat wallpapers).
export async function getPref(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string | null) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Storage full or blocked (e.g. a very large photo) - not remembered.
  }
}
