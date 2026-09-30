import type { HolisticLandmarker, MPMask, NormalizedLandmark } from '@mediapipe/tasks-vision'
import './style.css'

type TrackerTone = 'ready' | 'action' | 'error' | ''
type HandSide = 'left' | 'right'

type FingerMotion = {
  x: number
  time: number
  present: boolean
  lastSeenAt: number
}

type ClapMotion = {
  armed: boolean
  previousDistance: number
  previousClosingSpeed: number
  previousAt: number
  lastSeenAt: number
  lastClapAt: number
}

const video = document.querySelector<HTMLVideoElement>('#camera')!
const typeCanvas = document.querySelector<HTMLCanvasElement>('#typeCanvas')!
const typeContext = typeCanvas.getContext('2d')!
const personCanvas = document.querySelector<HTMLCanvasElement>('#personCanvas')!
const personContext = personCanvas.getContext('2d')!
const maskCanvas = document.createElement('canvas')
const maskContext = maskCanvas.getContext('2d')!
const permissionPanel = document.querySelector<HTMLElement>('#permissionPanel')!
const permissionCopy = document.querySelector<HTMLDivElement>('#permissionCopy')!
const startCameraButton = document.querySelector<HTMLButtonElement>('#startCamera')!
const trackingStatus = document.querySelector<HTMLDivElement>('#trackingStatus')!
const trackingStatusText = trackingStatus.querySelector<HTMLSpanElement>('span')!
const typeControls = document.querySelector<HTMLFormElement>('#typeControls')!
const textInput = document.querySelector<HTMLInputElement>('#textInput')!
const textColor = document.querySelector<HTMLInputElement>('#textColor')!
const colorChip = document.querySelector<HTMLLabelElement>('.color-chip')!
const characterCount = document.querySelector<HTMLOutputElement>('#characterCount')!

let tracker: HolisticLandmarker | null = null
let cameraStream: MediaStream | null = null
let cameraReady = false
let modelReady = false
let personVisible = false
let lastPersonSeenAt = 0
let lastVideoTime = -1
let lastDetectionAt = 0
let previousStatus = ''
let viewportWidth = window.innerWidth
let viewportHeight = window.innerHeight
let subjectCenter = .5
let targetSubjectCenter = .5
let subjectWidth = .3
let targetSubjectWidth = .3
let maskReady = false
let maskImageData: ImageData | null = null
let activeSwipeHand: HandSide | null = null
let swipeActive = false
let scrollOffset = 0
let scrollVelocity = 0
let lastFrameAt = performance.now()
let lastPersonDrawAt = 0
let typographyDirty = true

const fingerMotion: Record<HandSide, FingerMotion> = {
  left: { x: 0, time: 0, present: false, lastSeenAt: 0 },
  right: { x: 0, time: 0, present: false, lastSeenAt: 0 },
}

const clapMotion: ClapMotion = {
  armed: false,
  previousDistance: Infinity,
  previousClosingSpeed: 0,
  previousAt: 0,
  lastSeenAt: 0,
  lastClapAt: -Infinity,
}

const DETECTION_INTERVAL = 1000 / 24
const PERSON_FRAME_INTERVAL = 1000 / 30
const SWIPE_RELEASE_DELAY = 150
const CLAP_COOLDOWN = 850

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function setStatus(message: string, tone: TrackerTone = '') {
  const key = `${tone}:${message}`
  if (key === previousStatus) return
  previousStatus = key
  trackingStatusText.textContent = message
  trackingStatus.classList.remove('ready', 'action', 'error')
  if (tone) trackingStatus.classList.add(tone)
}

function videoLayout() {
  const sourceWidth = video.videoWidth || 1
  const sourceHeight = video.videoHeight || 1
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
  return {
    drawnWidth: sourceWidth * scale,
    drawnHeight: sourceHeight * scale,
    offsetX: (viewportWidth - sourceWidth * scale) / 2,
    offsetY: (viewportHeight - sourceHeight * scale) / 2,
  }
}

