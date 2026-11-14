import { Jost_400Regular, Jost_500Medium, Jost_600SemiBold, Jost_700Bold, useFonts } from '@expo-google-fonts/jost';
import { SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Doto_900Black } from '@expo-google-fonts/doto';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

function RootStack() {
  const { session, loading } = useAuth();
  const { c } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ Jost_400Regular, Jost_500Medium, Jost_600SemiBold, Jost_700Bold, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold, Doto_900Black });
  if (loading || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>
        <ActivityIndicator color={c.cat.move.ink} />
      </View>
    );
  }
  const signedIn = !!session;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {/* Deep-link target for the email link; reachable in both states. */}
      <Stack.Screen name="auth/callback" />
      {/* The Claude connector's consent page (web); reachable signed in or out. */}
      <Stack.Screen name="oauth/consent" />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemedStatusBar />
      <RootStack />
    </AuthProvider>
  );
}
