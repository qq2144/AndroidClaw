import { config } from '../config.ts';
import type { Brain } from './brain.ts';

export async function makeBrain(): Promise<Brain> {
  const which = (config.brainProvider ?? '').toLowerCase();
  if (which === 'qwen') {
    const { QwenBrain } = await import('./brain-qwen.ts');
    return new QwenBrain();
  }
  if (which === 'gemini') {
    const { GeminiBrain } = await import('./brain-gemini.ts');
    return new GeminiBrain();
  }
  if (which === 'claude') {
    const { ClaudeBrain } = await import('./brain-claude.ts');
    return new ClaudeBrain();
  }
  // auto-detect by which key is present
  if (config.qwen.apiKey) {
    const { QwenBrain } = await import('./brain-qwen.ts');
    return new QwenBrain();
  }
  if (config.gemini.apiKey) {
    const { GeminiBrain } = await import('./brain-gemini.ts');
    return new GeminiBrain();
  }
  const { ClaudeBrain } = await import('./brain-claude.ts');
  return new ClaudeBrain();
}
