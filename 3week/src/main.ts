import type { FilesetResolver, HolisticLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { WaterRenderer, type WaterFinger } from './waterRenderer'
import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="lemonade-app">
    <video id="camera" muted playsinline aria-hidden="true"></video>
    <canvas id="scene" aria-label="카메라 위에 레몬과 레몬에이드가 표시되는 인터랙션 화면"></canvas>
    <canvas id="waterScene" aria-label="손끝에 반응해 물결처럼 왜곡되는 카메라 화면"></canvas>

    <header class="bubble-nav">
      <a class="home-bubble" href="${import.meta.env.BASE_URL}" aria-label="홈으로 이동" title="홈으로 이동">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v8.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-8.6Z"/><path d="M9.2 21v-6.8h5.6V21"/></svg>
      </a>
      <nav class="bubble-tabs" aria-label="3주차 인터랙션 목록">
        <button class="bubble-tab active" id="lemonadeTab" type="button" aria-current="page">
          <span class="tab-fruit" aria-hidden="true">●</span>
          <span><small>WEEK 03</small>Lemonade</span>
        </button>
        <button class="bubble-tab water-tab" id="waterTab" type="button">
          <span class="tab-fruit" aria-hidden="true">≈</span>
          <span><small>WEEK 03</small>WaterTouch</span>
        </button>
        <button class="bubble-tab balloon-tab" id="balloonTab" type="button" aria-label="Balloon">
          <span class="tab-fruit" aria-hidden="true">●</span>
          <span><small>WEEK 03</small>Balloon</span>
        </button>
        <button class="bubble-tab mosquito-tab" id="mosquitoTab" type="button" aria-label="mosquito">
          <span class="tab-fruit" aria-hidden="true">🦟</span>
          <span><small>WEEK 03</small>mosquito</span>
        </button>
      </nav>
      <div class="tracking-status" id="trackingStatus"><i></i><span>카메라 준비 중</span></div>
    </header>

    <section class="gesture-guide" aria-label="사용 방법">
      <div class="guide-bubble guide-bubble--left">
        <span class="hand-icon" aria-hidden="true">✊</span>
        <p id="leftGuide"><b>왼손으로 짜기</b><small>레몬 가까이에서 주먹을 쥐세요</small></p>
      </div>
      <div class="guide-bubble guide-bubble--right">
        <span class="hand-icon" aria-hidden="true">✋</span>
        <p id="rightGuide"><b>오른손으로 컵 들기</b><small>손바닥을 보여주세요</small></p>
      </div>
    </section>

    <section class="permission-panel" id="permissionPanel" aria-live="polite">
      <div class="permission-illustration" aria-hidden="true"><span></span><i></i></div>
      <p class="permission-kicker" id="permissionKicker">WEEK 03 CAMERA</p>
      <h1 id="permissionTitle">손으로 즐기는<br />3주차 인터랙션</h1>
      <p id="permissionCopy">카메라 권한을 허용하면 레몬, 물결, 풍선, 모기를 몸짓으로 직접 움직일 수 있어요.</p>
      <button id="startCamera" type="button">카메라 실행하기</button>
    </section>

    <div class="camera-controls" aria-label="카메라 촬영 도구">
      <span class="record-time" id="recordTime" aria-live="polite">00:00</span>
      <button class="shutter" id="shutter" type="button" aria-label="짧게 눌러 사진 촬영, 길게 눌러 동영상 녹화" disabled>
        <span></span>
      </button>
      <p>사진 · 길게 눌러 영상</p>
    </div>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  </main>
`

type Point = { x: number; y: number }
type HandState = Point & { present: boolean; fist: boolean }
type LemonState = 'floating' | 'held' | 'falling' | 'gone'
type Interaction = 'lemonade' | 'water' | 'balloon' | 'mosquito'
type Lemon = Point & {
  id: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  size: number
  juice: number
  maxJuice: number
  state: LemonState
  fallSpeed: number
  squeeze: number
  nextDropAt: number
}
type Drop = Point & { vx: number; vy: number; size: number; value: number; life: number }
type BalloonState = 'rising' | 'held' | 'sticky' | 'popped'
type BalloonSprite = { canvas: HTMLCanvasElement; width: number; height: number; offsetX: number; offsetY: number; pixelRatio: number }
type StickyMotion = Point & { phase: number; driftX: number; driftY: number }
type Balloon = Point & {
  id: number
  vx: number
  vy: number
  radiusX: number
  radiusY: number
  color: string
  darkColor: string
  colors: string[]
  value: number
  isMerged: boolean
  stringLength: number
  stringEndX: number
  stringEndY: number
  wobble: number
  state: BalloonState
  grabbedBy: 'left' | 'right' | null
  sprite?: BalloonSprite
  sticky?: StickyMotion
}
type BalloonParticle = Point & { vx: number; vy: number; size: number; rotation: number; spin: number; color: string; life: number; maxLife: number }
type BalloonGesture = {
  index: Point & { present: boolean }
  pinch: Point & { present: boolean; pinching: boolean; vx: number; vy: number }
}
type MosquitoState = 'flying' | 'stunned' | 'flung' | 'dying' | 'falling' | 'dead'
type Mosquito = Point & {
  id: number
  vx: number
  vy: number
  size: number
  phase: number
  rotation: number
  state: MosquitoState
  stateSince: number
  stunnedUntil: number
  groundY: number
}
type BloodDrop = Point & { vx: number; vy: number; radius: number; life: number; maxLife: number }
type ClapBurst = Point & { startedAt: number }
type MosquitoFlick = Point & { present: boolean; vx: number; vy: number; lastUpdatedAt: number; lastFlickAt: number }
type VideoCrop = { sx: number; sy: number; sw: number; sh: number; videoWidth: number; videoHeight: number }
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number
}

const video = document.querySelector<HTMLVideoElement>('#camera')!
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const context = canvas.getContext('2d', { alpha: false, desynchronized: true })!
const waterCanvas = document.querySelector<HTMLCanvasElement>('#waterScene')!
const waterRenderer = new WaterRenderer(waterCanvas)
const app = document.querySelector<HTMLElement>('.lemonade-app')!
const permissionPanel = document.querySelector<HTMLElement>('#permissionPanel')!
const permissionCopy = document.querySelector<HTMLParagraphElement>('#permissionCopy')!
const startCameraButton = document.querySelector<HTMLButtonElement>('#startCamera')!
const lemonadeTab = document.querySelector<HTMLButtonElement>('#lemonadeTab')!
const waterTab = document.querySelector<HTMLButtonElement>('#waterTab')!
const balloonTab = document.querySelector<HTMLButtonElement>('#balloonTab')!
const mosquitoTab = document.querySelector<HTMLButtonElement>('#mosquitoTab')!
const leftGuide = document.querySelector<HTMLParagraphElement>('#leftGuide')!
const rightGuide = document.querySelector<HTMLParagraphElement>('#rightGuide')!
const guideIcons = Array.from(document.querySelectorAll<HTMLElement>('.hand-icon'))
const shutter = document.querySelector<HTMLButtonElement>('#shutter')!
const recordTime = document.querySelector<HTMLSpanElement>('#recordTime')!
const trackingStatus = document.querySelector<HTMLDivElement>('#trackingStatus')!
const trackingStatusText = trackingStatus.querySelector('span')!
const toast = document.querySelector<HTMLDivElement>('#toast')!

const lemonImage = new Image()
lemonImage.src = `${import.meta.env.BASE_URL}3week/lemon.png`
const silverBalloonImage = new Image()
silverBalloonImage.src = `${import.meta.env.BASE_URL}3week/silver bll.png`
silverBalloonImage.addEventListener('load', () => {
  // Rebuild the lightweight sprite cache once the reference texture is ready.
  balloons.forEach((balloon) => { balloon.sprite = undefined })
})
const waterTouchSound = new Audio(`${import.meta.env.BASE_URL}3week/watertouch.mp3`)
waterTouchSound.preload = 'auto'

const leftHand: HandState = { x: 0, y: 0, present: false, fist: false }
const rightHand: HandState = { x: 0, y: 0, present: false, fist: false }
const fingertips = new Map<string, WaterFinger>()
const cup = { x: 0, y: 0, liquid: 0, targetX: 0, targetY: 0 }
const mouth = { x: 0, y: 0, present: false, blowing: false }
const lemons: Lemon[] = []
const drops: Drop[] = []
const balloons: Balloon[] = []
const balloonParticles: BalloonParticle[] = []
const mosquitoes: Mosquito[] = []
const bloodDrops: BloodDrop[] = []
const clapBursts: ClapBurst[] = []
const balloonGestures: Record<'left' | 'right', BalloonGesture> = {
  left: {
    index: { x: 0, y: 0, present: false },
    pinch: { x: 0, y: 0, present: false, pinching: false, vx: 0, vy: 0 },
  },
  right: {
    index: { x: 0, y: 0, present: false },
    pinch: { x: 0, y: 0, present: false, pinching: false, vx: 0, vy: 0 },
  },
}
const mosquitoFlicks: Record<'left' | 'right', MosquitoFlick> = {
  left: { x: 0, y: 0, present: false, vx: 0, vy: 0, lastUpdatedAt: 0, lastFlickAt: 0 },
  right: { x: 0, y: 0, present: false, vx: 0, vy: 0, lastUpdatedAt: 0, lastFlickAt: 0 },
}

let viewportWidth = 1
let viewportHeight = 1
let pixelRatio = 1
let stream: MediaStream | null = null
let holisticLandmarker: HolisticLandmarker | null = null
let visionFileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null
let cameraReady = false
let modelReady = false
let heldLemonId: number | null = null
let lastFrameAt = performance.now()
let lastDetectionAt = 0
let lastVideoTime = -1
let toastTimer: number | undefined
let mediaRecorder: MediaRecorder | null = null
let recordingChunks: Blob[] = []
let recordingStartedAt = 0
let longPressTimer: number | undefined
let longPressTriggered = false
let stopPress = false
let previousStatus = ''
let sipReadyAnnounced = false
let cropCache: VideoCrop | null = null
let renderQueued = false
let interaction: Interaction = 'lemonade'
let lastWaterSoundAt = 0
let activeWaterSoundHand: 'left' | 'right' | null = null
let nextBalloonId = 0
let nextBalloonAt = 0
let lastRenderedAt = 0
let nextMosquitoId = 0
let nextMosquitoAt = 0
let wasBlowing = false
const mosquitoesBlownThisBreath = new Set<number>()
const wasMosquitoPinching: Record<'left' | 'right', boolean> = { left: false, right: false }

const ACTIVE_DETECTION_INTERVAL = 100
const IDLE_DETECTION_INTERVAL = 180
const LONG_PRESS_DURATION = 480
const FRAME_INTERVAL = 1000 / 30
const MAX_BALLOONS = 13
const MAX_BALLOON_PARTICLES = 120
const MAX_FLYING_MOSQUITOES = 9
const MAX_DEAD_MOSQUITOES = 28
const CAMERA_SESSION_KEY = 'interaction-week03-camera-started'

function hasStartedCameraThisSession() {
  try {
    return sessionStorage.getItem(CAMERA_SESSION_KEY) === 'true'
  } catch {
    return false
  }
}

function rememberCameraStart() {
  try {
    sessionStorage.setItem(CAMERA_SESSION_KEY, 'true')
  } catch {
    // The interaction still works if the browser blocks session storage.
  }
}

function prepareWaterTouchSound() {
  // Unlock audio during the camera button's user gesture without making sound.
  waterTouchSound.muted = true
  void waterTouchSound.play().then(() => {
    waterTouchSound.pause()
    waterTouchSound.currentTime = 0
    waterTouchSound.muted = false
  }).catch(() => {
    waterTouchSound.muted = false
  })
}

function stopWaterTouchSound(hand?: 'left' | 'right') {
  if (hand && activeWaterSoundHand !== hand) return
  waterTouchSound.pause()
  waterTouchSound.currentTime = 0
  activeWaterSoundHand = null
}

function playWaterTouchSound(hand: 'left' | 'right', strength: number, now: number) {
  if (interaction !== 'water' || now - lastWaterSoundAt < 320) return
  lastWaterSoundAt = now
  waterTouchSound.pause()
  waterTouchSound.currentTime = 0
  waterTouchSound.volume = Math.min(.95, .58 + strength * .28)
  activeWaterSoundHand = hand
  void waterTouchSound.play().catch(() => undefined)
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect()
  viewportWidth = Math.max(1, bounds.width)
  viewportHeight = Math.max(1, bounds.height)
  // The incoming camera is 960 × 540. Rendering more pixels than this on a
  // high-density phone adds heat without adding visible camera detail.
  const devicePixelRatio = window.devicePixelRatio || 1
  pixelRatio = Math.min(devicePixelRatio, devicePixelRatio >= 2 ? 1.25 : 1.5)
  canvas.width = Math.round(viewportWidth * pixelRatio)
  canvas.height = Math.round(viewportHeight * pixelRatio)
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  waterRenderer.resize(viewportWidth, viewportHeight, pixelRatio)
  cropCache = null
  if (!cup.x) {
    cup.x = viewportWidth / 2
    cup.y = viewportHeight - Math.min(190, viewportHeight * .23)
  }
}

function seedLemons() {
  const positions = [
    [.13, .22], [.34, .31], [.57, .18], [.78, .3], [.22, .52], [.73, .56],
  ]
  positions.forEach(([x, y], index) => {
    const maxJuice = 74 + index * 7
    lemons.push({
      id: index,
      x: x * viewportWidth,
      y: y * viewportHeight,
      vx: (index % 2 ? -1 : 1) * (11 + index * 1.8),
      vy: (index % 3 - 1) * 7,
      rotation: index * .7,
      rotationSpeed: (index % 2 ? -1 : 1) * (.08 + index * .012),
      size: 76 + (index % 3) * 9,
      juice: maxJuice,
      maxJuice,
      state: 'floating',
      fallSpeed: 0,
      squeeze: 0,
      nextDropAt: 0,
    })
  })
}

function showToast(message: string) {
  toast.textContent = message
  toast.classList.add('visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2400)
}

function updateTrackingStatus() {
  trackingStatus.classList.toggle('ready', cameraReady && modelReady)
  let nextStatus = '손을 보여주세요'
  if (!cameraReady) nextStatus = '카메라 준비 중'
  else if (!modelReady) nextStatus = '손 인식 준비 중'
  else if (interaction === 'water') nextStatus = fingertips.size ? `손끝 ${fingertips.size}/10 인식` : '손끝을 보여주세요'
  else if (interaction === 'balloon') {
    const holding = Object.values(balloonGestures).some((gesture) => gesture.pinch.pinching)
    const indexVisible = Object.values(balloonGestures).some((gesture) => gesture.index.present)
    const bundleCount = Math.max(
      balloons.filter((balloon) => balloon.state === 'held' && balloon.grabbedBy === 'left').reduce((count, balloon) => count + balloon.value, 0),
      balloons.filter((balloon) => balloon.state === 'held' && balloon.grabbedBy === 'right').reduce((count, balloon) => count + balloon.value, 0),
    )
    nextStatus = bundleCount > 1 ? `풍선 ${bundleCount}/5개 모음` : holding ? '끈을 잡고 있어요' : indexVisible ? '검지로 풍선을 터뜨려 보세요' : '손을 보여주세요'
  }
  else if (interaction === 'mosquito') {
    if (mouth.blowing) nextStatus = '후— 바람을 불고 있어요'
    else if (Object.values(balloonGestures).some((gesture) => gesture.pinch.pinching)) nextStatus = '엄지와 검지로 모기를 집고 있어요'
    else if (Object.values(mosquitoFlicks).some((flick) => flick.present)) nextStatus = '가운데손가락으로 모기를 튕겨보세요'
    else nextStatus = '집게손 또는 가운데손가락을 보여주세요'
  }
  else if (leftHand.present || rightHand.present) nextStatus = '손을 인식했어요'
  if (nextStatus !== previousStatus) {
    trackingStatusText.textContent = nextStatus
    previousStatus = nextStatus
  }
}

function setInteraction(next: Interaction, updateHash = true) {
  interaction = next
  const isWater = next === 'water'
  const isBalloon = next === 'balloon'
  const isMosquito = next === 'mosquito'
  if (!isMosquito) {
    wasBlowing = false
    mosquitoesBlownThisBreath.clear()
    wasMosquitoPinching.left = false
    wasMosquitoPinching.right = false
  }
  app.classList.toggle('water-mode', isWater)
  app.classList.toggle('water-fallback', isWater && !waterRenderer.supported)
  app.classList.toggle('balloon-mode', isBalloon)
  app.classList.toggle('mosquito-mode', isMosquito)
  lemonadeTab.classList.toggle('active', next === 'lemonade')
  waterTab.classList.toggle('active', isWater)
  balloonTab.classList.toggle('active', isBalloon)
  mosquitoTab.classList.toggle('active', isMosquito)
  lemonadeTab.toggleAttribute('aria-current', next === 'lemonade')
  waterTab.toggleAttribute('aria-current', isWater)
  balloonTab.toggleAttribute('aria-current', isBalloon)
  mosquitoTab.toggleAttribute('aria-current', isMosquito)

  if (isWater) {
    guideIcons[0].textContent = '☝️'
    guideIcons[1].textContent = '🖐️'
    leftGuide.innerHTML = '<b>손끝으로 수면 터치</b><small>한 손가락만 닿아도 파동이 생겨요</small>'
    rightGuide.innerHTML = '<b>양손 10개 손끝 인식</b><small>움직일수록 물살이 갈라져요</small>'
    document.title = 'WaterTouch · Week 03'
  } else if (isBalloon) {
    stopWaterTouchSound()
    guideIcons[0].textContent = '🤏'
    guideIcons[1].textContent = '🤏'
    leftGuide.innerHTML = '<b>왼손에 풍선 모으기</b><small>2개가 모이면 더 큰 풍선으로 합쳐져요</small>'
    rightGuide.innerHTML = '<b>오른손으로 하나 더 잡기</b><small>두 핀치를 가까이 대면 왼손으로 옮겨져요</small>'
    document.title = 'Balloon · Week 03'
    if (!balloons.length) seedBalloons()
  } else if (isMosquito) {
    stopWaterTouchSound()
    guideIcons[0].textContent = '🤏'
    guideIcons[1].textContent = '🫰'
    leftGuide.innerHTML = '<b>엄지·검지로 모기 집기</b><small>집힌 모기는 X X 눈으로 죽어요</small>'
    rightGuide.innerHTML = '<b>가운데손가락으로 튕기기</b><small>입을 O로 하면 바람도 불 수 있어요</small>'
    document.title = 'mosquito · Week 03'
    if (!mosquitoes.length) seedMosquitoes()
  } else {
    stopWaterTouchSound()
    guideIcons[0].textContent = '✊'
    guideIcons[1].textContent = '✋'
    leftGuide.innerHTML = '<b>왼손으로 짜기</b><small>레몬 가까이에서 주먹을 쥐세요</small>'
    rightGuide.innerHTML = '<b>오른손으로 컵 들기</b><small>손바닥을 보여주세요</small>'
    document.title = 'Lemonade · Week 03'
  }
  if (updateHash) {
    const hash = isWater ? '#watertouch' : isBalloon ? '#balloon' : isMosquito ? '#mosquito' : `${location.pathname}${location.search}`
    history.replaceState(null, '', hash)
  }
  updateTrackingStatus()
}

async function createHolisticTracker() {
  if (holisticLandmarker) return
  const { FilesetResolver, HolisticLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = visionFileset ?? await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  visionFileset = vision
  const options = {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/holistic_landmarker.task`, delegate: 'GPU' as const },
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
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/holistic_landmarker.task` },
    })
  }
  modelReady = true
  updateTrackingStatus()
}

async function startCamera(continuingSession = false) {
  if (!continuingSession) prepareWaterTouchSound()
  if (cameraReady) {
    if (!modelReady) await createHolisticTracker()
    permissionPanel.classList.add('hidden')
    return
  }
  if (continuingSession) permissionPanel.classList.add('hidden')
  else startCameraButton.disabled = true
  if (!continuingSession) permissionCopy.textContent = '카메라와 손 인식 모델을 준비하고 있어요.'
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 960, max: 960 },
        height: { ideal: 540, max: 540 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    })
    video.srcObject = stream
    await video.play()
    cropCache = null
    cameraReady = true
    rememberCameraStart()
    shutter.disabled = false
    permissionPanel.classList.add('hidden')
    updateTrackingStatus()
    void createHolisticTracker().catch(() => {
      permissionPanel.classList.remove('hidden')
      permissionPanel.classList.add('compact')
      permissionCopy.textContent = '손 인식 모델을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.'
      startCameraButton.textContent = '다시 시도'
      startCameraButton.disabled = false
    })
  } catch {
    permissionPanel.classList.remove('hidden')
    permissionCopy.textContent = '카메라를 열 수 없어요. 브라우저 설정에서 카메라 권한을 허용해 주세요.'
    startCameraButton.textContent = '다시 시도'
    startCameraButton.disabled = false
  }
}

function videoCrop(): VideoCrop {
  if (cropCache) return cropCache
  const videoWidth = video.videoWidth || viewportWidth
  const videoHeight = video.videoHeight || viewportHeight
  const videoRatio = videoWidth / videoHeight
  const canvasRatio = viewportWidth / viewportHeight
  if (videoRatio > canvasRatio) {
    const sourceWidth = videoHeight * canvasRatio
    cropCache = { sx: (videoWidth - sourceWidth) / 2, sy: 0, sw: sourceWidth, sh: videoHeight, videoWidth, videoHeight }
    return cropCache
  }
  const sourceHeight = videoWidth / canvasRatio
  cropCache = { sx: 0, sy: (videoHeight - sourceHeight) / 2, sw: videoWidth, sh: sourceHeight, videoWidth, videoHeight }
  return cropCache
}

function landmarkToScreen(landmark: NormalizedLandmark): Point {
  const crop = videoCrop()
  const croppedX = (landmark.x * crop.videoWidth - crop.sx) / crop.sw
  const croppedY = (landmark.y * crop.videoHeight - crop.sy) / crop.sh
  return { x: (1 - croppedX) * viewportWidth, y: croppedY * viewportHeight }
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function isFist(landmarks: NormalizedLandmark[]) {
  const wrist = landmarks[0]
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]]
  // A fist requires every non-thumb finger plus the thumb to be folded.
  // This deliberately excludes a one-finger gesture (for example, index up).
  const fingersFolded = fingers.every(([tip, middle]) => (
    distance(landmarks[tip], wrist) < distance(landmarks[middle], wrist) * 1.2
  ))
  const thumbFolded = distance(landmarks[4], wrist) < distance(landmarks[3], wrist) * 1.2
  return fingersFolded && thumbFolded
}

function setHandState(hand: HandState, landmarks: NormalizedLandmark[]) {
  const palmIndexes = [0, 5, 9, 13, 17]
  const palm = palmIndexes.reduce((point, index) => {
    const mapped = landmarkToScreen(landmarks[index])
    point.x += mapped.x / palmIndexes.length
    point.y += mapped.y / palmIndexes.length
    return point
  }, { x: 0, y: 0 })
  const smoothing = hand.present ? .38 : 1
  hand.x += (palm.x - hand.x) * smoothing
  hand.y += (palm.y - hand.y) * smoothing
  hand.present = true
  hand.fist = isFist(landmarks)
}

function detectWaterPunch(side: 'left' | 'right', hand: HandState, previous: HandState, now: number) {
  if (interaction !== 'water' || !hand.fist) {
    stopWaterTouchSound(side)
    return
  }
  const fistJustClosed = !previous.present || !previous.fist
  const movement = previous.present ? Math.hypot(hand.x - previous.x, hand.y - previous.y) : 0
  if (!fistJustClosed && movement < 7) {
    stopWaterTouchSound(side)
    return
  }
  if (fistJustClosed || movement > 30) playWaterTouchSound(side, Math.min(1, .55 + movement / 105), now)
}

function setFingertips(side: 'left' | 'right', landmarks: NormalizedLandmark[], activeIds: Set<string>, fist: boolean) {
  // MediaPipe exposes thumb through pinky as 4, 8, 12, 16 and 20.
  ;[4, 8, 12, 16, 20].forEach((landmarkIndex, fingerIndex) => {
    const id = `${side}-${fingerIndex}`
    const target = landmarkToScreen(landmarks[landmarkIndex])
    const previous = fingertips.get(id)
    const smoothing = previous ? .55 : 1
    const x = previous ? previous.x + (target.x - previous.x) * smoothing : target.x
    const y = previous ? previous.y + (target.y - previous.y) * smoothing : target.y
    fingertips.set(id, {
      id,
      x,
      y,
      vx: previous ? x - previous.x : 0,
      vy: previous ? y - previous.y : 0,
      // A clenched hand is treated as a heavier contact with the water surface.
      // A single finger creates a calm ripple; a fully closed fist is a strong impact.
      impact: fist ? 3.6 : .65,
    })
    activeIds.add(id)
  })
}

function updateBalloonGesture(side: 'left' | 'right', landmarks: NormalizedLandmark[]) {
  const gesture = balloonGestures[side]
  const indexTarget = landmarkToScreen(landmarks[8])
  const thumbTarget = landmarkToScreen(landmarks[4])
  const indexSmoothing = gesture.index.present ? .58 : 1
  gesture.index.x += (indexTarget.x - gesture.index.x) * indexSmoothing
  gesture.index.y += (indexTarget.y - gesture.index.y) * indexSmoothing
  gesture.index.present = true

  const pinchTarget = { x: (indexTarget.x + thumbTarget.x) / 2, y: (indexTarget.y + thumbTarget.y) / 2 }
  const pinchSmoothing = gesture.pinch.present ? .68 : 1
  const oldX = gesture.pinch.x
  const oldY = gesture.pinch.y
  gesture.pinch.x += (pinchTarget.x - gesture.pinch.x) * pinchSmoothing
  gesture.pinch.y += (pinchTarget.y - gesture.pinch.y) * pinchSmoothing
  gesture.pinch.vx = gesture.pinch.present ? gesture.pinch.x - oldX : 0
  gesture.pinch.vy = gesture.pinch.present ? gesture.pinch.y - oldY : 0
  gesture.pinch.present = true
  // Using normalized landmarks keeps this threshold stable at every screen size.
  gesture.pinch.pinching = distance(landmarks[4], landmarks[8]) < .058
}

function clearBalloonGesture(side: 'left' | 'right') {
  const gesture = balloonGestures[side]
  gesture.index.present = false
  gesture.pinch.present = false
  gesture.pinch.pinching = false
  gesture.pinch.vx = 0
  gesture.pinch.vy = 0
}

function updateMouth(face: NormalizedLandmark[] | undefined) {
  const wasPresent = mouth.present
  mouth.present = false
  mouth.blowing = false
  if (!face) return

  // 13/14 are the inner lip centers and 78/308 are the mouth corners.
  // Averaging all four anchors the straw to the lips, even while speaking.
  const lipPoints = [13, 14, 78, 308].map((index) => landmarkToScreen(face[index]))
  const target = lipPoints.reduce((point, lip) => ({
    x: point.x + lip.x / lipPoints.length,
    y: point.y + lip.y / lipPoints.length,
  }), { x: 0, y: 0 })
  const forehead = landmarkToScreen(face[10])
  const chin = landmarkToScreen(face[152])
  const faceTop = Math.min(forehead.y, chin.y)
  const faceHeight = Math.abs(chin.y - forehead.y)
  const isInsideMouthZone = faceHeight > 44
    && target.y > faceTop + faceHeight * .42
    && target.y < faceTop + faceHeight * .88
  if (!isInsideMouthZone) return

  const smoothing = wasPresent ? .28 : 1
  mouth.x += (target.x - mouth.x) * smoothing
  mouth.y += (target.y - mouth.y) * smoothing
  mouth.present = true

  // A vertically open, comparatively narrow mouth reads as an "O". Keeping
  // this in normalized landmark space makes the threshold independent of the
  // camera crop and screen size.
  const mouthWidth = distance(face[78], face[308])
  const mouthGap = distance(face[13], face[14])
  const faceWidth = distance(face[234], face[454])
  mouth.blowing = mouthWidth > .001 && faceWidth > .001
    && mouthGap / mouthWidth > .19
    && mouthWidth / faceWidth < .5
}

function updateMosquitoPinch(side: 'left' | 'right', now: number) {
  const pinching = balloonGestures[side].pinch.pinching
  if (interaction === 'mosquito' && pinching && !wasMosquitoPinching[side]) {
    catchMosquitoAt(balloonGestures[side].pinch, 54, now)
  }
  wasMosquitoPinching[side] = interaction === 'mosquito' && pinching
}

function clearMosquitoFlick(side: 'left' | 'right') {
  const flick = mosquitoFlicks[side]
  flick.present = false
  flick.vx = 0
  flick.vy = 0
}

function updateMosquitoFlick(side: 'left' | 'right', landmarks: NormalizedLandmark[], now: number) {
  if (interaction !== 'mosquito') return
  const flick = mosquitoFlicks[side]
  const tip = landmarkToScreen(landmarks[12])
  const elapsed = flick.present ? Math.max(.016, (now - flick.lastUpdatedAt) / 1000) : .1
  flick.vx = flick.present ? (tip.x - flick.x) / elapsed : 0
  flick.vy = flick.present ? (tip.y - flick.y) / elapsed : 0
  flick.x = tip.x
  flick.y = tip.y
  flick.present = true
  flick.lastUpdatedAt = now

  // A finger flick is a quick extension of the middle finger, rather than
  // ordinary hand travel. The tip speed gives the toss its on-screen heading.
  const middleExtended = distance(landmarks[12], landmarks[0]) > distance(landmarks[10], landmarks[0]) * 1.38
  const speed = Math.hypot(flick.vx, flick.vy)
  if (!middleExtended || balloonGestures[side].pinch.pinching || speed < 285 || now - flick.lastFlickAt < 430) return
  if (flickMosquitoAt(flick, now)) flick.lastFlickAt = now
}

function detectLandmarks(now: number) {
  if (!modelReady || !holisticLandmarker || document.hidden || video.readyState < 2) return
  const hasTrackedHand = leftHand.present || rightHand.present
  const needsLipTracking = (interaction === 'lemonade' && cup.liquid >= .7) || interaction === 'mosquito'
  const detectionInterval = hasTrackedHand || needsLipTracking ? ACTIVE_DETECTION_INTERVAL : IDLE_DETECTION_INTERVAL
  if (now - lastDetectionAt < detectionInterval || video.currentTime === lastVideoTime) return
  lastDetectionAt = now
  lastVideoTime = video.currentTime
  const activeFingerIds = new Set<string>()

  try {
    const result = holisticLandmarker.detectForVideo(video, now)
    const leftLandmarks = result.leftHandLandmarks[0]
    const rightLandmarks = result.rightHandLandmarks[0]

    if (leftLandmarks) {
      const previous = { ...leftHand }
      setHandState(leftHand, leftLandmarks)
      setFingertips('left', leftLandmarks, activeFingerIds, leftHand.fist)
      updateBalloonGesture('left', leftLandmarks)
      updateMosquitoFlick('left', leftLandmarks, now)
      detectWaterPunch('left', leftHand, previous, now)
    } else {
      leftHand.present = false
      clearBalloonGesture('left')
      clearMosquitoFlick('left')
      stopWaterTouchSound('left')
    }

    if (rightLandmarks) {
      const previous = { ...rightHand }
      setHandState(rightHand, rightLandmarks)
      setFingertips('right', rightLandmarks, activeFingerIds, rightHand.fist)
      updateBalloonGesture('right', rightLandmarks)
      updateMosquitoFlick('right', rightLandmarks, now)
      detectWaterPunch('right', rightHand, previous, now)
    } else {
      rightHand.present = false
      clearBalloonGesture('right')
      clearMosquitoFlick('right')
      stopWaterTouchSound('right')
    }

    if (needsLipTracking) updateMouth(result.faceLandmarks[0])
    else {
      mouth.present = false
      mouth.blowing = false
    }
  } catch {
    // A skipped or duplicated camera timestamp is safe to ignore.
  }

  fingertips.forEach((_finger, id) => {
    if (!activeFingerIds.has(id)) fingertips.delete(id)
  })
  updateMosquitoPinch('left', now)
  updateMosquitoPinch('right', now)
  updateTrackingStatus()
}

function nearestLemonTo(point: Point): Lemon | null {
  let nearest: Lemon | null = null
  let nearestDistance = Math.min(viewportWidth, viewportHeight) * .15
  lemons.forEach((lemon) => {
    if (lemon.state !== 'floating') return
    const currentDistance = Math.hypot(lemon.x - point.x, lemon.y - point.y)
    if (currentDistance < nearestDistance) {
      nearest = lemon
      nearestDistance = currentDistance
    }
  })
  return nearest
}

function emitJuice(lemon: Lemon, now: number) {
  if (now < lemon.nextDropAt) return
  lemon.nextDropAt = now + 42
  drops.push({
    x: lemon.x + (Math.random() - .5) * lemon.size * .23,
    y: lemon.y + lemon.size * .25,
    vx: (Math.random() - .5) * 26,
    vy: 72 + Math.random() * 30,
    size: 4 + Math.random() * 3,
    value: 1.7,
    life: 2.2,
  })
}

function updateLemons(delta: number, now: number) {
  if (leftHand.present && leftHand.fist && heldLemonId === null) {
    const target = nearestLemonTo(leftHand)
    if (target) {
      target.state = 'held'
      heldLemonId = target.id
    }
  }

  const heldLemon = heldLemonId === null ? null : lemons.find((lemon) => lemon.id === heldLemonId)
  if (heldLemon) {
    if (!leftHand.present || !leftHand.fist) {
      heldLemon.state = 'floating'
      heldLemon.vx = (Math.random() - .5) * 24
      heldLemon.vy = -8
      heldLemon.squeeze = 0
      heldLemonId = null
    } else {
      heldLemon.x += (leftHand.x - heldLemon.x) * .5
      heldLemon.y += (leftHand.y - heldLemon.y) * .5
      heldLemon.squeeze = .32 + Math.sin(now * .025) * .1
      heldLemon.juice = Math.max(0, heldLemon.juice - delta * 27)
      emitJuice(heldLemon, now)
      if (heldLemon.juice <= 0) {
        heldLemon.state = 'falling'
        heldLemon.squeeze = .48
        heldLemon.fallSpeed = 65
        heldLemonId = null
        showToast('레몬 한 개를 전부 짰어요!')
      }
    }
  }

  const margin = 54
  lemons.forEach((lemon) => {
    if (lemon.state === 'floating') {
      lemon.x += lemon.vx * delta
      lemon.y += lemon.vy * delta + Math.sin(now * .0015 + lemon.id) * 4 * delta
      lemon.rotation += lemon.rotationSpeed * delta
      if (lemon.x < margin || lemon.x > viewportWidth - margin) lemon.vx *= -1
      if (lemon.y < 100 || lemon.y > viewportHeight * .68) lemon.vy = lemon.y < 100 ? Math.abs(lemon.vy || 6) : -Math.abs(lemon.vy || 6)
      lemon.x = Math.max(margin, Math.min(viewportWidth - margin, lemon.x))
    } else if (lemon.state === 'falling') {
      lemon.fallSpeed += 520 * delta
      lemon.y += lemon.fallSpeed * delta
      lemon.rotation += 2.6 * delta
      if (lemon.y > viewportHeight + lemon.size) lemon.state = 'gone'
    }
  })
}

function cupMetrics() {
  const height = Math.max(130, Math.min(180, viewportHeight * .22))
  return { width: height * .72, height, top: cup.y - height / 2, bottom: cup.y + height / 2 }
}

function updateCup(delta: number) {
  const metrics = cupMetrics()
  cup.targetX = rightHand.present ? rightHand.x : viewportWidth / 2
  cup.targetY = rightHand.present ? rightHand.y + metrics.height * .08 : viewportHeight - Math.min(190, viewportHeight * .23)
  const ease = 1 - Math.pow(.001, delta)
  cup.x += (cup.targetX - cup.x) * ease
  cup.y += (cup.targetY - cup.y) * ease
  cup.x = Math.max(metrics.width * .6, Math.min(viewportWidth - metrics.width * .6, cup.x))
  cup.y = Math.max(130 + metrics.height / 2, Math.min(viewportHeight - 82 - metrics.height / 2, cup.y))
}

function updateDrops(delta: number) {
  const metrics = cupMetrics()
  for (let index = drops.length - 1; index >= 0; index -= 1) {
    const drop = drops[index]
    drop.vy += 490 * delta
    drop.x += drop.vx * delta
    drop.y += drop.vy * delta
    drop.life -= delta
    const inCup = drop.y >= metrics.top + 4
      && drop.y < metrics.bottom
      && Math.abs(drop.x - cup.x) < metrics.width * .42
      && drop.vy > 0
    if (inCup) {
      cup.liquid = Math.min(1, cup.liquid + drop.value / 330)
      if (cup.liquid >= .7 && !sipReadyAnnounced) {
        sipReadyAnnounced = true
        showToast('레몬에이드가 완성됐어요. 빨대로 한 모금!')
      }
      drops.splice(index, 1)
    } else if (drop.life <= 0 || drop.y > viewportHeight + 20) {
      drops.splice(index, 1)
    }
  }
}

const balloonPalette = [
  ['#ff5f87', '#cf2458'], ['#ff9b45', '#dd5f21'], ['#ffd84c', '#de9c12'],
  ['#66d6a7', '#19966c'], ['#55b8ff', '#1971c4'], ['#9c7cff', '#6541cf'],
  ['#ff75c9', '#cf358c'], ['#f4f3ee', '#bebcb3'],
] as const
const balloonKnotOffset = 1.14
const visibleStringAnchorOffset = .74

function hexToRgb(color: string) {
  const value = Number.parseInt(color.slice(1), 16)
  return { r: value >> 16, g: (value >> 8) & 255, b: value & 255 }
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0')).join('')}`
}

