import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { parseBackup, type ImportSummary } from '../domain/backup';
import * as db from './db';

/** Pick a recomp-backup-<date>.json and convert it. null = the person cancelled. */
export async function pickBackup() {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const text = Platform.OS === 'web' && a.file ? await a.file.text() : await new File(a.uri).text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error('That file is not a Recomp backup.'); }
  return { name: a.name, ...parseBackup(json) };
}
export type Picked = NonNullable<Awaited<ReturnType<typeof pickBackup>>>;

/** §17.5: compare what landed with what was sent. Returns the checks that differ. */
export function verifyImport(S: ImportSummary, R: Record<string, any>) {
  const bad: string[] = [];
  const eq = (label: string, a: unknown, b: unknown) => { if (a !== b) bad.push(`${label}: expected ${a}, got ${b}`); };
  eq('Days', S.days, R.days); eq('Food rows', S.foodRows, R.foodRows); eq('Calories in total', S.kcalSum, +R.kcalSum);
  eq('Sets', S.sets, R.sets); eq('Goals', S.goals, R.goals); eq('Reviews', S.reviews, R.reviews);
  eq('Latest weight', S.latestWeight?.kg ?? null, R.latestWeight ? +R.latestWeight.kg : null);
  Object.keys(S.setsByExercise).forEach((k) => eq(`Sets of ${k}`, S.setsByExercise[k], R.setsByExercise?.[k] ?? 0));
  Object.keys(S.habitValues).forEach((k) => eq(`Habit values for ${k}`, S.habitValues[k], R.habitValues?.[k] ?? 0));
  return bad;
}

export async function restore(p: Picked) {
  const R = await db.importBackup(p.payload);
  return verifyImport(p.summary, R);
}
