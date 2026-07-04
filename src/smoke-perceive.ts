// Smoke test — exercises device + perception + rollout layers without the LLM.
// Run on phone:  cd ~/aclaw && node --experimental-strip-types src/smoke-perceive.ts
import { RootDeviceAdapter } from './device/root-adapter.ts';
import { perceive } from './perception/perceive.ts';
import { RolloutLog } from './memory/rollout.ts';
import { config } from './config.ts';

async function main() {
  const device = new RootDeviceAdapter();
  const log = new RolloutLog(config.rolloutDir, 'smoke');
  const t0 = Date.now();
  const obs = await perceive(device, 1, log.stepDir(1));
  const ms = Date.now() - t0;
  log.observation(obs);
  console.log(JSON.stringify({
    ok: true,
    elapsedMs: ms,
    currentPackage: obs.currentPackage,
    screen: `${obs.screenWidth}x${obs.screenHeight}`,
    elementCount: obs.elements.length,
    sample: obs.elements.slice(0, 8).map((e) => ({
      id: e.id,
      label: (e.text || e.desc).slice(0, 40),
      flags: [e.clickable && 'click', e.editable && 'edit', e.scrollable && 'scroll'].filter(Boolean).join(','),
    })),
    rolloutPath: log.path,
  }, null, 2));
  log.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