function blendBalloonColors(colors: string[]) {
  const mixed = colors.map(hexToRgb).reduce((total, color) => ({
    r: total.r + color.r / colors.length,
    g: total.g + color.g / colors.length,
    b: total.b + color.b / colors.length,
  }), { r: 0, g: 0, b: 0 })
  return rgbToHex(mixed.r, mixed.g, mixed.b)
}

function darkenColor(color: string, amount = .7) {
  const rgb = hexToRgb(color)
  return rgbToHex(rgb.r * amount, rgb.g * amount, rgb.b * amount)
}

function createBalloon(y = viewportHeight + 120): Balloon {
  const [color, darkColor] = balloonPalette[nextBalloonId % balloonPalette.length]
  const radiusX = 27 + Math.random() * 30
  const radiusY = radiusX * (1.13 + Math.random() * .16)
  const stringLength = 124 + Math.random() * 102
  const x = radiusX + 12 + Math.random() * Math.max(1, viewportWidth - (radiusX + 12) * 2)
  const balloon: Balloon = {
    id: nextBalloonId++, x, y, vx: (Math.random() - .5) * 13, vy: -(24 + Math.random() * 26),
    radiusX, radiusY, color, darkColor, colors: [color], value: 1, isMerged: false, stringLength,
    stringEndX: x, stringEndY: y + radiusY * balloonKnotOffset + stringLength,
    wobble: Math.random() * Math.PI * 2, state: 'rising', grabbedBy: null,
  }
  return balloon
}

