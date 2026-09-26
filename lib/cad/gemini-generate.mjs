// Shared Gemini code generation for CAD: model fallback chain, Wikipedia grounding, and the automatic
// fidelity-review pass. Used by app/api/generate-cad/route.ts and scripts/cad-agent-worker.mjs.
import { SYSTEM_PROMPT } from './system-prompt.mjs';
import { formatWikipediaBlock, getWikipediaReference } from './wikipedia-reference.mjs';

// Tried in order; a later model is only used if the earlier ones are overloaded (503) or rate-limited (429).
// Flash first for speed — put gemini-pro-latest first for higher-fidelity but much slower generations.
export const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-pro-latest', 'gemini-3.5-flash-lite'];
const RETRIES_PER_MODEL = 2;
const RETRY_BASE_DELAY_MS = 500;
// Drafts shorter than this are simple parts (a cube is ~300 chars, a bracket ~1k, a detailed car 8k+); skip the review.
const REVIEW_MIN_DRAFT_CHARS = 3500;

// Google Search grounding (tools: [{ google_search: {} }]) requires a billing account on file to use at all,
// even within its free monthly allowance — a plain generateContent call succeeds on this project's key, but the
// identical call with the tool attached 429s immediately. Flip on once billing is linked; until then the
// fidelity pass runs on the model's own trained knowledge plus the Wikipedia reference.
const ENABLE_SEARCH_GROUNDING = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function extractCode(text) {
  const fenced = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function extractReferences(candidate) {
  const chunks = candidate?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set();
  const references = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web?.uri || seen.has(web.uri)) continue;
    seen.add(web.uri);
    references.push({ title: web.title || web.uri, uri: web.uri });
  }
  return references;
}

export function buildFidelityReviewMessage(originalPrompt, code, wikipediaBlock = '') {
  const referenceInstruction = wikipediaBlock
    ? `${wikipediaBlock}\n\nCompare the code's overall length, width, height, wheelbase/track (or the equivalent key dimensions) and proportions against the reference specifications above and correct any that are off; use the article's description and the attached photograph (if any) to fix silhouette and signature details.\n\n`
    : '';
  const groundingInstruction =
    referenceInstruction +
    (ENABLE_SEARCH_GROUNDING
      ? `Before rewriting, use Google Search to find reference images, real specifications, and known dimensions for this specific object (make/model/character/product), so the proportions and signature details you use are grounded in the real thing rather than guessed.\n\n`
      : `Draw on what you already know about this specific object's real proportions, specifications, and signature design cues (make/model/character/product) rather than guessing.\n\n`);
  return `Here is the replicad code you just generated for: "${originalPrompt}"\n\n${code}\n\n${groundingInstruction}Critically review the code against the fidelity checklist in your instructions: full sub-component breakdown, real proportions and signature design cues for that specific make/model/character, hollowed shells instead of solid blocks, distinct wheels/tires/rims/rotors/calipers and independent suspension where applicable, springs using the exact helix recipe, repeated details (bolts, fins, spokes, coil turns) added via loops, and a part count in the 20-140 range for a genuinely detailed assembly. Never change WHAT the object is: the result must still be "${originalPrompt}", at the size the request implies (a "20mm cube" stays a 20 mm cube). Simple objects (a cube, a bracket, a washer) must stay simple: if the code is already a faithful, complete model of the request, return it UNCHANGED, and only add detail the real object actually has.\n\nFind anything that is missing, blocky, oversimplified, or a crude placeholder, and rewrite the code to fix it — add the missing real sub-parts, correct proportions to match what you found, and loop-based repeated detail. Keep the same overall object, coordinate layout, and any parts that are already correct. Return the COMPLETE improved code, same contract as before (ONLY code, one main(replicad, helpers) function, no prose or markdown fences).`;
}

