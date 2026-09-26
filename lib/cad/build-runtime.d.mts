export const MAX_PARTS: number;
export function hardenReplicad(replicad: any): void;
export function describeError(error: unknown): string;
export function runCode(code: string, replicad: any, options?: { timeoutMs?: number }): unknown;
export function normalizeParts(returned: unknown): Array<{ shape?: any; rawMesh?: { vertices: number[]; triangles: number[] }; name?: string; color?: string }>;
export type BuiltPart = { name: string; color: string; mesh: { vertices: number[]; triangles: number[]; normals: number[] }; volume: number; surfaceArea: number };
export type BuildResult = {
  metrics: { volume: number; surfaceArea: number; partCount: number; triangleCount: number; bounds: { min: number[]; max: number[] } };
  validation: { valid: boolean; complete: boolean; warnings: string[]; score: number; findings: string[] };
  preview: { vertices: number[]; triangles: number[]; normals: number[]; parts: Array<{ name: string; color: string; vertices: number[]; triangles: number[]; normals: number[] }> };
  stl: Uint8Array;
  step: Uint8Array | null;
  warnings: string[];
  /** Live kernel shapes for the solid parts, for consumers that project from them (drawings). */
  shapes: any[];
  parts: BuiltPart[];
};
export function buildFromCode(code: string, replicad: any): Promise<BuildResult>;
