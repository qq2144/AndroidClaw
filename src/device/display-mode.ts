// Display-mode helpers — let the agent run while the screen LOOKS off but still renders to
// SurfaceFlinger (so screencap/uiautomator keep working). Pure root primitives; no Brain involvement.
//
// "dim-black" recipe:
//   1. Disable auto-brightness, set brightness to 0
//   2. Enable "reduce bright colors" (extra dim accessibility) at level 100 — on AMOLED this is
//      effectively black to the human eye, but Android still composites frames normally.
//   3. Pause auto-screen-off (large screen_off_timeout)
//   4. svc power stayon true (keeps screen state, plugged or not depending on platform)
//   5. termux-wake-lock to keep Termux process out of Doze
//
// On exit (or via `aclaw-display restore`), all five settings are reverted to whatever they were.
import { spawn } from 'node:child_process';

const KEYS = [
  ['system',  'screen_brightness_mode'],          // 0=manual, 1=auto
  ['system',  'screen_brightness'],               // 0..255
  ['system',  'screen_off_timeout'],              // ms
  ['secure',  'reduce_bright_colors_activated'],  // 0|1
  ['secure',  'reduce_bright_colors_level'],      // 0..100
] as const;

export interface DisplaySnapshot {
  values: Record<string, string>;
  takenAt: string;
}

async function runRoot(cmd: string, timeoutMs = 8000): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn('su', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (b) => out.push(b));
    p.on('error', reject);
    p.on('close', (code) => { clearTimeout(t); resolve({ stdout: Buffer.concat(out).toString('utf8').trim(), code: code ?? 0 }); });
  });
}

export async function snapshot(): Promise<DisplaySnapshot> {
  const values: Record<string, string> = {};
  for (const [ns, key] of KEYS) {
    const { stdout } = await runRoot(`settings get ${ns} ${key}`);
    values[`${ns}/${key}`] = stdout;
  }
  return { values, takenAt: new Date().toISOString() };
}

export async function enterDimBlack(): Promise<DisplaySnapshot> {
  const prev = await snapshot();
  // 1. Manual brightness, lowest
  await runRoot(`settings put system screen_brightness_mode 0`);
  await runRoot(`settings put system screen_brightness 0`);
  // 2. Extra dim
  await runRoot(`settings put secure reduce_bright_colors_activated 1`);
  await runRoot(`settings put secure reduce_bright_colors_level 100`);
  // 3. Don't auto-sleep
  await runRoot(`settings put system screen_off_timeout 86400000`);
  // 4. svc stayon
  await runRoot(`svc power stayon true`).catch(() => {});
  // 5. Termux wake lock (no-op if termux-api absent)
  await runRoot(`am startservice --user 0 -a com.termux.service_wake_lock com.termux/.app.TermuxService`).catch(() => {});
  return prev;
}

/** Keep the screen awake for the duration of a run (no dimming). Prevents 息屏 / auto-lock from
 *  interrupting a task mid-flight — the real cause of a "failed" run that had actually sent.
 *  Reuses restore() to revert (brightness keys in the snapshot are unchanged → restored as no-ops). */
export async function enterStayAwake(): Promise<DisplaySnapshot> {
  const prev = await snapshot();
  await runRoot(`input keyevent KEYCODE_WAKEUP`).catch(() => {});   // wake the screen if it was off
  await runRoot(`settings put system screen_off_timeout 86400000`); // no auto screen-off mid-run
  await runRoot(`svc power stayon true`).catch(() => {});           // stay on while charging (USB)
  await runRoot(`am startservice --user 0 -a com.termux.service_wake_lock com.termux/.app.TermuxService`).catch(() => {});
  return prev;
}

export async function restore(prev: DisplaySnapshot): Promise<void> {
  for (const [ns, key] of KEYS) {
    const v = prev.values[`${ns}/${key}`];
    if (!v || v === 'null') continue;
    await runRoot(`settings put ${ns} ${key} ${v}`);
  }
  await runRoot(`svc power stayon false`).catch(() => {});
  await runRoot(`am startservice --user 0 -a com.termux.service_wake_lock_release com.termux/.app.TermuxService`).catch(() => {});
}

export async function nudgeAwake(): Promise<void> {
  // For flash-wake mode: short tap on POWER, then back off. Not used by dim-black.
  await runRoot(`input keyevent KEYCODE_WAKEUP`);
}
