import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import type { Observation } from '../perception/types.ts';
import type { ActionInput } from '../agent/tools.ts';

export type RolloutItem =
  | { type: 'session_meta'; payload: SessionMeta }
  | { type: 'turn_start'; payload: { goal: string; turnId: string } }
  | { type: 'observation'; payload: ObservationLine }
  | { type: 'model_io'; payload: { step: number; inputTokens: number; outputTokens: number; rawId: string } }
  | { type: 'action'; payload: { step: number; action: ActionInput } }
  | { type: 'result'; payload: { step: number; ok: boolean; detail?: string } }
  | { type: 'approval'; payload: { step: number; reason: string; decision: 'approved' | 'denied' | 'approved_for_session' } }
  | { type: 'turn_end'; payload: { reason: string; finishSummary?: string; steps: number; totalInTokens: number; totalOutTokens: number } };

export interface SessionMeta {
  threadId: string;
  startedAt: string;
  model: string;
  device: string;
  cwd: string;
}

export interface ObservationLine {
  step: number;
  currentPackage: string;
  screenWidth: number;
  screenHeight: number;
  elementCount: number;
  screenshotPath: string;
  uiXmlPath: string;
}

export class RolloutLog {
  private stream: WriteStream;
  readonly dir: string;
  readonly path: string;

  constructor(rolloutDir: string, threadId: string) {
    const today = new Date().toISOString().slice(0, 10);
    this.dir = join(rolloutDir, today, threadId);
    mkdirSync(this.dir, { recursive: true });
    this.path = join(this.dir, 'rollout.jsonl');
    this.stream = createWriteStream(this.path, { flags: 'a' });
  }

  stepDir(step: number): string {
    const sub = join(this.dir, `step-${String(step).padStart(3, '0')}`);
    mkdirSync(sub, { recursive: true });
    return sub;
  }

  write(item: RolloutItem) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...item }) + '\n';
    this.stream.write(line);
  }

  observation(obs: Observation) {
    this.write({
      type: 'observation',
      payload: {
        step: obs.step,
        currentPackage: obs.currentPackage,
        screenWidth: obs.screenWidth,
        screenHeight: obs.screenHeight,
        elementCount: obs.elements.length,
        screenshotPath: obs.screenshotPath,
        uiXmlPath: obs.uiXmlPath,
        source: obs.source,
        ocrMs: obs.ocrMs,
      },
    });
  }

  close() {
    this.stream.end();
  }
}
