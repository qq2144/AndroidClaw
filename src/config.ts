import { homedir } from 'node:os';
import { join } from 'node:path';

export const config = {
  projectRoot: process.env.ACLAW_ROOT ?? join(homedir(), 'aclaw'),
  rolloutDir:  process.env.ACLAW_ROLLOUT ?? join(homedir(), 'aclaw', 'rollout'),
  tmpDir:      process.env.ACLAW_TMP ?? '/data/local/tmp/aclaw',
  brainProvider: process.env.ACLAW_BRAIN ?? '',  // 'claude' | 'gemini' | '' (auto)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model:  process.env.ACLAW_MODEL ?? 'claude-sonnet-4-6',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '',
    model:  process.env.ACLAW_GEMINI_MODEL ?? 'gemini-2.5-flash',
  },
  qwen: {
    apiKey: process.env.DASHSCOPE_API_KEY ?? '',
    model:  process.env.ACLAW_QWEN_MODEL ?? 'qwen-vl-max',
    baseUrl: process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  device: {
    useEvdev: process.env.ACLAW_USE_EVDEV === '1',
  },
  turn: {
    maxSteps: Number(process.env.ACLAW_MAX_STEPS ?? 30),
    stepTimeoutMs: Number(process.env.ACLAW_STEP_TIMEOUT_MS ?? 30_000),
    stuckThreshold: Number(process.env.ACLAW_STUCK_THRESHOLD ?? 3),
  },
  perception: {
    saveScreens: process.env.ACLAW_SAVE_SCREENS !== '0',
  },
} as const;
