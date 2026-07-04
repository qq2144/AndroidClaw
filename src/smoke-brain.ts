// Smoke — exercises Brain.decide() against current screen, ONE call. No TurnLoop.
import { RootDeviceAdapter } from './device/root-adapter.ts';
import { perceive } from './perception/perceive.ts';
import { RolloutLog } from './memory/rollout.ts';
import { makeBrain } from './agent/brain-factory.ts';
import { config } from './config.ts';

async function main() {
  const goal = process.argv.slice(2).join(' ').trim() || 'Determine the current foreground app and immediately call finish with that information.';
  const device = new RootDeviceAdapter();
  const log = new RolloutLog(config.rolloutDir, 'brainsmoke');
  const t0 = Date.now();
  const obs = await perceive(device, 1, log.stepDir(1));
  const tPerceive = Date.now() - t0;
  const brain = await makeBrain();
  const tBrainStart = Date.now();
  const decision = await brain.decide(
    { goal, history: [], memory: {} },
    obs,
  );
  const tBrain = Date.now() - tBrainStart;
  console.log(JSON.stringify({
    ok: true,
    brain: brain.name,
    perceiveMs: tPerceive,
    brainMs: tBrain,
    currentPackage: obs.currentPackage,
    elementCount: obs.elements.length,
    action: decision.action,
    inputTokens: decision.inputTokens,
    outputTokens: decision.outputTokens,
    rolloutPath: log.path,
  }, null, 2));
  log.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
