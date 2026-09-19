import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '../../../lib/cad/system-prompt';

// Tried in order; a later model is only used if the earlier ones are overloaded (503) or rate-limited (429).
// Flash first for now (speed) — swap gemini-pro-latest back to the front for higher-fidelity but much slower generations.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-pro-latest', 'gemini-3.5-flash-lite'];
const RETRIES_PER_MODEL = 2;
const RETRY_BASE_DELAY_MS = 500;


export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
  }

  let prompt: string;
  let previousCode: string | undefined;
  try {
    const body = await request.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    previousCode = typeof body?.previousCode === 'string' && body.previousCode.trim() ? body.previousCode : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: 'A prompt is required.' }, { status: 400 });
  }

  const userMessage = previousCode
    ? `Here is the existing replicad code:\n\n${previousCode}\n\nApply this edit and return the complete updated code: ${prompt}`
    : `Model this object: ${prompt}`;

  try {
    const { text, model } = await generateWithFallback(userMessage, apiKey);
    const code = extractCode(text);
    return NextResponse.json({ code, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function generateWithFallback(userMessage: string, apiKey: string): Promise<{ text: string; model: string }> {
  let lastError = 'Gemini request failed.';

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt += 1) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 32768 },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text: string | undefined = data?.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? '')
          .join('');
        if (text) return { text, model };
        lastError = `${model} returned no code.`;
        break; // try the next model, retrying an empty response from the same model won't help
      }

      const detail = await response.text();
      lastError = `Gemini request failed (${response.status}) on ${model}: ${detail}`;

      // Only overload/rate-limit errors are worth retrying or falling back for.
      const retryable = response.status === 503 || response.status === 429;
      if (!retryable) return Promise.reject(new Error(lastError));

      if (attempt < RETRIES_PER_MODEL) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }

  throw new Error(lastError);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCode(text: string): string {
  const fenced = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}
