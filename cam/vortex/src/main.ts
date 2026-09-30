import type { HolisticLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import './style.css'

type TrackerTone = 'ready' | 'action' | 'error' | ''

type Point = {
  x: number
  y: number
}

type HandSample = {
  landmarks: NormalizedLandmark[]
  center: Point
  width: number
}

type Spark = {
  x: number
  y: number
  previousX: number
  previousY: number
  velocityX: number
  velocityY: number
  life: number
  maxLife: number
  size: number
  hue: number
}

const video = document.querySelector<HTMLVideoElement>('#camera')!
const canvas = document.querySelector<HTMLCanvasElement>('#vortexCanvas')!
const context = canvas.getContext('2d')!
const vortexObject = document.querySelector<HTMLDivElement>('#vortexObject')!
const orbFloat = document.querySelector<HTMLDivElement>('#orbFloat')!
const earthImage = document.querySelector<HTMLImageElement>('#earthImage')!
const energyBands = [...document.querySelectorAll<HTMLSpanElement>('.energy-band')]
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
let handSeenAt = 0
let handVisible = false
let previousHandCenter: Point | null = null
let previousStatus = ''

let targetX = window.innerWidth / 2
let targetY = window.innerHeight / 2
let targetRadius = 100
let targetEnergy = 0
let smoothedX = targetX
let smoothedY = targetY
let smoothedRadius = targetRadius
let smoothedEnergy = 0
let spinAngle = 0
let sparkBudget = 0

const sparks: Spark[] = []
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const DETECTION_INTERVAL = 40
const HAND_GRACE_MS = 190
const MAX_SPARKS = reducedMotion ? 24 : 110

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return amount * amount * (3 - 2 * amount)
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

function averagePoint(landmarks: NormalizedLandmark[], indices: number[]): Point {
  const point = indices.reduce((sum, index) => ({
    x: sum.x + landmarks[index].x,
    y: sum.y + landmarks[index].y,
  }), { x: 0, y: 0 })
  return { x: point.x / indices.length, y: point.y / indices.length }
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

function screenPoint(point: Point): Point {
  const { sourceWidth, sourceHeight, scale, offsetX, offsetY } = videoLayout()
  return {
    x: window.innerWidth - (point.x * sourceWidth * scale + offsetX),
    y: point.y * sourceHeight * scale + offsetY,
  }
}

function normalizedPointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function handEnergy(landmarks: NormalizedLandmark[], palmWidth: number) {
  const wrist = landmarks[0]
  const fingerPairs = [[8, 6], [12, 10], [16, 14], [20, 18]]
  const curl = fingerPairs.reduce((sum, [tip, middle]) => {
    const ratio = distance(landmarks[tip], wrist) / Math.max(.001, distance(landmarks[middle], wrist))
    return sum + smoothstep(1.36, .92, ratio)
  }, 0) / fingerPairs.length

  const closestPinch = Math.min(
    distance(landmarks[4], landmarks[8]),
    distance(landmarks[4], landmarks[12]),
    distance(landmarks[4], landmarks[16]),
  ) / Math.max(.001, palmWidth)
  const pinch = smoothstep(.78, .25, closestPinch)

  // A cupped hand naturally combines partial finger curl with a narrowing
  // thumb. Keeping pinch as a secondary path also makes the gesture reliable
  // when only the fingertips are visible near the edge of the sphere.
  return clamp(Math.max(curl, pinch * .82), 0, 1)
}

function createHandSample(landmarks: NormalizedLandmark[] | undefined): HandSample | null {
  if (!landmarks) return null
  const width = distance(landmarks[5], landmarks[17])
  if (width < .025) return null
  return {
    landmarks,
    center: averagePoint(landmarks, [0, 5, 9, 13, 17]),
    width,
  }
}

function chooseHand(hands: HandSample[]) {
  if (!hands.length) return null
  if (!previousHandCenter) return hands.reduce((largest, hand) => hand.width > largest.width ? hand : largest)

  const closest = hands.reduce((best, hand) => (
    normalizedPointDistance(hand.center, previousHandCenter!)
      < normalizedPointDistance(best.center, previousHandCenter!) ? hand : best
  ))
  return normalizedPointDistance(closest.center, previousHandCenter) < .28
    ? closest
    : hands.reduce((largest, hand) => hand.width > largest.width ? hand : largest)
}

function updateHand(hand: HandSample, now: number) {
  const palmCenter = screenPoint(hand.center)
  const indexBase = screenPoint(hand.landmarks[5])
  const pinkyBase = screenPoint(hand.landmarks[17])
  const middleBase = screenPoint(hand.landmarks[9])
  const palmWidth = Math.hypot(indexBase.x - pinkyBase.x, indexBase.y - pinkyBase.y)
  const maxRadius = Math.min(window.innerWidth * .27, window.innerHeight * .25)
  const radius = clamp(palmWidth * .9, 68, maxRadius)

  targetX = palmCenter.x
  targetY = middleBase.y - radius * .66
  targetRadius = radius
  targetEnergy = handEnergy(hand.landmarks, hand.width)
  previousHandCenter = hand.center
  handSeenAt = now
  handVisible = true
  vortexObject.classList.remove('hidden')
}

function updateTrackingMessage() {
  if (!cameraReady) setStatus('카메라 준비 중')
  else if (!modelReady) setStatus('손 인식 준비 중')
  else if (!handVisible) setStatus('한 손을 카메라에 펼쳐보세요')
  else if (targetEnergy > .48) setStatus('소용돌이가 회전하며 스파크를 만들고 있어요', 'action')
  else setStatus('손가락을 안쪽으로 천천히 오므려보세요', 'ready')
}

function detect(now: number) {
  if (!modelReady || !holisticLandmarker || !cameraReady || document.hidden || video.readyState < 2) return
  if (now - lastDetectionAt < DETECTION_INTERVAL || lastVideoTime === video.currentTime) return
  lastDetectionAt = now
  lastVideoTime = video.currentTime

  try {
    const result = holisticLandmarker.detectForVideo(video, now)
    const hands = [
      createHandSample(result.leftHandLandmarks[0]),
      createHandSample(result.rightHandLandmarks[0]),
    ].filter((hand): hand is HandSample => hand !== null)
    const hand = chooseHand(hands)

    if (hand) updateHand(hand, now)
    else if (now - handSeenAt > HAND_GRACE_MS) {
      handVisible = false
      targetEnergy = 0
      previousHandCenter = null
      vortexObject.classList.add('hidden')
    }
    updateTrackingMessage()
  } catch {
    // Busy frames can briefly duplicate the video timestamp. The next camera
    // frame is enough to recover, so the visual should remain uninterrupted.
  }
}

async function createTracker() {
  if (holisticLandmarker) return
  const { FilesetResolver, HolisticLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  const options = {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/holistic_landmarker.task`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    minHandLandmarksConfidence: .5,
    minPoseDetectionConfidence: .42,
    minPosePresenceConfidence: .42,
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
}

async function startCamera() {
  startCameraButton.disabled = true
  permissionCopy.textContent = '카메라와 손 인식 모델을 준비하고 있어요.'
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
    setStatus('한 손을 카메라에 펼쳐보세요')
  } catch {
    cameraReady = false
    permissionPanel.classList.remove('hidden')
    permissionCopy.textContent = '카메라를 열 수 없어요. 브라우저 설정에서 이 사이트의 카메라 권한을 허용한 뒤 다시 시도해 주세요.'
    startCameraButton.textContent = '다시 시도'
    startCameraButton.disabled = false
    setStatus('카메라 권한이 필요해요', 'error')
  }
}

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(window.innerWidth * ratio)
  canvas.height = Math.round(window.innerHeight * ratio)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
}

function strokeEllipse(
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rotation: number,
  color: string,
  width: number,
  dash: number[],
  offset: number,
) {
  context.save()
  context.translate(x, y)
  context.rotate(rotation)
  context.scale(radiusX, radiusY)
  context.beginPath()
  context.arc(0, 0, 1, 0, Math.PI * 2)
  context.restore()
  context.setLineDash(dash)
  context.lineDashOffset = offset
  context.lineWidth = width
  context.strokeStyle = color
  context.stroke()
}

function drawVortexRings(now: number, x: number, y: number, radius: number, energy: number) {
  if (!handVisible || radius <= 0) return
  const glow = .18 + energy * .74
  const pulse = 1 + Math.sin(now * .006) * (.012 + energy * .022)

  context.save()
  context.globalCompositeOperation = 'lighter'
  context.shadowBlur = 7 + energy * 15
  context.shadowColor = `rgba(96, 165, 250, ${glow})`
  strokeEllipse(x, y + radius * .05, radius * 1.28 * pulse, radius * .34, -.11, `rgba(103, 232, 249, ${glow})`, 1.2 + energy * 1.8, [radius * .6, radius * .12], -now * (.018 + energy * .08))
  strokeEllipse(x, y - radius * .02, radius * 1.45, radius * .48, .19, `rgba(167, 139, 250, ${glow * .82})`, 1 + energy * 1.5, [radius * .25, radius * .09], now * (.013 + energy * .065))
  strokeEllipse(x, y, radius * 1.08, radius * .72, 1.22, `rgba(96, 165, 250, ${glow * .68})`, .8 + energy * 1.25, [radius * .18, radius * .11], -now * (.01 + energy * .045))
  context.restore()
  context.setLineDash([])
}

function spawnSpark(x: number, y: number, radius: number, energy: number) {
  if (sparks.length >= MAX_SPARKS) return
  const angle = Math.random() * Math.PI * 2
  const spread = radius * (.65 + Math.random() * .7)
  const ellipticalY = .55 + Math.random() * .3
  const speed = radius * (1.15 + energy * 2.6) * (.7 + Math.random() * .7)
  const radialX = Math.cos(angle)
  const radialY = Math.sin(angle) * ellipticalY
  const tangentX = -Math.sin(angle)
  const tangentY = Math.cos(angle) * ellipticalY
  const direction = Math.random() > .5 ? 1 : -1
  const life = .28 + Math.random() * .52
  const startX = x + radialX * spread
  const startY = y + radialY * spread

  sparks.push({
    x: startX,
    y: startY,
    previousX: startX,
    previousY: startY,
    velocityX: radialX * speed * .36 + tangentX * speed * direction,
    velocityY: radialY * speed * .36 + tangentY * speed * direction,
    life,
    maxLife: life,
    size: .8 + Math.random() * 1.8,
    hue: Math.random() > .34 ? 192 + Math.random() * 30 : 258 + Math.random() * 28,
  })
}

function updateAndDrawSparks(delta: number) {
  context.save()
  context.globalCompositeOperation = 'lighter'
  context.lineCap = 'round'

  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    const spark = sparks[index]
    spark.life -= delta
    if (spark.life <= 0) {
      sparks.splice(index, 1)
      continue
    }

    spark.previousX = spark.x
    spark.previousY = spark.y
    spark.velocityX *= Math.pow(.977, delta * 60)
    spark.velocityY = spark.velocityY * Math.pow(.977, delta * 60) + 18 * delta
    spark.x += spark.velocityX * delta
    spark.y += spark.velocityY * delta

    const alpha = Math.sin((spark.life / spark.maxLife) * Math.PI) * smoothedEnergy
    context.beginPath()
    context.moveTo(spark.previousX, spark.previousY)
    context.lineTo(spark.x, spark.y)
    context.lineWidth = spark.size
    context.strokeStyle = `hsla(${spark.hue}, 96%, 76%, ${alpha})`
    context.shadowBlur = 10
    context.shadowColor = `hsla(${spark.hue}, 100%, 66%, ${alpha})`
    context.stroke()
  }
  context.restore()
}

function drawElectricArc(x: number, y: number, radius: number, energy: number) {
  if (energy < .48 || Math.random() > energy * .28) return
  const startAngle = Math.random() * Math.PI * 2
  const length = .35 + Math.random() * .7
  const points = 7

  context.save()
  context.globalCompositeOperation = 'lighter'
  context.beginPath()
  for (let index = 0; index < points; index += 1) {
    const progress = index / (points - 1)
    const angle = startAngle + length * progress
    const jitter = index === 0 || index === points - 1 ? 0 : (Math.random() - .5) * radius * .2
    const arcRadius = radius * (1.06 + Math.sin(progress * Math.PI) * .2)
    const pointX = x + Math.cos(angle) * arcRadius + Math.cos(angle + Math.PI / 2) * jitter
    const pointY = y + Math.sin(angle) * arcRadius * .68 + Math.sin(angle + Math.PI / 2) * jitter
    if (!index) context.moveTo(pointX, pointY)
    else context.lineTo(pointX, pointY)
  }
  context.strokeStyle = `rgba(220, 240, 255, ${energy * .78})`
  context.lineWidth = .7 + energy * 1.2
  context.shadowBlur = 12
  context.shadowColor = '#67e8f9'
  context.stroke()
  context.restore()
}

function render(now: number) {
  const delta = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  detect(now)

  const positionMix = 1 - Math.exp(-delta * 15)
  const sizeMix = 1 - Math.exp(-delta * 10)
  const energyMix = 1 - Math.exp(-delta * (targetEnergy > smoothedEnergy ? 10 : 5))
  smoothedX += (targetX - smoothedX) * positionMix
  smoothedY += (targetY - smoothedY) * positionMix
  smoothedRadius += (targetRadius - smoothedRadius) * sizeMix
  smoothedEnergy += (targetEnergy - smoothedEnergy) * energyMix

  const bob = handVisible ? Math.sin(now * (.0018 + smoothedEnergy * .0018)) * smoothedRadius * (.025 + smoothedEnergy * .035) : 0
  const visualY = smoothedY + bob
  const diameter = smoothedRadius * 2
  spinAngle += delta * (.28 + smoothedEnergy * (reducedMotion ? 1.2 : 4.6))

  vortexObject.style.width = `${diameter}px`
  vortexObject.style.height = `${diameter}px`
  vortexObject.style.transform = `translate3d(${smoothedX - smoothedRadius}px, ${visualY - smoothedRadius}px, 0)`
  vortexObject.style.setProperty('--energy', smoothedEnergy.toFixed(3))
  orbFloat.style.transform = `rotate(${Math.sin(now * .0012) * 1.8}deg)`
  earthImage.style.transform = `rotate(${spinAngle * .24}rad)`
  const bandRotations = [-8, 17, 73]
  energyBands.forEach((band, index) => {
    const direction = index === 1 ? -1 : 1
    const turn = spinAngle * direction * (index === 2 ? .45 : 1)
    band.style.transform = `translate(-50%, -50%) rotate(${bandRotations[index]}deg) rotate(${turn}rad)`
  })

  context.clearRect(0, 0, window.innerWidth, window.innerHeight)
  drawVortexRings(now, smoothedX, visualY, smoothedRadius, smoothedEnergy)

  if (handVisible && smoothedEnergy > .22) {
    sparkBudget += delta * Math.pow(smoothedEnergy, 1.6) * (reducedMotion ? 12 : 58)
    while (sparkBudget >= 1) {
      spawnSpark(smoothedX, visualY, smoothedRadius, smoothedEnergy)
      sparkBudget -= 1
    }
    drawElectricArc(smoothedX, visualY, smoothedRadius, smoothedEnergy)
  }
  updateAndDrawSparks(delta)

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
window.addEventListener('resize', resizeCanvas)
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

resizeCanvas()
requestAnimationFrame(render)
void startCamera()
