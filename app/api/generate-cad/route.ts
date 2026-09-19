import { NextResponse } from 'next/server';
import { generateCadCode } from '../../../lib/cad/gemini-generate.mjs';

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

  try {
    // Model fallback chain, Wikipedia grounding and the fidelity-review pass all live in the shared module.
    const { code, model, passes, references } = await generateCadCode({ prompt, previousCode, apiKey });
    return NextResponse.json({ code, model, passes, references });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