function seedBalloons() {
  if (!viewportHeight) return
  while (balloons.length < 10) {
    // These are already in flight when the tab is first opened; all later
    // balloons are born below the frame in updateBalloons.
    const balloon = createBalloon(viewportHeight * (.16 + Math.random() * 1.02))
    balloons.push(balloon)
  }
}

function balloonKnot(balloon: Balloon) {
  return { x: balloon.x, y: balloon.y + balloon.radiusY * balloonKnotOffset }
}

function pointToSegmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t))
}

function burstBalloon(balloon: Balloon) {
  if (balloon.state === 'popped') return
  balloon.state = 'popped'
  balloon.grabbedBy = null
  const count = Math.round((17 + balloon.radiusX * .2) * Math.min(2.2, .8 + balloon.value * .38))
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI * 2 * index / count + (Math.random() - .5) * .26
    const speed = 115 + Math.random() * 250 + balloon.radiusX * 1.7
    balloonParticles.push({
      x: balloon.x + Math.cos(angle) * balloon.radiusX * .18,
      y: balloon.y + Math.sin(angle) * balloon.radiusY * .18,
      vx: Math.cos(angle) * speed + balloon.vx * .25,
      vy: Math.sin(angle) * speed + balloon.vy * .15,
      size: 3 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - .5) * 15,
      color: index % 5 === 0 ? '#fff7e7' : balloon.colors[index % balloon.colors.length],
      life: .52 + Math.random() * .36,
      maxLife: .88,
    })
  }
  if (balloonParticles.length > MAX_BALLOON_PARTICLES) {
    balloonParticles.splice(0, balloonParticles.length - MAX_BALLOON_PARTICLES)
  }
}

