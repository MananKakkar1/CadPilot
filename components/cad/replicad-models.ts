export type CadModelId = 'spur-gear' | 'phone-stand';
export type CadModelValues = { teeth: number; module: number; bore: number; thickness: number; tilt: number; width: number; height: number };
export interface CadModelParams { model: CadModelId; values: CadModelValues; }
export interface CadModelResult { mesh: { vertices: number[]; triangles: number[]; normals: number[] }; metrics: { volume: number; surfaceArea: number; valid: boolean }; label: string; }
export const defaultCadValues: CadModelValues = { teeth: 20, module: 2, bore: 10, thickness: 5, tilt: 68, width: 72, height: 92 };
export function labelForModel(model: CadModelId) { return model === 'spur-gear' ? 'Spur gear' : 'Phone stand'; }
