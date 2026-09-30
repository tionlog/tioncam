import type { HolisticLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import './style.css'

type TrackerTone = 'ready' | 'action' | 'reset' | 'error' | ''
type HandSide = 'left' | 'right'

type Point = {
  x: number
  y: number
}

type FingerTrace = Point & {
  radius: number
  present: boolean
  active: boolean
  lastSeenAt: number
  lastConfidentAt: number
  outlierFrames: number
}

type FingerDefinition = {
  mcp: number
  pip: number
  dip: number
  tip: number
  size: number
}

type DetectedHand = {
  source: HandSide
  landmarks: NormalizedLandmark[]
  points: Point[]
  center: Point
}

type HandAnchor = Point & {
  present: boolean
  lastSeenAt: number
  palmFacing: boolean
  lastPalmFacingAt: number
}

const video = document.querySelector<HTMLVideoElement>('#camera')!
const canvas = document.querySelector<HTMLCanvasElement>('#revealCanvas')!
const context = canvas.getContext('2d')!
const maskCanvas = document.createElement('canvas')
const maskContext = maskCanvas.getContext('2d')!
const permissionPanel = document.querySelector<HTMLElement>('#permissionPanel')!
const permissionCopy = document.querySelector<HTMLDivElement>('#permissionCopy')!
const startCameraButton = document.querySelector<HTMLButtonElement>('#startCamera')!
const trackingStatus = document.querySelector<HTMLDivElement>('#trackingStatus')!
const trackingStatusText = trackingStatus.querySelector<HTMLSpanElement>('span')!
const eraseSound = new Audio('/cam/blur%20erase.mp3')
eraseSound.loop = true
eraseSound.preload = 'auto'
eraseSound.volume = .42

let holisticLandmarker: HolisticLandmarker | null = null
let cameraStream: MediaStream | null = null
let cameraReady = false
let modelReady = false
let lastVideoTime = -1
let lastDetectionAt = 0
let lastFrameAt = performance.now()
let lastRenderedVideoTime = -1
let previousStatus = ''
let pixelRatio = 1
let viewportWidth = window.innerWidth
let viewportHeight = window.innerHeight
let revealedAmount = 0
let puckerStartedAt = 0
let puckerReleasedAt = 0
let resetActive = false
let resetLatched = false
let resetStartedAt = 0
let lastVisualAt = 0
let eraseSoundPlaying = false
let eraseSoundUnlocking = false
let eraseSoundRetryAt = 0
let fingerUseStartedAt = 0
let visibleFistCount = 0
let visibleBackHandCount = 0
let cachedVideoLayout: ReturnType<typeof calculateVideoLayout> | null = null

const FINGERS: FingerDefinition[] = [
  { mcp: 1, pip: 2, dip: 3, tip: 4, size: 1.08 },
  { mcp: 5, pip: 6, dip: 7, tip: 8, size: 1 },
  { mcp: 9, pip: 10, dip: 11, tip: 12, size: 1 },
  { mcp: 13, pip: 14, dip: 15, tip: 16, size: .92 },
  { mcp: 17, pip: 18, dip: 19, tip: 20, size: .78 },
]
const INDEX_FINGER = FINGERS[1]

function createFingerTrace(): FingerTrace {
  return {
    x: 0,
    y: 0,
    radius: 12,
    present: false,
    active: false,
    lastSeenAt: 0,
    lastConfidentAt: 0,
    outlierFrames: 0,
  }
}

const traces: Record<HandSide, FingerTrace> = {
  left: createFingerTrace(),
  right: createFingerTrace(),
}
const traceList = [traces.left, traces.right]
const handAnchors: Record<HandSide, HandAnchor> = {
  left: { x: 0, y: 0, present: false, lastSeenAt: 0, palmFacing: false, lastPalmFacingAt: 0 },
  right: { x: 0, y: 0, present: false, lastSeenAt: 0, palmFacing: false, lastPalmFacingAt: 0 },
}

const DETECTION_INTERVAL = 33
const HAND_GRACE_MS = 320
const FINGERTIP_SOUND_GRACE_MS = 220
const PUCKER_HOLD_MS = 400
const RESET_DURATION_MS = 720
const VISUAL_INTERVAL = 1000 / 30
const FINGER_SOUND_DELAY_MS = 3000
const PALM_FACING_GRACE_MS = 120

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function setStatus(message: string, tone: TrackerTone = '') {
  const key = `${tone}:${message}`
  if (key === previousStatus) return
  previousStatus = key
  trackingStatusText.textContent = message
  trackingStatus.classList.remove('ready', 'action', 'reset', 'error')
  if (tone) trackingStatus.classList.add(tone)
}

function calculateVideoLayout() {
  const sourceWidth = video.videoWidth || 1
  const sourceHeight = video.videoHeight || 1
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
  return {
    sourceWidth,
    sourceHeight,
    drawnWidth: sourceWidth * scale,
    drawnHeight: sourceHeight * scale,
    offsetX: (viewportWidth - sourceWidth * scale) / 2,
    offsetY: (viewportHeight - sourceHeight * scale) / 2,
  }
}

function videoLayout() {
  cachedVideoLayout ??= calculateVideoLayout()
  return cachedVideoLayout
}

function screenPoint(point: NormalizedLandmark): Point {
  const layout = videoLayout()
  return {
    x: viewportWidth - (point.x * layout.drawnWidth + layout.offsetX),
    y: point.y * layout.drawnHeight + layout.offsetY,
  }
}

function fingertipIsDetected(landmarks: NormalizedLandmark[], tipIndex: number) {
  const tip = landmarks[tipIndex]
  return Boolean(tip)
    && Number.isFinite(tip.x)
    && Number.isFinite(tip.y)
    && Number.isFinite(tip.z)
    && tip.x > -.15
    && tip.x < 1.15
    && tip.y > -.15
    && tip.y < 1.15
}

function createDetectedHand(source: HandSide, landmarks: NormalizedLandmark[]): DetectedHand {
  const points = landmarks.map(screenPoint)
  const centerIndices = [0, 5, 9, 13, 17]
  const center = centerIndices.reduce((sum, index) => ({
    x: sum.x + points[index].x / centerIndices.length,
    y: sum.y + points[index].y / centerIndices.length,
  }), { x: 0, y: 0 })
  return { source, landmarks, points, center }
}

function palmFacingScore(landmarks: NormalizedLandmark[], side: HandSide) {
  const wrist = landmarks[0]
  const indexBase = landmarks[5]
  const pinkyBase = landmarks[17]
  const indexX = indexBase.x - wrist.x
  const indexY = indexBase.y - wrist.y
  const pinkyX = pinkyBase.x - wrist.x
  const pinkyY = pinkyBase.y - wrist.y
  const cross = indexX * pinkyY - indexY * pinkyX
  const scale = Math.hypot(indexX, indexY) * Math.hypot(pinkyX, pinkyY)
  const orientation = cross / Math.max(.0001, scale)
  return orientation * (side === 'left' ? 1 : -1)
}

function palmFacesCamera(trackingSide: HandSide, hand: DetectedHand, now: number) {
  const anchor = handAnchors[trackingSide]
  const score = palmFacingScore(hand.landmarks, hand.source)
  if (score > .12) {
    anchor.palmFacing = true
    anchor.lastPalmFacingAt = now
  } else if (score < -.04) {
    // A clearly reversed landmark winding is the back of the hand. Reject it
    // immediately instead of letting temporal smoothing expose a new patch.
    anchor.palmFacing = false
  } else {
    // At an edge-on angle the winding is nearly zero. Preserve only a very
    // short recent palm-facing state to avoid flicker around the boundary.
    anchor.palmFacing = anchor.palmFacing
      && now - anchor.lastPalmFacingAt < PALM_FACING_GRACE_MS
  }
  return anchor.palmFacing
}

function deactivateIndexFinger(side: HandSide) {
  const trace = traces[side]
  trace.present = false
  trace.active = false
  trace.outlierFrames = 0
}

function handIsFist(landmarks: NormalizedLandmark[]) {
  const foldedFingers = FINGERS.slice(1).every(({ mcp, pip, tip }) => {
    const tipToWrist = distance(landmarks[tip], landmarks[0])
    const pipToWrist = distance(landmarks[pip], landmarks[0])
    const tipToMcp = distance(landmarks[tip], landmarks[mcp])
    const pipToMcp = distance(landmarks[pip], landmarks[mcp])
    return tipToWrist < pipToWrist * 1.08 || tipToMcp < pipToMcp * 1.35
  })
  if (!foldedFingers) return false

  const palmWidth = distance(landmarks[5], landmarks[17])
  const thumbLength = distance(landmarks[1], landmarks[2])
    + distance(landmarks[2], landmarks[3])
    + distance(landmarks[3], landmarks[4])
  const thumbStraightness = distance(landmarks[1], landmarks[4]) / Math.max(.001, thumbLength)
  const thumbSpan = distance(landmarks[4], landmarks[9]) / Math.max(.001, palmWidth)
  const thumbExtended = thumbStraightness > .78 && thumbSpan > .72
  return !thumbExtended
}

function brushRadius(points: Point[], finger: FingerDefinition) {
  const palmWidth = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y)
  const palmLength = Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y)
  const fingerLength = Math.hypot(points[finger.mcp].x - points[finger.pip].x, points[finger.mcp].y - points[finger.pip].y)
    + Math.hypot(points[finger.pip].x - points[finger.dip].x, points[finger.pip].y - points[finger.dip].y)
    + Math.hypot(points[finger.dip].x - points[finger.tip].x, points[finger.dip].y - points[finger.tip].y)
  const projectedHandSize = Math.max(palmWidth, palmLength * 1.1)
  const estimatedRadius = (projectedHandSize * .065 + fingerLength * .035) * finger.size
  const maximumRadius = Math.min(72, Math.min(viewportWidth, viewportHeight) * .09)
  return clamp(estimatedRadius, 4, maximumRadius)
}

