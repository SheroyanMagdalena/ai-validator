import { FieldDescriptor } from './types';

export interface AiHint {
  apiToken: string;
  modelToken: string;
  confidence: number; // 0..1
  rationale?: string;
}

export class AiHintsProvider {
  constructor(private enabled: boolean = false, private cfg?: { provider?: 'openai'; model?: string; apiKey?: string }) {}

  async proposeTokenHints(_apiFields: FieldDescriptor[], _modelFields: FieldDescriptor[]): Promise<AiHint[]> {
    if (!this.enabled) return [];
    return [];
  }
}
