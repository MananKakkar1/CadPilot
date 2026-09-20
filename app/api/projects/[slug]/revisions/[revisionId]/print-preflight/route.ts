import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectOwner } from '@/lib/projects';

export async function POST(_: Request, { params }: { params: Promise<{ slug: string; revisionId: string }> }) {
  const { slug, revisionId } = await params;
  const { project } = await requireProjectOwner(slug);
  const revision = await prisma.revision.findFirst({ where: { id: revisionId, projectId: project.id }, include: { artifacts: true } });
  if (!revision) return NextResponse.json({ error: 'Revision not found.' }, { status: 404 });
  const metrics = revision.metrics && typeof revision.metrics === 'object' ? revision.metrics as { volume?: number; triangleCount?: number; bounds?: { min?: number[]; max?: number[] } } : {};
  const validation = revision.validation && typeof revision.validation === 'object' ? revision.validation as { valid?: boolean; findings?: string[] } : {};
  const hasStl = revision.artifacts.some((artifact) => artifact.kind === 'STL');
  const hasThreeMf = revision.artifacts.some((artifact) => artifact.kind === 'THREE_MF');
  const bounds = metrics.bounds?.min && metrics.bounds.max ? metrics.bounds.max.map((value, index) => Math.abs(value - (metrics.bounds?.min?.[index] ?? value))) : [];
  const checks = [
    { id: 'valid-brep', label: 'Validated solid', passed: revision.isValid && validation.valid !== false, detail: 'The source revision passed deterministic geometry validation.' },
    { id: 'watertight', label: 'Watertight source', passed: revision.isValid && (metrics.volume ?? 0) > 0, detail: 'A measurable closed solid is required before slicing.' },
    { id: 'mesh', label: 'Mesh available', passed: hasStl && (metrics.triangleCount ?? 0) > 0, detail: hasStl ? `${(metrics.triangleCount ?? 0).toLocaleString()} triangles recorded.` : 'Generate an STL derivative before printing.' },
    { id: 'package', label: '3MF package available', passed: hasThreeMf, detail: hasThreeMf ? '3MF export is available for printer workflows.' : 'Generate a 3MF derivative for metadata-aware printers.' },
  ];
  return NextResponse.json({ revisionId, ready: checks.every((check) => check.passed), units: 'mm', bounds, checks, exports: { stl: hasStl, threeMf: hasThreeMf }, findings: validation.findings ?? [] });
}