function stampFingertip(trace: FingerTrace, rawPoint: Point, targetRadius: number, now: number) {
  let elapsed = trace.present ? now - trace.lastSeenAt : Infinity
  const rawTravel = trace.present ? Math.hypot(rawPoint.x - trace.x, rawPoint.y - trace.y) : 0
  const viewportDiagonal = Math.hypot(viewportWidth, viewportHeight)
  const jumpLimit = Math.max(180, viewportDiagonal * .16, Number.isFinite(elapsed) ? elapsed * 6 : 0)

  // Ignore a one- or two-frame teleport. A real fast relocation remains in
  // roughly the same new area and is accepted on the third detection without
  // drawing a line across the screen.
  if (trace.present && elapsed < 180 && rawTravel > jumpLimit) {
    trace.outlierFrames += 1
    trace.lastSeenAt = now
    if (trace.outlierFrames < 3) return
    trace.present = false
    trace.active = false
    elapsed = Infinity
  }
  trace.outlierFrames = 0

  const smoothing = trace.present
    ? clamp(.48 + rawTravel / Math.max(1, elapsed) * .12, .48, .88)
    : 1
  const next = {
    x: trace.present ? trace.x + (rawPoint.x - trace.x) * smoothing : rawPoint.x,
    y: trace.present ? trace.y + (rawPoint.y - trace.y) * smoothing : rawPoint.y,
  }
  const radius = trace.present ? trace.radius + (targetRadius - trace.radius) * .36 : targetRadius
  trace.lastConfidentAt = now
  const travel = trace.present ? Math.hypot(next.x - trace.x, next.y - trace.y) : 0
  const continuityLimit = Math.min(
    viewportDiagonal * .45,
    Math.max(180, radius * 22, Number.isFinite(elapsed) ? elapsed * 8 : 0),
  )
  const continuous = trace.present
    && trace.active
    && elapsed < HAND_GRACE_MS + 90
    && travel < continuityLimit

  if (!resetActive) {
    maskContext.save()
    maskContext.strokeStyle = '#fff'
    maskContext.fillStyle = '#fff'
    maskContext.lineCap = 'round'
    maskContext.lineJoin = 'round'
    maskContext.lineWidth = radius * 2
    maskContext.shadowColor = 'rgb(255 255 255 / 70%)'
    maskContext.shadowBlur = Math.max(2, radius * .16)

    if (continuous) {
      maskContext.beginPath()
      maskContext.moveTo(trace.x, trace.y)
      maskContext.lineTo(next.x, next.y)
      maskContext.stroke()
    } else {
      maskContext.beginPath()
      maskContext.arc(next.x, next.y, radius, 0, Math.PI * 2)
      maskContext.fill()
    }
    maskContext.restore()
    const paintedLength = continuous ? Math.max(radius, travel) : radius
    revealedAmount = clamp(revealedAmount + paintedLength * radius * 2 / (viewportWidth * viewportHeight), 0, 1)
  }

  trace.x = next.x
  trace.y = next.y
  trace.radius = radius
  trace.present = true
  trace.active = true
  trace.lastSeenAt = now
}

