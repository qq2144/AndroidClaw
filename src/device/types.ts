export interface DeviceAdapter {
  screencap(outPath: string): Promise<string>;
  uiDump(outPath: string): Promise<string>;
  tap(x: number, y: number): Promise<void>;
  longPress?(x: number, y: number, ms?: number): Promise<void>;
  swipe(x1: number, y1: number, x2: number, y2: number, ms: number): Promise<void>;
  inputText(text: string): Promise<void>;
  pasteText?(text: string): Promise<void>;
  submitImeAction?(): Promise<void>;
  keyevent(name: KeyName): Promise<void>;
  launchApp(pkg: string): Promise<void>;
  foregroundPackage(): Promise<string>;
  amStart(args: string[]): Promise<string>;
  shell(cmd: string, opts?: { asRoot?: boolean; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; code: number }>;
}

export type KeyName = 'BACK' | 'HOME' | 'APP_SWITCH' | 'ENTER' | 'DEL';

export const KEYCODES: Record<KeyName, number> = {
  BACK: 4,
  HOME: 3,
  APP_SWITCH: 187,
  ENTER: 66,
  DEL: 67,
};