function releaseBalloon(balloon: Balloon, gesture: BalloonGesture) {
  balloon.state = 'rising'
  balloon.grabbedBy = null
  balloon.vx = Math.max(-240, Math.min(240, gesture.pinch.vx * 22))
  balloon.vy = Math.min(-13, Math.max(-190, gesture.pinch.vy * 22 - 20))
}

function grabClosestBalloon(side: 'left' | 'right', gesture: BalloonGesture) {
  let closestIndex = -1
  let closestDistance = 48
  balloons.forEach((balloon, index) => {
    if (balloon.state !== 'rising') return
    const distanceToString = pointToSegmentDistance(gesture.pinch, balloonKnot(balloon), {
      x: balloon.stringEndX,
      y: balloon.stringEndY,
    })
    if (distanceToString < closestDistance) {
      closestIndex = index
      closestDistance = distanceToString
    }
  })
  const closest = balloons[closestIndex]
  if (!closest) return
  closest.state = 'held'
  closest.grabbedBy = side
  closest.stringEndX = gesture.pinch.x
  closest.stringEndY = gesture.pinch.y
}

function heldBalloonsFor(side: 'left' | 'right') {
  return balloons.filter((balloon) => balloon.state === 'held' && balloon.grabbedBy === side)
}

function bundleValue(balloonsInBundle: Balloon[]) {
  return balloonsInBundle.reduce((count, balloon) => count + balloon.value, 0)
}

function findStickyBalloonSpot(radiusX: number, radiusY: number) {
  const stuck = balloons.filter((balloon) => balloon.state === 'sticky')
  const minX = radiusX + 18
  const maxX = Math.max(minX, viewportWidth - radiusX - 18)
  const minY = Math.max(radiusY + 84, viewportHeight * .13)
  const maxY = Math.max(minY, Math.min(viewportHeight * .31, radiusY + 158))
  let fallback = { x: viewportWidth * (.16 + Math.random() * .68), y: minY }

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidate = {
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY),
    }
    fallback = candidate
    const hasRoom = stuck.every((balloon) => {
      const anchor = balloon.sticky ?? balloon
      const horizontal = candidate.x - anchor.x
      const vertical = (candidate.y - anchor.y) * .82
      return Math.hypot(horizontal, vertical) > (radiusX + balloon.radiusX) * .88
    })
    if (hasRoom) return candidate
  }
  return fallback
}

function combineLeftBundle(balloonsToCombine: Balloon[]) {
  const colors = balloonsToCombine.flatMap((balloon) => balloon.colors).slice(0, 2)
  const color = blendBalloonColors(colors)
  const area = balloonsToCombine.reduce((total, balloon) => total + balloon.radiusX ** 2, 0)
  const average = balloonsToCombine.reduce((point, balloon) => ({
    x: point.x + balloon.x / balloonsToCombine.length,
    y: point.y + balloon.y / balloonsToCombine.length,
    vx: point.vx + balloon.vx / balloonsToCombine.length,
    vy: point.vy + balloon.vy / balloonsToCombine.length,
    stringLength: point.stringLength + balloon.stringLength / balloonsToCombine.length,
  }), { x: 0, y: 0, vx: 0, vy: 0, stringLength: 0 })
  const radiusX = Math.sqrt(area) * 1.22
  const radiusY = radiusX * 1.24
  const stickySpot = findStickyBalloonSpot(radiusX, radiusY)
  const sticky = {
    x: stickySpot.x,
    y: stickySpot.y,
    phase: Math.random() * Math.PI * 2,
    driftX: 6 + Math.random() * 10,
    driftY: 2 + Math.random() * 4,
  }
  const combined: Balloon = {
    id: nextBalloonId++,
    x: sticky.x,
    y: sticky.y,
    vx: 0,
    vy: 0,
    radiusX,
    radiusY,
    color,
    darkColor: darkenColor(color),
    colors,
    value: 2,
    isMerged: true,
    stringLength: average.stringLength,
    stringEndX: sticky.x,
    stringEndY: sticky.y + radiusY * balloonKnotOffset,
    wobble: Math.random() * Math.PI * 2,
    state: 'sticky',
    grabbedBy: null,
    sticky,
  }
  const ids = new Set(balloonsToCombine.map((balloon) => balloon.id))
  for (let index = balloons.length - 1; index >= 0; index -= 1) {
    if (ids.has(balloons[index].id)) balloons.splice(index, 1)
  }
  balloons.push(combined)
  showToast('두 가지 색이 하나의 큰 풍선이 되었어요!')
}

function mergeBalloonBundles() {
  const leftGesture = balloonGestures.left
  const rightGesture = balloonGestures.right
  if (!leftGesture.pinch.pinching || !rightGesture.pinch.pinching) return

  const leftBalloons = heldBalloonsFor('left')
  const rightBalloons = heldBalloonsFor('right')
  if (!leftBalloons.length || !rightBalloons.length) return
  if (Math.hypot(leftGesture.pinch.x - rightGesture.pinch.x, leftGesture.pinch.y - rightGesture.pinch.y) > 94) return

  // When both hands meet, the left hand is always the collection anchor.
  rightBalloons.forEach((balloon) => {
    balloon.grabbedBy = 'left'
    balloon.stringEndX = leftGesture.pinch.x
    balloon.stringEndY = leftGesture.pinch.y
  })

  const merged = heldBalloonsFor('left')
  const value = bundleValue(merged)
  if (value >= 5) {
    merged.forEach(burstBalloon)
    showToast('풍선 5개가 동시에 펑! 터졌어요')
  } else if (value === 2) {
    combineLeftBundle(merged)
  }
  updateTrackingStatus()
}

