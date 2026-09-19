export const GEMINI_MODELS: string[];
export function extractCode(text: string): string;
export function buildFidelityReviewMessage(originalPrompt: string, code: string, wikipediaBlock?: string): string;
export type GenerateStage = 'reference' | 'draft' | 'fidelity';
export function generateCadCode(options: {
  prompt: string;
  previousCode?: string;
  apiKey: string;
  onStage?: (stage: GenerateStage, data: Record<string, unknown>) => void | Promise<void>;
}): Promise<{
  code: string;
  model: string;
  passes: number;
  references: Array<{ title: string; uri: string }>;
  wikipedia: import('./wikipedia-reference.mjs').WikipediaReference | null;
}>;
