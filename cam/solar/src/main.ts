import type { HolisticLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import './style.css'

type TrackerTone = 'ready' | 'action' | 'error' | ''

type HandFrame = {
  landmarks: NormalizedLandmark[]
  pointing: boolean
}

type PalmMotion = {
  x: number
  time: number
  present: boolean
}

const video = document.querySelector<HTMLVideoElement>('#camera')!
const earthObject = document.querySelector<HTMLDivElement>('#earthObject')!
const permissionPanel = document.querySelector<HTMLElement>('#permissionPanel')!
const permissionCopy = document.querySelector<HTMLDivElement>('#permissionCopy')!
const startCameraButton = document.querySelector<HTMLButtonElement>('#startCamera')!
const trackingStatus = document.querySelector<HTMLDivElement>('#trackingStatus')!
const trackingStatusText = trackingStatus.querySelector<HTMLSpanElement>('span')!

let holisticLandmarker: HolisticLandmarker | null = null
let cameraStream: MediaStream | null = null
let cameraReady = false
let modelReady = false
let lastVideoTime = -1
let lastDetectionAt = 0
let lastFrameAt = performance.now()
let anchorSeenAt = 0
let previousAnchorTip: { x: number, y: number } | null = null
let smoothedX = 0
let smoothedY = 0
let smoothedRadius = 0
let targetX = 0
let targetY = 0
let targetRadius = 0
let rotationVelocityY = 0
let rotationAngle = 0
let earthVisible = false
let latestSpinAt = 0
let previousStatus = ''

const palmMotion: PalmMotion = { x: 0, time: 0, present: false }

const DETECTION_INTERVAL = 42
const ANCHOR_GRACE_MS = 100
const SWIPE_SPEED_THRESHOLD = .11
const CONTROL_JUMP_LIMIT = .26
const BASE_SWIPE_IMPULSE = 24
const SPEED_IMPULSE_GAIN = 11
const MAX_SPIN_SPEED = 22
const SPIN_FRICTION = .9965

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function setStatus(message: string, tone: TrackerTone = '') {
  const key = `${tone}:${message}`
  if (key === previousStatus) return
  previousStatus = key
  trackingStatusText.textContent = message
  trackingStatus.classList.remove('ready', 'action', 'error')
  if (tone) trackingStatus.classList.add(tone)
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function fingerExtended(landmarks: NormalizedLandmark[], tip: number, pip: number, ratio = 1.13) {
  return distance(landmarks[tip], landmarks[0]) > distance(landmarks[pip], landmarks[0]) * ratio
}

function isVerticalIndex(landmarks: NormalizedLandmark[]) {
  const tip = landmarks[8]
  const pip = landmarks[6]
  const mcp = landmarks[5]
  const verticalSpan = mcp.y - tip.y
  const verticalAlignment = Math.abs(tip.x - mcp.x) < Math.max(.035, verticalSpan * .62)
  const jointsRise = tip.y < pip.y - .018 && pip.y < mcp.y - .008
  const indexExtended = fingerExtended(landmarks, 8, 6, 1.2)
  const foldedCount = [[12, 10], [16, 14], [20, 18]].filter(([fingerTip, fingerPip]) => (
    !fingerExtended(landmarks, fingerTip, fingerPip)
  )).length
  return verticalSpan > .07 && verticalAlignment && jointsRise && indexExtended && foldedCount >= 2
}

function palmCenterX(landmarks: NormalizedLandmark[]) {
  // Wrist + the four finger bases form a stable palm-center sample. Convert
  // source-space X to the mirrored camera view before measuring velocity.
  const indices = [0, 5, 9, 13, 17]
  const x = indices.reduce((sum, index) => sum + landmarks[index].x, 0) / indices.length
  return 1 - x
}

function videoLayout() {
  const sourceWidth = video.videoWidth || 1
  const sourceHeight = video.videoHeight || 1
  const scale = Math.max(window.innerWidth / sourceWidth, window.innerHeight / sourceHeight)
  return {
    sourceWidth,
    sourceHeight,
    scale,
    offsetX: (window.innerWidth - sourceWidth * scale) / 2,
    offsetY: (window.innerHeight - sourceHeight * scale) / 2,
  }
}

function screenPoint(point: NormalizedLandmark) {
  const { sourceWidth, sourceHeight, scale, offsetX, offsetY } = videoLayout()
  return {
    x: window.innerWidth - (point.x * sourceWidth * scale + offsetX),
    y: point.y * sourceHeight * scale + offsetY,
  }
}

function normalizedDistance(a: { x: number, y: number }, b: { x: number, y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function chooseRoles(hands: HandFrame[]) {
  const pointingHands = hands.filter((hand) => hand.pointing)
  if (!pointingHands.length) return null

  // Handedness labels may swap for a frame. The pointing gesture defines Hand
  // A, and proximity to its previous fingertip resolves the rare case where
  // both hands point at once without consulting MediaPipe's left/right label.
  const anchor = previousAnchorTip
    ? pointingHands.reduce((closest, hand) => (
      normalizedDistance(hand.landmarks[8], previousAnchorTip!)
        < normalizedDistance(closest.landmarks[8], previousAnchorTip!) ? hand : closest
    ))
    : pointingHands[0]
  const control = hands.find((hand) => hand !== anchor)
  return { anchor, control }
}

function updateAnchor(landmarks: NormalizedLandmark[], now: number) {
  const tip = screenPoint(landmarks[8])
  const knuckle = screenPoint(landmarks[5])
  const handScale = Math.hypot(tip.x - knuckle.x, tip.y - knuckle.y)
  const radius = clamp(handScale * 1.1, 82, Math.min(window.innerWidth, window.innerHeight) * .18)

  targetX = tip.x
  targetY = tip.y - radius * .82
  targetRadius = radius
  anchorSeenAt = now
  previousAnchorTip = { x: landmarks[8].x, y: landmarks[8].y }
  earthVisible = true
  earthObject.classList.remove('hidden')
}

function resetPalmMotion() {
  palmMotion.present = false
}

function updateControlHand(hand: HandFrame | undefined, now: number) {
  if (!hand) {
    palmMotion.present = false
    return
  }

  const centerX = palmCenterX(hand.landmarks)
  if (palmMotion.present) {
    const elapsed = now - palmMotion.time
    const travelledX = centerX - palmMotion.x
    // A discontinuity is a newly detected/reassigned hand, not a swipe.
    if (elapsed > 0 && elapsed < 180 && Math.abs(travelledX) < CONTROL_JUMP_LIMIT) {
      const velocityX = travelledX / Math.max(16, elapsed) * 1000
      const speed = Math.abs(velocityX)
      if (speed > SWIPE_SPEED_THRESHOLD) {
        // Treat each horizontal movement as an impulse, like pushing a real
        // globe. Impulses accumulate, so a decisive swipe accelerates an
        // already spinning earth instead of making it follow the wrist.
        const speedBoost = clamp(
          (speed - SWIPE_SPEED_THRESHOLD) * SPEED_IMPULSE_GAIN,
          0,
          20,
        )
        const impulse = travelledX * (BASE_SWIPE_IMPULSE + speedBoost)
        rotationVelocityY = clamp(
          rotationVelocityY + impulse,
          -MAX_SPIN_SPEED,
          MAX_SPIN_SPEED,
        )
        latestSpinAt = now
      }
    } else {
      palmMotion.present = false
    }
  }

  palmMotion.x = centerX
  palmMotion.time = now
  palmMotion.present = true
}

function updateTrackingMessage(hasAnchor: boolean, hasControl: boolean, now: number) {
  if (!cameraReady) setStatus('카메라 준비 중')
  else if (!modelReady) setStatus('손 인식 준비 중')
  else if (!hasAnchor || !earthVisible) setStatus('한 손의 검지를 위로 세워보세요')
  else if (now - latestSpinAt < 550 || Math.abs(rotationVelocityY) > .22) {
    setStatus('좌우 스와이프 방향으로 지구가 회전 중', 'action')
  } else if (hasControl) setStatus('반대손을 좌우로 스와이프해 보세요', 'ready')
  else setStatus('반대손을 보여주면 지구를 돌릴 수 있어요', 'ready')
}

function createHandFrame(landmarks: NormalizedLandmark[] | undefined): HandFrame | null {
  if (!landmarks) return null
  return {
    landmarks,
    pointing: isVerticalIndex(landmarks),
  }
}

function detect(now: number) {
  if (!modelReady || !holisticLandmarker || !cameraReady || document.hidden || video.readyState < 2) return
  if (now - lastDetectionAt < DETECTION_INTERVAL || lastVideoTime === video.currentTime) return
  lastDetectionAt = now
  lastVideoTime = video.currentTime

  try {
    const result = holisticLandmarker.detectForVideo(video, now)
    // Deliberately discard left/right labels. Roles are derived from gesture
    // every frame, so a label flip cannot swap the anchor and control hands.
    const hands = [
      createHandFrame(result.leftHandLandmarks[0]),
      createHandFrame(result.rightHandLandmarks[0]),
    ].filter((hand): hand is HandFrame => hand !== null)

    const roles = chooseRoles(hands)
    if (roles) {
      const nextTip = roles.anchor.landmarks[8]
      if (previousAnchorTip && normalizedDistance(nextTip, previousAnchorTip) > .22) {
        resetPalmMotion()
      }
      updateAnchor(roles.anchor.landmarks, now)
      updateControlHand(roles.control, now)
    } else if (now - anchorSeenAt > ANCHOR_GRACE_MS) {
      earthVisible = false
      earthObject.classList.add('hidden')
      previousAnchorTip = null
      resetPalmMotion()
    }

    updateTrackingMessage(Boolean(roles), Boolean(roles?.control), now)
  } catch {
    // MediaPipe can reject a duplicate camera timestamp on a busy frame.
  }
}

async function createTracker() {
  if (holisticLandmarker) return
  const { FilesetResolver, HolisticLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks('/mediapipe')
  const options = {
    baseOptions: { modelAssetPath: '/mediapipe/holistic_landmarker.task', delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    minHandLandmarksConfidence: .52,
    minPoseDetectionConfidence: .45,
    minPosePresenceConfidence: .45,
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
  permissionCopy.textContent = '카메라와 양손 인식 모델을 준비하고 있어요.'
  setStatus('카메라 준비 중')
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unavailable')
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960, max: 1280 },
          height: { ideal: 540, max: 720 },
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
    cameraReady = true
    permissionPanel.classList.add('hidden')
    setStatus('한 손의 검지를 위로 세워보세요')
  } catch {
    cameraReady = false
    permissionPanel.classList.remove('hidden')
    permissionCopy.textContent = '카메라를 열 수 없어요. 브라우저 설정에서 이 사이트의 카메라 권한을 허용한 뒤 다시 시도해 주세요.'
    startCameraButton.textContent = '다시 시도'
    startCameraButton.disabled = false
    setStatus('카메라 권한이 필요해요', 'error')
  }
}

function render(now: number) {
  const delta = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  detect(now)

  if (earthVisible) {
    const positionSmoothing = 1 - Math.exp(-delta * 18)
    const sizeSmoothing = 1 - Math.exp(-delta * 12)
    if (!smoothedRadius) {
      smoothedX = targetX
      smoothedY = targetY
      smoothedRadius = targetRadius
    } else {
      smoothedX += (targetX - smoothedX) * positionSmoothing
      smoothedY += (targetY - smoothedY) * positionSmoothing
      smoothedRadius += (targetRadius - smoothedRadius) * sizeSmoothing
    }
    const diameter = smoothedRadius * 2
    earthObject.style.width = `${diameter}px`
    earthObject.style.height = `${diameter}px`
    earthObject.style.transform = `translate3d(${smoothedX - smoothedRadius}px, ${smoothedY - smoothedRadius}px, 0) rotate(${rotationAngle}rad)`
  } else {
    smoothedRadius = 0
  }

  rotationAngle += rotationVelocityY * delta
  // Very light, refresh-rate-independent drag lets one strong swipe keep the
  // globe spinning for several seconds while it coasts naturally to rest.
  rotationVelocityY *= Math.pow(SPIN_FRICTION, delta * 60)
  if (Math.abs(rotationVelocityY) < .012) rotationVelocityY = 0

  requestAnimationFrame(render)
}

function releaseResources() {
  cameraStream?.getTracks().forEach((track) => track.stop())
  cameraStream = null
  video.srcObject = null
  holisticLandmarker?.close()
  holisticLandmarker = null
  cameraReady = false
  modelReady = false
}

startCameraButton.addEventListener('click', () => void startCamera())
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    video.pause()
    cameraStream?.getVideoTracks().forEach((track) => { track.enabled = false })
    return
  }
  cameraStream?.getVideoTracks().forEach((track) => { track.enabled = true })
  lastFrameAt = performance.now()
  void video.play().catch(() => undefined)
})
window.addEventListener('pagehide', releaseResources)

requestAnimationFrame(render)
void startCamera()
