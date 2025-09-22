import { FieldDescriptor } from './types';

export interface AiHint {
  apiToken: string;
  modelToken: string;
  confidence: number; // 0..1
  rationale?: string;
}

/**
 * Pluggable AI hint provider. Default implementation returns no hints.
 * If you want live hints, wire this to your GPT-5 endpoint (e.g., OpenAI "gpt-5-thinking").
 */
export class AiHintsProvider {
  constructor(private enabled: boolean = false, private cfg?: { provider?: 'openai'; model?: string; apiKey?: string }) {}

  async proposeTokenHints(_apiFields: FieldDescriptor[], _modelFields: FieldDescriptor[]): Promise<AiHint[]> {
    if (!this.enabled) return [];
    // Example wiring (pseudo):
    // const prompt = buildPrompt(_apiFields, _modelFields);
    // const res = await fetch('https://api.openai.com/v1/chat/completions', { ... });
    // return parseHints(res);
    return [];
  }
}
