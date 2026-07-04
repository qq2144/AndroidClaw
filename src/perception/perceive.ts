import { join } from 'node:path';
import type { DeviceAdapter } from '../device/types.ts';
import { parseUiXml } from './ui-tree.ts';
import { runOcr } from './ocr.ts';
import type { Observation, Element } from './types.ts';

export async function perceive(
  device: DeviceAdapter,
  step: number,
  stepDir: string,
): Promise<Observation> {
  const screenshotPath = join(stepDir, 'screen.png');
  const uiXmlPath = join(stepDir, 'ui.xml');
  // Run in parallel for latency.
  const [_, __] = await Promise.all([
    device.screencap(screenshotPath),
    device.uiDump(uiXmlPath),
  ]);
  const parsed = parseUiXml(uiXmlPath);
  let { elements, screenWidth, screenHeight } = parsed;
  let currentPackage = elements[0]?.pkg
    || (await device.foregroundPackage().catch(() => ''));
  // Fallback A: when the app blocks uiautomator (WeChat / Alipay / Flutter) the tree is empty
  // and we get 0x0. Query `wm size` so vision-only tools (tap_xy) still have a coord system.
  if ((!screenWidth || !screenHeight) && typeof (device as any).screenSize === 'function') {
    const dims = await (device as any).screenSize().catch(() => null);
    if (dims) {
      screenWidth = dims.w;
      screenHeight = dims.h;
    }
  }
  // Fallback B: if uiautomator gave us an empty/trivial tree but we have a screenshot,
  // run on-device OCR and synthesize elements. Brain stays on the tap-by-id path.
  let source: 'uiautomator' | 'ocr' | 'empty' = elements.length ? 'uiautomator' : 'empty';
  let ocrMs = 0;
  if (elements.length === 0 && process.env.ACLAW_OCR !== '0') {
    try {
      const r = await runOcr(screenshotPath);
      elements = r.elements;
      ocrMs = r.elapsedMs;
      if (elements.length) source = 'ocr';
    } catch (e: any) {
      console.error(`[perceive] OCR fallback failed: ${e?.message}`);
    }
  }
  return {
    step,
    ts: new Date().toISOString(),
    currentPackage,
    elements,
    screenshotPath,
    uiXmlPath,
    screenWidth,
    screenHeight,
    // Diagnostics — read by callers/rollout if interested.
    source,
    ocrMs,
  } satisfies Observation;
}

export function findElement(obs: Observation, id: number): Element | undefined {
  return obs.elements.find((e) => e.id === id);
}
