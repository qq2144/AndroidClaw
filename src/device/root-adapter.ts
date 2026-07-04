import { spawn } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DeviceAdapter, KeyName } from './types.ts';
import { KEYCODES } from './types.ts';
import { config } from '../config.ts';
import { parseTouchDevice, tapSequence, swipeSequence, type TouchDevice } from './evdev.ts';

const SDCARD_TMP = '/sdcard/aclaw';

export class RootDeviceAdapter implements DeviceAdapter {
  private touchDev: TouchDevice | null = null;
  private touchProbed = false;
  private screenW = 0;
  private screenH = 0;
  async screencap(outPath: string): Promise<string> {
    mkdirSync(dirname(outPath), { recursive: true });
    const remote = `${SDCARD_TMP}/screen-${Date.now()}.png`;
    await this.runRoot(`mkdir -p ${SDCARD_TMP} && screencap -p ${remote}`);
    await this.runRoot(`cat ${remote}`, { binaryToPath: outPath });
    await this.runRoot(`rm -f ${remote}`).catch(() => {});
    return outPath;
  }

  async uiDump(outPath: string): Promise<string> {
    mkdirSync(dirname(outPath), { recursive: true });
    const remote = `${SDCARD_TMP}/ui-${Date.now()}.xml`;
    await this.runRoot(`mkdir -p ${SDCARD_TMP} && uiautomator dump ${remote} >/dev/null`);
    const { stdout } = await this.runRoot(`cat ${remote}`);
    await this.runRoot(`rm -f ${remote}`).catch(() => {});
    const fs = await import('node:fs/promises');
    await fs.writeFile(outPath, stdout, 'utf8');
    return outPath;
  }

  async longPress(x: number, y: number, ms = 600) {
    // input swipe with same start/end coords + duration = long press
    await this.runRoot(`input swipe ${Math.round(x)} ${Math.round(y)} ${Math.round(x)} ${Math.round(y)} ${Math.round(ms)}`);
  }

