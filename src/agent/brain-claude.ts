import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { config } from '../config.ts';
import { TOOLS, type ActionInput } from './tools.ts';
import { summarizeForModel } from '../perception/ui-tree.ts';
import { systemPrompt, type Brain, type BrainContext, type BrainResult } from './brain.ts';
import type { Observation } from '../perception/types.ts';

export class ClaudeBrain implements Brain {
  readonly name = 'claude';
  private client: Anthropic;
  private model: string;
  constructor() {
    if (!config.anthropic.apiKey) throw new Error('ANTHROPIC_API_KEY is required for ClaudeBrain');
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.model = config.anthropic.model;
  }

  async decide(ctx: BrainContext, obs: Observation): Promise<BrainResult> {
    const userBlocks: Anthropic.Messages.ContentBlockParam[] = [];
    const png = readFileSync(obs.screenshotPath);
    userBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') },
    });
    userBlocks.push({ type: 'text', text: buildObservationText(ctx, obs) });

    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt(),
      tools: TOOLS,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: userBlocks }],
    });
    const toolUse = resp.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) throw new Error('Claude did not emit a tool call.');
    return {
      action: { name: toolUse.name, input: toolUse.input } as ActionInput,
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      rawId: resp.id,
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
