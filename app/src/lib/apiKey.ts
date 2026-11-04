import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The user's own Anthropic key. Lives only in the Android Keystore-backed
// SecureStore on this device; it is never written to Supabase.
const KEY = 'anthropic_api_key';

// SecureStore has no web backend; the web build (the connector's consent page) never holds a key.
const web = Platform.OS === 'web';
export const getApiKey = async () => (web ? null : SecureStore.getItemAsync(KEY));
export const clearApiKey = async () => { if (!web) await SecureStore.deleteItemAsync(KEY); };

export async function saveApiKey(value: string) {
  const v = value.trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v)) throw new Error("That doesn't look like an Anthropic API key (sk-ant-…).");
  if (web) throw new Error('Keys can only be saved in the Android app.');
  await SecureStore.setItemAsync(KEY, v);
}

export const maskKey = (k: string) => `${k.slice(0, 10)}…${k.slice(-4)}`;
