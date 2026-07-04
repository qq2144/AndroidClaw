// evdev tap via sendevent — bypasses InputManager (faster + indistinguishable from real touch
// to userspace apps). Type-B multi-touch protocol (Android 4.0+, the standard since 2013).
//
// Input event codes:
//   EV_SYN=0  EV_KEY=1  EV_ABS=3
//   ABS_MT_SLOT=47  ABS_MT_POSITION_X=53  ABS_MT_POSITION_Y=54  ABS_MT_TRACKING_ID=57
//   BTN_TOUCH=330  SYN_REPORT=0

export interface TouchDevice {
  path: string;       // /dev/input/eventN
  maxX: number;
  maxY: number;
  name: string;
}

/** Parse `getevent -lp` output to find a touchscreen device. */
export function parseTouchDevice(geteventOutput: string): TouchDevice | null {
  // Split into per-device blocks. A block starts with "add device N: /dev/input/eventM"
  const blocks = geteventOutput.split(/^add device \d+:\s*/m).slice(1);
  for (const block of blocks) {
    const pathMatch = block.match(/^(\/dev\/input\/event\d+)/);
    if (!pathMatch) continue;
    const path = pathMatch[1]!;
    const nameMatch = block.match(/name:\s*"([^"]+)"/);
    const name = nameMatch?.[1] ?? '';
    const xMatch = block.match(/ABS_MT_POSITION_X[^\n]*max\s+(\d+)/);
    const yMatch = block.match(/ABS_MT_POSITION_Y[^\n]*max\s+(\d+)/);
    if (xMatch && yMatch) {
      return { path, maxX: Number(xMatch[1]), maxY: Number(yMatch[1]), name };
    }
  }
  return null;
}

/** Build the sendevent command sequence for a single tap at (x, y). */
export function tapSequence(dev: string, x: number, y: number, trackingId = 99): string[] {
  const X = Math.round(x);
  const Y = Math.round(y);
  return [
    `sendevent ${dev} 3 47 0`,           // ABS_MT_SLOT 0
    `sendevent ${dev} 3 57 ${trackingId}`,// ABS_MT_TRACKING_ID
    `sendevent ${dev} 3 53 ${X}`,        // ABS_MT_POSITION_X
    `sendevent ${dev} 3 54 ${Y}`,        // ABS_MT_POSITION_Y
    `sendevent ${dev} 1 330 1`,          // BTN_TOUCH down
    `sendevent ${dev} 0 0 0`,            // SYN_REPORT
    `sendevent ${dev} 3 57 -1`,          // tracking id -1 = finger up
    `sendevent ${dev} 1 330 0`,          // BTN_TOUCH up
    `sendevent ${dev} 0 0 0`,            // SYN_REPORT
  ];
}

/** Multi-step linear swipe sequence (Type B). */
export function swipeSequence(
  dev: string,
  x1: number, y1: number, x2: number, y2: number,
  steps = 20,
  trackingId = 99,
): string[] {
  const cmds: string[] = [];
  cmds.push(`sendevent ${dev} 3 47 0`);
  cmds.push(`sendevent ${dev} 3 57 ${trackingId}`);
  cmds.push(`sendevent ${dev} 3 53 ${Math.round(x1)}`);
  cmds.push(`sendevent ${dev} 3 54 ${Math.round(y1)}`);
  cmds.push(`sendevent ${dev} 1 330 1`);
  cmds.push(`sendevent ${dev} 0 0 0`);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    cmds.push(`sendevent ${dev} 3 53 ${x}`);
    cmds.push(`sendevent ${dev} 3 54 ${y}`);
    cmds.push(`sendevent ${dev} 0 0 0`);
  }
  cmds.push(`sendevent ${dev} 3 57 -1`);
  cmds.push(`sendevent ${dev} 1 330 0`);
  cmds.push(`sendevent ${dev} 0 0 0`);
  return cmds;
}
