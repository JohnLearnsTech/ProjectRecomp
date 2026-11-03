import * as SecureStore from 'expo-secure-store';

// The user's own Anthropic key. Lives only in the Android Keystore-backed
// SecureStore on this device; it is never written to Supabase.
const KEY = 'anthropic_api_key';

export const getApiKey = () => SecureStore.getItemAsync(KEY);
export const clearApiKey = () => SecureStore.deleteItemAsync(KEY);

export async function saveApiKey(value: string) {
  const v = value.trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v)) throw new Error("That doesn't look like an Anthropic API key (sk-ant-…).");
  await SecureStore.setItemAsync(KEY, v);
}

export const maskKey = (k: string) => `${k.slice(0, 10)}…${k.slice(-4)}`;
