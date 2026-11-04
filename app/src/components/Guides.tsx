// r19's guide panels (tp-eat on Food, tp-train on Train, tp-rules on Progress), text verbatim.
import { Linking, Pressable, Text, View } from 'react-native';
import mobPost from '../domain/data/mobPost.json';
import mobPre from '../domain/data/mobPre.json';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';
import { Icon } from './Icon';
import { Fold } from './ui';

type Block = { h: string; p?: string[]; li?: (string | [string, string])[]; extra?: 'sessions' | 'mob' };
const EAT: Block[] = [
  { h: 'Protein first', p: ['Protein keeps your muscle while you lose fat, and it keeps you full. Eat it first at every meal so it is gone before you fill up. Most people do well on 1.6 to 2.2 g per kg of a healthy body weight; your number is set under Me.'] },
  { h: 'How the food log works', p: ['Type what you ate in plain words with amounts, one meal at a time. Common foods resolve instantly from a built-in table, and those numbers never drift. Anything else is estimated by Claude and tagged estimate. Correct any row and Recomp uses your numbers from then on.',
    'A small, consistent error still shows the trend. Numbers that change every time you log the same food do not, which is why the log never re-guesses a food you have corrected.'] },
  { h: 'Eating out', li: ['Grilled or tandoori protein beats anything in a gravy. Gravies hide 200 to 400 kcal of oil and cream.', 'One bread or one portion of rice, not several.',
    'Alcohol is 7 kcal a gram. If you drink, take it out of that day’s carbs, never your protein.', 'A meal you cannot weigh: log your best guess plus 20%.'] },
  { h: 'After a big meal', p: ['Log it honestly and go back to your normal targets the next day. Eating far less to make up for it is how the cycle starts.'] },
];
const TRAIN: Block[] = [
  { h: 'Your sessions', p: ['Every session in your plan, with how to do each movement. The play icon opens a video search for it.'], extra: 'sessions' },
  { h: 'How to progress', p: ['Stay at a load until you reach the top of the rep range on every set, then add a small step of weight and start again at the bottom. With no weight to add, use these in order: more reps, a slower three-second lowering, a bigger range, shorter rest. Session mode suggests the next step for you.'] },
  { h: 'Warm up moving, stretch held', p: ['Moving stretches before you lift warm the tissue and open the ranges the session uses. Long held stretches go after the session or on rest days; held right before a heavy set they slightly reduce how much force you can produce.'], extra: 'mob' },
  { h: 'Cardio and steps', li: [['Zone 2', ' is a pace where you could talk but would rather not. It builds the engine without eating into recovery.'], ['Steps', ' are the quiet engine of fat loss. Ten minutes of walking after a meal also blunts the blood sugar rise.'], ['Intervals', ' are a once-a-week tool, never the day before or after hard leg work.']] },
  { h: 'Sleep is training', p: ['Seven to eight hours, at roughly the same times. Short sleep in a calorie deficit shifts the loss toward muscle, raises hunger and makes the rest of the plan harder. If it is an early session or an hour of sleep, take the sleep.'] },
];
const RULES: Block[] = [
  { h: 'How to read the scale', p: ['Weigh in the morning, after the bathroom, before food or water. Then ignore the single number: compare this week’s seven-day average with the one from two weeks ago. Daily swings of 1 to 2 kg from salt, carbs and water are normal.'] },
  { h: 'When to adjust', p: ['If the seven-day average has not moved for two weeks and your logging is honest, change one thing: about 150 kcal less, or 1,500 more steps a day. Then wait two weeks. Never cut protein, and never go below your calorie floor. The weekly review applies this rule for you.'] },
  { h: 'What tracks progress', li: ['The seven-day average weight.', 'Your waist at the navel, once a week, same spot.', 'Photos every four weeks, same light and place.', 'Strength on the first lift of each session. Rising strength with falling weight means the loss is fat.', 'How your clothes fit.'] },
  { h: 'When the week goes wrong', li: [['Missed a session:', ' do it on the next open day. Don’t double up.'], ['Missed a whole week:', ' restart the same phase, drop the loads 10%, carry on.'], ['Off-plan meal:', ' log it and return to your targets tomorrow.'], ['Ill:', ' fluids first, then protein, then everything else. Training waits.']] },
];

/** r19 refCard: a fold listing exercises with sets and the how-to, each with a video search. */
function RefCard({ title, list }: { title: string; list: string[] }) {
  const { c } = useTheme();
  return (
    <Fold title={title}>
      {list.map((r, i) => {
        const [n, m, how] = r.split('|');
        return (
          <View key={i} style={{ gap: 3, paddingTop: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, borderStyle: 'dotted' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 13.5, color: c.ink }}>{n}</Text>
              <Pressable onPress={() => Linking.openURL('https://www.youtube.com/results?search_query=' + encodeURIComponent(n + ' exercise form'))} accessibilityLabel={`Watch how: ${n}`} hitSlop={8}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="play" size={11} color={c.cat.train.fill} />
              </Pressable>
            </View>
            <Text style={{ fontFamily: font.regular, fontSize: 11.5, color: c.muted }}>{m}</Text>
            {!!how && <Text style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: c.ink2 }}>{how}</Text>}
          </View>
        );
      })}
    </Fold>
  );
}

function Sessions() {
  const { engine } = useRecomp();
  const { PL } = engine;
  const usedIn = (k: string) => {
    const ph = PL.phases.map((p, i) => (p.weeks.some((w) => w.some((sl) => sl.t === 'lift' && sl.s === k)) ? i + 1 : 0)).filter(Boolean);
    return ph.length ? 'Phase' + (ph.length > 1 ? 's ' : ' ') + ph.join(' & ') : 'not scheduled';
  };
  const keys = Object.keys(PL.programs).sort((a, b) => (PL.programs[a].kit === 'gym' ? 1 : 0) - (PL.programs[b].kit === 'gym' ? 1 : 0));
  return <View style={{ gap: 8 }}>{keys.map((k) => <RefCard key={k} title={`${PL.programs[k].name} · ${usedIn(k)}`} list={PL.programs[k].ex} />)}</View>;
}

export function Guides({ kind }: { kind: 'eat' | 'train' | 'rules' }) {
  const { c, s } = useTheme();
  const blocks = kind === 'eat' ? EAT : kind === 'train' ? TRAIN : RULES;
  return (
    <View style={[s.card, { gap: 10 }]}>
      {blocks.map((b) => (
        <Fold key={b.h} title={b.h} big>
          {b.p?.map((t, i) => <Text key={i} style={{ fontFamily: font.regular, fontSize: 14.5, lineHeight: 22, color: c.ink2 }}>{t}</Text>)}
          {b.li?.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: c.muted, fontSize: 14.5 }}>•</Text>
              <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 14.5, lineHeight: 22, color: c.ink2 }}>
                {typeof t === 'string' ? t : <><Text style={{ fontFamily: font.bold, color: c.ink }}>{t[0]}</Text>{t[1]}</>}
              </Text>
            </View>
          ))}
          {b.extra === 'sessions' && <Sessions />}
          {b.extra === 'mob' && <View style={{ gap: 8 }}><RefCard title="Before lifting · 5 min, moving" list={mobPre as string[]} /><RefCard title="After lifting, or rest days · 8 min, held" list={mobPost as string[]} /></View>}
        </Fold>
      ))}
    </View>
  );
}
