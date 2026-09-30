import type { HolisticLandmarker, HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import type { FacePoint } from './face-alignment'

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
let tracker: Promise<HolisticLandmarker> | undefined

export function prepareSegmentation() {
  if (!tracker) tracker = (async () => {
    const { FilesetResolver, HolisticLandmarker } = await import('@mediapipe/tasks-vision')
    const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
    const options = {
      runningMode: 'IMAGE' as const,
      outputPoseSegmentationMasks: true,
      minFaceDetectionConfidence: .5,
      minFacePresenceConfidence: .5,
      outputFaceBlendshapes: false,
    }
    // Single-photo inference favors CPU: some WebGL drivers produce empty
    // float masks even when GPU face landmark detection itself succeeds.
    return HolisticLandmarker.createFromOptions(files, {
      ...options, baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/holistic_landmarker.task`, delegate: 'CPU' },
    })
  })().catch((error) => { tracker = undefined; throw error })
  return tracker
}

export async function captureSegmentedFace(video: HTMLVideoElement) {
  const detector = await prepareSegmentation()
  const snapshot = document.createElement('canvas')
  snapshot.width = video.videoWidth
  snapshot.height = video.videoHeight
  if (!snapshot.width || !snapshot.height) throw new Error('카메라가 준비되면 다시 촬영해 주세요.')
  snapshot.getContext('2d')!.drawImage(video, 0, 0)
  let output: { canvas: HTMLCanvasElement; depth: number[]; alignment: FacePoint[] } | undefined
  // Consume masks inside the callback; MediaPipe owns and frees them afterward.
  detector.detect(snapshot, (result) => { output = buildSegmentedPortrait(snapshot, result) })
  if (!output) throw new Error('얼굴을 인식하지 못했어요. 얼굴과 어깨가 보이도록 한 걸음 뒤에서 다시 촬영해 주세요.')
  return output
}

function buildSegmentedPortrait(snapshot: HTMLCanvasElement, result: HolisticLandmarkerResult) {
  const face = result.faceLandmarks[0]
  const mask = result.poseSegmentationMasks[0]
  if (!face || face.length < 468 || !mask) return undefined
  const oval = FACE_OVAL.map((index) => face[index])
  const minX = Math.min(...oval.map((point) => point.x))
  const maxX = Math.max(...oval.map((point) => point.x))
  const minY = Math.min(...oval.map((point) => point.y))
  const maxY = Math.max(...oval.map((point) => point.y))
  if (maxX - minX < .055 || maxY - minY < .09) return undefined
  const width = (maxX - minX) * 1.08
  const height = (maxY - minY) * 1.08
  const left = (minX + maxX - width) / 2
  const top = (minY + maxY - height) / 2
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.save()
  context.translate(size, 0)
  context.scale(-1, 1)
  context.drawImage(snapshot, left * snapshot.width, top * snapshot.height, width * snapshot.width, height * snapshot.height, 0, 0, size, size)
  context.restore()

  // Face oval removes torso/other people; human mask removes background along
  // the silhouette. Both use the same mirrored source coordinates as the photo.
  const silhouette = document.createElement('canvas')
  silhouette.width = silhouette.height = size
  const silhouetteContext = silhouette.getContext('2d')!
  silhouetteContext.filter = 'blur(1px)'
  silhouetteContext.fillStyle = 'white'
  silhouetteContext.beginPath()
  oval.forEach((point, index) => {
    const x = (1 - (point.x - left) / width) * size
    const y = (point.y - top) / height * size
    if (index === 0) silhouetteContext.moveTo(x, y)
    else silhouetteContext.lineTo(x, y)
  })
  silhouetteContext.closePath()
  silhouetteContext.fill()
  const outline = silhouetteContext.getImageData(0, 0, size, size).data
  const pixels = context.getImageData(0, 0, size, size)
  const confidence = mask.getAsFloat32Array()
  let visiblePixels = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sourceX = left + (1 - (x + .5) / size) * width
      const sourceY = top + (y + .5) / size * height
      const mx = Math.max(0, Math.min(mask.width - 1, Math.floor(sourceX * mask.width)))
      const my = Math.max(0, Math.min(mask.height - 1, Math.floor(sourceY * mask.height)))
      const person = Math.max(0, Math.min(1, (confidence[my * mask.width + mx] - .15) / .65))
      const alpha = (sourceX < 0 || sourceX > 1 || sourceY < 0 || sourceY > 1) ? 0 : person * person * (3 - 2 * person)
      const offset = (y * size + x) * 4 + 3
      pixels.data[offset] = Math.round(outline[offset] * alpha)
      if (pixels.data[offset] > 128) visiblePixels++
    }
  }
  if (visiblePixels < size * size * .18) return undefined
  context.putImageData(pixels, 0, 0)

  // A compact depth grid retains the individual's nose/cheek relief. Depth is
  // normalized by face width and bounded so it always stays outside the head.
  const baseline = (face[234].z + face[454].z) / 2
  const points = face.slice(0, 468).map((point) => ({
    u: 1 - (point.x - left) / width,
    v: (point.y - top) / height,
    d: Math.max(0, Math.min(.085, (baseline - point.z) / width * .17)),
  }))
  const depth: number[] = []
  for (let y = 0; y <= 32; y++) {
    for (let x = 0; x <= 32; x++) {
      let total = 0
      let weight = 0
      for (const point of points) {
        const distance = (point.u - x / 32) ** 2 + (point.v - y / 32) ** 2
        const w = Math.exp(-distance / .003)
        total += w * point.d
        weight += w
      }
      depth.push(weight > 1e-6 ? total / weight : 0)
    }
  }
  const point = (index: number): FacePoint => [1 - (face[index].x - left) / width, (face[index].y - top) / height]
  const leftToRight = (indices: number[]) => indices.map(point).sort((a, b) => a[0] - b[0])
  const alignment = [
    ...leftToRight([33, 133, 362, 263]), point(1), ...leftToRight([61, 291]),
    point(10), point(152), ...leftToRight([234, 454]),
  ]
  return { canvas, depth, alignment }
}
