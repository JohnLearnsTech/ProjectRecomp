import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { exchangeLinkCode } from '../../lib/auth';
import { useTheme } from '../../lib/theme';

// Handles recomp://auth/callback?code=... from the sign-in email.
export default function AuthCallback() {
  const { c, s: ui } = useTheme();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(params.error_description ?? null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !params.code) return;
    done.current = true;
    exchangeLinkCode(params.code)
      .then(() => router.replace('/'))
      .catch((e) =>
        setError(
          `${e.message}. Open the link on the same phone where you requested it, or request a new one.`,
        ),
      );
  }, [params.code]);

  return (
    <View style={[ui.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      {error ? (
        <>
          <Text style={ui.error}>{error}</Text>
          <Pressable style={[ui.outline, { alignSelf: 'stretch' }]} onPress={() => router.replace('/sign-in')}>
            <Text style={ui.outlineText}>Back to sign-in</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={c.cat.move.ink} />
      )}
    </View>
  );
}