function updateIndexFingertip(side: HandSide, hand: DetectedHand, now: number) {
  const fist = handIsFist(hand.landmarks)
  const trace = traces[side]
  if (fist || !fingertipIsDetected(hand.landmarks, INDEX_FINGER.tip)) {
    trace.active = false
    if (fist || now - trace.lastSeenAt > HAND_GRACE_MS) trace.present = false
    return fist
  }
  stampFingertip(
    trace,
    hand.points[INDEX_FINGER.tip],
    brushRadius(hand.points, INDEX_FINGER),
    now,
  )
  return false
}

function assignHands(detected: DetectedHand[], now: number) {
  const assignments = new Map<HandSide, DetectedHand>()
  if (!detected.length) return assignments

  const distanceToTrace = (hand: DetectedHand, side: HandSide) => {
    const anchor = handAnchors[side]
    return Math.hypot(hand.center.x - anchor.x, hand.center.y - anchor.y)
  }
  const fresh = (side: HandSide) => handAnchors[side].present
    && now - handAnchors[side].lastSeenAt < HAND_GRACE_MS + 120

  if (detected.length >= 2) {
    const [first, second] = detected
    if (fresh('left') && fresh('right')) {
      const directCost = distanceToTrace(first, 'left') + distanceToTrace(second, 'right')
      const swappedCost = distanceToTrace(first, 'right') + distanceToTrace(second, 'left')
      if (swappedCost < directCost) {
        assignments.set('right', first)
        assignments.set('left', second)
      } else {
        assignments.set('left', first)
        assignments.set('right', second)
      }
    } else if (fresh('left') || fresh('right')) {
      const knownSide: HandSide = fresh('left') ? 'left' : 'right'
      const otherSide: HandSide = knownSide === 'left' ? 'right' : 'left'
      const nearestIndex = distanceToTrace(first, knownSide) <= distanceToTrace(second, knownSide) ? 0 : 1
      assignments.set(knownSide, detected[nearestIndex])
      assignments.set(otherSide, detected[nearestIndex === 0 ? 1 : 0])
    } else {
      detected.slice(0, 2).forEach((hand) => assignments.set(hand.source, hand))
    }
    return assignments
  }

  const hand = detected[0]
  const freshSides = (['left', 'right'] as HandSide[]).filter(fresh)
  if (!freshSides.length) assignments.set(hand.source, hand)
  else {
    const closest = freshSides.reduce((best, side) => (
      distanceToTrace(hand, side) < distanceToTrace(hand, best) ? side : best
    ))
    assignments.set(closest, hand)
  }
  return assignments
}