  async tap(x: number, y: number) {
    if (config.device.useEvdev) {
      const dev = await this.ensureTouchDevice();
      if (dev) {
        const [tx, ty] = this.scaleToTouch(x, y, dev);
        await this.runRoot(tapSequence(dev.path, tx, ty).join(';'));
        return;
      }
    }
    await this.runRoot(`input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  async swipe(x1: number, y1: number, x2: number, y2: number, ms: number) {
    if (config.device.useEvdev) {
      const dev = await this.ensureTouchDevice();
      if (dev) {
        const [tx1, ty1] = this.scaleToTouch(x1, y1, dev);
        const [tx2, ty2] = this.scaleToTouch(x2, y2, dev);
        const steps = Math.max(8, Math.min(40, Math.round(ms / 12)));
        await this.runRoot(swipeSequence(dev.path, tx1, ty1, tx2, ty2, steps).join(';'));
        return;
      }
    }
    await this.runRoot(`input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${Math.round(ms)}`);
  }

  /** Inform adapter of current screen dims so evdev can scale UI-tree coords to touch coords. */
  setScreenSize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
  }

  private scaleToTouch(x: number, y: number, dev: TouchDevice): [number, number] {
    if (!this.screenW || !this.screenH) return [x, y];
    return [
      Math.round((x * dev.maxX) / this.screenW),
      Math.round((y * dev.maxY) / this.screenH),
    ];
  }

  private async ensureTouchDevice(): Promise<TouchDevice | null> {
    if (this.touchProbed) return this.touchDev;
    this.touchProbed = true;
    try {
      const { stdout } = await this.runRoot(`getevent -lp 2>&1`);
      this.touchDev = parseTouchDevice(stdout);
      if (this.touchDev) {
        console.error(`[evdev] touch device = ${this.touchDev.path} (${this.touchDev.name}) max=${this.touchDev.maxX}x${this.touchDev.maxY}`);
      } else {
        console.error('[evdev] no touch device found; falling back to `input tap`');
      }
    } catch (e: any) {
      console.error('[evdev] getevent failed; falling back to `input tap`:', e?.message);
    }
    return this.touchDev;
  }

  async inputText(text: string) {
    // Force ADBKeyBoard active before injecting — Chinese apps like WeChat auto-switch back
    // to the user's last-used pinyin IME the moment a chat input gets focus, which means our
    // ADB_INPUT broadcasts land in the wrong place (or get pinyin-converted into gibberish).
    await this.runRoot(`ime set com.android.adbkeyboard/.AdbIME`).catch(() => {});
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    await this.runRoot(`am broadcast -a ADB_INPUT_B64 --es msg '${b64}'`);
  }

  async submitImeAction() {
    // EditorInfo.IME_ACTION_SEND = 4. ADBKeyBoard forwards this to the focused input's
    // OnEditorActionListener, which for WeChat/Telegram/etc triggers sending the message.
    await this.runRoot(`am broadcast -a ADB_EDITOR_CODE --ei code 4 >/dev/null 2>&1`);
  }

  async pasteText(text: string) {
    // ColorOS / Android 15 stripped `cmd clipboard` shell, so we can't use the system clipboard.
    // Instead: force ADBKeyBoard active, let it settle, CLEAR the focused field, then inject.
    // This is "force-replace" semantics — clears any residual garbled text from prior IME issues.
    await this.runRoot(`ime set com.android.adbkeyboard/.AdbIME`).catch(() => {});
    await new Promise((r) => setTimeout(r, 250));
    await this.runRoot(`am broadcast -a ADB_CLEAR_TEXT >/dev/null 2>&1`).catch(() => {});
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    await this.runRoot(`am broadcast -a ADB_INPUT_B64 --es msg '${b64}'`);
  }

  async keyevent(name: KeyName) {
    await this.runRoot(`input keyevent ${KEYCODES[name]}`);
  }

  async launchApp(pkg: string) {
    // Force a clean stack: clear back to launcher Activity. Falls back to monkey if the launcher
    // intent fails (some apps don't expose .MAIN/LAUNCHER cleanly).
    const safe = pkg.replace(/[^a-zA-Z0-9._]/g, '');
    const r = await this.runRoot(`am start -W --activity-clear-task -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p ${safe} 2>&1`);
    if (!/Status: ok/i.test(r.stdout) && !/Activity: /i.test(r.stdout)) {
      await this.runRoot(`monkey -p ${safe} -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1`);
    }
  }

  private cachedScreenSize: { w: number; h: number } | null = null;
  async screenSize(): Promise<{ w: number; h: number }> {
    if (this.cachedScreenSize) return this.cachedScreenSize;
    const { stdout } = await this.runRoot(`wm size`);
    // Output: "Physical size: 1216x2640\nOverride size: 1216x2640" (override line optional)
    const m = stdout.match(/(?:Override|Physical) size:\s*(\d+)x(\d+)/);
    if (!m) throw new Error(`Could not parse wm size: ${stdout}`);
    this.cachedScreenSize = { w: Number(m[1]), h: Number(m[2]) };
    return this.cachedScreenSize;
  }

  async foregroundPackage(): Promise<string> {
    const { stdout } = await this.runRoot(`dumpsys activity activities | grep -E 'topResumedActivity|ResumedActivity=' | head -1`);
    const m = stdout.match(/([a-zA-Z0-9_.]+)\/[a-zA-Z0-9_.]+/);
    return m?.[1] ?? '';
  }

  async amStart(args: string[]): Promise<string> {
    const safe = args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
    const { stdout } = await this.runRoot(`am start ${safe}`);
    return stdout;
  }

  async shell(cmd: string, opts: { asRoot?: boolean; timeoutMs?: number } = {}) {
    return opts.asRoot ? this.runRoot(cmd, { timeoutMs: opts.timeoutMs }) : this.runUser(cmd, { timeoutMs: opts.timeoutMs });
  }

  private runUser(cmd: string, opts: { timeoutMs?: number } = {}) {
    return runShell('sh', ['-c', cmd], opts);
  }

  private runRoot(cmd: string, opts: { timeoutMs?: number; binaryToPath?: string } = {}) {
    return runShell('su', ['-c', cmd], opts);
  }
}

function runShell(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number; binaryToPath?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) timer = setTimeout(() => proc.kill('SIGKILL'), opts.timeoutMs);
    proc.stdout.on('data', (b) => stdoutChunks.push(b));
    proc.stderr.on('data', (b) => stderrChunks.push(b));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const out = Buffer.concat(stdoutChunks);
      if (opts.binaryToPath) {
        import('node:fs').then(({ writeFileSync }) => {
          writeFileSync(opts.binaryToPath!, out);
          resolve({ stdout: '', stderr: Buffer.concat(stderrChunks).toString('utf8'), code: code ?? 0 });
        }).catch(reject);
      } else {
        resolve({
          stdout: out.toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          code: code ?? 0,
        });
      }
    });
  });
}
