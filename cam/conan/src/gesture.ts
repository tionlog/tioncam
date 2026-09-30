export type Point3 = { x: number; y: number; z: number }

const distance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

function straightness(points: Point3[], joints: number[]) {
  let length = 0
  for (let i = 1; i < joints.length; i++) length += distance(points[joints[i - 1]], points[joints[i]])
  return length > 1e-6 ? distance(points[joints[0]], points[joints[joints.length - 1]]) / length : 0
}

/** Camera coordinates: negative Z points toward the lens. No handedness assumptions. */
export function isConanPose(normalized: Point3[], world: Point3[] | undefined, aspect: number) {
  if (normalized.length !== 21 || !normalized.every(p => [p.x, p.y, p.z].every(Number.isFinite))) return false
  // Normalized Z uses the same scale as X; correct Y for the camera aspect ratio.
  const camera = normalized.map(p => ({ x: p.x, y: p.y / aspect, z: p.z }))
  const points = world?.length === 21 && world.every(p => [p.x, p.y, p.z].every(Number.isFinite)) ? world : camera
  const palm = distance(points[0], points[9])
  if (palm < 1e-6) return false

  const indexLength = distance(camera[5], camera[8])
  const towardCamera = indexLength > 1e-6 && (camera[5].z - camera[8].z) / indexLength > .32
  const indexExtended = straightness(points, [5, 6, 7, 8]) > .78
    && distance(points[5], points[8]) > palm * .5
  const thumbExtended = straightness(points, [1, 2, 3, 4]) > .8
    && distance(points[4], points[5]) > palm * .48
    && distance(points[4], points[8]) > palm * .5
  const foldedFingers = [[9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].filter(joints => {
    const [, pip, , tip] = joints
    return straightness(points, joints) < .76
      || distance(points[0], points[tip]) < distance(points[0], points[pip]) * 1.08
  }).length

  return towardCamera && indexExtended && thumbExtended && foldedFingers >= 2
}

type VisiblePoint = Point3 & { visibility?: number }

/** Both palms meet near the face, with extended fingers pointing upward. */
export function isPrayerPose(
  left: Point3[], right: Point3[], face: Point3[], pose: VisiblePoint[], aspect: number,
) {
  if (!Number.isFinite(aspect) || aspect <= 0) return false
  const valid = (points: Point3[]) => points.every(p => [p.x, p.y, p.z].every(Number.isFinite))
  if (left.length !== 21 || right.length !== 21 || !valid(left) || !valid(right)) return false
  // Each hand's Z has its own wrist origin, so compare hands in image space.
  const imagePoints = (points: Point3[]) => points.map(p => ({ x: p.x, y: p.y / aspect, z: 0 }))
  const a = imagePoints(left)
  const b = imagePoints(right)
  const midpoint = (p: Point3, q: Point3): Point3 => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: 0 })
  const palmA = distance(a[0], a[9])
  const palmB = distance(b[0], b[9])
  const palm = (palmA + palmB) / 2
  if (palm < .015 || Math.min(palmA, palmB) / Math.max(palmA, palmB) < .45) return false

  const upright = (hand: Point3[]) => {
    const length = distance(hand[0], hand[12])
    if (length < palm * 1.1 || (hand[0].y - hand[12].y) / length < .65) return false
    return [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].filter(joints => {
      return straightness(hand, joints) > .72
        && distance(hand[0], hand[joints[3]]) > distance(hand[0], hand[joints[1]]) * 1.12
    }).length >= 3
  }
  if (!upright(a) || !upright(b)) return false
  if (distance(a[9], b[9]) > palm * .95 || distance(a[0], b[0]) > palm * 1.2
    || distance(a[12], b[12]) > palm * .95) return false

  let faceLeft: number, faceRight: number, faceTop: number, faceBottom: number
  if (face.length >= 468 && valid(face)) {
    const outline = imagePoints([face[10], face[152], face[234], face[454]])
    faceLeft = Math.min(...outline.map(p => p.x))
    faceRight = Math.max(...outline.map(p => p.x))
    faceTop = Math.min(...outline.map(p => p.y))
    faceBottom = Math.max(...outline.map(p => p.y))
  } else {
    // Hands can hide the mouth/nose from the face mesh; body head landmarks remain useful.
    const head = [pose[0], pose[7], pose[8]]
    if (head.some(p => !p || (p.visibility ?? 1) < .45) || !valid(head)) return false
    const [nose, earA, earB] = imagePoints(head)
    const faceWidth = distance(earA, earB)
    if (faceWidth < .025) return false
    faceLeft = nose.x - faceWidth * .65
    faceRight = nose.x + faceWidth * .65
    faceTop = nose.y - faceWidth * .8
    faceBottom = nose.y + faceWidth * .65
  }
  const faceWidth = faceRight - faceLeft
  const faceHeight = faceBottom - faceTop
  if (faceWidth < .02 || faceHeight < .02) return false
  const tips = midpoint(a[12], b[12])
  const palms = midpoint(a[9], b[9])
  return tips.x >= faceLeft - faceWidth * .25 && tips.x <= faceRight + faceWidth * .25
    && tips.y >= faceTop - faceHeight * .2 && tips.y <= faceBottom + faceHeight * .15
    && palms.y <= faceBottom + faceHeight * .6
    && Math.abs(palms.x - (faceLeft + faceRight) / 2) <= faceWidth * .8
}

/** Require a deliberate hold, then tolerate a few missed hand detections. */
export class PoseHold {
  private since: number | null = null
  private lastSeen = -Infinity
  active = false
  private holdMs: number
  private releaseMs: number

  constructor(holdMs = 180, releaseMs = 420) {
    this.holdMs = holdMs
    this.releaseMs = releaseMs
  }

  update(detected: boolean, now: number) {
    if (detected) {
      if (this.since === null) this.since = now
      this.lastSeen = now
      if (now - this.since >= this.holdMs) this.active = true
    } else {
      this.since = null
      if (now - this.lastSeen > this.releaseMs) this.active = false
    }
    return this.active
  }

  reset() {
    this.since = null
    this.lastSeen = -Infinity
    this.active = false
  }
}
