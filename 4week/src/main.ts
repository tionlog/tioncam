import type { HolisticLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import './style.css'

type Point = { x: number; y: number }
type HandSide = 'left' | 'right'
type AnchorBinding = { wedge: number; centerWeight: number; firstWeight: number; secondWeight: number }
type SurfaceVertex = AnchorBinding & { edgeAlpha: number }
type HandStretch = {
  active: boolean
  missingFrames: number
  latched: boolean
  anchor: AnchorBinding | null
  anchorPoint: Point
  target: Point
  pull: Point
  velocity: Point
}

const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]
const SURFACE_DIVISIONS = 14
const DETECTION_INTERVAL = 36

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="experience">
    <video id="camera" muted playsinline aria-hidden="true"></video>
    <div id="stage" aria-label="한 손 또는 양손으로 얼굴을 잡아 고무처럼 늘리는 카메라 화면"></div>

    <header class="topbar">
      <a class="home" href="/" aria-label="홈으로 이동">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v8.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-8.6Z"/><path d="M9.2 21v-6.8h5.6V21"/></svg>
      </a>
      <div class="title"><span>WEEK 04</span><strong>RUBBER FACE</strong></div>
      <div class="status" id="status" role="status" aria-live="polite"><i></i><span>카메라 준비 중</span></div>
    </header>

    <aside class="guide" aria-label="사용 방법">
      <div class="pinch-mark" aria-hidden="true"><span>●</span><span>●</span></div>
      <p><b>한 손 또는 양손으로 당겨보세요</b><small>얼굴을 Pinch하고 길게 늘인 뒤 놓으면 부드럽게 돌아옵니다.</small></p>
    </aside>

    <section class="intro" id="intro" aria-live="polite">
      <div class="intro-icon" aria-hidden="true">🤏</div>
      <p>WEEK 04 · FACE LAB</p>
      <h1>Rubber Face</h1>
      <div id="introCopy">얼굴과 손의 움직임을 인식하려면 카메라 권한이 필요해요.</div>
      <button id="startCamera" type="button">카메라 시작하기</button>
    </section>
  </main>
