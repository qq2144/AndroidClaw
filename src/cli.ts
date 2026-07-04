#!/usr/bin/env -S node --experimental-strip-types
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { RootDeviceAdapter } from './device/root-adapter.ts';
import { makeBrain } from './agent/brain-factory.ts';
import { ApprovalPolicy } from './safety/approval.ts';
import { TurnLoop } from './agent/turn-loop.ts';
import { enterDimBlack, enterStayAwake, restore as restoreDisplay, type DisplaySnapshot } from './device/display-mode.ts';

async function main() {
  const goal = process.argv.slice(2).join(' ').trim();
  if (!goal) {
    console.error('Usage: aclaw <goal description>');
    console.error('Example: aclaw "open Termux and read the prompt"');
    process.exit(2);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const device = new RootDeviceAdapter();
  const brain = await makeBrain();
  console.error(`[aclaw] brain=${brain.name}`);
  const mode = (process.env.ACLAW_APPROVAL ?? 'on-request') as 'unless-trusted' | 'on-request' | 'never';
  const auto = process.env.ACLAW_AUTO_APPROVE; // 'session' | 'approve' | undefined
  const approval = new ApprovalPolicy(mode);
  console.error(`[aclaw] approval=${mode}${auto ? ` auto=${auto}` : ''}`);
  const loop = new TurnLoop(device, brain, approval, {
    onApproval: async (reason) => {
      if (auto === 'session') { console.error(`[approval auto-session] ${reason}`); return 'approve_for_session'; }
      if (auto === 'approve') { console.error(`[approval auto-approve] ${reason}`); return 'approve'; }
      const ans = (await rl.question(`[approval] ${reason}\n  (y)es / (s)ession / (n)o: `)).trim().toLowerCase();
      if (ans.startsWith('s')) return 'approve_for_session';
      if (ans.startsWith('y')) return 'approve';
      return 'deny';
    },
    onAsk: async (q) => (await rl.question(`[agent] ${q}\n> `)).trim(),
  });

  let displaySnap: DisplaySnapshot | null = null;
  try {
    if (process.env.ACLAW_DIM_BLACK === '1') {
      console.error('[aclaw] entering dim-black display mode (includes stay-awake)');
      displaySnap = await enterDimBlack();
    } else if (process.env.ACLAW_STAY_AWAKE !== '0') {
      console.error('[aclaw] keeping screen awake for the run');
      displaySnap = await enterStayAwake();
    }
  } catch (e) {
    console.error('[aclaw] stay-awake setup failed (continuing without it):', e);
  }
  try {
    const res = await loop.run(goal);
    console.log(JSON.stringify(res, null, 2));
  } finally {
    if (displaySnap) {
      console.error('[aclaw] restoring display settings');
      try { await restoreDisplay(displaySnap); } catch (e) { console.error('[aclaw] restore failed:', e); }
    }
    rl.close();
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
