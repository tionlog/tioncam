export type FacePoint = [number, number]

// Front-facing proportions: four eye corners, nose, two mouth corners,
// forehead, chin and cheek edges, independent of the photographed silhouette.
export const FACE_TARGETS: readonly FacePoint[] = [
  [.19, .405], [.38, .405], [.62, .405], [.81, .405],
  [.5, .58], [.35, .735], [.65, .735],
  [.5, .045], [.5, .955], [.065, .51], [.935, .51],
]

export function validFaceAlignment(value: unknown): value is FacePoint[] {
  return Array.isArray(value) && value.length === FACE_TARGETS.length
    && value.every((p) => Array.isArray(p) && p.length === 2
      && p.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -.25 && v <= 1.25))
}

const radial = (squaredDistance: number) => squaredDistance < 1e-12 ? 0 : squaredDistance * Math.log(squaredDistance)

// Continuous inverse thin-plate-spline warp: no triangle seams or radial jaw
// stretching. Boundary anchors keep painted textures stable at the perimeter.
export function createFaceSampler(alignment?: readonly FacePoint[]) {
  if (!validFaceAlignment(alignment)) return (u: number, v: number): FacePoint => [u, v]
  const targets: readonly FacePoint[] = [...FACE_TARGETS, [0, 0], [1, 0], [0, 1], [1, 1]]
  const sources: readonly FacePoint[] = [...alignment, [0, 0], [1, 0], [0, 1], [1, 1]]
  const count = targets.length
  const size = count + 3
  const matrix = Array.from({ length: size }, () => new Float64Array(size + 2))
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) matrix[i][j] = radial((targets[i][0] - targets[j][0]) ** 2 + (targets[i][1] - targets[j][1]) ** 2)
    matrix[i][count] = matrix[count][i] = 1
    matrix[i][count + 1] = matrix[count + 1][i] = targets[i][0]
    matrix[i][count + 2] = matrix[count + 2][i] = targets[i][1]
    matrix[i][size] = sources[i][0]
    matrix[i][size + 1] = sources[i][1]
  }
  for (let column = 0; column < size; column++) {
    let pivot = column
    for (let row = column + 1; row < size; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row
    if (Math.abs(matrix[pivot][column]) < 1e-10) return (u: number, v: number): FacePoint => [u, v]
    ;[matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]]
    const divisor = matrix[column][column]
    for (let j = column; j < size + 2; j++) matrix[column][j] /= divisor
    for (let row = 0; row < size; row++) {
      if (row === column) continue
      const factor = matrix[row][column]
      for (let j = column; j < size + 2; j++) matrix[row][j] -= factor * matrix[column][j]
    }
  }
  return (u: number, v: number): FacePoint => {
    let x = matrix[count][size] + matrix[count + 1][size] * u + matrix[count + 2][size] * v
    let y = matrix[count][size + 1] + matrix[count + 1][size + 1] * u + matrix[count + 2][size + 1] * v
    for (let i = 0; i < count; i++) {
      const weight = radial((u - targets[i][0]) ** 2 + (v - targets[i][1]) ** 2)
      x += matrix[i][size] * weight
      y += matrix[i][size + 1] * weight
    }
    return [x, y]
  }
}
