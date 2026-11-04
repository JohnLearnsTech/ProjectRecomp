import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { pickBackup, restore, type Picked } from '../lib/backup';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';

const n = (x: number) => x.toLocaleString('en-US');

/** Restore an r19 web-app backup (recomp-backup-<date>.json) into this account. */
export function BackupImport({ compact = false }: { compact?: boolean }) {
  const { c, s } = useTheme('move');
  const { reload, touch } = useRecomp();
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; detail?: string[] } | null>(null);

  const choose = async () => {
    setMsg(null);
    try { const p = await pickBackup(); if (p) setPicked(p); }
    catch (e) { setPicked(null); setMsg({ ok: false, text: (e as Error).message }); }
  };
  const go = async () => {
    if (!picked) return;
    setBusy(true); setMsg(null);
    try {
      const bad = await restore(picked);
      const S = picked.summary;
      setPicked(null);
      setMsg(bad.length
        ? { ok: false, text: 'Restored, but some numbers don\'t match the backup:', detail: bad }
        : { ok: true, text: `Restored ${n(S.days)} days and your settings. Every count matches the backup.` });
      await reload(); touch();
      if (compact && !bad.length) router.replace('/');
    } catch (e) { setMsg({ ok: false, text: 'Nothing was changed. ' + (e as Error).message }); }
    finally { setBusy(false); }
  };

  const S = picked?.summary;
  return (
    <View style={compact ? { gap: 10 } : s.card}>
      {!compact && <Text style={s.cardTitle}>Backup</Text>}
      {!compact && <Text style={s.body2}>Moving from the Recomp web app? In it, open Me, Backup, and save a backup. Then restore that file here.</Text>}
      {!picked && (
        <Pressable style={s.outline} onPress={choose} disabled={busy}><Text style={s.outlineText}>Restore from a backup…</Text></Pressable>
      )}
      {picked && S && (
        <View style={{ backgroundColor: c.surface2, borderRadius: 14, padding: 14, gap: 6 }}>
          <Text style={[s.label, { fontFamily: font.semibold }]}>{picked.name}</Text>
          <Text style={s.body}>{n(S.days)} days{S.firstDay ? `, ${S.firstDay} to ${S.lastDay}` : ''}</Text>
          <Text style={s.body}>{n(S.foodRows)} food rows, {n(S.sets)} sets, {S.habits} habit{S.habits === 1 ? '' : 's'}, {S.reviews} review{S.reviews === 1 ? '' : 's'}</Text>
          <Text style={s.body}>{S.activeGoal ? `Goal: ${S.activeGoal}` : 'No current goal'} · {S.plan === 'saved' ? 'your saved plan' : 'the default plan'}</Text>
          {picked.notes.map((x, i) => <Text key={i} style={s.label}>{x}</Text>)}
          <Text style={[s.body, { fontFamily: font.semibold, marginTop: 6 }]}>This replaces everything in this account with the backup.</Text>
          <View style={s.row}>
            <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.5 }]} onPress={go} disabled={busy}>
              {busy ? <ActivityIndicator color={c.paper} /> : <Text style={s.primaryText}>Restore</Text>}
            </Pressable>
            <Pressable style={[s.outline, { flex: 1 }]} onPress={() => setPicked(null)} disabled={busy}><Text style={s.outlineText}>Cancel</Text></Pressable>
          </View>
        </View>
      )}
      {msg && <Text style={msg.ok ? s.body2 : s.error}>{msg.text}</Text>}
      {msg?.detail?.map((x, i) => <Text key={i} style={s.label}>• {x}</Text>)}
    </View>
  );
}
