// Conversational replies about a CAD project. Unlike gemini-generate.mjs this never produces
// geometry or code to execute — it answers questions about the design that already exists.
import { GEMINI_MODELS } from './gemini-generate.mjs';

// Keep the prompt bounded: long design conversations would otherwise grow without limit.
const MAX_HISTORY_TURNS = 12;
const MAX_SOURCE_CHARS = 6000;

const SYSTEM_BRIEF = `You are CadPilot's engineering assistant. The designer may ask about the specific CAD part loaded in this project, or ask a general engineering question unrelated to it — answer both well.

Rules:
- When your answer touches this loaded part's geometry, dimensions, tolerances, materials, or validation state: use ONLY the measurements and facts given below, and never invent one. If a number was not measured, say it was not measured. Distinguish clearly between what was verified (geometry checks that ran) and what was not (manufacturability, fit, engineering suitability).
- For a general engineering question not about the specifics of this loaded part (materials science, manufacturing processes, design theory, tolerancing standards, and the like): answer normally from your own engineering knowledge, and say plainly that this is general guidance rather than a fact checked against this part.
- You are NOT building anything in this turn. If the user wants a change made to the loaded part, describe precisely what you would change, then tell them to send it in Build (or Plan first for a plan to approve before any geometry is built).
- Be brief and technical. No marketing language. Plain prose, short paragraphs; use a list only for genuinely enumerable items.`;

function contextBlock(context = {}) {
  const { revisionNumber, prompt, metrics, validation, sourceCode, artifactKinds, isValid } = context;
  if (!revisionNumber) return 'PROJECT STATE: no completed revision yet. Nothing has been built in this project so far.';
  const lines = [`PROJECT STATE — revision ${revisionNumber}${isValid ? '' : ' (not a completed/valid revision)'}`];
  if (prompt) lines.push(`Original request: ${prompt}`);
  if (metrics && typeof metrics === 'object') {
    const m = [];
    if (typeof metrics.volume === 'number') m.push(`volume ${metrics.volume} mm3`);
    if (typeof metrics.surfaceArea === 'number') m.push(`surface area ${metrics.surfaceArea} mm2`);
    if (typeof metrics.partCount === 'number') m.push(`${metrics.partCount} part(s)`);
    if (typeof metrics.triangleCount === 'number') m.push(`${metrics.triangleCount} triangles`);
    if (metrics.bounds?.min && metrics.bounds?.max) {
      const [a, b] = [metrics.bounds.min, metrics.bounds.max];
      m.push(`bounding box ${(b[0] - a[0]).toFixed(2)} x ${(b[1] - a[1]).toFixed(2)} x ${(b[2] - a[2]).toFixed(2)} mm`);
    }
    if (m.length) lines.push(`Measured: ${m.join(', ')}.`);
  }
  if (validation && typeof validation === 'object') {
    lines.push(`Geometry checks: valid=${validation.valid === true}, exports complete=${validation.complete === true}.`);
    const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
    lines.push(warnings.length ? `Warnings: ${warnings.join(' | ')}` : 'Warnings: none recorded.');
  }
  if (Array.isArray(artifactKinds) && artifactKinds.length) lines.push(`Available outputs: ${artifactKinds.join(', ')}.`);
  if (sourceCode) {
    const source = sourceCode.length > MAX_SOURCE_CHARS ? `${sourceCode.slice(0, MAX_SOURCE_CHARS)}\n/* …source truncated… */` : sourceCode;
    lines.push(`Current Replicad source:\n\`\`\`js\n${source}\n\`\`\``);
  }
  return lines.join('\n');
}

/**
 * Ask Gemini a question about the project.
 * Returns { reply, thoughts, model } — `thoughts` is the model's own reasoning summary when the
 * model supports it, and an empty string otherwise.
 */
export async function chatAboutProject({ message, history = [], context = {}, apiKey, signal }) {
  if (!apiKey) throw new Error('No Gemini API key is configured, so the assistant cannot answer questions.');
  const trimmed = history.slice(-MAX_HISTORY_TURNS).filter((turn) => turn && typeof turn.content === 'string' && turn.content.trim());
  const contents = [
    { role: 'user', parts: [{ text: `${SYSTEM_BRIEF}\n\n${contextBlock(context)}` }] },
    { role: 'model', parts: [{ text: 'Understood. I will answer using only those recorded facts.' }] },
    ...trimmed.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let lastError = 'No Gemini model answered.';
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          contents,
          // Ask for the reasoning summary; models that don't support it just omit thought parts.
          generationConfig: { temperature: 0.4, maxOutputTokens: 1400, thinkingConfig: { includeThoughts: true } },
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        lastError = `Gemini request failed (${response.status}) on ${model}: ${detail.slice(0, 300)}`;
        // Quota is per-model and overload is transient; either way the next model is the fastest recovery.
        if (response.status === 429 || response.status === 503) continue;
        break;
      }
      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const reply = parts.filter((part) => part?.text && !part.thought).map((part) => part.text).join('').trim();
      const thoughts = parts.filter((part) => part?.text && part.thought).map((part) => part.text).join('\n').trim();
      if (reply) return { reply, thoughts, model };
      lastError = `${model} returned an empty answer.`;
      break;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}
