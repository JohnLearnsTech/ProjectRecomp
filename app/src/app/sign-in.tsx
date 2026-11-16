import { useEffect, useState } from 'react';
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
      setError(plain(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  // Supabase's own words for the common failures, in plain language.
  const plain = (m: string) => /rate limit|too many|security purposes/i.test(m) ? 'Too many emails were requested. Wait a few minutes, then try once.'
    : /expired|invalid/i.test(m) ? 'That code is wrong or has expired. Use the newest email, or send a new one.' : m;
  // A new email cancels the last one, so sending again is held back for a minute.
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!sent) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [sent]);
  const wait = Math.max(0, 60 - Math.floor((now - sentAt) / 1000));
  const send = () => run(async () => { await sendSignInEmail(email); setSent(true); setSentAt(Date.now()); setNow(Date.now()); setCode(''); });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
      <KeyboardAvoidingView behavior="padding" style={[ui.screen, { justifyContent: 'center' }]}>
        <Text style={ui.title}>Project Recomp</Text>
        <Text style={ui.label}>Sign in with your email. No password: we email you a 6-digit code.</Text>

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
            onPress={send}
          >
            <Text style={ui.primaryText}>{busy ? 'Sending…' : 'Email me a code'}</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={ui.body}>
              Check {email.trim()} for a 6-digit code and enter it here. Use the newest email only: each new one cancels the last. The link in the email also works, if you open it on this phone.
            </Text>
            <TextInput
              style={ui.input}
              placeholder="123456"
              autoComplete="one-time-code"
              autoFocus
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
            <Pressable style={[ui.outline, (wait > 0 || busy) && { opacity: 0.5 }]} disabled={wait > 0 || busy} onPress={send}>
              <Text style={ui.outlineText}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</Text>
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