function isPuckering(face: NormalizedLandmark[] | undefined) {
  if (!face) return false
  const mouthWidth = distance(face[78], face[308])
  const innerGap = distance(face[13], face[14])
  const faceWidth = distance(face[234], face[454])
  if (mouthWidth < .001 || faceWidth < .001) return false
  const opening = innerGap / mouthWidth
  const narrowness = mouthWidth / faceWidth
  return opening > .16 && opening < .7 && narrowness < .48
}

function updatePucker(face: NormalizedLandmark[] | undefined, now: number) {
  if (isPuckering(face)) {
    puckerReleasedAt = 0
    if (!puckerStartedAt) puckerStartedAt = now
    if (!resetLatched && now - puckerStartedAt >= PUCKER_HOLD_MS) {
      resetActive = true
      resetLatched = true
      resetStartedAt = now
    }
    return
  }

  puckerStartedAt = 0
  if (!puckerReleasedAt) puckerReleasedAt = now
  if (now - puckerReleasedAt > 180) resetLatched = false
}

function activeTraceCount(now: number) {
  return traceList.filter((trace) => (
    trace.present && trace.active && now - trace.lastSeenAt < HAND_GRACE_MS
  )).length
}

function syncEraseSound(now: number) {
  const fingertipActive = cameraReady
    && !resetActive
    && traceList.some((trace) => (
      trace.present
      && trace.active
      && now - trace.lastSeenAt < HAND_GRACE_MS
      && now - trace.lastConfidentAt < FINGERTIP_SOUND_GRACE_MS
    ))

  if (!fingertipActive) {
    fingerUseStartedAt = 0
    if (eraseSoundPlaying) {
      eraseSoundPlaying = false
      eraseSound.pause()
      eraseSound.currentTime = 0
    }
    return
  }

  if (!fingerUseStartedAt) fingerUseStartedAt = now
  const shouldPlay = now - fingerUseStartedAt >= FINGER_SOUND_DELAY_MS

  if (shouldPlay && !eraseSoundPlaying && now >= eraseSoundRetryAt) {
    eraseSoundPlaying = true
    void eraseSound.play().catch(() => {
      eraseSoundPlaying = false
      eraseSoundRetryAt = performance.now() + 800
    })
  }
}

