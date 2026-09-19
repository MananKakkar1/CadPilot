/**
 * Builds a triangle mesh from a rows x cols grid of points. pointAt(i, j) returns the [x,y,z]
 * of grid row i (0..rows-1), column j (0..cols-1). Neighbouring points are joined by two triangles.
 */
export function meshFromGrid(rows, cols, pointAt, options = {}) {
    if (!(rows >= 2 && cols >= 2))
        throw new Error('meshFromGrid needs at least 2 rows and 2 columns.');
    const { wrapCols = false, wrapRows = false, flip = false } = options;
    const vertices = [];
    for (let i = 0; i < rows; i += 1) {
        for (let j = 0; j < cols; j += 1) {
            const p = pointAt(i, j);
            if (!Array.isArray(p) || p.length < 3 || p.some((c) => !Number.isFinite(c))) {
                throw new Error(`meshFromGrid: pointAt(${i}, ${j}) must return three finite numbers.`);
            }
            vertices.push(p[0], p[1], p[2]);
        }
    }
    const triangles = [];
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
            if (flip)
                triangles.push(a, c, b, a, d, c);
            else
                triangles.push(a, b, c, a, c, d);
        }
    }
    return { vertices, triangles };
}
/**
 * Samples a parametric surface fn(u, v) -> [x,y,z] for u, v in [0, 1] on a (uSteps+1) x (vSteps+1) grid.
 * Use closeU / closeV for surfaces that wrap around (a torus wraps in both directions).
 */
export function meshFromParametric(fn, uSteps, vSteps, options = {}) {
    const { closeU = false, closeV = false, flip = false } = options;
    const rows = closeU ? uSteps : uSteps + 1;
    const cols = closeV ? vSteps : vSteps + 1;
    return meshFromGrid(rows, cols, (i, j) => fn(i / uSteps, j / vSteps), { wrapRows: closeU, wrapCols: closeV, flip });
}
/**
 * Revolves a 2D profile of [radius, z] points around the Z axis. Profile order runs bottom to top.
 * A radius of 0 is allowed (poles/caps). Capped ends are not added: include r=0 points to close the ends.
 */
export function latheMesh(profile, segments = 48, options = {}) {
    if (profile.length < 2)
        throw new Error('latheMesh needs at least 2 profile points.');
    return meshFromGrid(profile.length, segments, (i, j) => {
        const angle = (j / segments) * Math.PI * 2;
        const [r, z] = profile[i];
        return [Math.cos(angle) * r, Math.sin(angle) * r, z];
    }, { wrapCols: true, flip: options.flip });
}
export function mergeMeshes(meshes) {
    const vertices = [];
    const triangles = [];
    for (const mesh of meshes) {
        const offset = vertices.length / 3;
        for (const v of mesh.vertices)
            vertices.push(v);
        for (const t of mesh.triangles)
            triangles.push(t + offset);
    }
    return { vertices, triangles };
}
export function translateMesh(mesh, [dx, dy, dz]) {
    const vertices = mesh.vertices.slice();
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i] += dx;
        vertices[i + 1] += dy;
        vertices[i + 2] += dz;
    }
    return { vertices, triangles: mesh.triangles.slice() };
}
export function scaleMesh(mesh, [sx, sy, sz]) {
    const vertices = mesh.vertices.slice();
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i] *= sx;
        vertices[i + 1] *= sy;
        vertices[i + 2] *= sz;
    }
    return { vertices, triangles: mesh.triangles.slice() };
}
/** Checks a mesh is well-formed; throws a descriptive error otherwise. */
export function validateRawMesh(mesh, label, maxTriangles = 400_000) {
    const { vertices, triangles } = mesh;
    if (!Array.isArray(vertices) || !Array.isArray(triangles))
        throw new Error(`${label}: mesh needs vertices and triangles arrays.`);
    if (vertices.length === 0 || vertices.length % 3 !== 0)
        throw new Error(`${label}: vertices must be a flat [x,y,z,...] array with a length that is a multiple of 3.`);
    if (triangles.length === 0 || triangles.length % 3 !== 0)
        throw new Error(`${label}: triangles must be a flat [a,b,c,...] index array with a length that is a multiple of 3.`);
    if (triangles.length / 3 > maxTriangles)
        throw new Error(`${label}: ${triangles.length / 3} triangles exceeds the ${maxTriangles} limit.`);
    const vertexCount = vertices.length / 3;
    for (let i = 0; i < vertices.length; i += 1) {
        if (!Number.isFinite(vertices[i]))
            throw new Error(`${label}: vertices contains a non-finite value at index ${i}.`);
    }
    for (let i = 0; i < triangles.length; i += 1) {
        const index = triangles[i];
        if (!Number.isInteger(index) || index < 0 || index >= vertexCount)
            throw new Error(`${label}: triangle index ${index} at position ${i} is outside 0..${vertexCount - 1}.`);
    }
}
/** Absolute enclosed volume (divergence theorem) and total surface area of a triangle mesh. */
export function measureRawMesh(mesh) {
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
function boundsOfVertices(vertices) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 3) {
        for (let k = 0; k < 3; k += 1) {
            const value = vertices[i + k];
            if (value < min[k])
                min[k] = value;
            if (value > max[k])
                max[k] = value;
        }
    }
    return { min, max };
}
// Distance between two axis-aligned boxes; 0 if they touch or overlap.
function boxDistance(a, b) {
    let sumSq = 0;
    for (let k = 0; k < 3; k += 1) {
        const gap = Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k], 0);
        sumSq += gap * gap;
    }
    return Math.sqrt(sumSq);
}
/**
 * Flags parts whose bounding box sits far from every other part in the assembly — a strong signal
 * of a coordinate/rotation mistake in generated placement code (a leg, bolt, or panel translated to
 * the wrong spot), since nothing in a real, properly-assembled object floats disconnected from
 * everything else. Compares each part to its NEAREST neighbour (not the assembly's centroid), so
 * legitimately spread-out but touching parts (e.g. a car's four wheels) are never flagged.
 * Returns the names of parts isolated by more than `thresholdFraction` of the assembly's own
 * bounding-box diagonal (default 12%).
 */
export function findDisconnectedParts(parts, thresholdFraction = 0.12) {
    if (parts.length < 2)
        return [];
    const boxes = parts.map((part) => ({ name: part.name, ...boundsOfVertices(part.vertices) }));
    const overallMin = [Infinity, Infinity, Infinity];
    const overallMax = [-Infinity, -Infinity, -Infinity];
    for (const box of boxes) {
        for (let k = 0; k < 3; k += 1) {
            overallMin[k] = Math.min(overallMin[k], box.min[k]);
            overallMax[k] = Math.max(overallMax[k], box.max[k]);
        }
    }
    const diagonal = Math.hypot(overallMax[0] - overallMin[0], overallMax[1] - overallMin[1], overallMax[2] - overallMin[2]);
    if (!Number.isFinite(diagonal) || diagonal === 0)
        return [];
    const threshold = diagonal * thresholdFraction;
    const disconnected = [];
    for (let i = 0; i < boxes.length; i += 1) {
        let nearest = Infinity;
        for (let j = 0; j < boxes.length; j += 1) {
            if (i === j)
                continue;
            nearest = Math.min(nearest, boxDistance(boxes[i], boxes[j]));
        }
        if (nearest > threshold)
            disconnected.push(boxes[i].name);
    }
    return disconnected;
}
export const meshHelpers = { meshFromGrid, meshFromParametric, latheMesh, mergeMeshes, translateMesh, scaleMesh };
