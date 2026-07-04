import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import type { DeviceAdapter } from '../device/types.ts';
import { perceive, findElement } from '../perception/perceive.ts';
import { centerOf } from '../perception/types.ts';
import type { Observation } from '../perception/types.ts';
import type { Brain, BrainContext, HistoryEntry } from './brain.ts';
import type { ActionInput } from './tools.ts';
import { verifyAction } from './verify.ts';
import { ApprovalPolicy } from '../safety/approval.ts';
import { RolloutLog } from '../memory/rollout.ts';
import { config } from '../config.ts';

type ApprovalHook = (reason: string) => Promise<'approve' | 'approve_for_session' | 'deny'>;
type AskUserHook = (q: string) => Promise<string>;

export interface RunResult {
  status: 'finished' | 'aborted' | 'max_steps' | 'error' | 'asked';
  detail?: string;
  steps: number;
  totalInTokens: number;
  totalOutTokens: number;
  rolloutPath: string;
}

export class TurnLoop {
  private active = false;
  constructor(
    private device: DeviceAdapter,
    private brain: Brain,
    private approval: ApprovalPolicy,
    private hooks: { onApproval: ApprovalHook; onAsk: AskUserHook },
  ) {}

  async run(goal: string): Promise<RunResult> {
    if (this.active) throw new Error('TurnLoop already active — single active turn enforced.');
    this.active = true;
    const threadId = randomUUID().slice(0, 8);
    const log = new RolloutLog(config.rolloutDir, threadId);
    log.write({
      type: 'session_meta',
      payload: {
        threadId,
        startedAt: new Date().toISOString(),
        model: `${this.brain.name}:${
          this.brain.name === 'gemini' ? config.gemini.model :
          this.brain.name === 'qwen'   ? config.qwen.model :
                                         config.anthropic.model
        }`,
        device: 'root-adapter',
        cwd: process.cwd(),
      },
    });
    log.write({ type: 'turn_start', payload: { goal, turnId: threadId } });

    const ctx: BrainContext = { goal, history: [], memory: {} };
    let step = 0;
    let totalIn = 0;
    let totalOut = 0;
    let lastObsKey = '';
    let lastAction: ActionInput | null = null;
    let stuckCount = 0;

    try {
      while (step < config.turn.maxSteps) {
        step++;
        const stepDir = log.stepDir(step);
        const obs = await perceive(this.device, step, stepDir);
        // Pass screen dims to adapters that can use them (e.g. evdev coord scaling).
        if (typeof (this.device as any).setScreenSize === 'function') {
          (this.device as any).setScreenSize(obs.screenWidth, obs.screenHeight);
        }
        log.observation(obs);

        // PNG byte size is a cheap visual-change fingerprint — covers vision-only mode
        // where elements list is empty for the whole task (WeChat / Alipay / Flutter).
        let pngSize = 0;
        try { pngSize = statSync(obs.screenshotPath).size; } catch { /* ignore */ }
        const obsKey = `${obs.currentPackage}|${obs.elements.length}|${obs.elements.slice(0, 5).map((e) => e.text || e.desc).join('§')}|${pngSize}`;
        const screenChanged = lastObsKey === '' || obsKey !== lastObsKey;
        // Verify the PREVIOUS action now that its on-screen effect is visible; surface a warning
        // into history so the model won't blindly repeat an action that did nothing (task-A wobble).
        if (lastAction) {
          const v = verifyAction(lastAction, screenChanged, obs);
          const h = ctx.history[ctx.history.length - 1];
          if (!v.ok && v.note && h && !h.result.includes('⚠')) {
            h.result += ` ⚠ ${v.note}`;
            log.write({ type: 'result', payload: { step: step - 1, ok: false, detail: `verify: ${v.note}` } });
          }
        }
        if (obsKey === lastObsKey) stuckCount++; else stuckCount = 0;
        lastObsKey = obsKey;
        if (stuckCount >= config.turn.stuckThreshold) {
          log.write({ type: 'turn_end', payload: { reason: 'stuck', steps: step, totalInTokens: totalIn, totalOutTokens: totalOut } });
          return { status: 'aborted', detail: `stuck on same screen ${stuckCount} steps`, steps: step, totalInTokens: totalIn, totalOutTokens: totalOut, rolloutPath: log.path };
        }

        const decision = await withTimeout(
          this.brain.decide(ctx, obs),
          config.turn.stepTimeoutMs,
          'brain.decide timed out',
        );
        totalIn += decision.inputTokens;
        totalOut += decision.outputTokens;
        log.write({
          type: 'model_io',
          payload: { step, inputTokens: decision.inputTokens, outputTokens: decision.outputTokens, rawId: decision.rawId },
        });
        log.write({ type: 'action', payload: { step, action: decision.action } });

        const apr = this.approval.evaluate(decision.action, obs);
        if (apr.needs) {
          const verdict = await this.hooks.onApproval(apr.reason ?? 'unspecified');
          log.write({
            type: 'approval',
            payload: { step, reason: apr.reason ?? 'unspecified', decision: verdict === 'approve' ? 'approved' : verdict === 'approve_for_session' ? 'approved_for_session' : 'denied' },
          });
          if (verdict === 'deny') {
            ctx.history.push({ step, currentPackage: obs.currentPackage, action: decision.action, result: 'denied by user' });
            continue;
          }
          if (verdict === 'approve_for_session') this.approval.approveKey(obs, decision.action);
        }

        const result = await this.execute(decision.action, obs, ctx);
        log.write({ type: 'result', payload: { step, ok: result.ok, detail: result.detail } });
        ctx.history.push({ step, currentPackage: obs.currentPackage, action: decision.action, result: result.detail ?? (result.ok ? 'ok' : 'failed') });
        lastAction = decision.action;

        if (decision.action.name === 'finish') {
          log.write({ type: 'turn_end', payload: { reason: 'finish', finishSummary: decision.action.input.summary, steps: step, totalInTokens: totalIn, totalOutTokens: totalOut } });
          return { status: 'finished', detail: decision.action.input.summary, steps: step, totalInTokens: totalIn, totalOutTokens: totalOut, rolloutPath: log.path };
        }
        if (decision.action.name === 'ask_user') {
          const answer = await this.hooks.onAsk(decision.action.input.question);
          ctx.history.push({ step, currentPackage: obs.currentPackage, action: { name: 'remember', input: { key: 'user_answer', value: answer } } as ActionInput, result: 'answered' });
          ctx.memory['user_answer'] = answer;
        }
      }
      log.write({ type: 'turn_end', payload: { reason: 'max_steps', steps: step, totalInTokens: totalIn, totalOutTokens: totalOut } });
      return { status: 'max_steps', steps: step, totalInTokens: totalIn, totalOutTokens: totalOut, rolloutPath: log.path };
    } catch (e: any) {
      log.write({ type: 'turn_end', payload: { reason: `error: ${e?.message ?? e}`, steps: step, totalInTokens: totalIn, totalOutTokens: totalOut } });
      return { status: 'error', detail: String(e?.message ?? e), steps: step, totalInTokens: totalIn, totalOutTokens: totalOut, rolloutPath: log.path };
    } finally {
      log.close();
      this.active = false;
    }
  }