function unlockEraseSound() {
  if (eraseSoundPlaying || eraseSoundUnlocking) return
  eraseSoundUnlocking = true
  eraseSound.muted = true
  void eraseSound.play().then(() => {
    eraseSound.pause()
    eraseSound.currentTime = 0
    eraseSound.muted = false
    eraseSoundPlaying = false
    eraseSoundUnlocking = false
    eraseSoundRetryAt = 0
  }).catch(() => {
    eraseSound.muted = false
    eraseSoundUnlocking = false
  })
}

function updateTrackingMessage(now: number) {
  if (!cameraReady) setStatus('카메라 준비 중')
  else if (!modelReady) setStatus('손과 입술 인식 준비 중')
  else if (resetActive) {
    setStatus('후— 블러가 다시 차오르고 있어요', 'reset')
  } else if (puckerStartedAt && resetLatched) {
    setStatus('블러가 모두 복구됐어요', 'ready')
  } else if (puckerStartedAt && now - puckerStartedAt > 100) {
    setStatus('입술을 그대로 유지해 주세요', 'reset')
  } else {
    const active = activeTraceCount(now)
    if (active >= 2) setStatus('두 검지 끝으로 블러를 지우는 중', 'action')
    else if (active === 1) setStatus('검지 끝으로 블러를 지우는 중', 'action')
    else if (visibleFistCount > 0) setStatus('주먹을 펴면 검지 끝을 인식해요', 'ready')
    else if (visibleBackHandCount > 0) setStatus('손바닥 면을 카메라에 보여주세요', 'ready')
    else if (revealedAmount > .001) setStatus('입술을 오므리면 다시 흐려져요', 'ready')
    else setStatus('검지 끝을 카메라에 보여주세요', 'ready')
  }
}

