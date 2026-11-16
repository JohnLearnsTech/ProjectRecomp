// How an exercise looks and what it works: two photos that alternate (start and end of the
// movement) and a front-and-back body diagram with the working muscles filled in.
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';
import { exInfo, muscleWords, REGION } from '../domain/exinfo';
import { font, mix, useTheme } from '../lib/theme';

/** Fetch the photos for a session ahead of time, so they are there in a gym with poor signal. */
export function prefetchExercises(names: string[]) {
  names.forEach((n) => exInfo(n).frames?.forEach((u) => { Image.prefetch(u).catch(() => {}); }));
}

/** The small picture on an exercise row; a plain tile when there is no photo. */
export function ExerciseThumb({ name, size = 46 }: { name: string; size?: number }) {
  const { c } = useTheme('train');
  const f = exInfo(name).frames;
  const [bad, setBad] = useState(false);
  return (
    <View style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: c.surface2, borderWidth: 1, borderColor: c.lineSoft }}>
      {f && !bad && <Image source={{ uri: f[1] }} style={{ width: size, height: size }} resizeMode="cover" onError={() => setBad(true)} accessibilityIgnoresInvertColors />}
    </View>
  );
}

function Frames({ frames, name }: { frames: [string, string]; name: string }) {
  const { c } = useTheme('train');
  const [i, setI] = useState(0), [play, setPlay] = useState(true), [bad, setBad] = useState(false);
  useEffect(() => { if (!play) return; const t = setInterval(() => setI((x) => 1 - x), 1100); return () => clearInterval(t); }, [play]);
  if (bad) return null;
  // Both frames stay mounted and only their opacity changes, so the swap never flashes.
  return (
    <Pressable onPress={() => setPlay(!play)} accessibilityLabel={`${name}: ${play ? 'pause' : 'play'} the demonstration`}
      style={{ aspectRatio: 1.5, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
      {frames.map((u, k) => <Image key={u} source={{ uri: u }} resizeMode="contain" onError={() => setBad(true)} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: k === i ? 1 : 0 }} />)}
      <View style={{ position: 'absolute', right: 8, bottom: 8, borderRadius: 999, backgroundColor: '#000000aa', paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 11, color: '#fff' }}>{play ? (i ? 'End' : 'Start') : 'Paused · tap to play'}</Text>
      </View>
      <View style={{ position: 'absolute', left: 8, bottom: 10, flexDirection: 'row', gap: 4 }}>
        {[0, 1].map((k) => <View key={k} style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: k === i ? c.cat.train.fill : '#ffffff66' }} />)}
      </View>
    </Pressable>
  );
}

export function ExerciseGuide({ name }: { name: string }) {
  const { c, s } = useTheme('train');
  const x = exInfo(name);
  const strong = c.cat.train.fill, light = mix(c.cat.train.fill, c.surface, 0.42);
  // Primary muscles at full colour, supporting ones lighter; a region both lists name stays primary.
  const parts = new Map<string, number>();
  x.secondary.forEach((m) => { if (REGION[m]) parts.set(REGION[m], 2); });
  x.primary.forEach((m) => { if (REGION[m]) parts.set(REGION[m], 1); });
  const data: ExtendedBodyPart[] = [...parts].map(([slug, intensity]) => ({ slug: slug as Slug, intensity }));
  const body = (side: 'front' | 'back') => (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Body data={data} side={side} gender="male" scale={0.62} colors={[strong, light]} border={c.line} defaultFill={c.surface2} />
      <Text style={{ fontFamily: font.regular, fontSize: 11, color: c.muted }}>{side === 'front' ? 'Front' : 'Back'}</Text>
    </View>
  );
  if (!x.frames && !data.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {x.frames && <Frames frames={x.frames} name={name} />}
      {x.frames && x.like && <Text style={[s.label, { marginTop: -4 }]}>Shown: {x.like}, a similar movement. Follow the notes for your version.</Text>}
      {data.length > 0 && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.lineSoft, backgroundColor: c.surface, padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>{body('front')}{body('back')}</View>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: strong }} />
              <Text style={[s.body2, { flex: 1 }]}><Text style={{ fontFamily: font.bold, color: c.ink }}>Works </Text>{muscleWords(x.primary)}</Text>
            </View>
            {x.secondary.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: light }} />
                <Text style={[s.body2, { flex: 1 }]}><Text style={{ fontFamily: font.bold, color: c.ink }}>Helps </Text>{muscleWords(x.secondary)}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
