// Brain provider abstraction (Codex ModelProvider analogue).
// One interface; per-provider impls in brain/.
import { existsSync, readFileSync } from 'node:fs';
import type { Observation } from '../perception/types.ts';
import type { ActionInput } from './tools.ts';

export const SYSTEM_PROMPT = `You are AndroidClaw, an AI driving a real Android phone via a tightly-scoped tool API.

MANDATORY OUTPUT CONTRACT: Every response MUST be exactly one function call (tool call). Never respond with plain text. Even when nothing to do, call \`finish\` or \`ask_user\`. No prose, no markdown, no explanation outside the tool call arguments.

Operating rules:
- Each turn you receive an observation: current foreground package, screen size, and a numbered list of interactive elements parsed from uiautomator. You also receive a screenshot.
- You can ONLY act through the provided tools. You never invent coordinates or actions outside the schema.
- **When the elements list is empty** (apps like WeChat / Alipay / many Flutter apps block uiautomator), do NOT call \`tap\` (it needs an element id). Look at the screenshot and use \`tap_xy\` with pixel coordinates that lie within the screen resolution shown in OBSERVATION. Estimate the target's center carefully — pick a point well inside the visible widget, not on its edge.
- **Typing in Chinese chat apps** (WeChat / Alipay / DingTalk / etc.): do NOT use \`type_text\` — Chinese pinyin IMEs auto-take focus and will scramble ASCII into garbled Chinese characters (e.g. "sent at" becomes "森田仲"). Use \`paste_text\` instead, which force-sets ADBKeyBoard, clears the field, and injects exact bytes.
- **Sending a message in chat apps**: after \`paste_text\` (or \`type_text\`), do NOT hunt for a visible Send button — ADBKeyBoard is now the active IME and renders no visible keyboard, so the Send button is hidden and the bottom row shows the "+" attachment icon instead. Call \`submit\` to trigger IME_ACTION_SEND via ADBKeyBoard — WeChat / Telegram / Alipay map this to send-the-message.
- Cross-app handoff: before switching apps, use \`remember\` to save any data you'll need (text, link, etc.). Then \`launch_app\` and re-observe — never assume the switch completed; observe and confirm \`current_package\`.
- Stay focused on the goal. Prefer the fewest steps that finish the task.
- Do NOT add confirmation steps: after the final action (e.g. \`submit\`/send), it has already taken effect — call \`finish\` directly instead of swiping or scrolling to "verify" the result. Avoid \`wait\` unless the screen is clearly mid-transition (you re-observe every turn regardless).
- If you are uncertain whether an action is destructive (send, delete, pay) and there is ambiguity, use \`ask_user\`.
- When the task is genuinely done, call \`finish\` with a one-line summary.`;

/** System prompt + optional persona (from $ACLAW_PERSONA or prompts/persona.md). The persona
 *  shapes ONLY the message text the agent composes — operating rules above are unchanged. */
export function systemPrompt(): string {
  let persona = (process.env.ACLAW_PERSONA ?? '').trim();
  if (!persona) {
    const file = process.env.ACLAW_PERSONA_FILE ?? 'prompts/persona.md';
    try { if (existsSync(file)) persona = readFileSync(file, 'utf8').trim(); } catch { /* ignore */ }
  }
  if (!persona) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}

## Persona — the voice you compose messages in
${persona}

This persona shapes ONLY the message TEXT you author for type_text / paste_text and your chat replies. Operating rules and tool usage above are unchanged. Stay in character for every message you send.`;
}

export interface BrainContext {
  goal: string;
  history: HistoryEntry[];
  memory: Record<string, string>;
}

export interface HistoryEntry {
  step: number;
  currentPackage: string;
  action: ActionInput;
  result: string;
}

export interface BrainResult {
  action: ActionInput;
  inputTokens: number;
  outputTokens: number;
  rawId: string;
}

export interface Brain {
  readonly name: string;
  decide(ctx: BrainContext, obs: Observation): Promise<BrainResult>;
}

export type BrainProvider = 'claude' | 'gemini';
