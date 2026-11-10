// Me > Reminders, Me > Backup and Me > Settings (r19 renderRem, renderBackup, secSettings).
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { aiMessage } from '../../domain/ai';
import { clearApiKey, maskKey, saveApiKey } from '../../lib/apiKey';
import { signOut, useAuth } from '../../lib/auth';
import { checkKey, MODEL } from '../../lib/claude';
import * as db from '../../lib/db';
import { useDays } from '../../lib/days';
import { exportFile } from '../../lib/exportBackup';
import { useRecomp } from '../../lib/recomp';
import { connectSteps, disconnectSteps, openStepSources, stepsConnected, stepsSupported, syncSteps } from '../../lib/steps';
import { clearReminders, remRows, scheduleReminders, scheduledCount } from '../../lib/reminders';
import { ACCENTS, font, setPrefs, usePrefs, useTheme } from '../../lib/theme';
import { BackupImport } from '../BackupImport';
import { ConnectClaude } from '../ConnectClaude';
import { Icon } from '../Icon';
import { Cue, Mini, PanelHead, Segmented } from '../ui';

const REM_TIP = 'Reminders are notifications on this phone at the times you set. Tap Update reminders after you change your plan, times or dates, so they follow the new schedule.';

export function RemindersTab({ toast }: { toast: (t: string) => void }) {
  const { engine, maxDay } = useRecomp();
  const { c, s } = useTheme('move');
  const [uc, setUc] = useState<db.UserCheckRow[]>([]);
  const [hidden, setHidden] = useState<Record<string, string | true>>({});
  const [items, setItems] = useState<Record<string, { on: boolean; time: string }>>({});
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    Promise.all([db.listUserChecks(), db.listHiddenChecks(), db.listReminders()]).then(([u, h, r]) => {
      setUc(u); setHidden(Object.fromEntries(h.map((x) => [x.check_id, x.label === x.check_id ? true : x.label])));
      setItems(Object.fromEntries(r.map((x) => [x.key, { on: x.enabled, time: String(x.local_time).slice(0, 5) }])));
    }).catch(() => {});
    if (Platform.OS !== 'web') scheduledCount().then(setCount).catch(() => setCount(0));
  }, []);
  const rows = remRows(engine, maxDay, uc, hidden);
  const item = (k: string, dflt: [string, boolean]) => items[k] ?? { on: dflt[1], time: dflt[0] };
  const set = (k: string, v: { on: boolean; time: string }) => {
    setItems((o) => ({ ...o, [k]: v }));
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) db.setReminder({ key: k, enabled: v.on, local_time: v.time }).catch(() => {});
  };
  const sync = async () => {
    setBusy(true); setMsg('');
    try {
      const all = Object.fromEntries(rows.map((r) => [r.k, item(r.k, r.dflt)]));
      const n = await scheduleReminders(engine, maxDay, rows, all); setCount(n); setMsg(n ? `${n} reminders set for the next eight weeks.` : 'Nothing to remind you of in the next eight weeks.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <View style={s.card}>
      <PanelHead title="Reminders" info={{ text: REM_TIP, label: 'About reminders' }} />
      <Text style={[s.label, { marginTop: -4 }]}>{count ? `${count} reminder${count > 1 ? 's' : ''} set on this phone.` : 'No reminders set on this phone yet.'}</Text>
      <View style={{ borderWidth: 1, borderColor: c.lineSoft, borderRadius: 12, overflow: 'hidden' }}>
        {rows.map((r, i) => {
          const it = item(r.k, r.dflt), on = it.on && !r.off;
          return (
            <View key={r.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: c.lineSoft, opacity: r.off ? 0.55 : 1 }}>
              <Pressable disabled={r.off} onPress={() => set(r.k, { ...it, on: !it.on })} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={r.label}
                style={{ flexDirection: 'row', gap: 12, flex: 1, alignItems: 'flex-start' }}>
                <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: on ? c.cat.move.fill : c.muted, backgroundColor: on ? c.cat.move.fill : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {on && <Icon name="check" size={14} color={c.cat.move.on} stroke={3} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: c.ink }}>{r.label}</Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12, color: c.muted }}>{r.sub}</Text>
                </View>
              </Pressable>
              {!r.noTime && (
                <TextInput style={[s.input, { width: 82, minHeight: 40, textAlign: 'center' }]} value={it.time} maxLength={5} keyboardType="numbers-and-punctuation"
                  onChangeText={(t) => set(r.k, { ...it, time: t })} accessibilityLabel={r.label + ' time'} />
              )}
            </View>
          );
        })}
      </View>
      {Platform.OS === 'web' ? <Cue>Reminders are set from the Android app.</Cue> : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={sync}><Text style={s.primaryText}>{busy ? 'Working…' : count ? 'Update reminders' : 'Turn on reminders'}</Text></Pressable>
          {!!count && <Mini label="Remove all" onPress={async () => { await clearReminders(); setCount(0); toast('Reminders removed'); }} style={{ minHeight: 52 }} />}
        </View>
      )}
      {!!msg && <Cue>{msg}</Cue>}
      <Cue>Each reminder is a notification at that time, so your phone reminds you even with Recomp closed. After you change your plan, times or dates, tap Update reminders.</Cue>
    </View>
  );
}

