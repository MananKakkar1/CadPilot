import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const artifact = user ? await prisma.artifact.findFirst({ where: { id, revision: { project: { ownerId: user.id } }, }, include: { revision: { include: { artifacts: true } } } }) : null;
  if (!artifact) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  const revision = artifact.revision;
  const metrics = revision.metrics && typeof revision.metrics === 'object' ? revision.metrics as { volume?: number; triangleCount?: number; bounds?: { min?: number[]; max?: number[] } } : {};
  const validation = revision.validation && typeof revision.validation === 'object' ? revision.validation as { valid?: boolean; findings?: string[] } : {};
  const hasStl = revision.artifacts.some((item) => item.kind === 'STL');
  const hasThreeMf = revision.artifacts.some((item) => item.kind === 'THREE_MF');
  const checks = [
    { id: 'valid-brep', label: 'Validated solid', passed: revision.isValid && validation.valid !== false, detail: 'The revision passed deterministic geometry validation.' },
    { id: 'watertight', label: 'Watertight source', passed: revision.isValid && (metrics.volume ?? 0) > 0, detail: 'A measurable closed solid is required before slicing.' },
    { id: 'mesh', label: 'Mesh available', passed: hasStl && (metrics.triangleCount ?? 0) > 0, detail: hasStl ? `${(metrics.triangleCount ?? 0).toLocaleString()} triangles recorded.` : 'STL derivative is missing.' },
    { id: 'package', label: '3MF package available', passed: hasThreeMf, detail: hasThreeMf ? '3MF export is available.' : '3MF derivative is missing.' },
  ];
  return NextResponse.json({ ready: checks.every((check) => check.passed), units: 'mm', checks, bounds: metrics.bounds ?? null, exports: { stl: hasStl, threeMf: hasThreeMf }, findings: validation.findings ?? [] });
}
