// Validate enterStayAwake/restore toggles screen_off_timeout on the real device.
//   node --experimental-strip-types src/smoke-stayawake.ts
import { enterStayAwake, restore, snapshot } from './device/display-mode.ts';

async function main() {
  const k = 'system/screen_off_timeout';
  const before = (await snapshot()).values[k];
  const snap = await enterStayAwake();
  const during = (await snapshot()).values[k];
  await restore(snap);
  const after = (await snapshot()).values[k];
  console.log(JSON.stringify({ before, during, after, ok: during === '86400000' && after === before }, null, 2));
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
