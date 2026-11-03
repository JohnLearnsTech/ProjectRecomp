import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { clearApiKey, getApiKey, maskKey, saveApiKey } from '../../lib/apiKey';
import { signOut, useAuth } from '../../lib/auth';
import { getProfile, updateProfile, type Sex } from '../../lib/db';
import { useTheme } from '../../lib/theme';

// Me: About you and Settings > AI for now. Plan, Targets, Goal, Notes, Reminders
// and Backup tabs come with later build steps.

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const SEXES: [Sex, string][] = [['female', 'Female'], ['male', 'Male'], ['unspecified', 'Prefer not to say']];

export default function Me() {
  const { c, s } = useTheme();
  const { session } = useAuth();
  const [f, setF] = useState({ name: '', age: '', height: '', cuisine: '', water: '', rules: '' });
  const [sex, setSex] = useState<Sex>('unspecified');
  const [joint, setJoint] = useState(false);
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      if (!p) return;
      setF({
        name: p.name ?? '', age: p.age?.toString() ?? '', height: p.height_cm?.toString() ?? '',
        cuisine: p.cuisine ?? '', water: p.water_l?.toString() ?? '', rules: p.rules ?? '',
      });
      setSex(p.sex);
      setJoint(p.joint_friendly);
    }).catch((e) => setMsg({ t: e.message, err: true }));
    getApiKey().then(setStoredKey);
  }, []);

  const attempt = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); setMsg({ t: ok }); } catch (e) { setMsg({ t: (e as Error).message, err: true }); }
  };

  const saveAbout = () => {
    const age = num(f.age), height = num(f.height), water = num(f.water);
    // Same ranges as r19's About form: out of range becomes null rather than an error.
    const inRange = (v: number | null, lo: number, hi: number) => (v != null && v >= lo && v <= hi ? v : null);
    return attempt(() => updateProfile({
      name: f.name.trim().slice(0, 30) || null,
      sex,
      age: age == null ? null : inRange(Math.round(age), 13, 100),
      height_cm: inRange(height, 120, 230),
      cuisine: f.cuisine.trim().slice(0, 40) || null,
      water_l: inRange(water, 1, 6),
      joint_friendly: joint,
      rules: f.rules.trim().slice(0, 1200) || null,
    }), 'Saved.');
  };

  const input = (k: keyof typeof f, label: string, numeric = false, multiline = false) => (
    <View style={{ gap: 6, flex: multiline ? undefined : 1 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }]}
        value={f[k]}
        onChangeText={(v) => setF((o) => ({ ...o, [k]: v }))}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        placeholderTextColor={c.muted}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.screen}>
      <View style={s.card}>
        <Text style={s.cardTitle}>About you</Text>
        {input('name', 'First name')}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Sex (sets calorie floor)</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {SEXES.map(([v, l]) => (
              <Pressable
                key={v}
                onPress={() => setSex(v)}
                style={[s.outline, { paddingHorizontal: 14, minHeight: 44 }, sex === v && { backgroundColor: c.lineSoft, borderColor: c.ink2 }]}
              >
                <Text style={s.outlineText}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={s.row}>
          {input('age', 'Age', true)}
          {input('height', 'Height (cm)', true)}
        </View>
        <View style={s.row}>
          {input('cuisine', 'Usual cuisine')}
          {input('water', 'Water (L/day)', true)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.body}>Joint-friendly exercises</Text>
          <Switch value={joint} onValueChange={setJoint} trackColor={{ true: c.cat.move.fill }} />
        </View>
        {input('rules', 'Your rules for Claude (one per line)', false, true)}
        <Pressable style={s.primary} onPress={saveAbout}>
          <Text style={s.primaryText}>Save</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>AI</Text>
        <Text style={s.body2}>
          Optional. Paste your own Anthropic API key to use Claude inside Recomp. It stays in this phone's secure
          storage and is sent only to Anthropic, never to Recomp's servers. Usage is billed to your Anthropic account.
        </Text>
        {storedKey ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
            <Text style={[s.body, { fontVariant: ['tabular-nums'] }]}>{maskKey(storedKey)}</Text>
            <Pressable onPress={() => attempt(async () => { await clearApiKey(); setStoredKey(null); }, 'Key removed.')} hitSlop={12}>
              <Text style={[s.body, { color: c.danger }]}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={s.input}
              placeholder="sk-ant-…"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={keyInput}
              onChangeText={setKeyInput}
            />
            <Pressable
              style={s.outline}
              onPress={() => attempt(async () => { await saveApiKey(keyInput); setStoredKey(keyInput.trim()); setKeyInput(''); }, 'Key saved on this phone.')}
            >
              <Text style={s.outlineText}>Save key</Text>
            </Pressable>
          </>
        )}
      </View>

      {msg && <Text style={msg.err ? s.error : s.label}>{msg.t}</Text>}

      <Text style={[s.label, { textAlign: 'center' }]}>Signed in as {session?.user.email}</Text>
      <Pressable style={s.outline} onPress={signOut}>
        <Text style={[s.outlineText, { color: c.danger }]}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
