// Me > Settings: teach the walk tracker how your phone counts. Walk a counted number of steps
// with the phone where you carry it; the ratio of your count to the phone's raw count scales every
// walk from then on.
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { calStart, calSteps, calStop, hasStepSensor, setStepFactor, stepFactor, walkPermissions, walkState, walkSupported } from '../lib/walk';
import { font, useTheme } from '../lib/theme';
import { Cue, Mini, PanelHead } from './ui';

const TARGET = 100;

export function StepCalibration({ toast }: { toast: (t: string) => void }) {
  const { c, s } = useTheme('move');
  const [factor, setFactor] = useState(stepFactor());
  const [open, setOpen] = useState(false);
  if (!walkSupported || !hasStepSensor()) return null;
  const pct = Math.round((factor - 1) * 100);
  return (
    <View style={s.card}>
      <PanelHead title="Step calibration" info={{ label: 'About step calibration', text: 'Phones count steps differently depending on the phone and where you carry it. Walk 100 steps you count yourself, and Recomp scales every timed walk to match you. Redo it if you start carrying the phone somewhere else.' }} />
      <Text style={s.body2}>
        {factor === 1 ? 'Not calibrated. Timed walks use the phone’s raw count, which can be off by 10 to 30%.'
          : `Calibrated. Your walks are scaled by ${factor.toFixed(2)} (${pct > 0 ? '+' : ''}${pct}% on the phone’s count).`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pressable style={[s.primary, { flex: 1 }]} onPress={() => setOpen(true)}><Text style={s.primaryText}>{factor === 1 ? 'Calibrate' : 'Calibrate again'}</Text></Pressable>
        {factor !== 1 && <Mini label="Reset" onPress={() => { setStepFactor(1); setFactor(1); toast('Calibration cleared'); }} />}
      </View>
      {open && <CalibrateSheet onClose={() => setOpen(false)} onSaved={(f) => { setFactor(f); setOpen(false); toast(`Calibrated: walks scaled by ${f.toFixed(2)}`); }} />}
    </View>
  );
}

function CalibrateSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (f: number) => void }) {
  useKeepAwake();
  const { c, s } = useTheme('move');
  const [phase, setPhase] = useState<'ready' | 'walking' | 'count'>('ready');
  const [raw, setRaw] = useState(0);
  const [counted, setCounted] = useState(String(TARGET));
  const [err, setErr] = useState<string | null>(null);
  // While walking, show the phone's raw count so a glance confirms it's working.
  useEffect(() => {
    if (phase !== 'walking') return;
    const t = setInterval(() => setRaw(calSteps()), 500);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => () => { calStop(); }, []);

  const start = async () => {
    setErr(null);
    if (walkState()?.running) return setErr('Pause or stop your walk timer first, then calibrate.');
    if (!(await walkPermissions())) return setErr('Recomp needs Physical activity permission to read steps. Allow it in Android settings, then try again.');
    if (!calStart()) return setErr('This phone’s step counter didn’t start. Try again in a moment.');
    setRaw(0); setPhase('walking');
  };
  const stop = () => { setRaw(calStop()); setPhase('count'); };
  const save = () => {
    const n = Math.round(Number(counted));
    if (!(n >= 30 && n <= 2000)) return setErr('Enter the number of steps you counted (at least 30).');
    if (raw < 20) return setErr('The phone barely counted any steps. Check the phone was with you, and try again.');
    const f = n / raw;
    if (f < 0.5 || f > 1.5) return setErr(`You counted ${n} and the phone counted ${raw}. That’s too far apart to be right. Try again, counting carefully.`);
    setStepFactor(f);
    onSaved(Math.round(f * 100) / 100);
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={phase === 'walking' ? undefined : onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 12 }}>
        <Text style={s.cardTitle}>Calibrate steps</Text>
        {phase === 'ready' && (
          <>
            {['Put the phone where you carry it on walks: pocket, hand or armband.', `Tap Start, then walk about ${TARGET} steps at your normal pace, counting each one.`, 'Stop, take the phone out, tap Stop, and enter the number you counted.'].map((t, i) => (
              <Text key={i} style={s.body}>{i + 1}. {t}</Text>
            ))}
            <Cue>The screen stays on while this is open, so the count isn’t paused.</Cue>
            <Pressable style={s.primary} onPress={start}><Text style={s.primaryText}>Start</Text></Pressable>
          </>
        )}
        {phase === 'walking' && (
          <>
            <Text style={[s.body2, { textAlign: 'center' }]}>Walk and count. The phone has counted</Text>
            <Text style={{ fontFamily: font.bold, fontSize: 56, color: c.ink, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{raw}</Text>
            <Pressable style={s.primary} onPress={stop}><Text style={s.primaryText}>Stop</Text></Pressable>
          </>
        )}
        {phase === 'count' && (
          <>
            <Text style={s.body}>The phone counted <Text style={{ fontFamily: font.bold }}>{raw}</Text>. How many steps did you count?</Text>
            <TextInput style={[s.input, { textAlign: 'center', fontSize: 24, fontFamily: font.bold }]} value={counted} onChangeText={setCounted} keyboardType="number-pad" selectTextOnFocus accessibilityLabel="Steps you counted" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={[s.primary, { flex: 1 }]} onPress={save}><Text style={s.primaryText}>Save</Text></Pressable>
              <Mini label="Try again" onPress={() => { setErr(null); setPhase('ready'); }} />
            </View>
          </>
        )}
        {err && <Text style={s.error}>{err}</Text>}
      </View>
    </Modal>
  );
}