function detect(now: number) {
  if (!modelReady || !holisticLandmarker || !cameraReady || document.hidden || video.readyState < 2) return
  if (now - lastDetectionAt < DETECTION_INTERVAL || lastVideoTime === video.currentTime) return
  lastDetectionAt = now
  lastVideoTime = video.currentTime

  try {
    const result = holisticLandmarker.detectForVideo(video, now)
    const detected: DetectedHand[] = []
    if (result.leftHandLandmarks[0]) detected.push(createDetectedHand('left', result.leftHandLandmarks[0]))
    if (result.rightHandLandmarks[0]) detected.push(createDetectedHand('right', result.rightHandLandmarks[0]))
    const assignments = assignHands(detected, now)
    visibleFistCount = 0
    visibleBackHandCount = 0

    ;(['left', 'right'] as HandSide[]).forEach((side) => {
      const hand = assignments.get(side)
      if (hand) {
        handAnchors[side].x = hand.center.x
        handAnchors[side].y = hand.center.y
        handAnchors[side].present = true
        handAnchors[side].lastSeenAt = now
        if (!palmFacesCamera(side, hand, now)) {
          visibleBackHandCount += 1
          deactivateIndexFinger(side)
        } else if (updateIndexFingertip(side, hand, now)) visibleFistCount += 1
      } else if (now - handAnchors[side].lastSeenAt > HAND_GRACE_MS) {
        handAnchors[side].present = false
        handAnchors[side].palmFacing = false
        deactivateIndexFinger(side)
      }
    })
    updatePucker(result.faceLandmarks[0], now)
    updateTrackingMessage(now)
  } catch {
    // A duplicated camera timestamp can be skipped without interrupting the view.
  }
}

async function createTracker() {
  if (holisticLandmarker) return
  const { FilesetResolver, HolisticLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks('/mediapipe')
  const options = {
    baseOptions: { modelAssetPath: '/mediapipe/holistic_landmarker.task', delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    minFaceDetectionConfidence: .48,
    minFacePresenceConfidence: .48,
    minHandLandmarksConfidence: .5,
    outputFaceBlendshapes: false,
    outputPoseSegmentationMasks: false,
  }
  try {
    holisticLandmarker = await HolisticLandmarker.createFromOptions(vision, options)
  } catch {
    holisticLandmarker = await HolisticLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: '/mediapipe/holistic_landmarker.task' },
    })
  }
  modelReady = true
}

async function startCamera() {
  startCameraButton.disabled = true
  permissionCopy.textContent = '카메라와 제스처 인식 모델을 준비하고 있어요.'
  setStatus('카메라 준비 중')
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unavailable')
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      }),
      createTracker(),
    ])
    cameraStream?.getTracks().forEach((track) => track.stop())
    cameraStream = stream
    video.srcObject = stream
    await video.play()
    cachedVideoLayout = null
    cameraReady = true
    permissionPanel.classList.add('hidden')
    setStatus('양손의 검지 끝을 움직여보세요', 'ready')
  } catch {
    cameraReady = false
    permissionPanel.classList.remove('hidden')
    permissionCopy.textContent = '카메라를 열 수 없어요. 브라우저 설정에서 이 사이트의 카메라 권한을 허용한 뒤 다시 시도해 주세요.'
    startCameraButton.textContent = '다시 시도'
    startCameraButton.disabled = false
    setStatus('카메라 권한이 필요해요', 'error')
  }
}

function fadeMask(delta: number, now: number) {
  if (!resetActive) return
  maskContext.save()
  maskContext.globalCompositeOperation = 'destination-out'
  maskContext.globalAlpha = clamp(delta * 1000 / RESET_DURATION_MS * 4.5, 0, .3)
  maskContext.fillRect(0, 0, viewportWidth, viewportHeight)
  maskContext.restore()
  if (now - resetStartedAt >= RESET_DURATION_MS) {
    maskContext.clearRect(0, 0, viewportWidth, viewportHeight)
    revealedAmount = 0
    resetActive = false
  }
}