`

const video = document.querySelector<HTMLVideoElement>('#camera')!
const stage = document.querySelector<HTMLDivElement>('#stage')!
const intro = document.querySelector<HTMLElement>('#intro')!
const introCopy = document.querySelector<HTMLDivElement>('#introCopy')!
const startButton = document.querySelector<HTMLButtonElement>('#startCamera')!
const status = document.querySelector<HTMLDivElement>('#status')!
const statusText = status.querySelector<HTMLSpanElement>('span')!

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setClearColor(0x120f10, 1)
stage.append(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10)
camera.position.z = 3

const videoTexture = new THREE.VideoTexture(video)
videoTexture.colorSpace = THREE.SRGBColorSpace
videoTexture.minFilter = THREE.LinearFilter
videoTexture.magFilter = THREE.LinearFilter
videoTexture.flipY = true
const background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: videoTexture }))
scene.add(background)

const snapshotCanvas = document.createElement('canvas')
const snapshotContext = snapshotCanvas.getContext('2d', { alpha: false })!
const snapshotTexture = new THREE.CanvasTexture(snapshotCanvas)
snapshotTexture.colorSpace = THREE.SRGBColorSpace
snapshotTexture.minFilter = THREE.LinearFilter
snapshotTexture.magFilter = THREE.LinearFilter
snapshotTexture.generateMipmaps = false
snapshotTexture.flipY = true

function barycentric(wedge: number, centerWeight: number, firstWeight: number, secondWeight: number): AnchorBinding {
  return { wedge, centerWeight, firstWeight, secondWeight }
}

function buildSurfaceVertices() {
  const vertices: SurfaceVertex[] = []
  const pushVertex = (binding: AnchorBinding) => {
    const radius = binding.firstWeight + binding.secondWeight
    vertices.push({ ...binding, edgeAlpha: 1 - THREE.MathUtils.smoothstep(radius, 0.88, 1) })
  }
  for (let wedge = 0; wedge < FACE_OVAL.length; wedge += 1) {
    for (let row = 0; row < SURFACE_DIVISIONS; row += 1) {
      for (let column = 0; column < SURFACE_DIVISIONS - row; column += 1) {
        const make = (first: number, second: number) => barycentric(
          wedge,
          1 - (first + second) / SURFACE_DIVISIONS,
          first / SURFACE_DIVISIONS,
          second / SURFACE_DIVISIONS,
        )
        const a = make(row, column)
        const b = make(row + 1, column)
        const c = make(row, column + 1)
        pushVertex(a)
        pushVertex(b)
        pushVertex(c)
        if (row + column < SURFACE_DIVISIONS - 1) {
          pushVertex(b)
          pushVertex(make(row + 1, column + 1))
          pushVertex(c)
        }
      }
    }
  }
  return vertices
}

const surfaceVertices = buildSurfaceVertices()
const surfaceGeometry = new THREE.BufferGeometry()
const surfacePositions = new Float32Array(surfaceVertices.length * 3)
const surfaceUvs = new Float32Array(surfaceVertices.length * 2)
const surfaceEdgeAlpha = new Float32Array(surfaceVertices.map((vertex) => vertex.edgeAlpha))
surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(surfacePositions, 3).setUsage(THREE.DynamicDrawUsage))
surfaceGeometry.setAttribute('uv', new THREE.BufferAttribute(surfaceUvs, 2).setUsage(THREE.DynamicDrawUsage))
surfaceGeometry.setAttribute('edgeAlpha', new THREE.BufferAttribute(surfaceEdgeAlpha, 1))

const faceMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: snapshotTexture },
    uAnchorLeft: { value: new THREE.Vector2() },
    uPullLeft: { value: new THREE.Vector2() },
    uOpacityLeft: { value: 0 },
    uEnabledLeft: { value: 0 },
    uAnchorRight: { value: new THREE.Vector2() },
    uPullRight: { value: new THREE.Vector2() },
    uOpacityRight: { value: 0 },
    uEnabledRight: { value: 0 },
    uFaceSize: { value: new THREE.Vector2(0.5, 0.7) },
  },
  vertexShader: `
    attribute float edgeAlpha;
    uniform vec2 uAnchorLeft;
    uniform vec2 uPullLeft;
    uniform float uOpacityLeft;
    uniform float uEnabledLeft;
    uniform vec2 uAnchorRight;
    uniform vec2 uPullRight;
    uniform float uOpacityRight;
    uniform float uEnabledRight;
    uniform vec2 uFaceSize;
    varying vec2 vUv;
    varying float vEdgeAlpha;
    varying float vPatchAlpha;

    vec2 rubberOffset(vec2 base, vec2 anchor, vec2 pull, float enabled, out float influence) {
      vec2 delta = base - anchor;
      float pullLength = length(pull);
      float stretch = clamp(pullLength / max(uFaceSize.x, 0.001), 0.0, 2.4);
      vec2 radius = uFaceSize * vec2(0.32 + stretch * 0.045, 0.275 + stretch * 0.038);
      vec2 local = delta / max(radius, vec2(0.001));
      influence = exp(-1.32 * dot(local, local)) * enabled;
      vec2 direction = pullLength > 0.0001 ? pull / pullLength : vec2(1.0, 0.0);
      vec2 normal = vec2(-direction.y, direction.x);
      float sideDistance = dot(delta, normal);
      vec2 narrowing = -normal * sideDistance * influence * stretch * 0.22;
      return pull * influence + narrowing;
    }

    void main() {
      vUv = uv;
      vEdgeAlpha = edgeAlpha;
      float influenceLeft;
      float influenceRight;
      vec2 offsetLeft = rubberOffset(position.xy, uAnchorLeft, uPullLeft, uEnabledLeft, influenceLeft);
      vec2 offsetRight = rubberOffset(position.xy, uAnchorRight, uPullRight, uEnabledRight, influenceRight);
      vec2 deformed = position.xy + offsetLeft + offsetRight;
      float patchLeft = smoothstep(0.14, 0.56, influenceLeft) * uOpacityLeft;
      float patchRight = smoothstep(0.14, 0.56, influenceRight) * uOpacityRight;
      vPatchAlpha = max(patchLeft, patchRight);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(deformed, position.z, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uMap;
    varying vec2 vUv;
    varying float vEdgeAlpha;
    varying float vPatchAlpha;
    void main() {
      vec4 skin = texture2D(uMap, vUv);
      float alpha = vEdgeAlpha * vPatchAlpha;
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(skin.rgb, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
})

const stretchUniforms = {
  left: {
    anchor: faceMaterial.uniforms.uAnchorLeft,
    pull: faceMaterial.uniforms.uPullLeft,
    opacity: faceMaterial.uniforms.uOpacityLeft,
    enabled: faceMaterial.uniforms.uEnabledLeft,
  },
  right: {
    anchor: faceMaterial.uniforms.uAnchorRight,
    pull: faceMaterial.uniforms.uPullRight,
    opacity: faceMaterial.uniforms.uOpacityRight,
    enabled: faceMaterial.uniforms.uEnabledRight,
  },
}

const faceSurface = new THREE.Mesh(surfaceGeometry, faceMaterial)
faceSurface.position.z = 0.14
faceSurface.renderOrder = 1
faceSurface.frustumCulled = false
faceSurface.visible = false
scene.add(faceSurface)

let landmarker: HolisticLandmarker | null = null
let stream: MediaStream | null = null
let modelReady = false
let cameraReady = false
let faceReady = false
let lastVideoTime = -1
let lastDetectionAt = 0
let lastFrameAt = performance.now()
let hasCleanSnapshot = false
let snapshotActive = false
let faceCenter: Point = { x: 0, y: 0 }
let faceWidth = 0.5
let faceHeight = 0.7
let facePoints: Point[] = []
let faceUvs: Point[] = []
let statusKey = ''
const handSides: HandSide[] = ['left', 'right']
const createHandStretch = (): HandStretch => ({
  active: false,
  missingFrames: 0,
  latched: false,
  anchor: null,
  anchorPoint: { x: 0, y: 0 },
  target: { x: 0, y: 0 },
  pull: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
})
const handStretches: Record<HandSide, HandStretch> = {
  left: createHandStretch(),
  right: createHandStretch(),
}

function setStatus(message: string, tone: '' | 'ready' | 'active' | 'error' = '') {
  const nextKey = `${tone}:${message}`
  if (nextKey === statusKey) return
  statusKey = nextKey
  statusText.textContent = message
  status.classList.remove('ready', 'active', 'error')
  if (tone) status.classList.add(tone)
}

function normalizedToStage(x: number, y: number): Point {
  return { x: (1 - x * 2) * Math.abs(background.scale.x), y: (1 - y * 2) * background.scale.y }
}

function updateBackgroundScale() {
  if (!video.videoWidth || !video.videoHeight) return
  const videoAspect = video.videoWidth / video.videoHeight
  const viewportAspect = Math.max(1, innerWidth) / Math.max(1, innerHeight)
  const scaleX = videoAspect > viewportAspect ? videoAspect / viewportAspect : 1
  const scaleY = videoAspect > viewportAspect ? 1 : viewportAspect / videoAspect
  background.scale.set(-scaleX, scaleY, 1)
}

function updateAnchorPoint(binding: AnchorBinding, output: Point) {
  const first = facePoints[binding.wedge]
  const second = facePoints[(binding.wedge + 1) % facePoints.length]
  output.x = faceCenter.x * binding.centerWeight + first.x * binding.firstWeight + second.x * binding.secondWeight
  output.y = faceCenter.y * binding.centerWeight + first.y * binding.firstWeight + second.y * binding.secondWeight
}

function updateSurfacePositions() {
  if (!facePoints.length) return
  const pointCount = facePoints.length
  for (let index = 0; index < surfaceVertices.length; index += 1) {
    const vertex = surfaceVertices[index]
    const first = facePoints[vertex.wedge]
    const second = facePoints[(vertex.wedge + 1) % pointCount]
    surfacePositions[index * 3] = faceCenter.x * vertex.centerWeight
      + first.x * vertex.firstWeight + second.x * vertex.secondWeight
    surfacePositions[index * 3 + 1] = faceCenter.y * vertex.centerWeight
      + first.y * vertex.firstWeight + second.y * vertex.secondWeight
  }
  ;(surfaceGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
}

function updateSurfaceUvs() {
  if (!faceUvs.length) return
  let centerX = 0
  let centerY = 0
  for (const uv of faceUvs) {
    centerX += uv.x
    centerY += uv.y
  }
  centerX /= faceUvs.length
  centerY /= faceUvs.length
  const pointCount = faceUvs.length
  for (let index = 0; index < surfaceVertices.length; index += 1) {
    const vertex = surfaceVertices[index]
    const first = faceUvs[vertex.wedge]
    const second = faceUvs[(vertex.wedge + 1) % pointCount]
    surfaceUvs[index * 2] = centerX * vertex.centerWeight
      + first.x * vertex.firstWeight + second.x * vertex.secondWeight
    surfaceUvs[index * 2 + 1] = centerY * vertex.centerWeight
      + first.y * vertex.firstWeight + second.y * vertex.secondWeight
  }
  ;(surfaceGeometry.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true
}

function updateFace(landmarks: NormalizedLandmark[]) {
  const mix = faceReady ? 0.52 : 1
  if (!facePoints.length) {
    facePoints = FACE_OVAL.map(() => ({ x: 0, y: 0 }))
    faceUvs = FACE_OVAL.map(() => ({ x: 0, y: 0 }))
  }

  const scaleX = Math.abs(background.scale.x)
  const scaleY = background.scale.y
  let centerX = 0
  let centerY = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let index = 0; index < FACE_OVAL.length; index += 1) {
    const landmark = landmarks[FACE_OVAL[index]]
    const incomingX = (1 - landmark.x * 2) * scaleX
    const incomingY = (1 - landmark.y * 2) * scaleY
    const point = facePoints[index]
    point.x += (incomingX - point.x) * mix
    point.y += (incomingY - point.y) * mix
    if (!snapshotActive) {
      const uv = faceUvs[index]
      uv.x += (landmark.x - uv.x) * mix
      uv.y += (1 - landmark.y - uv.y) * mix
    }
    centerX += point.x
    centerY += point.y
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  faceCenter.x = centerX / facePoints.length
  faceCenter.y = centerY / facePoints.length
  faceWidth = Math.max(0.08, maxX - minX)
  faceHeight = Math.max(0.12, maxY - minY)
  faceMaterial.uniforms.uFaceSize.value.set(faceWidth, faceHeight)
  // Positions keep following the live face. Texture coordinates are committed
  // only together with a clean camera snapshot so the skin never slips.
  updateSurfacePositions()
  faceReady = true
}

function triangleBinding(point: Point, wedge: number): AnchorBinding | null {
  const first = facePoints[wedge]
  const second = facePoints[(wedge + 1) % facePoints.length]
  const denominator = (first.y - second.y) * (faceCenter.x - second.x) + (second.x - first.x) * (faceCenter.y - second.y)
  if (Math.abs(denominator) < 0.000001) return null
  const centerWeight = ((first.y - second.y) * (point.x - second.x) + (second.x - first.x) * (point.y - second.y)) / denominator
  const firstWeight = ((second.y - faceCenter.y) * (point.x - second.x) + (faceCenter.x - second.x) * (point.y - second.y)) / denominator
  const secondWeight = 1 - centerWeight - firstWeight
  // Keep the trigger just inside the facial silhouette. A loose tolerance here
  // makes a pinch beside the hair or jaw look like a second cut-out face.
  return centerWeight >= 0.025 && firstWeight >= -0.002 && secondWeight >= -0.002
    ? barycentric(wedge, centerWeight, firstWeight, secondWeight)
    : null
}

function findFaceBinding(point: Point) {
  for (let wedge = 0; wedge < facePoints.length; wedge += 1) {
    const binding = triangleBinding(point, wedge)
    if (binding) return binding
  }
  return null
}

function landmarkDistance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pinchRatio(hand: NormalizedLandmark[]) {
  return landmarkDistance(hand[4], hand[8]) / Math.max(0.001, landmarkDistance(hand[5], hand[17]))
}

function pinchPoint(hand: NormalizedLandmark[]) {
  return normalizedToStage((hand[4].x + hand[8].x) * 0.5, (hand[4].y + hand[8].y) * 0.5)
}

function handOverFace(hand: NormalizedLandmark[] | undefined) {
  if (!hand || !faceReady) return false
  return hand.some((landmark) => Boolean(findFaceBinding(normalizedToStage(landmark.x, landmark.y))))
}

function refreshSnapshot() {
  if (!video.videoWidth || !video.videoHeight) return
  if (snapshotCanvas.width !== video.videoWidth || snapshotCanvas.height !== video.videoHeight) {
    snapshotCanvas.width = video.videoWidth
    snapshotCanvas.height = video.videoHeight
  }
  snapshotContext.setTransform(1, 0, 0, 1, 0, 0)
  snapshotContext.drawImage(video, 0, 0)
  updateSurfaceUvs()
  snapshotTexture.needsUpdate = true
  hasCleanSnapshot = true
}

function activeHandCount() {
  let count = 0
  for (const side of handSides) if (handStretches[side].active) count += 1
  return count
}

function beginPinch(side: HandSide, point: Point) {
  const stretch = handStretches[side]
  if (!faceReady || stretch.anchor || (!snapshotActive && !hasCleanSnapshot)) return
  const binding = findFaceBinding(point)
  if (!binding) return

  stretch.active = true
  stretch.missingFrames = 0
  stretch.anchor = binding
  stretch.target = { x: 0, y: 0 }
  stretch.pull = { x: 0, y: 0 }
  stretch.velocity = { x: 0, y: 0 }
  snapshotActive = true
  faceSurface.visible = true

  updateAnchorPoint(binding, stretch.anchorPoint)
  const uniforms = stretchUniforms[side]
  uniforms.anchor.value.set(stretch.anchorPoint.x, stretch.anchorPoint.y)
  uniforms.pull.value.set(0, 0)
  uniforms.opacity.value = 0
  uniforms.enabled.value = 1
  setStatus(activeHandCount() === 2 ? '양손으로 잡았어요 · 당겨보세요' : '잡았어요 · 그대로 당겨보세요', 'active')
}

function releasePinch(side: HandSide) {
  const stretch = handStretches[side]
  if (!stretch.active) return
  stretch.active = false
  stretch.missingFrames = 0
  stretch.target = { x: 0, y: 0 }
  setStatus(activeHandCount() ? '다른 손은 계속 트래킹 중' : '탱글하게 돌아가는 중', activeHandCount() ? 'active' : 'ready')
}

function updateHands(left: NormalizedLandmark[] | undefined, right: NormalizedLandmark[] | undefined) {
  const hands: Record<HandSide, NormalizedLandmark[] | undefined> = { left, right }

  for (const side of handSides) {
    const hand = hands[side]
    const stretch = handStretches[side]
    if (!hand) {
      stretch.latched = false
      if (stretch.active) {
        stretch.missingFrames += 1
        if (stretch.missingFrames >= 3) releasePinch(side)
      }
      continue
    }

    const ratio = pinchRatio(hand)
    const wasLatched = stretch.latched
    if (ratio > 0.58) stretch.latched = false
    else if (ratio < 0.4) stretch.latched = true

    if (stretch.active && stretch.anchor) {
      if (ratio < 0.58) {
        stretch.missingFrames = 0
        const point = pinchPoint(hand)
        updateAnchorPoint(stretch.anchor, stretch.anchorPoint)
        const rawX = point.x - stretch.anchorPoint.x
        const rawY = point.y - stretch.anchorPoint.y
        const length = Math.hypot(rawX, rawY)
        const maxPull = faceWidth * 2.35
        const limit = length > maxPull ? maxPull / length : 1
        stretch.target.x = rawX * limit
        stretch.target.y = rawY * limit
      } else releasePinch(side)
      continue
    }

    if (!stretch.anchor && !wasLatched && stretch.latched) beginPinch(side, pinchPoint(hand))
  }
}

function updateSprings(delta: number) {
  if (!snapshotActive) return

  for (const side of handSides) {
    const stretch = handStretches[side]
    if (!stretch.anchor) continue
    const stiffness = stretch.active ? 72 : 92
    const damping = stretch.active ? 16 : 10.5
    stretch.velocity.x += (stretch.target.x - stretch.pull.x) * stiffness * delta
    stretch.velocity.y += (stretch.target.y - stretch.pull.y) * stiffness * delta
    const drag = Math.exp(-damping * delta)
    stretch.velocity.x *= drag
    stretch.velocity.y *= drag
    stretch.pull.x += stretch.velocity.x * delta
    stretch.pull.y += stretch.velocity.y * delta

    updateAnchorPoint(stretch.anchor, stretch.anchorPoint)
    const uniforms = stretchUniforms[side]
    uniforms.anchor.value.set(stretch.anchorPoint.x, stretch.anchorPoint.y)
    uniforms.pull.value.set(stretch.pull.x, stretch.pull.y)
    uniforms.opacity.value = THREE.MathUtils.smoothstep(
      Math.hypot(stretch.pull.x, stretch.pull.y),
      faceWidth * 0.008,
      faceWidth * 0.055,
    )

    if (!stretch.active && Math.hypot(stretch.pull.x, stretch.pull.y, stretch.velocity.x, stretch.velocity.y) < 0.0025) {
      stretch.anchor = null
      stretch.pull = { x: 0, y: 0 }
      stretch.velocity = { x: 0, y: 0 }
      uniforms.pull.value.set(0, 0)
      uniforms.opacity.value = 0
      uniforms.enabled.value = 0
    }
  }

  if (!handSides.some((side) => handStretches[side].anchor)) {
    snapshotActive = false
    faceSurface.visible = false
    setStatus(faceReady ? '얼굴 위에서 Pinch 해보세요' : '얼굴을 카메라에 보여주세요', faceReady ? 'ready' : '')
  }
}

function detect(now: number) {
  if (!landmarker || !modelReady || !cameraReady || document.hidden || video.readyState < 2) return
  if (now - lastDetectionAt < DETECTION_INTERVAL || video.currentTime === lastVideoTime) return
  lastDetectionAt = now
  lastVideoTime = video.currentTime
  try {
    const result = landmarker.detectForVideo(video, now)
    const face = result.faceLandmarks[0]
    const left = result.leftHandLandmarks[0]
    const right = result.rightHandLandmarks[0]
    if (face) updateFace(face)
    else faceReady = false
    if (face && !snapshotActive && !handOverFace(left) && !handOverFace(right)) {
      refreshSnapshot()
    }
    updateHands(left, right)
    if (!face && !snapshotActive) setStatus('얼굴을 카메라에 보여주세요')
    else if (face && !snapshotActive) setStatus('얼굴 위에서 Pinch 해보세요', 'ready')
  } catch {
    // A duplicate MediaPipe timestamp is harmless; the next frame recovers.
  }
}

async function createTracker() {
  if (landmarker) return
  const { FilesetResolver, HolisticLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks('/mediapipe')
  const options = {
    baseOptions: { modelAssetPath: '/mediapipe/holistic_landmarker.task', delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minHandLandmarksConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputPoseSegmentationMasks: false,
  }
  try {
    landmarker = await HolisticLandmarker.createFromOptions(vision, options)
  } catch {
    landmarker = await HolisticLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: '/mediapipe/holistic_landmarker.task' } })
  }
  modelReady = true
}

async function startCamera() {
  startButton.disabled = true
  introCopy.textContent = '카메라와 얼굴·손 인식 모델을 준비하고 있어요.'
  setStatus('얼굴과 손 인식 준비 중')
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unavailable')
    const [cameraStream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      }),
      createTracker(),
    ])
    stream?.getTracks().forEach((track) => track.stop())
    stream = cameraStream
    video.srcObject = stream
    await video.play()
    cameraReady = true
    updateBackgroundScale()
    intro.classList.add('hidden')
    setStatus('얼굴을 카메라에 보여주세요')
  } catch {
    cameraReady = false
    intro.classList.remove('hidden')
    introCopy.textContent = '카메라를 열 수 없어요. 브라우저 설정에서 권한을 허용한 뒤 다시 시도해 주세요.'
    startButton.textContent = '다시 시도'
    startButton.disabled = false
    setStatus('카메라 권한이 필요해요', 'error')
  }
}

function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(innerWidth, innerHeight, false)
  updateBackgroundScale()
}

function render(now: number) {
  const delta = Math.min(0.04, Math.max(0.001, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  detect(now)
  updateSprings(delta)
  renderer.render(scene, camera)
  requestAnimationFrame(render)
}

function releaseResources() {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  video.srcObject = null
  landmarker?.close()
  landmarker = null
  cameraReady = false
  modelReady = false
}

startButton.addEventListener('click', () => void startCamera())
window.addEventListener('resize', resize, { passive: true })
window.addEventListener('pagehide', releaseResources)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    video.pause()
    stream?.getVideoTracks().forEach((track) => { track.enabled = false })
    return
  }
  stream?.getVideoTracks().forEach((track) => { track.enabled = true })
  lastFrameAt = performance.now()
  void video.play().catch(() => undefined)
})

resize()
requestAnimationFrame(render)
