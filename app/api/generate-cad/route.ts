import { NextResponse } from 'next/server';

/** @deprecated CAD generation is now authenticated and processed by the dedicated worker. */
export async function POST() {
  return NextResponse.json({ error: 'This endpoint has been replaced by project build jobs. Create a project and use POST /api/projects/:slug/builds.' }, { status: 410 });
}
