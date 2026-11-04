import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { font, useTheme } from '../../lib/theme';

// OAuth consent for the Recomp connector (Supabase Auth's OAuth 2.1 server redirects here with
// ?authorization_id=...). Runs in the browser Claude opens: sign in with your Recomp email,
// see what Claude asks for, then Allow or Deny. Served from the app's web build, and on Android
// the same screen opens in the app when the consent link points at recomp://.
const CAN = [
  'Read your days: food, weight, steps, sleep, sets and habits',
  'Log food, weight, steps and sleep for you',
  'Fill in calories for foods you logged without numbers',
  'Propose plan changes and save weekly reviews, which you apply yourself in the app',
];
const CANNOT = 'It cannot see or change your checklist, medicines, notes or milestones, and it never applies a plan change by itself.';

export default function Consent() {
  const { c, s } = useTheme('move');
  const params = useLocalSearchParams<{ authorization_id?: string; code?: string; error_description?: string }>();
  const authId = params.authorization_id;
  const { session, loading } = useAuth();
  const [details, setDetails] = useState<{ client: string; scope: string; email: string } | null>(null);
  const [err, setErr] = useState<string | null>(params.error_description ?? null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [handedBack, setHandedBack] = useState(false);
  // Back to Claude with the result. In the app, the callback opens in the Claude app or the browser.
  const go = (url: string) => {
    if (Platform.OS === 'web') { window.location.href = url; return; }
    setHandedBack(true);
    Linking.openURL(url).catch((e) => setErr(e.message));
  };

  // Back from the sign-in email link with a PKCE code: finish signing in here.
  useEffect(() => {
    if (!params.code) return;
    supabase.auth.exchangeCodeForSession(params.code).catch((e) => setErr(`${e.message}. Open the email link in the same browser you started in, or use the code.`));
  }, [params.code]);

  useEffect(() => {
    if (!session || !authId) return;
    supabase.auth.oauth.getAuthorizationDetails(authId).then(({ data, error }) => {
      if (error) return setErr(error.message);
      if (!data) return;
      if (!('authorization_id' in data)) return go(data.redirect_url);       // already allowed before
      setDetails({ client: data.client?.name || 'An app', scope: data.scope, email: data.user?.email });
    });
  }, [session, authId]);

  const decide = async (allow: boolean) => {
    if (!authId) return;
    setBusy(true);
    const fn = allow ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error } = await fn.call(supabase.auth.oauth, authId, { skipBrowserRedirect: true });
    if (error) { setErr(error.message); setBusy(false); return; }
    go(data.redirect_url);
  };

  const sendLink = async () => {
    setBusy(true); setErr(null);
    const back = Platform.OS === 'web'
      ? `${window.location.origin}/oauth/consent?authorization_id=${encodeURIComponent(authId ?? '')}`
      : Linking.createURL('/oauth/consent', { queryParams: { authorization_id: authId ?? '' } });
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: back, shouldCreateUser: false } });
    setBusy(false);
    if (error) setErr(error.message.includes('Signups not allowed') ? 'No Recomp account uses that email. Sign up in the Recomp app first.' : error.message);
    else setSent(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: c.cat.move.fill, borderWidth: 1.5, borderColor: c.cat.move.ink }} />
          <Text style={{ fontFamily: font.bold, fontSize: 22, color: c.ink }}>Project Recomp</Text>
        </View>
        {handedBack ? (
          <View style={{ gap: 12 }}>
            <Text style={s.title}>Done. Back to Claude.</Text>
            <Text style={s.body2}>If Claude didn't open by itself, switch back to it: the Project Recomp connector should now show as connected.</Text>
            <Pressable style={s.outline} onPress={() => router.replace('/')}><Text style={s.outlineText}>Open Project Recomp</Text></Pressable>
          </View>
        ) : !authId ? (
          <Text style={s.body2}>This page is where you allow Claude to use your Project Recomp log. Start from the Project Recomp connector in your Claude app.</Text>
        ) : loading ? null : !session ? (
          <View style={{ gap: 12 }}>
            <Text style={s.title}>Sign in to connect Claude</Text>
            <Text style={s.body2}>Use the email you use in the Recomp app.</Text>
            <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="email-address" editable={!sent} accessibilityLabel="Email" />
            {!sent ? (
              <Pressable style={[s.primary, (busy || !/\S+@\S+\.\S+/.test(email)) && { opacity: 0.5 }]} disabled={busy || !/\S+@\S+\.\S+/.test(email)} onPress={sendLink}>
                <Text style={s.primaryText}>{busy ? 'Sending…' : 'Email me a sign-in link'}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={s.body}>Check {email.trim()}. Open the link in this same browser, and this page carries on. If the email has a 6-digit code, enter it here.</Text>
                <TextInput style={s.input} value={code} onChangeText={setCode} placeholder="123456" placeholderTextColor={c.muted} keyboardType="number-pad" maxLength={6} accessibilityLabel="Code" />
                <Pressable style={[s.primary, code.length !== 6 && { opacity: 0.5 }]} disabled={code.length !== 6}
                  onPress={async () => { const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' }); if (error) setErr(error.message); }}>
                  <Text style={s.primaryText}>Verify code</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : !details ? (
          <Text style={s.body2}>Checking the request…</Text>
        ) : (
          <View style={{ gap: 14 }}>
            <Text style={s.title}>Allow {details.client} to use your Project Recomp log?</Text>
            <Text style={s.label}>Signed in as {details.email}</Text>
            <View style={[s.card, { gap: 8 }]}>
              <Text style={[s.body, { fontFamily: font.semibold }]}>{details.client} will be able to:</Text>
              {CAN.map((x) => <Text key={x} style={s.body}>• {x}</Text>)}
              <Text style={s.body2}>{CANNOT}</Text>
            </View>
            <Text style={s.label}>Claude's own usage is on your Claude plan. You can remove the connector in Claude at any time.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={[s.outline, { flex: 1, minHeight: 52 }]} disabled={busy} onPress={() => decide(false)}><Text style={s.outlineText}>Deny</Text></Pressable>
              <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => decide(true)}><Text style={s.primaryText}>{busy ? 'One moment…' : 'Allow'}</Text></Pressable>
            </View>
          </View>
        )}
        {err && <Text style={s.error}>{err}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
