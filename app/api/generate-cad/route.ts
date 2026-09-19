import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '../../../lib/cad/system-prompt';

// Tried in order; a later model is only used if the earlier ones are overloaded (503) or rate-limited (429).
// Flash first for now (speed) — swap gemini-pro-latest back to the front for higher-fidelity but much slower generations.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-pro-latest', 'gemini-3.5-flash-lite'];
const RETRIES_PER_MODEL = 2;
const RETRY_BASE_DELAY_MS = 500;

// Google Search grounding (tools: [{ google_search: {} }]) requires a billing account on file
// to use at all, even within its free monthly allowance — a plain generateContent call succeeds
// on this project's key, but the identical call with the tool attached 429s immediately every
// time. Flip this on once billing is linked; until then the fidelity pass runs on the model's
// own trained knowledge only (no live lookup).
const ENABLE_SEARCH_GROUNDING = false;


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
    const first = await generateWithFallback(userMessage, apiKey);
    let finalText = first.text;
    let finalModel = first.model;
    let passes = 1;
    let references: Reference[] = [];

    // Only run the automatic fidelity pass on a fresh generation — a manual
    // refine request is already a targeted edit and shouldn't be re-critiqued.
    if (!previousCode) {
      try {
        const firstPassCode = extractCode(first.text);
        const reviewMessage = buildFidelityReviewMessage(prompt, firstPassCode);
        const second = await generateWithFallback(reviewMessage, apiKey, { groundWithSearch: ENABLE_SEARCH_GROUNDING });
        finalText = second.text;
        finalModel = second.model;
        references = second.references;
        passes = 2;
      } catch (error) {
        // Fidelity pass failed (rate limit, empty response, etc.) — ship the first-pass result rather than fail the request.
        console.warn('[generate-cad] fidelity pass failed, falling back to first-pass code:', error);
      }
    }

    const code = extractCode(finalText);
    return NextResponse.json({ code, model: finalModel, passes, references });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function buildFidelityReviewMessage(originalPrompt: string, code: string): string {
  const groundingInstruction = ENABLE_SEARCH_GROUNDING
    ? `Before rewriting, use Google Search to find reference images, real specifications, and known dimensions for this specific object (make/model/character/product), so the proportions and signature details you use are grounded in the real thing rather than guessed.\n\n`
    : `Draw on what you already know about this specific object's real proportions, specifications, and signature design cues (make/model/character/product) rather than guessing.\n\n`;
  return `Here is the replicad code you just generated for: "${originalPrompt}"\n\n${code}\n\n${groundingInstruction}Critically review the code against the fidelity checklist in your instructions: full sub-component breakdown, real proportions and signature design cues for that specific make/model/character, hollowed shells instead of solid blocks, distinct wheels/tires/rims/rotors/calipers and independent suspension where applicable, springs using the exact helix recipe, repeated details (bolts, fins, spokes, coil turns) added via loops, and a part count in the 20-140 range for a genuinely detailed assembly.\n\nFind anything that is missing, blocky, oversimplified, or a crude placeholder, and rewrite the code to fix it — add the missing real sub-parts, correct proportions to match what you found, and loop-based repeated detail. Keep the same overall object, coordinate layout, and any parts that are already correct. Return the COMPLETE improved code, same contract as before (ONLY code, one main(replicad) function, no prose or markdown fences).`;
}

type Reference = { title: string; uri: string };

async function generateWithFallback(
  userMessage: string,
  apiKey: string,
  options: { groundWithSearch?: boolean } = {},
): Promise<{ text: string; model: string; references: Reference[] }> {
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
          ...(options.groundWithSearch ? { tools: [{ google_search: {} }] } : {}),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const candidate = data?.candidates?.[0];
        const text: string | undefined = candidate?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? '')
          .join('');
        if (text) return { text, model, references: extractReferences(candidate) };
        lastError = `${model} returned no code.`;
        break; // try the next model, retrying an empty response from the same model won't help
      }

      const detail = await response.text();
      lastError = `Gemini request failed (${response.status}) on ${model}: ${detail}`;

      // 429 quota is enforced per-model (see the "model: ..." in Gemini's error body), so
      // retrying the SAME model within the same request wastes calls — a rate-limited model
      // won't clear inside our short backoff window, but the next model's quota is untouched.
      // Move on immediately instead of burning retries on it.
      if (response.status === 429) break;

      // 503 (overloaded) is a transient server issue, worth a short backoff on the same model.
      if (response.status !== 503) return Promise.reject(new Error(lastError));

      if (attempt < RETRIES_PER_MODEL) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }

  throw new Error(lastError);
}

function extractReferences(candidate: unknown): Reference[] {
  const chunks = (candidate as { groundingMetadata?: { groundingChunks?: unknown[] } } | undefined)
    ?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const seen = new Set<string>();
  const references: Reference[] = [];
  for (const chunk of chunks) {
    const web = (chunk as { web?: { uri?: string; title?: string } } | undefined)?.web;
    if (!web?.uri || seen.has(web.uri)) continue;
    seen.add(web.uri);
    references.push({ title: web.title || web.uri, uri: web.uri });
  }
  return references;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCode(text: string): string {
  const fenced = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}
