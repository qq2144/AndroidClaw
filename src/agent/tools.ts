import type Anthropic from '@anthropic-ai/sdk';

// Schema-constrained action set. The model can ONLY emit one of these.
// Schemas double as Anthropic tool-use definitions.

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'tap',
    description: 'Tap a UI element by its numbered id from the elements list. Preferred when elements are available.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Element id from the observation.' },
        why: { type: 'string', description: 'One short sentence explaining why.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'tap_xy',
    description: 'Tap at raw pixel coordinates. Use ONLY when the elements list is empty (the app blocks uiautomator, e.g. WeChat / Alipay / many Flutter apps). Read coordinates from the screenshot; they must lie within the screen resolution shown in OBSERVATION.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'integer' },
        y: { type: 'integer' },
        why: { type: 'string' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'swipe',
    description: 'Scroll the page. `dir` is the direction the page content moves: "down" reveals items lower in the list (more below), "up" reveals items above. Use this to find off-screen items.',
    input_schema: {
      type: 'object',
      properties: {
        dir: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        why: { type: 'string' },
      },
      required: ['dir'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text into the currently focused input field via ADBKeyBoard. Reliable for system apps and most third-party apps. UNRELIABLE inside WeChat / Alipay / Chinese chat apps (their input field auto-switches IME and may scramble ASCII into pinyin Chinese). In those apps, prefer `paste_text`.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        why: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'paste_text',
    description: 'Set the system clipboard to `text` and send a paste keystroke. IME-agnostic — works regardless of which keyboard is active. PREFER this in WeChat, Alipay, and other Chinese-input apps. Requires focus to already be on an editable input.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        why: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'long_press',
    description: 'Long-press at the center of a UI element (e.g. to open a text-selection context menu). Provide either an element id from the elements list, or raw (x, y) pixel coordinates when elements are empty (OCR mode).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        x: { type: 'integer' },
        y: { type: 'integer' },
        ms: { type: 'integer', minimum: 200, maximum: 2000 },
        why: { type: 'string' },
      },
    },
  },
  {
    name: 'key',
    description: 'Press a hardware key.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: ['BACK', 'HOME', 'APP_SWITCH', 'ENTER', 'DEL'] },
        why: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'launch_app',
    description: 'Launch an app by package name. After launching, the loop waits until that package is foreground.',
    input_schema: {
      type: 'object',
      properties: {
        pkg: { type: 'string', description: 'e.g. com.tencent.mm' },
        why: { type: 'string' },
      },
      required: ['pkg'],
    },
  },
  {
    name: 'wait',
    description: 'Wait briefly (UI animation, app launch). Prefer short waits and re-observe.',
    input_schema: {
      type: 'object',
      properties: {
        ms: { type: 'integer', minimum: 100, maximum: 5000 },
        why: { type: 'string' },
      },
      required: ['ms'],
    },
  },
  {
    name: 'remember',
    description: 'Save a piece of data into turn context for cross-app handoff (e.g. text captured before switching apps).',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'submit',
    description: 'Trigger the focused input field\'s IME submit action via ADBKeyBoard (equivalent to pressing the keyboard\'s Send/Done/Search button). PREFER this over hunting for a visible "Send" button in chat apps — WeChat / Telegram / Alipay all map IME_ACTION_SEND to sending the message. Works only when ADBKeyBoard is the active IME (paste_text and type_text both leave it active).',
    input_schema: {
      type: 'object',
      properties: {
        why: { type: 'string' },
      },
    },
  },
  {
    name: 'finish',
    description: 'Task complete. Provide a one-line summary.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'ask_user',
    description: 'Stop and ask the user a clarifying question — only when truly blocked.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
      },
      required: ['question'],
    },
  },
];

export type ToolName =
  | 'tap' | 'tap_xy' | 'long_press' | 'swipe' | 'type_text' | 'paste_text' | 'submit' | 'key' | 'launch_app'
  | 'wait' | 'remember' | 'finish' | 'ask_user';

export type ActionInput =
  | { name: 'tap';        input: { id: number; why?: string } }
  | { name: 'tap_xy';     input: { x: number; y: number; why?: string } }
  | { name: 'long_press'; input: { id?: number; x?: number; y?: number; ms?: number; why?: string } }
  | { name: 'swipe';      input: { dir: 'up' | 'down' | 'left' | 'right'; why?: string } }
  | { name: 'type_text';  input: { text: string; why?: string } }
  | { name: 'paste_text'; input: { text: string; why?: string } }
  | { name: 'submit';     input: { why?: string } }
  | { name: 'key';        input: { name: 'BACK' | 'HOME' | 'APP_SWITCH' | 'ENTER' | 'DEL'; why?: string } }
  | { name: 'launch_app'; input: { pkg: string; why?: string } }
  | { name: 'wait';       input: { ms: number; why?: string } }
  | { name: 'remember';   input: { key: string; value: string } }
  | { name: 'finish';     input: { summary: string } }
  | { name: 'ask_user';   input: { question: string } };
