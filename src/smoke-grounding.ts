// Grounding probe — compare DashScope VL models' GUI coordinate grounding on a real
// screenshot, before committing task A's brain (see DESIGN §10 / brain choice).
//
// For each model we force a single `tap_xy(x,y)` tool and ask it to point at one target.
// Two things get measured at once:
//   (1) COMPAT  — did the model emit a clean OpenAI-compat tool_call (the path QwenBrain uses)?
//   (2) GROUNDING — is (x,y) in-bounds and where on the image? (open the HTML overlay to eyeball)
//
// Run on phone (DASHSCOPE_API_KEY already in env):
//   tsx src/smoke-grounding.ts smoke/wx7_final.png "底部消息输入框"
// Pick other targets / images:
//   tsx src/smoke-grounding.ts smoke/wx7/4aa48ed8/step-002/screen.png "绿色的发送(Send)按钮"
// Swap the model set:
//   PROBE_MODELS=qwen3-vl-flash-2026-01-22,qwen-vl-max tsx src/smoke-grounding.ts <png> "<target>"

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const API_KEY = process.env.DASHSCOPE_API_KEY ?? '';
const BASE_URL = (process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
const MODELS = (process.env.PROBE_MODELS ?? 'qwen3-vl-flash,qwen3-vl-32b-thinking,qwen3.7-plus')
  .split(',').map((s) => s.trim()).filter(Boolean);

const imgPath = process.argv[2] ?? 'smoke/wx7_final.png';
const target = process.argv[3] ?? '底部的消息文本输入框（图标左侧那条宽的空白输入区）';

if (!API_KEY) { console.error('DASHSCOPE_API_KEY not set in env'); process.exit(2); }

/** Read width/height from a PNG IHDR — no image dep needed. */
function pngSize(buf: Buffer): { w: number; h: number } {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${imgPath}`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const png = readFileSync(imgPath);
const { w, h } = pngSize(png);
const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

// Single-tool schema: forces the grounding answer through our exact tool-call path.
const tools = [{
  type: 'function' as const,
  function: {
    name: 'tap_xy',
    description: 'Tap at a raw pixel coordinate on the screenshot.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'integer', description: `pixel x, 0..${w}` },
        y: { type: 'integer', description: `pixel y, 0..${h}` },
      },
      required: ['x', 'y'],
    },
  },
}];

const SYSTEM = `You are a GUI grounding probe. You see ONE Android screenshot that is exactly ${w} pixels wide and ${h} pixels tall. Call tap_xy with the PIXEL coordinates (NOT normalized, NOT 0-1000) of the CENTER of the requested target. x must be in [0, ${w}], y in [0, ${h}]. Emit exactly one tap_xy tool call and nothing else.`;
const USER_TEXT = `Target to locate: ${target}\nReturn tap_xy at the pixel center of that target.`;

interface Row {
  model: string;
  ok: boolean;            // emitted a usable tap_xy tool call
  x?: number; y?: number;
  inBounds?: boolean;
  maybeNormalized?: boolean;
  ms: number;
  toolName?: string;
  note: string;
}

async function probe(model: string): Promise<Row> {
  const t0 = Date.now();
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: USER_TEXT },
      ] },
    ],
    tools,
    tool_choice: 'auto',
    max_tokens: 2048, // headroom: 'thinking' models spend tokens reasoning before the tool call
  };
  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const text = await r.text();
      return { model, ok: false, ms, note: `HTTP ${r.status}: ${text.slice(0, 180)}` };
    }
    const data = await r.json();
    const msg = data.choices?.[0]?.message;
    const tc = msg?.tool_calls?.[0];
    if (!tc) {
      const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '');
      const reasoning = msg?.reasoning_content ? ` | reasoning=${String(msg.reasoning_content).slice(0, 100)}` : '';
      return { model, ok: false, ms, note: `NO tool_call (compat issue). content=${content.slice(0, 120)}${reasoning}` };
    }
    let args: any;
    try { args = JSON.parse(tc.function?.arguments ?? '{}'); }
    catch { return { model, ok: false, ms, toolName: tc.function?.name, note: `bad JSON args: ${String(tc.function?.arguments).slice(0, 120)}` }; }
    const x = Number(args.x), y = Number(args.y);
    if (!isFinite(x) || !isFinite(y)) return { model, ok: false, ms, toolName: tc.function?.name, note: `non-numeric coords: ${JSON.stringify(args)}` };
    const inBounds = x >= 0 && x <= w && y >= 0 && y <= h;
    // Heuristic: Qwen-VL is trained on 0-1000 normalized coords; if both <=1000 on a bigger
    // image, the model probably ignored the pixel instruction and we'd need to rescale x*W/1000.
    const maybeNormalized = x <= 1000 && y <= 1000 && (w > 1000 || h > 1000);
    return { model, ok: true, x, y, inBounds, maybeNormalized, ms, toolName: tc.function?.name, note: inBounds ? (maybeNormalized ? '⚠ in-bounds but maybe 0-1000 normalized' : 'ok') : 'OUT OF BOUNDS' };
  } catch (e: any) {
    return { model, ok: false, ms: Date.now() - t0, note: `error: ${e?.message?.slice(0, 180)}` };
  }
}

const rows: Row[] = [];
for (const m of MODELS) {
  process.stderr.write(`probing ${m} ...\n`);
  rows.push(await probe(m)); // sequential — keeps DashScope per-minute rate happy
}

// ---- console report ----
console.log(`\nGrounding probe — ${basename(imgPath)} (${w}x${h}px), target: "${target}"\n`);
for (const r of rows) {
  const mark = r.ok && r.inBounds && !r.maybeNormalized ? '✓' : (r.ok ? '~' : '✗');
  const coord = r.ok ? `(${r.x},${r.y}) ${Math.round((r.x! / w) * 100)}%,${Math.round((r.y! / h) * 100)}%` : '—';
  console.log(`${mark} ${r.model.padEnd(24)} ${coord.padEnd(22)} ${(r.ms + 'ms').padEnd(8)} ${r.note}`);
}
console.log(`\nlegend: ✓ clean tool_call + in-bounds   ~ returned but suspect (oob / normalized)   ✗ no usable tool_call`);

// ---- HTML overlay (self-contained: image embedded, color-coded dots) ----
const COLORS = ['#ff3b30', '#34c759', '#0a84ff', '#ff9f0a', '#bf5af2'];
const dots = rows
  .filter((r) => r.ok && isFinite(r.x!) && isFinite(r.y!))
  .map((r, i) => {
    const c = COLORS[i % COLORS.length];
    const left = ((r.x! / w) * 100).toFixed(2);
    const top = ((r.y! / h) * 100).toFixed(2);
    return `<div class="dot" style="left:${left}%;top:${top}%;--c:${c}"><span>${r.model} (${r.x},${r.y})${r.maybeNormalized ? ' ⚠norm?' : ''}</span></div>`;
  })
  .join('\n');
const html = `<!doctype html><meta charset="utf8"><title>grounding probe — ${basename(imgPath)}</title>
<style>
 body{margin:0;background:#111;color:#eee;font:14px system-ui,sans-serif}
 h2{font:600 15px system-ui;padding:10px 12px;margin:0}
 .wrap{position:relative;display:inline-block;margin:0 12px 24px}
 img{display:block;max-width:100%;height:auto}
 .dot{position:absolute;transform:translate(-50%,-50%);width:24px;height:24px;border:3px solid var(--c);border-radius:50%;box-shadow:0 0 0 2px #000,0 0 8px var(--c)}
 .dot span{position:absolute;left:28px;top:-3px;white-space:nowrap;color:#fff;background:var(--c);padding:2px 7px;border-radius:5px;font-weight:600;font-size:12px}
</style>
<h2>target: ${target} &nbsp;|&nbsp; ${basename(imgPath)} (${w}×${h})</h2>
<div class="wrap"><img src="${dataUrl}" alt="screenshot">
${dots}
</div>`;
const stem = basename(imgPath).replace(/\.png$/i, '');
const outHtml = join(dirname(imgPath), `${stem}.probe.html`);
const outJson = join(dirname(imgPath), `${stem}.probe.json`);
writeFileSync(outHtml, html);
writeFileSync(outJson, JSON.stringify({ image: imgPath, w, h, target, models: MODELS, rows }, null, 2));
console.log(`\noverlay: ${outHtml}\njson:    ${outJson}`);
