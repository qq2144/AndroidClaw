// On-device OCR fallback (Tesseract) — used when uiautomator returns empty/single-node tree
// (WeChat / Alipay / many Flutter apps). Synthesizes an Element[] in the same shape as the
// uiautomator-derived list so the Brain doesn't care where the data came from.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import type { Element } from './types.ts';

const TESS_LANG = process.env.ACLAW_TESS_LANG ?? 'chi_sim';
const TESS_PSM  = process.env.ACLAW_TESS_PSM  ?? '12';
const MIN_CONF  = Number(process.env.ACLAW_OCR_MIN_CONF ?? 40);

export async function runOcr(pngPath: string): Promise<{ elements: Element[]; elapsedMs: number; }> {
  const t0 = Date.now();
  const stem = join(dirname(pngPath), basename(pngPath, extname(pngPath)) + '.ocr');
  const tsvPath = stem + '.tsv';
  await runTesseract(pngPath, stem);
  if (!existsSync(tsvPath)) throw new Error(`tesseract did not produce ${tsvPath}`);
  const tsv = readFileSync(tsvPath, 'utf8');
  try { unlinkSync(tsvPath); } catch { /* ignore */ }
  const elements = parseTsvToElements(tsv);
  return { elements, elapsedMs: Date.now() - t0 };
}

function runTesseract(pngPath: string, outStem: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('tesseract', [
      pngPath, outStem,
      '-l', TESS_LANG,
      '--psm', TESS_PSM,
      'tsv',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (b) => { stderr += b.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tesseract exit ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

/** Group words into lines, then into Elements ready for the Brain. */
export function parseTsvToElements(tsv: string): Element[] {
  // Tesseract TSV columns: level page_num block_num par_num line_num word_num left top width height conf text
  type Word = { line: string; left: number; top: number; width: number; height: number; conf: number; text: string };
  const lines = tsv.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0]!.split('\t');
  const idx = {
    page:  header.indexOf('page_num'),
    block: header.indexOf('block_num'),
    par:   header.indexOf('par_num'),
    line:  header.indexOf('line_num'),
    left:  header.indexOf('left'),
    top:   header.indexOf('top'),
    width: header.indexOf('width'),
    height:header.indexOf('height'),
    conf:  header.indexOf('conf'),
    text:  header.indexOf('text'),
  };
  const wordsByLine = new Map<string, Word[]>();
  for (let li = 1; li < lines.length; li++) {
    const f = lines[li]!.split('\t');
    if (f.length < header.length) continue;
    const text = (f[idx.text] ?? '').trim();
    if (!text) continue;
    const conf = Number(f[idx.conf] ?? '-1');
    if (!isFinite(conf) || conf < MIN_CONF) continue;
    const key = `${f[idx.page]}|${f[idx.block]}|${f[idx.par]}|${f[idx.line]}`;
    const w: Word = {
      line: key,
      left: Number(f[idx.left]),
      top:  Number(f[idx.top]),
      width: Number(f[idx.width]),
      height: Number(f[idx.height]),
      conf,
      text,
    };
    const arr = wordsByLine.get(key) ?? [];
    arr.push(w);
    wordsByLine.set(key, arr);
  }
  const elements: Element[] = [];
  let nextId = 0;
  for (const ws of wordsByLine.values()) {
    if (!ws.length) continue;
    ws.sort((a, b) => a.left - b.left);
    const text = ws.map((w) => w.text).join(/[一-鿿]/.test(ws.map((w)=>w.text).join('')) ? '' : ' ').trim();
    const left = Math.min(...ws.map((w) => w.left));
    const top  = Math.min(...ws.map((w) => w.top));
    const right = Math.max(...ws.map((w) => w.left + w.width));
    const bottom = Math.max(...ws.map((w) => w.top + w.height));
    elements.push({
      id: nextId++,
      text,
      desc: '',
      klass: 'OcrText',
      pkg: '',
      bounds: [left, top, right, bottom],
      clickable: true,   // assume any visible text is a tappable target — Brain decides
      scrollable: false,
      editable: false,
      focused: false,
      password: false,
    });
  }
  return elements;
}