function updateMask(mask: MPMask) {
  const width = mask.width
  const height = mask.height
  if (maskCanvas.width !== width || maskCanvas.height !== height || !maskImageData) {
    maskCanvas.width = width
    maskCanvas.height = height
    maskImageData = maskContext.createImageData(width, height)
    for (let index = 0; index < width * height; index += 1) {
      const dataIndex = index * 4
      maskImageData.data[dataIndex] = 255
      maskImageData.data[dataIndex + 1] = 255
      maskImageData.data[dataIndex + 2] = 255
    }
  }

  const values = mask.getAsFloat32Array()
  for (let index = 0; index < values.length; index += 1) {
    const confidence = clamp((values[index] - .08) / .72, 0, 1)
    const eased = confidence * confidence * (3 - 2 * confidence)
    maskImageData.data[index * 4 + 3] = Math.round(eased * 255)
  }
  maskContext.putImageData(maskImageData, 0, 0)
  maskReady = true
}

function landmarkRange(points: NormalizedLandmark[]) {
  let minimum = 1
  let maximum = 0
  for (const point of points) {
    if (!Number.isFinite(point.x) || point.visibility === 0) continue
    minimum = Math.min(minimum, point.x)
    maximum = Math.max(maximum, point.x)
  }
  return { minimum, maximum }
}

function updatePersonPosition(
  pose: NormalizedLandmark[] | undefined,
  face: NormalizedLandmark[] | undefined,
  now: number,
) {
  const landmarks = pose?.length ? pose : face
  if (!landmarks?.length) {
    if (now - lastPersonSeenAt > 450) personVisible = false
    return
  }

  const { minimum, maximum } = landmarkRange(landmarks)
  if (maximum <= minimum) return
  const layout = videoLayout()
  const screenLeft = viewportWidth - (maximum * layout.drawnWidth + layout.offsetX)
  const screenRight = viewportWidth - (minimum * layout.drawnWidth + layout.offsetX)
  targetSubjectCenter = clamp((screenLeft + screenRight) / 2 / viewportWidth, -.15, 1.15)
  targetSubjectWidth = clamp((screenRight - screenLeft) / viewportWidth * 1.06, .16, .82)
  lastPersonSeenAt = now
  personVisible = true
}

function fingerExtended(landmarks: NormalizedLandmark[], tip: number, middle: number, ratio = 1.18) {
  return distance(landmarks[tip], landmarks[0]) > distance(landmarks[middle], landmarks[0]) * ratio
}

function isPointingIndex(landmarks: NormalizedLandmark[]) {
  const indexExtended = fingerExtended(landmarks, 8, 6, 1.2)
  const foldedFingers = [[12, 10], [16, 14], [20, 18]].filter(([tip, middle]) => (
    !fingerExtended(landmarks, tip, middle, 1.12)
  )).length
  return indexExtended && foldedFingers >= 2
}

function updateSwipeHand(side: HandSide, landmarks: NormalizedLandmark[], now: number) {
  const motion = fingerMotion[side]
  const screenX = (1 - landmarks[8].x) * viewportWidth
  const elapsed = now - motion.time

  if (motion.present && elapsed > 0 && elapsed < 180) {
    const movement = screenX - motion.x
    if (Math.abs(movement) < viewportWidth * .16) {
      scrollOffset += movement
      scrollVelocity = clamp(
        scrollVelocity * .38 + movement / elapsed * 1000 * .62,
        -2600,
        2600,
      )
      typographyDirty = true
    }
  }

  motion.x = screenX
  motion.time = now
  motion.lastSeenAt = now
  motion.present = true
}

