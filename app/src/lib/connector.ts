import * as Clipboard from 'expo-clipboard';
import { Linking, Share } from 'react-native';

export const CONNECTOR_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/mcp`;
export const copyConnectorUrl = () => Clipboard.setStringAsync(CONNECTOR_URL);

// The person's Recomp chat in Claude. Saved once, every request goes there instead of
// starting a new chat each time.
const CHAT = 'recomp:claudeChat';
const CHAT_RE = /^https:\/\/claude\.ai\/chat\/[0-9a-f-]{20,}$/i;
export const claudeChat = () => { try { return localStorage.getItem(CHAT); } catch { return null; } };
/** Saves a claude.ai/chat/... link; returns false when it isn't one. Empty clears it. */
export function setClaudeChat(link: string) {
  const v = link.trim().split(/[?#]/)[0].replace(/\/$/, '');
  try {
    if (!v) { localStorage.removeItem(CHAT); return true; }
    if (!CHAT_RE.test(v)) return false;
    localStorage.setItem(CHAT, v); return true;
  } catch { return false; }
}

/**
 * Hands a request to Claude, which acts on it through the Recomp connector. With a saved chat it
 * opens that chat, with the request on the clipboard in case it isn't typed in for you. Without
 * one, claude.ai/new?q= starts a new chat with the request typed in. The share sheet is the
 * fallback. Returns where it went.
 */
export async function handOffToClaude(message = 'Estimate my pending Recomp foods'): Promise<'thread' | 'new' | 'shared'> {
  const chat = claudeChat();
  try {
    if (chat) {
      await Clipboard.setStringAsync(message).catch(() => {});
      await Linking.openURL(chat + '?q=' + encodeURIComponent(message));
      return 'thread';
    }
    await Linking.openURL('https://claude.ai/new?q=' + encodeURIComponent(message));
    return 'new';
  } catch {
    await Share.share({ message }); return 'shared';
  }
}