function updateBalloons(delta: number, now: number) {
  if (now >= nextBalloonAt) {
    if (balloons.length < MAX_BALLOONS) balloons.push(createBalloon(viewportHeight + 90 + Math.random() * 130))
    nextBalloonAt = now + 470 + Math.random() * 430
  }

  balloons.forEach((balloon) => {
    if (balloon.state !== 'held' || !balloon.grabbedBy) return
    const gesture = balloonGestures[balloon.grabbedBy]
    if (!gesture.pinch.present || !gesture.pinch.pinching) releaseBalloon(balloon, gesture)
  })

  ;(['left', 'right'] as const).forEach((side) => {
    const gesture = balloonGestures[side]
    const alreadyHolding = balloons.some((balloon) => balloon.state === 'held' && balloon.grabbedBy === side)
    if (gesture.pinch.present && gesture.pinch.pinching && !alreadyHolding) grabClosestBalloon(side, gesture)
  })
  mergeBalloonBundles()

  balloons.forEach((balloon) => {
    // A balloon already held by either hand, plus a completed merged balloon,
    // is safe from the index-fingertip pop gesture.
    if (balloon.state !== 'rising') return
    const isTouched = Object.values(balloonGestures).some((gesture) => {
      if (!gesture.index.present) return false
      const normalizedX = (gesture.index.x - balloon.x) / balloon.radiusX
      const normalizedY = (gesture.index.y - balloon.y) / balloon.radiusY
      return normalizedX * normalizedX + normalizedY * normalizedY < 1.04
    })
    if (isTouched) burstBalloon(balloon)
  })

  for (let index = balloons.length - 1; index >= 0; index -= 1) {
    const balloon = balloons[index]
    if (balloon.state === 'popped') {
      balloons.splice(index, 1)
      continue
    }
    if (balloon.state === 'sticky') {
      const anchor = balloon.sticky
      if (anchor) {
        const oldX = balloon.x
        const oldY = balloon.y
        const seconds = now * .001
        balloon.x = anchor.x + Math.sin(seconds * .73 + anchor.phase) * anchor.driftX + Math.sin(seconds * 1.31 + anchor.phase * 1.8) * anchor.driftX * .2
        balloon.y = anchor.y + Math.cos(seconds * .91 + anchor.phase) * anchor.driftY
        balloon.vx = (balloon.x - oldX) / Math.max(delta, .001)
        balloon.vy = (balloon.y - oldY) / Math.max(delta, .001)
      }
      continue
    }
    if (balloon.state === 'held' && balloon.grabbedBy) {
      const gesture = balloonGestures[balloon.grabbedBy]
      const oldX = balloon.x
      const oldY = balloon.y
      // A light Verlet-like prediction retains a little momentum before the
      // rope constraint projects the knot back to the pinched endpoint.
      balloon.x += balloon.vx * delta
      balloon.y += balloon.vy * delta
      balloon.vx *= .78
      balloon.vy *= .78
      const knot = balloonKnot(balloon)
      let dx = knot.x - gesture.pinch.x
      let dy = knot.y - gesture.pinch.y
      let distance = Math.hypot(dx, dy)
      if (distance < .001) {
        dx = 0
        dy = -1
        distance = 1
      }
      balloon.x = gesture.pinch.x + dx / distance * balloon.stringLength
      balloon.y = gesture.pinch.y + dy / distance * balloon.stringLength - balloon.radiusY * balloonKnotOffset
      const constraintVelocityX = (balloon.x - oldX) / Math.max(delta, .001)
      const constraintVelocityY = (balloon.y - oldY) / Math.max(delta, .001)
      balloon.vx = balloon.vx * .22 + constraintVelocityX * .78
      balloon.vy = balloon.vy * .22 + constraintVelocityY * .78
      balloon.stringEndX = gesture.pinch.x
      balloon.stringEndY = gesture.pinch.y
      continue
    }

    balloon.vx += Math.sin(now * .0012 + balloon.wobble) * 3.4 * delta
    balloon.vy = Math.max(-68, balloon.vy - 2.5 * delta)
    balloon.vx *= .997
    balloon.x += balloon.vx * delta
    balloon.y += balloon.vy * delta
    if (balloon.x < balloon.radiusX + 7 || balloon.x > viewportWidth - balloon.radiusX - 7) balloon.vx *= -1
    balloon.x = Math.max(balloon.radiusX + 7, Math.min(viewportWidth - balloon.radiusX - 7, balloon.x))
    const knot = balloonKnot(balloon)
    const stringSway = Math.max(-balloon.stringLength * .42, Math.min(balloon.stringLength * .42, Math.sin(now * .0018 + balloon.wobble) * 9 + balloon.vx * .12))
    // The free end sways, but its distance from the knot remains the same.
    balloon.stringEndX = knot.x + stringSway
    balloon.stringEndY = knot.y + Math.sqrt(balloon.stringLength ** 2 - stringSway ** 2)
    if (balloon.y + balloon.radiusY < -balloon.stringLength - 30) balloons.splice(index, 1)
  }
}

function updateBalloonParticles(delta: number) {
  for (let index = balloonParticles.length - 1; index >= 0; index -= 1) {
    const particle = balloonParticles[index]
    particle.vy += 630 * delta
    particle.vx *= .985
    particle.x += particle.vx * delta
    particle.y += particle.vy * delta
    particle.rotation += particle.spin * delta
    particle.life -= delta
    if (particle.life <= 0) balloonParticles.splice(index, 1)
  }
}

function createMosquito(now: number, y = 0): Mosquito {
  const size = 19 + Math.random() * 10
  const margin = size * 1.8
  const x = margin + Math.random() * Math.max(1, viewportWidth - margin * 2)
  const startY = y || (90 + Math.random() * Math.max(1, viewportHeight * .64))
  const vx = (Math.random() - .5) * 90
  const vy = (Math.random() - .5) * 70
  return {
    id: nextMosquitoId++, x, y: startY, vx, vy, size,
    phase: Math.random() * Math.PI * 2,
    rotation: Math.atan2(vy, vx),
    state: 'flying', stateSince: now, stunnedUntil: 0,
    groundY: viewportHeight - Math.max(13, size * .48),
  }
}

function seedMosquitoes() {
  if (!viewportHeight) return
  const now = performance.now()
  const positions = [[.15, .3], [.3, .61], [.45, .2], [.61, .48], [.78, .25], [.86, .66], [.1, .7], [.52, .74], [.7, .78]]
  positions.forEach(([x, y]) => {
    const mosquito = createMosquito(now, y * viewportHeight)
    mosquito.x = x * viewportWidth
    mosquitoes.push(mosquito)
  })
}

function emitBlood(mosquito: Mosquito) {
  const count = 7 + Math.floor(Math.random() * 5)
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = 32 + Math.random() * 105
    bloodDrops.push({
      x: mosquito.x + (Math.random() - .5) * mosquito.size * .35,
      y: mosquito.y + (Math.random() - .5) * mosquito.size * .28,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 28,
      radius: 1.8 + Math.random() * 2.5,
      life: .55 + Math.random() * .42,
      maxLife: .97,
    })
  }
}

function restingPlaceFor(mosquito: Mosquito) {
  let groundY = viewportHeight - Math.max(13, mosquito.size * .48)
  mosquitoes.forEach((other) => {
    if (other === mosquito || other.state !== 'dead') return
    const horizontal = Math.abs(other.x - mosquito.x)
    const overlap = (other.size + mosquito.size) * .6 - horizontal
    if (overlap > 0) groundY = Math.min(groundY, other.y - Math.max(5, mosquito.size * .43))
  })
  return Math.max(82, groundY)
}

function catchMosquitoAt(point: Point, radius: number, now: number) {
  let caught: Mosquito | undefined
  let closest = radius
  for (const mosquito of mosquitoes) {
    if (mosquito.state !== 'flying' && mosquito.state !== 'stunned') continue
    const distanceToClap = Math.hypot(mosquito.x - point.x, mosquito.y - point.y)
    if (distanceToClap < closest) {
      caught = mosquito
      closest = distanceToClap
    }
  }
  if (!caught) return
  caught.state = 'dying'
  caught.stateSince = now
  caught.vx = 0
  caught.vy = 0
  caught.rotation = (Math.random() - .5) * .9
  clapBursts.push({ x: caught.x, y: caught.y, startedAt: now })
  emitBlood(caught)
  showToast('모기를 잡았어요!')
}

function flickMosquitoAt(flick: MosquitoFlick, now: number) {
  const mosquito = mosquitoes.find((candidate) =>
    (candidate.state === 'flying' || candidate.state === 'stunned')
    && Math.hypot(candidate.x - flick.x, candidate.y - flick.y) < candidate.size + 42)
  if (!mosquito) return false
  mosquito.state = 'stunned'
  mosquito.stateSince = now
  mosquito.stunnedUntil = now + 950
  mosquito.vx = flick.vx * .75
  mosquito.vy = flick.vy * .75
  return true
}

function blowMosquitoes(now: number) {
  if (!mouth.blowing || !mouth.present) {
    if (wasBlowing) mosquitoesBlownThisBreath.clear()
    wasBlowing = false
    return
  }
  const windRadius = Math.min(270, Math.max(180, Math.min(viewportWidth, viewportHeight) * .34))
  mosquitoes.forEach((mosquito) => {
    if (mosquito.state !== 'flying' || mosquitoesBlownThisBreath.has(mosquito.id)) return
    const dx = mosquito.x - mouth.x
    const dy = mosquito.y - mouth.y
    const distanceToMouth = Math.hypot(dx, dy)
    if (distanceToMouth < 20 || distanceToMouth > windRadius) return
    const strength = 1 - distanceToMouth / windRadius
    mosquitoesBlownThisBreath.add(mosquito.id)
    mosquito.state = 'stunned'
    mosquito.stateSince = now
    mosquito.stunnedUntil = now + 2000
    mosquito.vx = dx / distanceToMouth * (170 + strength * 170)
    mosquito.vy = dy / distanceToMouth * (130 + strength * 150) - 25
  })
  wasBlowing = true
}

