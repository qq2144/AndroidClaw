// Standalone OCR smoke — run on phone:
//   npx tsx src/smoke-ocr.ts smoke/wechat-bench.png
import { runOcr } from './perception/ocr.ts';

async function main() {
  const path = process.argv[2];
  if (!path) { console.error('usage: smoke-ocr <png>'); process.exit(2); }
  const { elements, elapsedMs } = await runOcr(path);
  console.log(JSON.stringify({
    ok: true,
    elapsedMs,
    elementCount: elements.length,
    sample: elements.slice(0, 25).map((e) => ({
      id: e.id,
      text: e.text.slice(0, 50),
      bounds: e.bounds,
      center: [Math.round((e.bounds[0] + e.bounds[2]) / 2), Math.round((e.bounds[1] + e.bounds[3]) / 2)],
    })),
  }, null, 2));
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
