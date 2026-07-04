import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import type { Element } from './types.ts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  preserveOrder: false,
});

const BOUNDS_RE = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;

function parseBounds(s: string | undefined): [number, number, number, number] | null {
  if (!s) return null;
  const m = s.match(BOUNDS_RE);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function asBool(v: unknown): boolean {
  return v === 'true' || v === true;
}

interface ParseResult {
  elements: Element[];
  screenWidth: number;
  screenHeight: number;
}

export function parseUiXml(xmlPath: string): ParseResult {
  const xml = readFileSync(xmlPath, 'utf8');
  const tree = parser.parse(xml);
  const root = tree.hierarchy;
  const elements: Element[] = [];
  let nextId = 0;
  let maxW = 0;
  let maxH = 0;

  function walk(n: any) {
    if (!n) return;
    const nodes = Array.isArray(n) ? n : [n];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const bounds = parseBounds(node.bounds);
      if (bounds) {
        maxW = Math.max(maxW, bounds[2]);
        maxH = Math.max(maxH, bounds[3]);
        const clickable = asBool(node.clickable);
        const scrollable = asBool(node.scrollable);
        const editable = node.class === 'android.widget.EditText' || asBool(node.editable);
        const focused = asBool(node.focused);
        const text = String(node.text ?? '').trim();
        const desc = String(node['content-desc'] ?? '').trim();
        // Skip nodes with zero area or no actionable surface.
        const w = bounds[2] - bounds[0];
        const h = bounds[3] - bounds[1];
        if (w > 0 && h > 0 && (clickable || scrollable || editable || text || desc)) {
          elements.push({
            id: nextId++,
            text,
            desc,
            klass: String(node.class ?? ''),
            pkg: String(node.package ?? ''),
            bounds,
            clickable,
            scrollable,
            editable,
            focused,
            password: asBool(node.password),
          });
        }
      }
      if (node.node) walk(node.node);
    }
  }
  walk(root?.node);
  return { elements, screenWidth: maxW, screenHeight: maxH };
}

export function summarizeForModel(elements: Element[], maxLabelLen = 40): string {
  const lines: string[] = [];
  for (const e of elements) {
    const label = (e.text || e.desc || e.klass.split('.').pop() || '').slice(0, maxLabelLen);
    const flags = [
      e.clickable ? 'click' : '',
      e.editable ? 'edit' : '',
      e.scrollable ? 'scroll' : '',
      e.focused ? 'focus' : '',
    ].filter(Boolean).join(',');
    const flagStr = flags ? ` (${flags})` : '';
    lines.push(`#${e.id} ${JSON.stringify(label)}${flagStr}`);
  }
  return lines.join('\n');
}