function updateMosquitoes(delta: number, now: number) {
  blowMosquitoes(now)
  const inFlight = mosquitoes.filter((mosquito) => mosquito.state === 'flying' || mosquito.state === 'stunned' || mosquito.state === 'dying').length
  if (inFlight < MAX_FLYING_MOSQUITOES && now >= nextMosquitoAt) {
    mosquitoes.push(createMosquito(now, viewportHeight + 30))
    nextMosquitoAt = now + 640 + Math.random() * 560
  }

  mosquitoes.forEach((mosquito) => {
    if (mosquito.state === 'flying') {
      mosquito.vx += Math.sin(now * .0017 + mosquito.phase) * 32 * delta
      mosquito.vy += Math.cos(now * .0012 + mosquito.phase * 1.7) * 28 * delta
      mosquito.vx = Math.max(-125, Math.min(125, mosquito.vx))
      mosquito.vy = Math.max(-98, Math.min(98, mosquito.vy))
      mosquito.x += mosquito.vx * delta
      mosquito.y += mosquito.vy * delta
      mosquito.rotation += (Math.atan2(mosquito.vy, mosquito.vx) - mosquito.rotation) * Math.min(1, delta * 5)
      const margin = mosquito.size
      if (mosquito.x < margin || mosquito.x > viewportWidth - margin) mosquito.vx *= -1
      if (mosquito.y < 82 || mosquito.y > viewportHeight - 105) mosquito.vy *= -1
      mosquito.x = Math.max(margin, Math.min(viewportWidth - margin, mosquito.x))
      mosquito.y = Math.max(82, Math.min(viewportHeight - 105, mosquito.y))
      return
    }
    if (mosquito.state === 'stunned') {
      const pushDuration = .24
      if (now - mosquito.stateSince < pushDuration * 1000) {
        mosquito.x += mosquito.vx * delta
        mosquito.y += mosquito.vy * delta
        mosquito.vx *= .79
        mosquito.vy *= .79
      } else {
        mosquito.vx = 0
        mosquito.vy = 0
      }
      if (now >= mosquito.stunnedUntil) {
        mosquito.state = 'flying'
        mosquito.stateSince = now
        mosquito.vx = (Math.random() - .5) * 72
        mosquito.vy = (Math.random() - .5) * 62
      }
      return
    }
    if (mosquito.state === 'dying') {
      if (now - mosquito.stateSince > 360) {
        mosquito.state = 'falling'
        mosquito.stateSince = now
        mosquito.groundY = restingPlaceFor(mosquito)
        mosquito.vy = 42
      }
      return
    }
    if (mosquito.state === 'falling') {
      mosquito.vy += 580 * delta
      mosquito.x += mosquito.vx * delta
      mosquito.y += mosquito.vy * delta
      mosquito.rotation += 1.8 * delta
      if (mosquito.y >= mosquito.groundY) {
        mosquito.y = mosquito.groundY
        mosquito.vx = 0
        mosquito.vy = 0
        mosquito.state = 'dead'
      }
    }
  })

  for (let index = bloodDrops.length - 1; index >= 0; index -= 1) {
    const drop = bloodDrops[index]
    drop.vy += 420 * delta
    drop.x += drop.vx * delta
    drop.y += drop.vy * delta
    drop.life -= delta
    if (drop.life <= 0 || drop.y > viewportHeight + 20) bloodDrops.splice(index, 1)
  }
  for (let index = clapBursts.length - 1; index >= 0; index -= 1) {
    if (now - clapBursts[index].startedAt > 360) clapBursts.splice(index, 1)
  }
  const dead = mosquitoes.filter((mosquito) => mosquito.state === 'dead')
  if (dead.length > MAX_DEAD_MOSQUITOES) {
    const oldestDead = mosquitoes.findIndex((mosquito) => mosquito.state === 'dead')
    if (oldestDead >= 0) mosquitoes.splice(oldestDead, 1)
  }
}