export function BackupTab({ toast }: { toast: (t: string) => void }) {
  const { engine, maxDay } = useRecomp();
  const { D, entries } = useDays();
  const { c, s } = useTheme('move');
  const [busy, setBusy] = useState<string | null>(null);
  const n = Object.keys(entries).filter((k) => k <= maxDay).length;
  const go = async (kind: 'json' | 'daily' | 'food' | 'sets') => {
    setBusy(kind);
    try { const name = await exportFile(kind, engine, D, maxDay); toast('Saved ' + name); } catch (e) { toast((e as Error).message); } finally { setBusy(null); }
  };
  const B = (kind: 'json' | 'daily' | 'food' | 'sets', t: string, sub: string) => (
    <Pressable onPress={() => go(kind)} disabled={!!busy} style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.lineSoft, backgroundColor: c.surface2, gap: 2, opacity: busy && busy !== kind ? 0.5 : 1 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: c.ink }}>{busy === kind ? 'Preparing…' : t}</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 11.5, color: c.muted }}>{sub}</Text>
    </Pressable>
  );
  return (
    <View style={s.card}>
      <PanelHead title="Backup and export" />
      <Cue>{n} days logged. A backup holds everything: days, food, sets, habits, goal, plan, saved meals and settings. Restoring it on another phone, or in the web app, brings all of it back.</Cue>
      <View style={s.row}>{B('json', 'Full backup', '.json, to restore later')}{B('daily', 'Daily log', '.csv, one row a day')}</View>
      <View style={s.row}>{B('food', 'Food log', '.csv, one row an item')}{B('sets', 'Sets log', '.csv, one row a set')}</View>
      <BackupImport compact />
    </View>
  );
}

