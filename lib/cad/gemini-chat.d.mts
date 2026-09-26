export declare function chatAboutProject(input: {
  message: string;
  history?: Array<{ role: string; content: string }>;
  context?: {
    revisionNumber?: number;
    prompt?: string;
    isValid?: boolean;
    metrics?: Record<string, unknown> | null;
    validation?: Record<string, unknown> | null;
    sourceCode?: string | null;
    artifactKinds?: string[];
  };
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<{ reply: string; thoughts: string; model: string }>;