function updateSwipe(
  leftHand: NormalizedLandmark[] | undefined,
  rightHand: NormalizedLandmark[] | undefined,
  now: number,
) {
  const hands: Partial<Record<HandSide, NormalizedLandmark[]>> = {
    left: leftHand,
    right: rightHand,
  }
  const pointingHands = (['left', 'right'] as HandSide[]).filter((side) => {
    const hand = hands[side]
    return Boolean(hand && isPointingIndex(hand))
  })

  if (activeSwipeHand && !pointingHands.includes(activeSwipeHand)) {
    const motion = fingerMotion[activeSwipeHand]
    if (now - motion.lastSeenAt > SWIPE_RELEASE_DELAY) {
      motion.present = false
      activeSwipeHand = null
    }
  }
  if (!activeSwipeHand && pointingHands.length) {
    activeSwipeHand = pointingHands[0]
    fingerMotion[activeSwipeHand].present = false
  }

  swipeActive = Boolean(activeSwipeHand)
  if (activeSwipeHand) {
    const hand = hands[activeSwipeHand]
    if (hand && pointingHands.includes(activeSwipeHand)) updateSwipeHand(activeSwipeHand, hand, now)
  }
}

function palmCenter(landmarks: NormalizedLandmark[]) {
  const indices = [0, 5, 9, 13, 17]
  return indices.reduce((center, index) => ({
    x: center.x + landmarks[index].x / indices.length,
    y: center.y + landmarks[index].y / indices.length,
  }), { x: 0, y: 0 })
}

function randomTextColor() {
  const hue = Math.random() * 360
  const saturation = .72 + Math.random() * .23
  const lightness = .48 + Math.random() * .2
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const secondary = chroma * (1 - Math.abs(segment % 2 - 1))
  const match = lightness - chroma / 2
  const [red, green, blue] = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
      : segment < 3 ? [0, chroma, secondary]
        : segment < 4 ? [0, secondary, chroma]
          : segment < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary]
  const hex = (value: number) => Math.round((value + match) * 255).toString(16).padStart(2, '0')
  return `#${hex(red)}${hex(green)}${hex(blue)}`
}

function applyRandomTextColor() {
  textColor.value = randomTextColor()
  updateColor()
}

function updateClap(
  leftHand: NormalizedLandmark[] | undefined,
  rightHand: NormalizedLandmark[] | undefined,
  now: number,
) {
  if (!leftHand || !rightHand) {
    const justLostAtImpact = clapMotion.armed
      && now - clapMotion.lastSeenAt < 110
      && clapMotion.previousDistance < 1.85
      && clapMotion.previousClosingSpeed > 2.4
    if (justLostAtImpact && now - clapMotion.lastClapAt > CLAP_COOLDOWN) {
      clapMotion.armed = false
      clapMotion.lastClapAt = now
      applyRandomTextColor()
      return
    }
    if (now - clapMotion.lastSeenAt > 220) {
      clapMotion.previousDistance = Infinity
      clapMotion.previousClosingSpeed = 0
      clapMotion.previousAt = 0
    }
    return
  }

  const leftCenter = palmCenter(leftHand)
  const rightCenter = palmCenter(rightHand)
  const centerDistance = Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y)
  const palmWidth = Math.max(
    .015,
    (distance(leftHand[5], leftHand[17]) + distance(rightHand[5], rightHand[17])) / 2,
  )
  const normalizedDistance = centerDistance / palmWidth
  const elapsed = now - clapMotion.previousAt
  const closingSpeed = Number.isFinite(clapMotion.previousDistance) && elapsed > 0 && elapsed < 180
    ? (clapMotion.previousDistance - normalizedDistance) / elapsed * 1000
    : 0

  if (normalizedDistance > 2.7) clapMotion.armed = true
  const clapped = clapMotion.armed
    && normalizedDistance < 1.65
    && closingSpeed > 2.4
    && now - clapMotion.lastClapAt > CLAP_COOLDOWN

  clapMotion.previousDistance = normalizedDistance
  clapMotion.previousClosingSpeed = closingSpeed
  clapMotion.previousAt = now
  clapMotion.lastSeenAt = now
  if (!clapped) return

  clapMotion.armed = false
  clapMotion.lastClapAt = now
  applyRandomTextColor()
}

