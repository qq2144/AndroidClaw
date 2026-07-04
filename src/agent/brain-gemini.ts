import { GoogleGenAI, Type, type Tool, type FunctionDeclaration } from '@google/genai';
import { readFileSync } from 'node:fs';
import { config } from '../config.ts';
import { TOOLS, type ActionInput } from './tools.ts';
import { summarizeForModel } from '../perception/ui-tree.ts';
import { systemPrompt, type Brain, type BrainContext, type BrainResult } from './brain.ts';
import type { Observation } from '../perception/types.ts';

// Convert our Anthropic-flavored Tool schemas into Gemini FunctionDeclarations.
function toGeminiTools(): Tool[] {
  const funcs: FunctionDeclaration[] = TOOLS.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    parameters: convertSchema(t.input_schema) as any,
  }));
  return [{ functionDeclarations: funcs }];
}

function convertSchema(s: any): any {
  if (!s) return undefined;
  const out: any = {};
  if (s.type === 'object') {
    out.type = Type.OBJECT;
    if (s.properties) {
      out.properties = {};
      for (const [k, v] of Object.entries<any>(s.properties)) {
        out.properties[k] = convertSchema(v);
      }
    }
    if (s.required) out.required = s.required;
  } else if (s.type === 'integer') {
    out.type = Type.INTEGER;
    if (s.description) out.description = s.description;
    if (s.minimum !== undefined) out.minimum = s.minimum;
    if (s.maximum !== undefined) out.maximum = s.maximum;
  } else if (s.type === 'number') {
    out.type = Type.NUMBER;
    if (s.description) out.description = s.description;
  } else if (s.type === 'string') {
    out.type = Type.STRING;
    if (s.description) out.description = s.description;
    if (s.enum) out.enum = s.enum;
  } else if (s.type === 'boolean') {
    out.type = Type.BOOLEAN;
  }
  return out;
}

export class GeminiBrain implements Brain {
  readonly name = 'gemini';
  private client: GoogleGenAI;
  private model: string;
  private tools = toGeminiTools();

  constructor() {
    if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY is required for GeminiBrain');
    this.client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.model = config.gemini.model;
  }

  private async callWithRetry(req: any, maxRetries = 5): Promise<any> {
    let lastErr: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.client.models.generateContent(req);
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? '');
        const code = e?.status ?? (msg.match(/"code":(\d+)/)?.[1] ? Number(msg.match(/"code":(\d+)/)![1]) : 0);
        // Daily/free-tier quota is NOT transient — don't burn the budget retrying.
        const isDailyQuota = /per_day|free_tier_requests|GenerateRequestsPerDay/i.test(msg);
        const retriable = !isDailyQuota && ([429, 500, 502, 503, 504].includes(code) || /UNAVAILABLE|DEADLINE_EXCEEDED/i.test(msg));
        if (!retriable) throw e;
        const wait = Math.min(2000 * Math.pow(2, attempt), 15000) + Math.floor(Math.random() * 500);
        console.error(`[gemini] ${code} retriable; attempt=${attempt + 1}/${maxRetries} wait=${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr;
  }

  async decide(ctx: BrainContext, obs: Observation): Promise<BrainResult> {
    const png = readFileSync(obs.screenshotPath);
    const observationText = buildObservationText(ctx, obs);

    const resp = await this.callWithRetry({
      model: this.model,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: png.toString('base64') } },
          { text: observationText },
        ],
      }],
      config: {
        systemInstruction: systemPrompt(),
        tools: this.tools,
        toolConfig: { functionCallingConfig: { mode: 'ANY' as any } },
        maxOutputTokens: 1024,
      },
    });

    const candidate = resp.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;
    if (!fnCall || !fnCall.name) throw new Error('Gemini did not emit a function call.');

    const action = { name: fnCall.name, input: fnCall.args ?? {} } as ActionInput;
    const usage = resp.usageMetadata;
    return {
      action,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      rawId: resp.responseId ?? 'gemini',
    };
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
