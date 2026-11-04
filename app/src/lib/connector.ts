import * as Clipboard from 'expo-clipboard';
import { Linking, Share } from 'react-native';

export const CONNECTOR_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/mcp`;
export const copyConnectorUrl = () => Clipboard.setStringAsync(CONNECTOR_URL);

/**
 * "Estimate with Claude" without a key: open Claude with the request typed in, so Claude,
 * through the Recomp connector, fills every pending row in one go. claude.ai/new?q= prefills a
 * new chat and opens the Claude app where it handles the link; the share sheet is the fallback.
 */
export async function handOffToClaude(message = 'Estimate my pending Recomp foods') {
  const url = 'https://claude.ai/new?q=' + encodeURIComponent(message);
  try { await Linking.openURL(url); return 'opened'; }
  catch { await Share.share({ message }); return 'shared'; }
}