async function generateWithFallback(userMessage, apiKey, options = {}) {
  let lastError = 'Gemini request failed.';
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt += 1) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }, ...(options.imageParts ?? [])] }],
          // includeThoughts surfaces the model's reasoning summary for the UI. Thought parts MUST be
          // filtered out of the code below — concatenating them would corrupt the generated source.
          generationConfig: { temperature: 0.5, maxOutputTokens: 32768, thinkingConfig: { includeThoughts: true } },
          ...(options.groundWithSearch ? { tools: [{ google_search: {} }] } : {}),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const candidate = data?.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];
        const text = parts.filter((part) => !part?.thought).map((part) => part.text ?? '').join('');
        const thoughts = parts.filter((part) => part?.thought && part.text).map((part) => part.text).join('\n').trim();
        if (text) return { text, model, thoughts, references: extractReferences(candidate) };
        lastError = `${model} returned no code.`;
        break; // an empty response won't improve on retry — try the next model
      }

      const detail = await response.text();
      lastError = `Gemini request failed (${response.status}) on ${model}: ${detail.slice(0, 400)}`;

      // 429 quota is enforced per model, so retrying the SAME model inside a short backoff window wastes calls —
      // move on to the next model immediately.
      if (response.status === 429) break;
      // 503 (overloaded) is transient: short backoff on the same model. Anything else is a real error.
      if (response.status !== 503) throw new Error(lastError);
      if (attempt < RETRIES_PER_MODEL) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw new Error(lastError);
}

/**
 * Generates replicad code for `prompt`.
 *  - Fresh generation (no previousCode): looks up a Wikipedia reference, drafts, then runs a fidelity-review pass.
 *  - Edit/repair (previousCode set): a single targeted pass with no lookup or review.
 * `onStage(stage, data)` is optional progress reporting: 'reference', 'draft', 'fidelity'.
 * Returns { code, model, passes, references, wikipedia }.
 */
export async function generateCadCode({ prompt, previousCode, apiKey, onStage = () => {} }) {
  const wikipedia = previousCode ? null : await getWikipediaReference(prompt, { fetchImage: true });
  const wikipediaBlock = wikipedia ? formatWikipediaBlock(wikipedia) : '';
  const imageParts = wikipedia?.image ? [{ inlineData: { mimeType: wikipedia.image.mimeType, data: wikipedia.image.data } }] : [];
  if (wikipedia) await onStage('reference', { title: wikipedia.title, url: wikipedia.url, specifications: Object.fromEntries(wikipedia.infobox.slice(0, 12)) });

  const userMessage = previousCode
    ? `Here is the existing replicad code:\n\n${previousCode}\n\nApply this edit and return the complete updated code: ${prompt}`
    : `Model this object: ${prompt}${wikipediaBlock ? `\n\n${wikipediaBlock}` : ''}`;

  const first = await generateWithFallback(userMessage, apiKey, { imageParts });
  await onStage('draft', { model: first.model, thoughts: first.thoughts || '' });
  let finalText = first.text;
  let finalModel = first.model;
  let passes = 1;
  let references = wikipedia ? [{ title: `Wikipedia: ${wikipedia.title}`, uri: wikipedia.url }] : [];

  // The automatic fidelity pass only runs on a fresh generation (an edit is already a targeted change), and only when
  // it can help: there is a real-world reference to check against, or the draft is already an elaborate assembly.
  // Reviewing a trivial part (a cube, a washer) with a "make it more detailed" prompt turns it into something else.
  const draftCode = extractCode(first.text);
  const worthReviewing = Boolean(wikipedia) || draftCode.length > REVIEW_MIN_DRAFT_CHARS;
  if (!previousCode && !worthReviewing) {
    await onStage('fidelity', { skipped: true, reason: 'simple object — the first draft is kept as is' });
  } else if (!previousCode) {
    try {
      const reviewMessage = buildFidelityReviewMessage(prompt, draftCode, wikipediaBlock);
      const second = await generateWithFallback(reviewMessage, apiKey, { groundWithSearch: ENABLE_SEARCH_GROUNDING, imageParts });
      finalText = second.text;
      finalModel = second.model;
      references = [...references, ...second.references];
      passes = 2;
      await onStage('fidelity', { model: second.model, thoughts: second.thoughts || '' });
    } catch (error) {
      // Rate limit, empty response, etc. — ship the first pass rather than fail the whole request.
      console.warn('[gemini-generate] fidelity pass failed, using first-pass code:', error instanceof Error ? error.message : error);
      await onStage('fidelity', { skipped: true, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { code: extractCode(finalText), model: finalModel, passes, references, wikipedia };
}