  private async execute(action: ActionInput, obs: Observation, ctx: BrainContext): Promise<{ ok: boolean; detail?: string }> {
    switch (action.name) {
      case 'tap': {
        const el = findElement(obs, action.input.id);
        if (!el) return { ok: false, detail: `no element #${action.input.id}` };
        const [x, y] = centerOf(el.bounds);
        await this.device.tap(x, y);
        return { ok: true, detail: `tapped #${el.id} ${JSON.stringify((el.text || el.desc).slice(0, 30))}` };
      }
      case 'tap_xy': {
        const { x, y } = action.input;
        if (obs.screenWidth && (x < 0 || x > obs.screenWidth || y < 0 || y > obs.screenHeight)) {
          return { ok: false, detail: `(${x},${y}) outside screen ${obs.screenWidth}x${obs.screenHeight}` };
        }
        await this.device.tap(x, y);
        return { ok: true, detail: `tapped raw (${x},${y})` };
      }
      case 'swipe': {
        // dir = direction the PAGE CONTENT moves (intuitive scroll semantics).
        //   'down' = reveal content lower in the list = finger swipes UP physically.
        //   'up'   = reveal content higher = finger swipes DOWN physically.
        const cx = obs.screenWidth / 2;
        const cy = obs.screenHeight / 2;
        const span = Math.min(obs.screenWidth, obs.screenHeight) * 0.35;
        const moves: Record<typeof action.input.dir, [number, number, number, number]> = {
          down:  [cx, cy + span, cx, cy - span], // finger up  → page scrolls down (more below)
          up:    [cx, cy - span, cx, cy + span], // finger down → page scrolls up   (more above)
          left:  [cx + span, cy, cx - span, cy],
          right: [cx - span, cy, cx + span, cy],
        };
        const [x1, y1, x2, y2] = moves[action.input.dir];
        await this.device.swipe(x1, y1, x2, y2, 250);
        return { ok: true };
      }
      case 'type_text':
        await this.device.inputText(action.input.text);
        return { ok: true, detail: `typed ${action.input.text.length} chars (via ADBKeyBoard, force-set IME)` };
      case 'paste_text':
        if (typeof this.device.pasteText !== 'function') {
          return { ok: false, detail: 'paste_text not supported by this DeviceAdapter' };
        }
        await this.device.pasteText(action.input.text);
        return { ok: true, detail: `pasted ${action.input.text.length} chars (ADBKeyBoard CLEAR+INPUT)` };
      case 'submit':
        if (typeof this.device.submitImeAction !== 'function') {
          return { ok: false, detail: 'submit not supported by this DeviceAdapter' };
        }
        await this.device.submitImeAction();
        return { ok: true, detail: 'fired IME_ACTION_SEND (ADB_EDITOR_CODE 4)' };
      case 'long_press': {
        let x: number, y: number;
        if (typeof action.input.id === 'number') {
          const el = findElement(obs, action.input.id);
          if (!el) return { ok: false, detail: `no element #${action.input.id}` };
          [x, y] = centerOf(el.bounds);
        } else if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
          x = action.input.x; y = action.input.y;
        } else {
          return { ok: false, detail: 'long_press needs id or (x,y)' };
        }
        const ms = action.input.ms ?? 600;
        if (typeof this.device.longPress === 'function') {
          await this.device.longPress(x, y, ms);
        } else {
          await this.device.swipe(x, y, x, y, ms);
        }
        return { ok: true, detail: `long-pressed (${x},${y}) for ${ms}ms` };
      }
      case 'key':
        await this.device.keyevent(action.input.name);
        return { ok: true };
      case 'launch_app':
        await this.device.launchApp(action.input.pkg);
        // poll until foreground (up to 4s)
        for (let i = 0; i < 8; i++) {
          await wait(500);
          const fg = await this.device.foregroundPackage();
          if (fg === action.input.pkg) return { ok: true, detail: `foreground=${fg}` };
        }
        return { ok: false, detail: `launched but foreground != ${action.input.pkg}` };
      case 'wait':
        await wait(action.input.ms);
        return { ok: true };
      case 'remember':
        ctx.memory[action.input.key] = action.input.value;
        return { ok: true, detail: `remembered ${action.input.key} (${action.input.value.length} chars)` };
      case 'finish':
        return { ok: true };
      case 'ask_user':
        return { ok: true };
      default:
        // Model invented a tool that doesn't exist in our schema. Don't crash — report back.
        return { ok: false, detail: `unknown tool: ${(action as any)?.name}` };
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
