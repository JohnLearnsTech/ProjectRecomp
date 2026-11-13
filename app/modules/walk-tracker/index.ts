// The live walk tracker (Android): a foreground service that counts steps from the phone's step
// counter while the walk timer runs and keeps a live notification. Null where it isn't built in.
import { requireOptionalNativeModule } from 'expo';

export type WalkState = { active: boolean; running: boolean; habitId: string; steps: number; elapsedMs: number };
type WalkTrackerModule = {
  hasStepSensor(): boolean;
  start(habitId: string, name: string, accumMs: number, steps: number): void;
  pause(): void;
  resume(): void;
  stop(): number;
  state(): WalkState;
  takeEvents(): string[];
};

export default requireOptionalNativeModule<WalkTrackerModule>('WalkTracker');
