// WEBSITE - keeps the login key in this browser, so you stay logged in after
// closing the tab or refreshing. Cleared by Log Out.
const KEY = "cosquest.authToken";

export async function loadSavedToken(): Promise<string | null> {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string | null) {
  try {
    if (token) {
      window.localStorage.setItem(KEY, token);
    } else {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    // Private mode / storage blocked - you'll just need to log in next time.
  }
}