function drawMosquito(mosquito: Mosquito, now: number) {
  const dead = mosquito.state === 'dying' || mosquito.state === 'falling' || mosquito.state === 'dead'
  const wingBeat = dead ? 0 : Math.sin(now * .045 + mosquito.phase) * .34
  context.save()
  context.translate(mosquito.x, mosquito.y)
  context.rotate(dead ? mosquito.rotation + .42 : mosquito.rotation)
  const scale = mosquito.size / 24
  context.scale(scale, scale)
  context.shadowColor = 'rgba(0, 0, 0, .38)'
  context.shadowBlur = 7
  context.shadowOffsetY = 3

  context.fillStyle = 'rgba(218, 235, 239, .64)'
  context.beginPath()
  context.ellipse(-3, -7 - wingBeat * 7, 10, 4.3, -.45 - wingBeat, 0, Math.PI * 2)
  context.ellipse(-3, 7 + wingBeat * 7, 10, 4.3, .45 + wingBeat, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = 'rgba(33, 50, 57, .34)'
  context.lineWidth = .75
  context.stroke()

  context.shadowColor = 'transparent'
  context.strokeStyle = '#202a2b'
  context.lineWidth = 1.25
  for (const y of [-3.5, 0, 3.5]) {
    context.beginPath()
    context.moveTo(-4, y)
    context.lineTo(-10, y + (y < 0 ? -4 : 4))
    context.lineTo(-13, y + (y < 0 ? -2 : 6))
    context.stroke()
  }
  context.fillStyle = '#384343'
  context.beginPath()
  context.ellipse(-2, 0, 10, 5.5, 0, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#d6d2b2'
  context.fillRect(-7, -4.5, 3, 9)
  context.fillRect(-1, -5, 3, 10)
  context.fillStyle = '#273131'
  context.beginPath()
  context.arc(10, 0, 6.1, 0, Math.PI * 2)
  context.fill()

  if (dead) {
    context.strokeStyle = '#f5f0df'
    context.lineWidth = 1.7
    ;[-2.2, 2.2].forEach((y) => {
      context.beginPath()
      context.moveTo(8, y - 1.7)
      context.lineTo(11.5, y + 1.7)
      context.moveTo(11.5, y - 1.7)
      context.lineTo(8, y + 1.7)
      context.stroke()
    })
  } else {
    context.fillStyle = '#c63e48'
    context.beginPath()
    context.arc(10.8, -2.3, 1.4, 0, Math.PI * 2)
    context.arc(10.8, 2.3, 1.4, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawBloodDrops() {
  bloodDrops.forEach((drop) => {
    const opacity = Math.max(0, drop.life / drop.maxLife)
    context.beginPath()
    context.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2)
    context.fillStyle = `rgba(151, 14, 26, ${opacity * .88})`
    context.fill()
  })
}

function drawClapBursts(now: number) {
  clapBursts.forEach((burst) => {
    const progress = Math.min(1, (now - burst.startedAt) / 360)
    context.save()
    context.globalAlpha = 1 - progress
    context.beginPath()
    context.arc(burst.x, burst.y, 16 + progress * 48, 0, Math.PI * 2)
    context.strokeStyle = '#fff3bb'
    context.lineWidth = 3 - progress * 1.5
    context.stroke()
    context.restore()
  })
}

function drawWindEffect(now: number) {
  if (!mouth.present || !mouth.blowing) return
  context.save()
  context.strokeStyle = 'rgba(237, 252, 255, .78)'
  context.lineCap = 'round'
  for (let index = 0; index < 3; index += 1) {
    const phase = (now * .002 + index * .26) % 1
    const radius = 18 + phase * 65
    context.globalAlpha = (1 - phase) * .75
    context.lineWidth = 2.4 - phase
    context.beginPath()
    context.arc(mouth.x, mouth.y, radius, -.72, .72)
    context.stroke()
  }
  context.restore()
}

function drawCamera() {
  if (!cameraReady || video.readyState < 2) {
    const gradient = context.createLinearGradient(0, 0, viewportWidth, viewportHeight)
    gradient.addColorStop(0, '#f7dfa3')
    gradient.addColorStop(1, '#c9e592')
    context.fillStyle = gradient
    context.fillRect(0, 0, viewportWidth, viewportHeight)
    return
  }
  const { sx, sy, sw, sh } = videoCrop()
  context.save()
  context.translate(viewportWidth, 0)
  context.scale(-1, 1)
  context.drawImage(video, sx, sy, sw, sh, 0, 0, viewportWidth, viewportHeight)
  context.restore()
  context.fillStyle = 'rgba(28, 35, 13, .08)'
  context.fillRect(0, 0, viewportWidth, viewportHeight)
}

function drawWater(now: number) {
  const crop = videoCrop()
  const rendered = waterRenderer.render(video, crop, fingertips.values(), now, viewportWidth, viewportHeight)
  if (!rendered) drawCamera()
}

function balloonTilt(balloon: Balloon, now = performance.now()) {
  return Math.sin(now * .0019 + balloon.wobble) * .08 + balloon.vx * .0014
}

function renderedBalloonKnot(balloon: Balloon, now = performance.now()) {
  const angle = balloonTilt(balloon, now)
  // Start the visible rope well inside the rendered balloon. Because strings
  // are drawn first, the body covers this overlap and no gap can appear even
  // while the balloon rotates or the reference texture's knot shifts.
  const offset = balloon.radiusY * visibleStringAnchorOffset
  return {
    x: balloon.x - Math.sin(angle) * offset,
    y: balloon.y + Math.cos(angle) * offset,
  }
}

function drawBalloonString(balloon: Balloon) {
  if (balloon.state === 'sticky') return
  const knot = renderedBalloonKnot(balloon)
  const end = { x: balloon.stringEndX, y: balloon.stringEndY }
  const deltaX = end.x - knot.x
  const deltaY = end.y - knot.y
  const distance = Math.max(1, Math.hypot(deltaX, deltaY))
  const wave = Math.min(24, 9 + distance * .085)
  const perpendicularX = -deltaY / distance * wave
  const perpendicularY = deltaX / distance * wave
  const drawRopePath = () => {
    context.beginPath()
    context.moveTo(knot.x, knot.y)
    context.bezierCurveTo(
      knot.x + deltaX * .31 + perpendicularX, knot.y + deltaY * .31 + perpendicularY,
      knot.x + deltaX * .69 - perpendicularX, knot.y + deltaY * .69 - perpendicularY,
      end.x, end.y,
    )
  }
  context.save()
  const satinGradient = context.createLinearGradient(knot.x, knot.y, end.x, end.y)
  satinGradient.addColorStop(0, balloon.darkColor)
  satinGradient.addColorStop(.16, '#e7edf6')
  satinGradient.addColorStop(.42, balloon.color)
  satinGradient.addColorStop(.68, '#f8fafc')
  satinGradient.addColorStop(1, balloon.darkColor)
  drawRopePath()
  context.strokeStyle = 'rgba(32, 42, 57, .34)'
  context.lineWidth = 6.4
  context.shadowColor = 'rgba(8, 14, 25, .3)'
  context.shadowBlur = 5
  context.shadowOffsetY = 2
  context.stroke()
  drawRopePath()
  context.shadowColor = 'transparent'
  context.strokeStyle = satinGradient
  context.lineWidth = 4.6
  context.stroke()
  drawRopePath()
  context.strokeStyle = 'rgba(255, 255, 255, .72)'
  context.lineWidth = 1.15
  context.stroke()
  if (balloon.state === 'held') {
    context.beginPath()
    context.arc(end.x, end.y, 9, 0, Math.PI * 2)
    context.fillStyle = balloon.color
    context.globalAlpha = .33
    context.fill()
    context.globalAlpha = 1
    context.beginPath()
    context.arc(end.x, end.y, 4.8, 0, Math.PI * 2)
    context.strokeStyle = 'rgba(255, 255, 255, .92)'
    context.lineWidth = 1.3
    context.stroke()
  }
  context.restore()
}

function balloonBodyPath(target: CanvasRenderingContext2D, balloon: Balloon) {
  target.beginPath()
  target.moveTo(0, -balloon.radiusY)
  target.bezierCurveTo(balloon.radiusX * .77, -balloon.radiusY * .96, balloon.radiusX * 1.08, -balloon.radiusY * .18, balloon.radiusX * .65, balloon.radiusY * .52)
  target.bezierCurveTo(balloon.radiusX * .38, balloon.radiusY * .94, balloon.radiusX * .12, balloon.radiusY * .97, 0, balloon.radiusY)
  target.bezierCurveTo(-balloon.radiusX * .12, balloon.radiusY * .97, -balloon.radiusX * .38, balloon.radiusY * .94, -balloon.radiusX * .65, balloon.radiusY * .52)
  target.bezierCurveTo(-balloon.radiusX * 1.08, -balloon.radiusY * .18, -balloon.radiusX * .77, -balloon.radiusY * .96, 0, -balloon.radiusY)
}

function createBalloonSprite(balloon: Balloon) {
  const spritePixelRatio = Math.min(1.5, Math.max(1, pixelRatio))
  const padding = Math.max(20, balloon.radiusX * .34)
  const width = balloon.radiusX * 2.18 + padding * 2
  const height = balloon.radiusY * 2.22 + padding * 2
  const offsetX = padding + balloon.radiusX * 1.09
  const offsetY = padding + balloon.radiusY
  const spriteCanvas = document.createElement('canvas')
  spriteCanvas.width = Math.ceil(width * spritePixelRatio)
  spriteCanvas.height = Math.ceil(height * spritePixelRatio)
  const spriteContext = spriteCanvas.getContext('2d')!
  spriteContext.setTransform(spritePixelRatio, 0, 0, spritePixelRatio, 0, 0)
  spriteContext.imageSmoothingEnabled = true
  spriteContext.imageSmoothingQuality = 'high'
  spriteContext.translate(offsetX, offsetY)

  spriteContext.save()
  const hasReferenceTexture = silverBalloonImage.complete && silverBalloonImage.naturalWidth > 0
  if (hasReferenceTexture) {
    // Crop the reference to its balloon and knot, leaving string motion to
    // the interaction renderer. Its grey material becomes a colour-preserving
    // metallic base once multiplied by each balloon's own colour.
    const bodyWidth = balloon.radiusX * 2.18
    const bodyHeight = balloon.radiusY * 2.19
    spriteContext.shadowColor = 'rgba(0, 0, 0, .34)'
    spriteContext.shadowBlur = 16
    spriteContext.shadowOffsetY = 10
    spriteContext.drawImage(silverBalloonImage, 470, 40, 560, 650, -bodyWidth / 2, -balloon.radiusY * 1.04, bodyWidth, bodyHeight)
    spriteContext.globalCompositeOperation = 'source-atop'
    spriteContext.globalAlpha = .84
    spriteContext.fillStyle = balloon.color
    spriteContext.fillRect(-offsetX, -offsetY, width, height)
    spriteContext.globalAlpha = 1
    spriteContext.globalCompositeOperation = 'source-over'
    spriteContext.shadowColor = 'transparent'
    spriteContext.beginPath()
    spriteContext.ellipse(-balloon.radiusX * .34, -balloon.radiusY * .55, balloon.radiusX * .065, balloon.radiusY * .12, -.46, 0, Math.PI * 2)
    spriteContext.fillStyle = 'rgba(255, 255, 255, .54)'
    spriteContext.fill()
  } else {
    spriteContext.shadowColor = 'rgba(0, 0, 0, .32)'
    spriteContext.shadowBlur = 17
    spriteContext.shadowOffsetY = 10
    balloonBodyPath(spriteContext, balloon)
    const gradient = spriteContext.createRadialGradient(-balloon.radiusX * .35, -balloon.radiusY * .48, balloon.radiusX * .06, 0, 0, balloon.radiusX * 1.17)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(.075, 'rgba(255, 255, 255, .92)')
    gradient.addColorStop(.21, balloon.color)
    gradient.addColorStop(.72, balloon.color)
    gradient.addColorStop(1, balloon.darkColor)
    spriteContext.fillStyle = gradient
    spriteContext.fill()
    spriteContext.shadowColor = 'transparent'
    spriteContext.strokeStyle = balloon.isMerged ? 'rgba(255, 255, 255, .68)' : 'rgba(255, 255, 255, .33)'
    spriteContext.lineWidth = balloon.isMerged ? 2.7 : 1.4
    spriteContext.stroke()

    spriteContext.beginPath()
    spriteContext.ellipse(-balloon.radiusX * .27, -balloon.radiusY * .41, balloon.radiusX * .15, balloon.radiusY * .29, -.42, 0, Math.PI * 2)
    spriteContext.fillStyle = 'rgba(255, 255, 255, .36)'
    spriteContext.fill()
    spriteContext.beginPath()
    spriteContext.ellipse(-balloon.radiusX * .4, -balloon.radiusY * .62, balloon.radiusX * .055, balloon.radiusY * .1, -.45, 0, Math.PI * 2)
    spriteContext.fillStyle = 'rgba(255, 255, 255, .9)'
    spriteContext.fill()
    spriteContext.beginPath()
    spriteContext.ellipse(balloon.radiusX * .32, balloon.radiusY * .47, balloon.radiusX * .22, balloon.radiusY * .25, .35, 0, Math.PI * 2)
    spriteContext.fillStyle = 'rgba(0, 0, 0, .055)'
    spriteContext.fill()
    spriteContext.beginPath()
    spriteContext.moveTo(-balloon.radiusX * .14, balloon.radiusY * .87)
    spriteContext.lineTo(0, balloon.radiusY * 1.12)
    spriteContext.lineTo(balloon.radiusX * .14, balloon.radiusY * .87)
    spriteContext.closePath()
    spriteContext.fillStyle = balloon.darkColor
    spriteContext.fill()
  }
  spriteContext.restore()

  return { canvas: spriteCanvas, width, height, offsetX, offsetY, pixelRatio: spritePixelRatio }
}

function balloonSpriteFor(balloon: Balloon) {
  const spritePixelRatio = Math.min(1.5, Math.max(1, pixelRatio))
  if (!balloon.sprite || balloon.sprite.pixelRatio !== spritePixelRatio) balloon.sprite = createBalloonSprite(balloon)
  return balloon.sprite
}

function drawBalloon(balloon: Balloon) {
  const sprite = balloonSpriteFor(balloon)
  const tilt = balloonTilt(balloon)
  context.save()
  context.translate(balloon.x, balloon.y)
  context.rotate(tilt)
  context.drawImage(sprite.canvas, -sprite.offsetX, -sprite.offsetY, sprite.width, sprite.height)
  context.restore()
}

function drawBalloonParticles() {
  balloonParticles.forEach((particle) => {
    const opacity = Math.max(0, particle.life / particle.maxLife)
    context.save()
    context.translate(particle.x, particle.y)
    context.rotate(particle.rotation)
    context.globalAlpha = opacity
    context.fillStyle = particle.color
    context.beginPath()
    context.moveTo(-particle.size, -particle.size * .42)
    context.lineTo(particle.size * .92, -particle.size * .7)
    context.lineTo(particle.size * .62, particle.size)
    context.lineTo(-particle.size * .85, particle.size * .55)
    context.closePath()
    context.fill()
    context.restore()
  })
}

function drawBalloonHandHints() {
  Object.values(balloonGestures).forEach((gesture) => {
    if (gesture.index.present) {
      context.save()
      context.beginPath()
      context.arc(gesture.index.x, gesture.index.y, 12, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(255, 255, 255, .84)'
      context.lineWidth = 2
      context.setLineDash([3, 5])
      context.stroke()
      context.setLineDash([])
      context.restore()
    }
    if (gesture.pinch.present && gesture.pinch.pinching) {
      context.beginPath()
      context.arc(gesture.pinch.x, gesture.pinch.y, 16, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(255, 237, 109, .95)'
      context.lineWidth = 2.5
      context.stroke()
    }
  })
}

function drawLemon(lemon: Lemon) {
  if (lemon.state === 'gone') return
  const remaining = lemon.maxJuice ? lemon.juice / lemon.maxJuice : 0
  const scaleY = Math.max(.38, 1 - lemon.squeeze - (1 - remaining) * .16)
  const width = lemon.size * (1 + lemon.squeeze * .18)
  const height = lemon.size * scaleY
  context.save()
  context.translate(lemon.x, lemon.y)
  context.rotate(lemon.rotation)
  context.shadowColor = 'rgba(49, 55, 10, .28)'
  context.shadowBlur = 18
  context.shadowOffsetY = 9
  if (lemonImage.complete && lemonImage.naturalWidth) {
    context.drawImage(lemonImage, -width / 2, -height / 2, width, height)
  } else {
    context.fillStyle = '#f7e33f'
    context.beginPath()
    context.ellipse(0, 0, width * .44, height * .5, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number) {
  const corner = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + corner, y)
  context.lineTo(x + width - corner, y)
  context.quadraticCurveTo(x + width, y, x + width, y + corner)
  context.lineTo(x + width, y + height - corner)
  context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height)
  context.lineTo(x + corner, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - corner)
  context.lineTo(x, y + corner)
  context.quadraticCurveTo(x, y, x + corner, y)
  context.closePath()
}

function cupPath(width: number, height: number) {
  context.beginPath()
  context.moveTo(cup.x - width * .48, cup.y - height / 2)
  context.lineTo(cup.x - width * .36, cup.y + height / 2)
  context.quadraticCurveTo(cup.x, cup.y + height * .56, cup.x + width * .36, cup.y + height / 2)
  context.lineTo(cup.x + width * .48, cup.y - height / 2)
  context.closePath()
}

function drawCup() {
  const { width, height, bottom } = cupMetrics()
  const innerHeight = height - 13
  const liquidHeight = Math.max(9, innerHeight * cup.liquid)
  const liquidTop = bottom - 7 - liquidHeight
  context.save()
  cupPath(width, height)
  context.clip()

  const liquidGradient = context.createLinearGradient(0, liquidTop, 0, bottom)
  liquidGradient.addColorStop(0, 'rgba(255, 239, 69, .73)')
  liquidGradient.addColorStop(1, 'rgba(246, 196, 20, .88)')
  context.fillStyle = liquidGradient
  context.fillRect(cup.x - width / 2, liquidTop, width, liquidHeight + 8)

  const iceBaseY = cup.liquid > .08 ? liquidTop + 19 : bottom - 31
  const ice = [[-.2, 0, -.16], [.18, 9, .12], [-.02, 30, .25]]
  ice.forEach(([offsetX, offsetY, rotation]) => {
    context.save()
    context.translate(cup.x + width * offsetX, Math.min(bottom - 21, iceBaseY + offsetY))
    context.rotate(rotation)
    roundedRect(-16, -12, 32, 24, 7)
    context.fillStyle = 'rgba(238, 252, 255, .58)'
    context.fill()
    context.strokeStyle = 'rgba(255, 255, 255, .78)'
    context.lineWidth = 1.5
    context.stroke()
    context.restore()
  })
  context.restore()

  context.save()
  context.shadowColor = 'rgba(0, 0, 0, .2)'
  context.shadowBlur = 12
  cupPath(width, height)
  const glassGradient = context.createLinearGradient(cup.x - width / 2, 0, cup.x + width / 2, 0)
  glassGradient.addColorStop(0, 'rgba(255, 255, 255, .34)')
  glassGradient.addColorStop(.45, 'rgba(255, 255, 255, .04)')
  glassGradient.addColorStop(1, 'rgba(255, 255, 255, .27)')
  context.fillStyle = glassGradient
  context.fill()
  context.strokeStyle = 'rgba(255, 255, 255, .82)'
  context.lineWidth = 3
  context.stroke()
  context.beginPath()
  context.ellipse(cup.x, cup.y - height / 2, width * .48, 8, 0, 0, Math.PI * 2)
  context.strokeStyle = 'rgba(255, 255, 255, .92)'
  context.lineWidth = 2.5
  context.stroke()

  const sliceX = cup.x + width * .29
  const sliceY = cup.y - height * .18
  context.beginPath()
  context.arc(sliceX, sliceY, width * .2, 0, Math.PI * 2)
  context.fillStyle = 'rgba(255, 235, 62, .88)'
  context.fill()
  context.strokeStyle = '#fff8a5'
  context.lineWidth = 4
  context.stroke()
  context.strokeStyle = 'rgba(255, 255, 255, .65)'
  context.lineWidth = 1
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3
    context.beginPath()
    context.moveTo(sliceX, sliceY)
    context.lineTo(sliceX + Math.cos(angle) * width * .17, sliceY + Math.sin(angle) * width * .17)
    context.stroke()
  }
  context.restore()
}

function drawDrinkingEffect(now: number) {
  if (cup.liquid < .7 || !mouth.present) return

  const { width, height, top } = cupMetrics()
  const target = {
    x: mouth.x,
    y: Math.min(viewportHeight - 110, mouth.y + 8),
  }
  const strawStart = { x: cup.x + width * .12, y: top + height * .14 }
  const controlOne = { x: strawStart.x + (target.x - strawStart.x) * .08, y: strawStart.y - height * .55 }
  const controlTwo = { x: target.x - (target.x - strawStart.x) * .12, y: target.y + 38 }

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'

  // A layered stroke reads as a hollow, transparent glass tube over the camera.
  context.beginPath()
  context.moveTo(strawStart.x, strawStart.y)
  context.bezierCurveTo(controlOne.x, controlOne.y, controlTwo.x, controlTwo.y, target.x, target.y)
  context.strokeStyle = 'rgba(27, 83, 94, .22)'
  context.lineWidth = 16
  context.shadowColor = 'rgba(17, 63, 72, .22)'
  context.shadowBlur = 12
  context.shadowOffsetY = 5
  context.stroke()

  context.beginPath()
  context.moveTo(strawStart.x, strawStart.y)
  context.bezierCurveTo(controlOne.x, controlOne.y, controlTwo.x, controlTwo.y, target.x, target.y)
  context.shadowColor = 'transparent'
  context.strokeStyle = 'rgba(223, 250, 255, .48)'
  context.lineWidth = 13
  context.stroke()

  // Lemonade moves as bright segments inside the hollow glass tube.
  context.beginPath()
  context.moveTo(strawStart.x, strawStart.y)
  context.bezierCurveTo(controlOne.x, controlOne.y, controlTwo.x, controlTwo.y, target.x, target.y)
  context.setLineDash([19, 10])
  context.lineDashOffset = now * .07
  context.strokeStyle = 'rgba(250, 224, 39, .78)'
  context.lineWidth = 7
  context.stroke()

  context.beginPath()
  context.moveTo(strawStart.x, strawStart.y)
  context.bezierCurveTo(controlOne.x, controlOne.y, controlTwo.x, controlTwo.y, target.x, target.y)
  context.setLineDash([])
  context.strokeStyle = 'rgba(255, 255, 255, .72)'
  context.lineWidth = 2.2
  context.stroke()
  context.setLineDash([])

  for (let index = 0; index < 3; index += 1) {
    const progress = (now * .00022 + index * .31) % 1
    const inverse = 1 - progress
    const point = {
      x: inverse ** 3 * strawStart.x + 3 * inverse ** 2 * progress * controlOne.x + 3 * inverse * progress ** 2 * controlTwo.x + progress ** 3 * target.x,
      y: inverse ** 3 * strawStart.y + 3 * inverse ** 2 * progress * controlOne.y + 3 * inverse * progress ** 2 * controlTwo.y + progress ** 3 * target.y,
    }
    context.beginPath()
    context.arc(point.x, point.y, 2.4, 0, Math.PI * 2)
    context.fillStyle = 'rgba(255, 248, 130, .94)'
    context.fill()
  }

  context.beginPath()
  context.ellipse(target.x, target.y + 3, 18, 7, 0, 0, Math.PI * 2)
  context.strokeStyle = 'rgba(255, 255, 255, .84)'
  context.lineWidth = 2.5
  context.stroke()

  for (let index = 0; index < 3; index += 1) {
    const phase = (now * .0011 + index * .33) % 1
    const angle = -2.3 + index * .55
    const distance = 19 + phase * 18
    context.beginPath()
    context.arc(target.x + Math.cos(angle) * distance, target.y + Math.sin(angle) * distance, 2.2 - phase, 0, Math.PI * 2)
    context.fillStyle = `rgba(255, 246, 131, ${.8 - phase * .55})`
    context.fill()
  }
  context.restore()
}

function drawDrops() {
  drops.forEach((drop) => {
    context.save()
    context.translate(drop.x, drop.y)
    context.rotate(Math.atan2(drop.vy, drop.vx) - Math.PI / 2)
    context.beginPath()
    context.moveTo(0, -drop.size * 1.8)
    context.bezierCurveTo(drop.size, -drop.size * .2, drop.size, drop.size, 0, drop.size * 1.25)
    context.bezierCurveTo(-drop.size, drop.size, -drop.size, -drop.size * .2, 0, -drop.size * 1.8)
    context.fillStyle = 'rgba(255, 234, 50, .92)'
    context.shadowColor = 'rgba(246, 213, 20, .55)'
    context.shadowBlur = 8
    context.fill()
    context.restore()
  })
}

function drawHandHints() {
  ;[leftHand, rightHand].forEach((hand, index) => {
    if (!hand.present) return
    context.beginPath()
    context.arc(hand.x, hand.y, hand.fist ? 28 : 20, 0, Math.PI * 2)
    context.strokeStyle = index === 0 ? 'rgba(255, 231, 55, .8)' : 'rgba(255, 255, 255, .65)'
    context.lineWidth = 2
    context.setLineDash([5, 7])
    context.stroke()
    context.setLineDash([])
  })
}

function updateRecordTime(now: number) {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return
  const seconds = Math.floor((now - recordingStartedAt) / 1000)
  recordTime.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function render(now: number) {
  renderQueued = false
  if (document.hidden) return
  // requestVideoFrameCallback may run at 60fps on some cameras. The camera
  // preview, effects and captures are designed for 30fps, so skip duplicate
  // work while preserving the same visual cadence.
  if (now - lastRenderedAt < FRAME_INTERVAL - 1) {
    scheduleRender()
    return
  }
  lastRenderedAt = now
  const delta = Math.min(.04, (now - lastFrameAt) / 1000)
  lastFrameAt = now
  detectLandmarks(now)
  if (interaction === 'water') {
    drawWater(now)
    updateRecordTime(now)
    scheduleRender()
    return
  }
  if (interaction === 'balloon') {
    updateBalloons(delta, now)
    updateBalloonParticles(delta)
    drawCamera()
    balloons.forEach(drawBalloonString)
    balloons.forEach(drawBalloon)
    drawBalloonParticles()
    drawBalloonHandHints()
    updateRecordTime(now)
    scheduleRender()
    return
  }
  if (interaction === 'mosquito') {
    updateMosquitoes(delta, now)
    drawCamera()
    mosquitoes.forEach((mosquito) => drawMosquito(mosquito, now))
    drawBloodDrops()
    drawClapBursts(now)
    drawWindEffect(now)
    updateRecordTime(now)
    scheduleRender()
    return
  }
  updateLemons(delta, now)
  updateCup(delta)
  updateDrops(delta)
  drawCamera()
  lemons.forEach(drawLemon)
  drawDrops()
  drawDrinkingEffect(now)
  drawCup()
  drawHandHints()
  updateRecordTime(now)
  scheduleRender()
}

function scheduleRender() {
  if (document.hidden || renderQueued) return
  renderQueued = true
  const frameVideo = video as unknown as VideoWithFrameCallback
  if (cameraReady && frameVideo.requestVideoFrameCallback) {
    frameVideo.requestVideoFrameCallback(render)
    return
  }
  requestAnimationFrame(render)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function timestampName(prefix: string, extension: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${prefix}-${stamp}.${extension}`
}

function activeCaptureCanvas() {
  return interaction === 'water' && waterRenderer.supported ? waterCanvas : canvas
}

function takePhoto() {
  activeCaptureCanvas().toBlob((blob) => {
    if (!blob) {
      showToast('사진을 만들지 못했어요.')
      return
    }
    downloadBlob(blob, timestampName(`${interaction}-photo`, 'jpg'))
    app.classList.add('flash')
    window.setTimeout(() => app.classList.remove('flash'), 180)
    showToast('사진을 저장했어요')
  }, 'image/jpeg', .92)
}

function supportedRecordingType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function startRecording() {
  if (!('MediaRecorder' in window) || typeof canvas.captureStream !== 'function') {
    showToast('이 브라우저에서는 영상 녹화를 지원하지 않아요.')
    return
  }
  const recordingStream = activeCaptureCanvas().captureStream(30)
  const mimeType = supportedRecordingType()
  try {
    mediaRecorder = new MediaRecorder(recordingStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 4_000_000,
    })
  } catch {
    mediaRecorder = new MediaRecorder(recordingStream)
  }
  recordingChunks = []
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size) recordingChunks.push(event.data)
  }
  mediaRecorder.onstop = () => {
    const actualType = mediaRecorder?.mimeType || mimeType || 'video/webm'
    const extension = actualType.includes('mp4') ? 'mp4' : 'webm'
    const recording = new Blob(recordingChunks, { type: actualType })
    recordingStream.getTracks().forEach((track) => track.stop())
    if (recording.size) downloadBlob(recording, timestampName(`${interaction}-video`, extension))
    shutter.classList.remove('recording')
    recordTime.classList.remove('visible')
    recordTime.textContent = '00:00'
    shutter.setAttribute('aria-label', '짧게 눌러 사진 촬영, 길게 눌러 동영상 녹화')
    showToast('영상을 저장했어요')
  }
  mediaRecorder.start(1000)
  recordingStartedAt = performance.now()
  shutter.classList.add('recording')
  recordTime.classList.add('visible')
  shutter.setAttribute('aria-label', '동영상 녹화 종료')
  showToast('영상 촬영을 시작했어요')
}

function stopRecording() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop()
}

function clearLongPress() {
  window.clearTimeout(longPressTimer)
  longPressTimer = undefined
}

shutter.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  if (mediaRecorder?.state === 'recording') {
    stopPress = true
    stopRecording()
    return
  }
  stopPress = false
  longPressTriggered = false
  shutter.setPointerCapture(event.pointerId)
  shutter.classList.add('pressed')
  longPressTimer = window.setTimeout(() => {
    longPressTriggered = true
    shutter.classList.remove('pressed')
    startRecording()
  }, LONG_PRESS_DURATION)
})

shutter.addEventListener('pointerup', () => {
  clearLongPress()
  shutter.classList.remove('pressed')
  if (!longPressTriggered && !stopPress) takePhoto()
})

shutter.addEventListener('pointercancel', () => {
  clearLongPress()
  shutter.classList.remove('pressed')
})

shutter.addEventListener('click', (event) => {
  if (event.detail === 0 && mediaRecorder?.state !== 'recording') takePhoto()
})

shutter.addEventListener('contextmenu', (event) => event.preventDefault())
lemonadeTab.addEventListener('click', () => setInteraction('lemonade'))
waterTab.addEventListener('click', () => setInteraction('water'))
balloonTab.addEventListener('click', () => setInteraction('balloon'))
mosquitoTab.addEventListener('click', () => setInteraction('mosquito'))
startCameraButton.addEventListener('click', () => void startCamera())
window.addEventListener('resize', resizeCanvas, { passive: true })
window.addEventListener('hashchange', () => setInteraction(location.hash === '#watertouch' ? 'water' : location.hash === '#balloon' ? 'balloon' : location.hash === '#mosquito' ? 'mosquito' : 'lemonade', false))
video.addEventListener('loadedmetadata', () => { cropCache = null })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    video.pause()
    stream?.getVideoTracks().forEach((track) => { track.enabled = false })
    return
  }
  stream?.getVideoTracks().forEach((track) => { track.enabled = true })
  cropCache = null
  lastFrameAt = performance.now()
  lastRenderedAt = 0
  void video.play().catch(() => undefined)
  scheduleRender()
})
function releaseCameraResources() {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  video.srcObject = null
  holisticLandmarker?.close()
  holisticLandmarker = null
  cameraReady = false
  modelReady = false
  lastVideoTime = -1
  stopWaterTouchSound()
}

window.addEventListener('pagehide', () => {
  releaseCameraResources()
})
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return
  cropCache = null
  lastFrameAt = performance.now()
  lastRenderedAt = 0
  if (hasStartedCameraThisSession()) void startCamera(true)
  scheduleRender()
})

resizeCanvas()
seedLemons()
seedBalloons()
seedMosquitoes()
setInteraction(location.hash === '#watertouch' ? 'water' : location.hash === '#balloon' ? 'balloon' : location.hash === '#mosquito' ? 'mosquito' : 'lemonade', false)
updateTrackingStatus()
if (hasStartedCameraThisSession()) void startCamera(true)
scheduleRender()