export function SettingsTab({ storedKey, setStoredKey, toast }: { storedKey: string | null; setStoredKey: (k: string | null) => void; toast: (t: string) => void }) {
  const { c, s } = useTheme('move');
  const prefs = usePrefs();
  const { session } = useAuth();
  const { touch } = useRecomp();
  const [keyInput, setKeyInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const line = (title: string, sub: string, right?: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingVertical: 6 }}>
      <View style={{ flexShrink: 1 }}><Text style={{ fontFamily: font.semibold, fontSize: 15, color: c.ink }}>{title}</Text><Text style={{ fontFamily: font.regular, fontSize: 12.5, color: c.muted }}>{sub}</Text></View>
      {right}
    </View>
  );
  const cycleTheme = () => setPrefs({ theme: prefs.theme === 'auto' ? 'light' : prefs.theme === 'light' ? 'dark' : 'auto' });
  return (
    <View style={{ gap: 14 }}>
      {stepsSupported && <StepsCard toast={toast} />}
      <View style={s.card}>
        <PanelHead title="Settings" right={
          <Pressable onPress={cycleTheme} accessibilityLabel={`Theme: ${prefs.theme}. Tap to change.`} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={prefs.theme === 'auto' ? 'auto' : prefs.theme === 'light' ? 'sun' : 'moon'} size={17} color={c.ink} />
          </Pressable>} />
        {line('Theme', 'Auto follows your phone.', <Segmented items={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} value={prefs.theme} onChange={(t) => setPrefs({ theme: t })} />)}
        {line('Colour', 'The accent used for buttons, rings and progress.')}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACCENTS.map(([k, l, cols]) => {
            const on = prefs.accent === k;
            return (
              <Pressable key={k} onPress={() => setPrefs({ accent: k })} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.line, backgroundColor: c.surface }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: c.lineSoft }}>
                  {cols.length === 1 ? <View style={{ width: '100%', height: '100%', backgroundColor: cols[0] }} /> : cols.map((x) => <View key={x} style={{ width: '33.4%', height: '50%', backgroundColor: x }} />)}
                </View>
                <Text style={{ fontFamily: font.semibold, fontSize: 14, color: c.ink }}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
        {line('Version', `${Constants.expoConfig?.version ?? '1.0.0'} · Android port of 2026-11-03 r19`)}
        {line('Setup', 'Answer the setup questions again for a fresh goal, targets and plan. Your logs stay.',
          <Mini label="Run setup" onPress={() => router.push({ pathname: '/onboarding', params: { again: '1' } })} />)}
      </View>

      <View style={s.card}>
        <PanelHead title="AI" />
        <Cue>Optional. Paste your own Anthropic API key to use Claude inside Recomp. It stays in this phone's secure storage and is sent only to Anthropic, never to Recomp's servers. Usage is billed to your Anthropic account.</Cue>
        <Cue>Uses {MODEL}. Food estimates, label and plate photos, the plan builder and the weekly review all run with this key.</Cue>
        {storedKey ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
            <Text style={[s.body, { fontVariant: ['tabular-nums'] }]}>{maskKey(storedKey)}</Text>
            <Mini label="Remove" danger onPress={async () => { await clearApiKey(); setStoredKey(null); touch(); setMsg({ t: 'Key removed.' }); }} />
          </View>
        ) : (
          <>
            <TextInput style={s.input} placeholder="sk-ant-…" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} secureTextEntry value={keyInput} onChangeText={setKeyInput} accessibilityLabel="Anthropic API key" />
            <Mini label={checking ? 'Checking…' : 'Check and save key'} disabled={checking} onPress={async () => {
              setChecking(true);
              try {
                const bad = await checkKey(keyInput.trim()); if (bad) throw new Error(aiMessage(bad));
                await saveApiKey(keyInput); setStoredKey(keyInput.trim()); setKeyInput(''); touch(); setMsg({ t: 'Key checked with Anthropic and saved on this phone.' });
              } catch (e) { setMsg({ t: (e as Error).message, err: true }); } finally { setChecking(false); }
            }} />
          </>
        )}
        {msg && <Text style={msg.err ? s.error : s.label}>{msg.t}</Text>}
      </View>

      <ConnectClaude />

      <View style={[s.card, { alignItems: 'center' }]}>
        <Text style={s.label}>Signed in as {session?.user.email}</Text>
        <Mini label="Sign out" danger onPress={() => { signOut(); toast('Signed out'); }} />
      </View>
    </View>
  );
}

/** Me > Settings: steps counted by the phone, read from Health Connect. */
function StepsCard({ toast }: { toast: (t: string) => void }) {
  const { c, s } = useTheme('move');
  const { engine, maxDay, touch } = useRecomp();
  const { entries } = useDays();
  const [on, setOn] = useState(stepsConnected());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const connect = async () => {
    setBusy(true); setErr(null);
    try {
      await connectSteps(); setOn(true);
      const ch = await syncSteps(maxDay, engine.T.START, (k) => entries[k]?.steps ?? null, 14);
      if (ch.length) touch();
      toast(ch.length ? `Connected. Steps filled in for ${ch.length} day${ch.length > 1 ? 's' : ''}.` : 'Connected. If no steps appear, check that a step app writes to Health Connect.');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <View style={s.card}>
      <PanelHead title="Steps from your phone" />
      <Text style={s.body2}>{on
        ? 'On. Recomp reads your step count from Health Connect when you open it, and fills in the last week. A higher number you type yourself is kept.'
        : 'Read your daily steps from Health Connect instead of typing them. It works with whatever counts your steps: the phone itself, Samsung Health, Google Fit or a watch.'}</Text>
      {err && <Cue>{err}</Cue>}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {!on ? (
          <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={connect}><Text style={s.primaryText}>{busy ? 'Connecting…' : 'Connect step counter'}</Text></Pressable>
        ) : (
          <>
            <Mini label="Step sources" onPress={openStepSources} />
            <Mini label="Stop syncing" onPress={() => { disconnectSteps(); setOn(false); toast('Step syncing off'); }} />
          </>
        )}
      </View>
      {on && <Text style={[s.label, { color: c.muted }]}>No steps showing? Open Step sources and check an app or your phone is allowed to write steps to Health Connect.</Text>}
    </View>
  );
}