function drawSharpCamera() {
  context.clearRect(0, 0, viewportWidth, viewportHeight)
  if (!cameraReady || video.readyState < 2) return
  const layout = videoLayout()
  context.save()
  context.translate(viewportWidth, 0)
  context.scale(-1, 1)
  context.drawImage(video, layout.offsetX, layout.offsetY, layout.drawnWidth, layout.drawnHeight)
  context.restore()
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(maskCanvas, 0, 0, viewportWidth, viewportHeight)
  context.globalCompositeOperation = 'source-over'
}

function drawFingerCursors(now: number) {
  if (resetActive) return
  traceList.forEach((trace) => {
    if (!trace.present || !trace.active || now - trace.lastSeenAt > HAND_GRACE_MS) return
    context.save()
    context.beginPath()
    context.arc(trace.x, trace.y, trace.radius + 4, 0, Math.PI * 2)
    context.strokeStyle = 'rgb(255 255 255 / 78%)'
    context.lineWidth = 1.3
    context.shadowColor = 'rgb(196 181 253 / 75%)'
    context.shadowBlur = 9
    context.stroke()
    context.restore()
  })
}

function render(now: number) {
  requestAnimationFrame(render)
  if (document.hidden || now - lastVisualAt < VISUAL_INTERVAL) return
  lastVisualAt = now
  detect(now)
  syncEraseSound(now)
  if (!resetActive && video.currentTime === lastRenderedVideoTime) return
  const delta = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  fadeMask(delta, now)
  drawSharpCamera()
  drawFingerCursors(now)
  lastRenderedVideoTime = video.currentTime
}

function resizeCanvas() {
  const oldMask = document.createElement('canvas')
  oldMask.width = maskCanvas.width
  oldMask.height = maskCanvas.height
  oldMask.getContext('2d')?.drawImage(maskCanvas, 0, 0)
  const oldWidth = viewportWidth
  const oldHeight = viewportHeight

  viewportWidth = window.innerWidth
  viewportHeight = window.innerHeight
  cachedVideoLayout = null
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(viewportWidth * pixelRatio)
  canvas.height = Math.round(viewportHeight * pixelRatio)
  maskCanvas.width = Math.round(viewportWidth * pixelRatio)
  maskCanvas.height = Math.round(viewportHeight * pixelRatio)
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  maskContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

  if (oldMask.width && oldMask.height && oldWidth && oldHeight) {
    maskContext.drawImage(oldMask, 0, 0, oldMask.width, oldMask.height, 0, 0, viewportWidth, viewportHeight)
  }
  traceList.forEach((trace) => {
    trace.present = false
    trace.active = false
  })
  ;(['left', 'right'] as HandSide[]).forEach((side) => {
    handAnchors[side].present = false
    handAnchors[side].palmFacing = false
  })
}

function releaseResources() {
  fingerUseStartedAt = 0
  eraseSoundPlaying = false
  eraseSound.pause()
  eraseSound.currentTime = 0
  cameraStream?.getTracks().forEach((track) => track.stop())
  cameraStream = null
  video.srcObject = null
  holisticLandmarker?.close()
  holisticLandmarker = null
  cameraReady = false
  modelReady = false
}

startCameraButton.addEventListener('click', () => {
  unlockEraseSound()
  void startCamera()
})
window.addEventListener('pointerdown', unlockEraseSound, { once: true, passive: true })
window.addEventListener('resize', resizeCanvas)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    fingerUseStartedAt = 0
    eraseSoundPlaying = false
    eraseSound.pause()
    video.pause()
    cameraStream?.getVideoTracks().forEach((track) => { track.enabled = false })
    return
  }
  cameraStream?.getVideoTracks().forEach((track) => { track.enabled = true })
  lastFrameAt = performance.now()
  lastVisualAt = 0
  void video.play().catch(() => undefined)
})
window.addEventListener('pagehide', releaseResources)

resizeCanvas()
requestAnimationFrame(render)
void startCamera()
