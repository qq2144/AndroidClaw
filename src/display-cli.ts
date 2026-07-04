// Standalone CLI for the display mode.
//   aclaw-display dim       — enter dim-black mode; writes snapshot to ~/.aclaw-display.json
//   aclaw-display restore   — restore prior settings using that snapshot
//   aclaw-display status    — print current relevant settings
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { enterDimBlack, restore, snapshot } from './device/display-mode.ts';

const SNAP_PATH = join(homedir(), '.aclaw-display.json');

async function main() {
  const cmd = process.argv[2] ?? 'status';
  switch (cmd) {
    case 'dim': {
      const prev = await enterDimBlack();
      writeFileSync(SNAP_PATH, JSON.stringify(prev, null, 2));
      console.log(JSON.stringify({ ok: true, mode: 'dim-black', snapshotAt: prev.takenAt, restoreFile: SNAP_PATH }, null, 2));
      return;
    }
    case 'restore': {
      if (!existsSync(SNAP_PATH)) {
        console.error(`no snapshot at ${SNAP_PATH}; manually run: settings put system screen_brightness <prev>`);
        process.exit(2);
      }
      const prev = JSON.parse(readFileSync(SNAP_PATH, 'utf8'));
      await restore(prev);
      console.log(JSON.stringify({ ok: true, restored: prev.takenAt }, null, 2));
      return;
    }
    case 'status': {
      const cur = await snapshot();
      console.log(JSON.stringify({ ok: true, current: cur.values }, null, 2));
      return;
    }
    default:
      console.error(`usage: aclaw-display <dim|restore|status>`);
      process.exit(2);
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
