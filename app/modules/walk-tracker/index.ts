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
  /** Today's numbers for the native home screen widgets, as JSON. */
  setWidgetData(json: string): void;
  /** Calibration: count raw sensor steps while the person walks a counted number. */
  calStart(): boolean;
  calSteps(): number;
  calStop(): number;
  getFactor(): number;
  setFactor(f: number): void;
};

export default requireOptionalNativeModule<WalkTrackerModule>('WalkTracker');
