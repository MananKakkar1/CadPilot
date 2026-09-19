export type Vec3 = [number, number, number];
export type RawMesh = { vertices: number[]; triangles: number[] };

type GridOptions = {
  /** Connect the last column back to the first (tubes, rings, lathe surfaces). */
  wrapCols?: boolean;
  /** Connect the last row back to the first. */
  wrapRows?: boolean;
  /** Reverse triangle winding (flip which side is "outside"). */
  flip?: boolean;
};

/**
 * Builds a triangle mesh from a rows x cols grid of points. pointAt(i, j) returns the [x,y,z]
 * of grid row i (0..rows-1), column j (0..cols-1). Neighbouring points are joined by two triangles.
 */
export function meshFromGrid(rows: number, cols: number, pointAt: (i: number, j: number) => Vec3, options: GridOptions = {}): RawMesh {
  if (!(rows >= 2 && cols >= 2)) throw new Error('meshFromGrid needs at least 2 rows and 2 columns.');
  const { wrapCols = false, wrapRows = false, flip = false } = options;
  const vertices: number[] = [];
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const p = pointAt(i, j);
      if (!Array.isArray(p) || p.length < 3 || p.some((c) => !Number.isFinite(c))) {
        throw new Error(`meshFromGrid: pointAt(${i}, ${j}) must return three finite numbers.`);
      }
      vertices.push(p[0], p[1], p[2]);
    }
  }
  const triangles: number[] = [];
  const rowEnd = wrapRows ? rows : rows - 1;
  const colEnd = wrapCols ? cols : cols - 1;
  for (let i = 0; i < rowEnd; i += 1) {
    for (let j = 0; j < colEnd; j += 1) {
      const i2 = (i + 1) % rows;
      const j2 = (j + 1) % cols;
      const a = i * cols + j;
      const b = i2 * cols + j;
      const c = i2 * cols + j2;
      const d = i * cols + j2;
      if (flip) triangles.push(a, c, b, a, d, c);
      else triangles.push(a, b, c, a, c, d);
    }
  }
  return { vertices, triangles };
}

/**
 * Samples a parametric surface fn(u, v) -> [x,y,z] for u, v in [0, 1] on a (uSteps+1) x (vSteps+1) grid.
 * Use closeU / closeV for surfaces that wrap around (a torus wraps in both directions).
 */
export function meshFromParametric(
  fn: (u: number, v: number) => Vec3,
  uSteps: number,
  vSteps: number,
  options: { closeU?: boolean; closeV?: boolean; flip?: boolean } = {},
): RawMesh {
  const { closeU = false, closeV = false, flip = false } = options;
  const rows = closeU ? uSteps : uSteps + 1;
  const cols = closeV ? vSteps : vSteps + 1;
  return meshFromGrid(rows, cols, (i, j) => fn(i / uSteps, j / vSteps), { wrapRows: closeU, wrapCols: closeV, flip });
}

/**
 * Revolves a 2D profile of [radius, z] points around the Z axis. Profile order runs bottom to top.
 * A radius of 0 is allowed (poles/caps). Capped ends are not added: include r=0 points to close the ends.
 */
export function latheMesh(profile: Array<[number, number]>, segments = 48, options: { flip?: boolean } = {}): RawMesh {
  if (profile.length < 2) throw new Error('latheMesh needs at least 2 profile points.');
  return meshFromGrid(
    profile.length,
    segments,
    (i, j) => {
      const angle = (j / segments) * Math.PI * 2;
      const [r, z] = profile[i];
      return [Math.cos(angle) * r, Math.sin(angle) * r, z];
    },
    { wrapCols: true, flip: options.flip },
  );
}

export function mergeMeshes(meshes: RawMesh[]): RawMesh {
  const vertices: number[] = [];
  const triangles: number[] = [];
  for (const mesh of meshes) {
    const offset = vertices.length / 3;
    for (const v of mesh.vertices) vertices.push(v);
    for (const t of mesh.triangles) triangles.push(t + offset);
  }
  return { vertices, triangles };
}

export function translateMesh(mesh: RawMesh, [dx, dy, dz]: Vec3): RawMesh {
  const vertices = mesh.vertices.slice();
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] += dx;
    vertices[i + 1] += dy;
    vertices[i + 2] += dz;
  }
  return { vertices, triangles: mesh.triangles.slice() };
}

export function scaleMesh(mesh: RawMesh, [sx, sy, sz]: Vec3): RawMesh {
  const vertices = mesh.vertices.slice();
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] *= sx;
    vertices[i + 1] *= sy;
    vertices[i + 2] *= sz;
  }
  return { vertices, triangles: mesh.triangles.slice() };
}

/** Checks a mesh is well-formed; throws a descriptive error otherwise. */
export function validateRawMesh(mesh: RawMesh, label: string, maxTriangles = 400_000): void {
  const { vertices, triangles } = mesh;
  if (!Array.isArray(vertices) || !Array.isArray(triangles)) throw new Error(`${label}: mesh needs vertices and triangles arrays.`);
  if (vertices.length === 0 || vertices.length % 3 !== 0) throw new Error(`${label}: vertices must be a flat [x,y,z,...] array with a length that is a multiple of 3.`);
  if (triangles.length === 0 || triangles.length % 3 !== 0) throw new Error(`${label}: triangles must be a flat [a,b,c,...] index array with a length that is a multiple of 3.`);
  if (triangles.length / 3 > maxTriangles) throw new Error(`${label}: ${triangles.length / 3} triangles exceeds the ${maxTriangles} limit.`);
  const vertexCount = vertices.length / 3;
  for (let i = 0; i < vertices.length; i += 1) {
    if (!Number.isFinite(vertices[i])) throw new Error(`${label}: vertices contains a non-finite value at index ${i}.`);
  }
  for (let i = 0; i < triangles.length; i += 1) {
    const index = triangles[i];
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) throw new Error(`${label}: triangle index ${index} at position ${i} is outside 0..${vertexCount - 1}.`);
  }
}

/** Absolute enclosed volume (divergence theorem) and total surface area of a triangle mesh. */
export function measureRawMesh(mesh: RawMesh): { volume: number; surfaceArea: number } {
  const { vertices: v, triangles: t } = mesh;
  let signedVolume = 0;
  let area = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3;
    const b = t[i + 1] * 3;
    const c = t[i + 2] * 3;
    const ax = v[a], ay = v[a + 1], az = v[a + 2];
    const bx = v[b], by = v[b + 1], bz = v[b + 2];
    const cx = v[c], cy = v[c + 1], cz = v[c + 2];
    signedVolume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
  }
  return { volume: Math.abs(signedVolume), surfaceArea: area };
}

export const meshHelpers = { meshFromGrid, meshFromParametric, latheMesh, mergeMeshes, translateMesh, scaleMesh };
export type MeshHelpers = typeof meshHelpers;
