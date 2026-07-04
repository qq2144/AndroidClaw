// QwenBrain — Qwen-VL-Max via DashScope OpenAI-compatible chat/completions.
// No SDK dependency; pure fetch.
import { readFileSync } from 'node:fs';
import { config } from '../config.ts';
import { TOOLS, type ActionInput } from './tools.ts';
import { summarizeForModel } from '../perception/ui-tree.ts';
import { systemPrompt, type Brain, type BrainContext, type BrainResult } from './brain.ts';
import type { Observation } from '../perception/types.ts';

export class QwenBrain implements Brain {
  readonly name = 'qwen';
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private tools = TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema,
    },
  }));

  constructor() {
    if (!config.qwen.apiKey) throw new Error('DASHSCOPE_API_KEY is required for QwenBrain');
    this.apiKey = config.qwen.apiKey;
    this.model = config.qwen.model;
    this.baseUrl = config.qwen.baseUrl.replace(/\/+$/, '');
  }

  async decide(ctx: BrainContext, obs: Observation): Promise<BrainResult> {
    const png = readFileSync(obs.screenshotPath);
    const imageData = `data:image/png;base64,${png.toString('base64')}`;
    const observationText = buildObservationText(ctx, obs);

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt() },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageData } },
            { type: 'text', text: observationText },
          ],
        },
      ],
      tools: this.tools,
      tool_choice: 'auto',
      max_tokens: 1024,
    };

    const data = await this.callWithRetry(body);
    const choice = data.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    if (!toolCall) {
      const reply = choice?.message?.content;
      throw new Error(`Qwen did not emit a tool call. Reply: ${(typeof reply === 'string' ? reply : JSON.stringify(reply))?.slice(0, 200)}`);
    }
    let args: any;
    try {
      args = JSON.parse(toolCall.function?.arguments ?? '{}');
    } catch {
      throw new Error(`Qwen returned invalid JSON arguments: ${toolCall.function?.arguments}`);
    }
    return {
      action: { name: toolCall.function?.name, input: args } as ActionInput,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      rawId: data.id ?? 'qwen',
    };
  }

  private async callWithRetry(body: any, maxRetries = 5): Promise<any> {
    let lastErr: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const r = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (r.ok) return await r.json();
        const text = await r.text();
        const status = r.status;
        const isDailyQuota = /quota_exhausted|RequestLimitExceeded|InsufficientQuota|per_day/i.test(text);
        // 5xx is transient; 429 only retriable when it's per-minute rate, not daily quota.
        const retriable =
          [500, 502, 503, 504].includes(status) ||
          (status === 429 && !isDailyQuota);
        const err: any = new Error(`DashScope HTTP ${status}: ${text.slice(0, 300)}`);
        err.nonRetriable = !retriable;
        lastErr = err;
        if (!retriable) throw err;
        const wait = Math.min(2000 * Math.pow(2, attempt), 15000) + Math.floor(Math.random() * 500);
        console.error(`[qwen] HTTP ${status} retriable; attempt=${attempt + 1}/${maxRetries} wait=${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      } catch (e: any) {
        lastErr = e;
        if (e?.nonRetriable) throw e;
        if (attempt === maxRetries - 1) throw e;
        const wait = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.error(`[qwen] network error attempt=${attempt + 1}/${maxRetries}: ${e?.message?.slice(0, 200)}; wait=${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr;
  }
}

function buildObservationText(ctx: BrainContext, obs: Observation): string {
  const elementsText = summarizeForModel(obs.elements);
  const memoryText = Object.keys(ctx.memory).length
    ? `\n\nRemembered:\n${Object.entries(ctx.memory).map(([k, v]) => `- ${k}: ${JSON.stringify(v).slice(0, 200)}`).join('\n')}`
    : '';
  const historyText = ctx.history.length
    ? `\n\nRecent steps:\n${ctx.history.slice(-5).map((h) => `- step ${h.step} @ ${h.currentPackage}: ${h.action.name}(${JSON.stringify(h.action.input).slice(0, 80)}) -> ${h.result.slice(0, 80)}`).join('\n')}`
    : '';
  return `GOAL: ${ctx.goal}

OBSERVATION (step ${obs.step}):
  current_package: ${obs.currentPackage}
  screen: ${obs.screenWidth}x${obs.screenHeight}
  elements:
${elementsText}${memoryText}${historyText}

Choose exactly one tool call to make progress.`;
}
