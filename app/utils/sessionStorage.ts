// PHONES - keeps the login key in the phone's secure, encrypted storage
// (Keychain on iPhone, Keystore on Android), so you stay logged in after
// closing the app. Only the key is saved; your profile is fetched fresh.
// (The website version is sessionStorage.web.ts.)
import * as SecureStore from "expo-secure-store";

const KEY = "cosquest.authToken";

export async function loadSavedToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string | null) {
  try {
    if (token) {
      await SecureStore.setItemAsync(KEY, token);
    } else {
      await SecureStore.deleteItemAsync(KEY);
    }
  } catch {
    // Storage unavailable - you'll just need to log in next time.
  }
}
