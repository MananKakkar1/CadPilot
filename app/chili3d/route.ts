export const dynamic = 'force-dynamic';

/**
 * Chili3D's bundled loader accidentally appends its default plugin path to the
 * runtime `?plugin=` query. Keep that malformed request harmless; the actual
 * bridge is loaded from its manifest URL separately.
 */
export function GET() {
  return Response.json({ plugins: [] });
}