function updateTrackingMessage(now: number) {
  if (now - clapMotion.lastClapAt < 900) {
    setStatus('박수! 새로운 색상으로 바뀌었어요', 'action')
  } else if (swipeActive) {
    setStatus('검지로 텍스트를 움직이는 중', 'ready')
  } else if (personVisible) {
    setStatus('검지로 스와이프 · 박수로 색상 변경', 'ready')
  } else {
    setStatus('인물을 카메라에 보여주세요', 'ready')
  }
}

function detect(now: number) {
  if (!modelReady || !tracker || !cameraReady || document.hidden || video.readyState < 2) return
  if (now - lastDetectionAt < DETECTION_INTERVAL || lastVideoTime === video.currentTime) return
  lastDetectionAt = now
  lastVideoTime = video.currentTime

  try {
    const result = tracker.detectForVideo(video, now)
    const mask = result.poseSegmentationMasks[0]
    if (mask) updateMask(mask)
    updatePersonPosition(result.poseLandmarks[0], result.faceLandmarks[0], now)
    const leftHand = result.leftHandLandmarks[0]
    const rightHand = result.rightHandLandmarks[0]
    updateClap(leftHand, rightHand, now)
    updateSwipe(leftHand, rightHand, now)
    updateTrackingMessage(now)
  } catch {
    // A duplicated camera timestamp can be skipped safely.
  }
}

function drawPerson(now: number) {
  if (!cameraReady || !maskReady || video.readyState < 2) return
  if (now - lastPersonDrawAt < PERSON_FRAME_INTERVAL) return
  lastPersonDrawAt = now
  personContext.clearRect(0, 0, viewportWidth, viewportHeight)
  const layout = videoLayout()
  personContext.save()
  personContext.translate(viewportWidth, 0)
  personContext.scale(-1, 1)
  personContext.drawImage(video, layout.offsetX, layout.offsetY, layout.drawnWidth, layout.drawnHeight)
  personContext.globalCompositeOperation = 'destination-in'
  personContext.imageSmoothingEnabled = true
  personContext.drawImage(maskCanvas, layout.offsetX, layout.offsetY, layout.drawnWidth, layout.drawnHeight)
  personContext.restore()
}

function measuredTextWidth(text: string, fontSize: number) {
  typeContext.save()
  typeContext.font = `900 ${fontSize}px "Arial Narrow", "Noto Sans KR", sans-serif`
  const width = typeContext.measureText(text).width * .58
  typeContext.restore()
  return width
}

function drawWord(text: string, x: number, y: number, fontSize: number) {
  typeContext.save()
  typeContext.translate(x, y)
  typeContext.scale(.58, 1.18)
  typeContext.font = `900 ${fontSize}px "Arial Narrow", "Noto Sans KR", sans-serif`
  typeContext.textAlign = 'left'
  typeContext.textBaseline = 'middle'
  typeContext.lineJoin = 'round'
  typeContext.miterLimit = 2
  typeContext.fillStyle = textColor.value
  typeContext.strokeStyle = '#000000'
  typeContext.lineWidth = 2 / .58
  typeContext.strokeText(text, 0, 0)
  typeContext.fillText(text, 0, 0)
  typeContext.restore()
}

function drawTypography() {
  typeContext.clearRect(0, 0, viewportWidth, viewportHeight)
  const text = Array.from(textInput.value.trim()).slice(0, 12).join('')
  if (!text) return

  const fontSize = clamp(viewportHeight * .43, 190, 430)
  const wordWidth = measuredTextWidth(text, fontSize)
  const gap = clamp(fontSize * .045, 8, 20)
  const step = Math.max(24, wordWidth + gap)
  const centerY = viewportHeight * .49
  const oppositeBias = (.5 - subjectCenter) * step * (.72 + subjectWidth * .45)
  if (Math.abs(scrollOffset) > step * 1000) scrollOffset %= step
  const lineOffset = scrollOffset + oppositeBias
  let x = -step + ((lineOffset % step) + step) % step

  while (x < viewportWidth + step) {
    drawWord(text, x, centerY, fontSize)
    x += step
  }
}

