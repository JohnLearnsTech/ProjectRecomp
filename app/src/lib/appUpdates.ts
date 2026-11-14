// Over-the-air updates, applied without guesswork: check when the app opens or comes back,
// download in the background, then offer a one-tap restart (Android often keeps an app alive
// when it's swiped away, so waiting for a "next launch" can take days).
import * as Updates from 'expo-updates';
import { AppState, Platform } from 'react-native';
import { toast } from './toast';

let busy = false, offered = false, last = 0;

export async function checkForAppUpdate(manual = false) {
  if (Platform.OS === 'web' || !Updates.isEnabled || busy) return 'off';
  if (!manual && Date.now() - last < 10 * 60000) return 'skip';
  busy = true; last = Date.now();
  try {
    const r = await Updates.checkForUpdateAsync();
    if (!r.isAvailable) { if (manual) toast('You have the latest version.'); return 'latest'; }
    await Updates.fetchUpdateAsync();
    if (!offered || manual) { offered = true; toast('Update ready.', () => Updates.reloadAsync(), 'Restart', 20000); }
    return 'ready';
  } catch (e) {
    if (manual) toast('Couldn’t check for updates. Check your connection and try again.');
    return 'error';
  } finally { busy = false; }
}

/** Check now and whenever the app comes back to the foreground. */
export function watchAppUpdates() {
  checkForAppUpdate();
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') checkForAppUpdate(); });
  return () => sub.remove();
}

/** What this copy of the app is running, for Settings. */
export function runningUpdate() {
  if (Platform.OS === 'web' || !Updates.isEnabled) return 'Web version';
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) return 'Built-in version (no updates applied yet)';
  const d = Updates.createdAt;
  return `Update of ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}
