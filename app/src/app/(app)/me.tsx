import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AboutTab, NotesTab } from '../../components/me/AboutTab';
import { GoalTab } from '../../components/me/GoalTab';
import { PlanTab, TargetsTab } from '../../components/me/PlanTab';
import { BackupTab, RemindersTab, SettingsTab } from '../../components/me/SettingsTabs';
import { SubTabs } from '../../components/ui';
import { getApiKey } from '../../lib/apiKey';
import { font, useTheme } from '../../lib/theme';

// Me: one page per topic (r19 ME_TABS), remembered between visits like goa:metab.
type Tab = 'plan' | 'targets' | 'goal' | 'you' | 'notes' | 'reminders' | 'backup' | 'settings';
const TABS: [Tab, string][] = [['plan', 'Plan'], ['targets', 'Targets'], ['goal', 'Goal'], ['you', 'About you'], ['notes', 'Notes'], ['reminders', 'Reminders'], ['backup', 'Backup'], ['settings', 'Settings']];
const readTab = (): Tab => { try { const t = localStorage.getItem('recomp:metab'); if (t && TABS.some((x) => x[0] === t)) return t as Tab; } catch { /* ignore */ } return 'plan'; };

export default function Me() {
  const { c, s } = useTheme();
  const [tab, setTabRaw] = useState<Tab>(readTab);
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { getApiKey().then(setStoredKey).catch(() => {}); }, []);
  const setTab = (t: Tab) => { setTabRaw(t); try { localStorage.setItem('recomp:metab', t); } catch { /* ignore */ } scroll.current?.scrollTo({ y: 0, animated: false }); };
  const toast = (t: string) => {
    setToastText(t);
    Animated.sequence([Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }), Animated.delay(2200), Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true })]).start();
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView ref={scroll} contentContainerStyle={[s.screen, { paddingBottom: 60 }]} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]}>
        <ScreenHeader title="Me" strip={false} dayLine={false} onMe />
        <View style={{ backgroundColor: c.paper, paddingVertical: 6, marginHorizontal: -20, paddingHorizontal: 20 }}>
          <SubTabs tabs={TABS} value={tab} onChange={setTab} />
        </View>
        {tab === 'plan' && <PlanTab keyed={!!storedKey} toast={toast} />}
        {tab === 'targets' && <TargetsTab toast={toast} />}
        {tab === 'goal' && <GoalTab toast={toast} />}
        {tab === 'you' && <AboutTab toast={toast} />}
        {tab === 'notes' && <NotesTab toast={toast} />}
        {tab === 'reminders' && <RemindersTab toast={toast} />}
        {tab === 'backup' && <BackupTab toast={toast} />}
        {tab === 'settings' && <SettingsTab storedKey={storedKey} setStoredKey={setStoredKey} toast={toast} />}
        <Text style={[s.label, { fontSize: 12, lineHeight: 18, marginTop: 6 }]}>Recomp is a training, nutrition and habits tool. Its targets come from standard formulas and your own logs; they are not medical advice.</Text>
      </ScrollView>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: 28, opacity: fade, alignItems: 'center' }}>
        {toastText && <View style={{ backgroundColor: c.ink, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 }}><Text style={{ color: c.paper, fontFamily: font.semibold, fontSize: 14 }}>{toastText}</Text></View>}
      </Animated.View>
    </SafeAreaView>
  );
}
