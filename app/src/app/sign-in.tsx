import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendSignInEmail, verifyCode } from '../lib/auth';
import { useTheme } from '../lib/theme';

export default function SignIn() {
  const { c, s: ui } = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
      <KeyboardAvoidingView behavior="padding" style={[ui.screen, { justifyContent: 'center' }]}>
        <Text style={ui.title}>Recomp</Text>
        <Text style={ui.label}>Sign in with your email. No password.</Text>

        <TextInput
          style={ui.input}
          placeholder="you@example.com"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!sent}
        />

        {!sent ? (
          <Pressable
            style={[ui.primary, (!validEmail || busy) && { opacity: 0.5 }]}
            disabled={!validEmail || busy}
            onPress={() => run(async () => { await sendSignInEmail(email); setSent(true); })}
          >
            <Text style={ui.primaryText}>{busy ? 'Sending…' : 'Email me a sign-in link'}</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={ui.body}>
              Check {email.trim()}. Open the link on this phone and Recomp signs you in. If the email has a 6-digit code, enter it here.
            </Text>
            <TextInput
              style={ui.input}
              placeholder="123456"
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            <Pressable
              style={[ui.primary, (code.length !== 6 || busy) && { opacity: 0.5 }]}
              disabled={code.length !== 6 || busy}
              onPress={() => run(() => verifyCode(email, code))}
            >
              <Text style={ui.primaryText}>{busy ? 'Checking…' : 'Verify code'}</Text>
            </Pressable>
            <Pressable style={ui.outline} onPress={() => { setSent(false); setCode(''); }}>
              <Text style={ui.outlineText}>Use a different email</Text>
            </Pressable>
          </View>
        )}
        {error && <Text style={ui.error}>{error}</Text>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
