import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  const outputs = await prisma.agentOutput.findMany({ where: { runId, run: { project: { ownerId: user.id } } }, include: { artifact: true, step: true }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ outputs });
}