function render(now: number) {
  const delta = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  detect(now)

  const centerMovement = targetSubjectCenter - subjectCenter
  const widthMovement = targetSubjectWidth - subjectWidth
  subjectCenter += centerMovement * .14
  subjectWidth += widthMovement * .14
  if (Math.abs(centerMovement) > .0002 || Math.abs(widthMovement) > .0002) typographyDirty = true

  if (!swipeActive) {
    scrollOffset += scrollVelocity * delta
    scrollVelocity *= Math.exp(-delta * 4.4)
    if (Math.abs(scrollVelocity) >= 1) typographyDirty = true
    else scrollVelocity = 0
  }
  if (typographyDirty) {
    drawTypography()
    typographyDirty = false
  }
  drawPerson(now)
  if (cameraReady) requestAnimationFrame(render)
}

async function createTracker() {
  if (tracker) return
  const { FilesetResolver, HolisticLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  const options = {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/holistic_landmarker.task`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    minFaceDetectionConfidence: .45,
    minFacePresenceConfidence: .45,
    minPoseDetectionConfidence: .45,
    minPosePresenceConfidence: .45,
    minTrackingConfidence: .45,
    outputFaceBlendshapes: false,
    outputPoseSegmentationMasks: true,
  }
  try {
    tracker = await HolisticLandmarker.createFromOptions(vision, options)
  } catch {
    tracker = await HolisticLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/holistic_landmarker.task` },
    })
  }
  modelReady = true
}

async function startCamera() {
  startCameraButton.disabled = true
  permissionCopy.textContent = '카메라와 인물 인식 모델을 준비하고 있어요.'
  setStatus('카메라 준비 중')
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unavailable')
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960, max: 960 },
          height: { ideal: 540, max: 540 },
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
    setStatus('인물을 카메라에 보여주세요', 'ready')
    window.setTimeout(() => textInput.focus(), 260)
    lastFrameAt = performance.now()
    requestAnimationFrame(render)
  } catch {
    cameraReady = false
    permissionPanel.classList.remove('hidden')
    permissionCopy.textContent = '카메라를 열 수 없어요. 브라우저 설정에서 이 사이트의 카메라 권한을 허용한 뒤 다시 시도해 주세요.'
    startCameraButton.textContent = '다시 시도'
    startCameraButton.disabled = false
    setStatus('카메라 권한이 필요해요', 'error')
  }
}

function resize() {
  viewportWidth = window.innerWidth
  viewportHeight = window.innerHeight
  const devicePixelRatio = window.devicePixelRatio || 1
  const resizeCanvas = (
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    ratio: number,
  ) => {
    canvas.width = Math.round(viewportWidth * ratio)
    canvas.height = Math.round(viewportHeight * ratio)
    canvas.style.width = `${viewportWidth}px`
    canvas.style.height = `${viewportHeight}px`
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  resizeCanvas(typeCanvas, typeContext, Math.min(devicePixelRatio, 1.5))
  resizeCanvas(personCanvas, personContext, Math.min(devicePixelRatio, 1.25))
  lastPersonDrawAt = 0
  typographyDirty = true
}

function updateInput() {
  const characters = Array.from(textInput.value)
  if (characters.length > 12) textInput.value = characters.slice(0, 12).join('')
  characterCount.value = `${Array.from(textInput.value).length}/12`
  characterCount.textContent = characterCount.value
  typographyDirty = true
}

function updateColor() {
  colorChip.style.setProperty('--chip-color', textColor.value)
  typographyDirty = true
}

typeControls.addEventListener('submit', (event) => {
  event.preventDefault()
  textInput.blur()
})
textInput.addEventListener('input', updateInput)
textColor.addEventListener('input', updateColor)
startCameraButton.addEventListener('click', startCamera)
window.addEventListener('resize', resize)
window.addEventListener('pagehide', () => {
  cameraReady = false
  cameraStream?.getTracks().forEach((track) => track.stop())
  tracker?.close()
})

resize()
updateInput()
updateColor()
requestAnimationFrame(render)
