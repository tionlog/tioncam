import type { HolisticLandmarker, MPMask, NormalizedLandmark } from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import './style.css'

type TrackerTone = 'ready' | 'action' | 'stopped' | 'error' | ''
type HandSide = 'left' | 'right'

type FingerMotion = {
  x: number
  y: number
  time: number
  present: boolean
  lastSeenAt: number
}

type HeadFrame = {
  centerX: number
  centerY: number
  halfWidth: number
  halfHeight: number
}

const video = document.querySelector<HTMLVideoElement>('#camera')!
const globeLayer = document.querySelector<HTMLDivElement>('#globeLayer')!
const permissionPanel = document.querySelector<HTMLElement>('#permissionPanel')!
const permissionCopy = document.querySelector<HTMLDivElement>('#permissionCopy')!
const startCameraButton = document.querySelector<HTMLButtonElement>('#startCamera')!
const trackingStatus = document.querySelector<HTMLDivElement>('#trackingStatus')!
const trackingStatusText = trackingStatus.querySelector<HTMLSpanElement>('span')!

const scene = new THREE.Scene()
const sceneCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 4000)
sceneCamera.position.z = 1500

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
})
renderer.setClearColor(0x000000, 0)
renderer.outputColorSpace = THREE.SRGBColorSpace
globeLayer.append(renderer.domElement)

// A live, softly segmented head texture. It is only made visible after a
// rotation begins, so the untouched camera feed remains natural at rest.
const TEXTURE_SIZE = 288
const headTextureCanvas = document.createElement('canvas')
headTextureCanvas.width = TEXTURE_SIZE
headTextureCanvas.height = TEXTURE_SIZE
const headTextureContext = headTextureCanvas.getContext('2d', {
  alpha: true,
  willReadFrequently: true,
})!
const headTexture = new THREE.CanvasTexture(headTextureCanvas)
headTexture.colorSpace = THREE.SRGBColorSpace
headTexture.minFilter = THREE.LinearFilter
headTexture.magFilter = THREE.LinearFilter
headTexture.generateMipmaps = false

const headGeometry = new THREE.SphereGeometry(1, 48, 32)
const headPositions = headGeometry.getAttribute('position') as THREE.BufferAttribute
const headUvs = headGeometry.getAttribute('uv') as THREE.BufferAttribute
for (let index = 0; index < headPositions.count; index += 1) {
  // Project the camera image over an ellipsoid instead of stretching a 2D
  // outline. Rotation therefore changes the entire volume at once.
  headUvs.setXY(index, (headPositions.getX(index) + 1) / 2, (headPositions.getY(index) + 1) / 2)
}
headUvs.needsUpdate = true

const headMaterial = new THREE.MeshBasicMaterial({
  map: headTexture,
  transparent: true,
  opacity: 0,
  alphaTest: .018,
  depthWrite: true,
})
const rotatingHead = new THREE.Mesh(headGeometry, headMaterial)
rotatingHead.renderOrder = 0

const helmetTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}cam/face/astronaut-helmet.png`)
helmetTexture.colorSpace = THREE.SRGBColorSpace
helmetTexture.minFilter = THREE.LinearFilter
helmetTexture.magFilter = THREE.LinearFilter

// The source image is bent slightly so the shell reads as a volume when the
// shared rotation group turns.
const helmetGeometry = new THREE.PlaneGeometry(2, 2, 28, 28)
const helmetPositions = helmetGeometry.getAttribute('position') as THREE.BufferAttribute
for (let index = 0; index < helmetPositions.count; index += 1) {
  const x = helmetPositions.getX(index)
  const y = helmetPositions.getY(index)
  const dome = Math.max(0, 1 - x * x * .68 - y * y * .34)
  helmetPositions.setZ(index, dome * .24)
}
helmetPositions.needsUpdate = true
helmetGeometry.computeVertexNormals()

const helmetMaterial = new THREE.MeshBasicMaterial({
  map: helmetTexture,
  transparent: true,
  opacity: 1,
  alphaTest: .025,
  depthWrite: false,
  side: THREE.DoubleSide,
})
const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial)
helmet.position.set(0, -.13, .32)
helmet.scale.set(1.42, 1.48, 1)
helmet.renderOrder = 3

const visorTextureCanvas = document.createElement('canvas')
visorTextureCanvas.width = 512
visorTextureCanvas.height = 512
const visorTextureContext = visorTextureCanvas.getContext('2d')!
const visorGlass = visorTextureContext.createRadialGradient(256, 220, 40, 256, 256, 250)
visorGlass.addColorStop(0, 'rgba(160, 220, 255, .06)')
visorGlass.addColorStop(.72, 'rgba(29, 75, 110, .18)')
visorGlass.addColorStop(1, 'rgba(4, 16, 29, .58)')
visorTextureContext.fillStyle = visorGlass
visorTextureContext.fillRect(0, 0, 512, 512)
visorTextureContext.strokeStyle = 'rgba(225, 245, 255, .5)'
visorTextureContext.lineWidth = 10
visorTextureContext.beginPath()
visorTextureContext.arc(256, 256, 246, 0, Math.PI * 2)
visorTextureContext.stroke()
visorTextureContext.strokeStyle = 'rgba(255, 255, 255, .28)'
visorTextureContext.lineWidth = 24
visorTextureContext.beginPath()
visorTextureContext.arc(210, 185, 150, 3.72, 5.05)
visorTextureContext.stroke()
const visorTexture = new THREE.CanvasTexture(visorTextureCanvas)
visorTexture.colorSpace = THREE.SRGBColorSpace

const visorMaterial = new THREE.MeshBasicMaterial({
  map: visorTexture,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
})
const visor = new THREE.Mesh(new THREE.CircleGeometry(1, 48), visorMaterial)
visor.position.set(0, -.015, .2)
visor.scale.set(.98, .94, 1)
visor.renderOrder = 2

// headAnchor follows the real head. spinGroup contains every synthetic part
// that must rotate together. helmetPose adds only the real-world head pose.
const helmetPose = new THREE.Group()
helmetPose.add(visor, helmet)
helmetPose.visible = true

const spinGroup = new THREE.Group()
spinGroup.add(rotatingHead, helmetPose)

const headAnchor = new THREE.Group()
headAnchor.add(spinGroup)
headAnchor.visible = false
scene.add(headAnchor)

let holisticLandmarker: HolisticLandmarker | null = null
let cameraStream: MediaStream | null = null
let cameraReady = false
let modelReady = false
let faceReady = false
let hasCleanHeadTexture = false
let lastVideoTime = -1
let lastDetectionAt = 0
let lastTextureAt = 0
let lastFrameAt = performance.now()

let smoothedHeadX = 0
let smoothedHeadY = 0
let smoothedHeadHalfWidth = 0
let smoothedHeadHalfHeight = 0
let helmetRotationX = 0
let helmetRotationY = 0
let helmetRotationZ = 0
let targetHelmetRotationX = 0
let targetHelmetRotationY = 0
let targetHelmetRotationZ = 0

let spinAngleX = 0
let spinAngleY = 0
let spinVelocityX = 0
let spinVelocityY = 0
let activeRotationHand: HandSide | null = null
let lastPointerMotionAt = 0
let rotationBlocked = false
let fistSince = 0
let fistActionLatched = false
let resetSpinToDefault = false
let latestRotationAt = 0
let latestStopAt = 0

let visorTarget = 0
let visorProgress = 0
let openPalmSince = 0

let previousStatus = ''
const fingerMotion: Record<HandSide, FingerMotion> = {
  left: { x: 0, y: 0, time: 0, present: false, lastSeenAt: 0 },
  right: { x: 0, y: 0, time: 0, present: false, lastSeenAt: 0 },
}

const DETECTION_INTERVAL = 40
const TEXTURE_INTERVAL = 66

function setStatus(message: string, tone: TrackerTone = '') {
  const statusKey = `${tone}:${message}`
  if (statusKey === previousStatus) return
  previousStatus = statusKey
  trackingStatusText.textContent = message
  trackingStatus.classList.remove('ready', 'action', 'stopped', 'error')
  if (tone) trackingStatus.classList.add(tone)
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return amount * amount * (3 - 2 * amount)
}

function fingerExtended(landmarks: NormalizedLandmark[], tip: number, middle: number, ratio = 1.2) {
  return distance(landmarks[tip], landmarks[0]) > distance(landmarks[middle], landmarks[0]) * ratio
}

function isPointingIndex(landmarks: NormalizedLandmark[]) {
  const indexExtended = fingerExtended(landmarks, 8, 6, 1.24)
  const foldedFingers = [[12, 10], [16, 14], [20, 18]].filter(([tip, middle]) => (
    !fingerExtended(landmarks, tip, middle, 1.13)
  )).length
  return indexExtended && foldedFingers >= 2
}

function isOpenPalm(landmarks: NormalizedLandmark[]) {
  return [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, middle]) => (
    fingerExtended(landmarks, tip, middle, 1.13)
  ))
}

function isFist(landmarks: NormalizedLandmark[]) {
  const wrist = landmarks[0]
  const folded = [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, middle]) => (
    distance(landmarks[tip], wrist) < distance(landmarks[middle], wrist) * 1.22
  ))
  const thumbFolded = distance(landmarks[4], wrist) < distance(landmarks[3], wrist) * 1.24
  return folded && thumbFolded
}

function getHeadFrame(face: NormalizedLandmark[]): HeadFrame {
  const forehead = face[10]
  const chin = face[152]
  const leftCheek = face[234]
  const rightCheek = face[454]
  const faceWidth = Math.max(.001, Math.abs(rightCheek.x - leftCheek.x))
  const faceHeight = Math.max(.001, Math.abs(chin.y - forehead.y))
  const top = forehead.y - faceHeight * .48
  const bottom = chin.y + faceHeight * .08
  return {
    centerX: (leftCheek.x + rightCheek.x) / 2,
    centerY: (top + bottom) / 2,
    halfWidth: faceWidth * .67,
    halfHeight: (bottom - top) / 2,
  }
}

function handOverlapsHead(hand: NormalizedLandmark[] | undefined, frame: HeadFrame) {
  if (!hand) return false
  return hand.some((point) => {
    const x = (point.x - frame.centerX) / Math.max(.001, frame.halfWidth * 1.08)
    const y = (point.y - frame.centerY) / Math.max(.001, frame.halfHeight * 1.08)
    return x * x + y * y < 1
  })
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

function updateHeadTexture(frame: HeadFrame, segmentation: MPMask | undefined, now: number) {
  if (now - lastTextureAt < TEXTURE_INTERVAL) return
  lastTextureAt = now

  const { sourceWidth, sourceHeight } = videoLayout()
  const sourceX = (frame.centerX - frame.halfWidth) * sourceWidth
  const sourceY = (frame.centerY - frame.halfHeight) * sourceHeight
  const sourceCropWidth = frame.halfWidth * 2 * sourceWidth
  const sourceCropHeight = frame.halfHeight * 2 * sourceHeight

  headTextureContext.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  headTextureContext.save()
  headTextureContext.translate(TEXTURE_SIZE, 0)
  headTextureContext.scale(-1, 1)
  headTextureContext.drawImage(
    video,
    sourceX,
    sourceY,
    sourceCropWidth,
    sourceCropHeight,
    0,
    0,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
  )
  headTextureContext.restore()

  const image = headTextureContext.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  let personMask: Float32Array | null = null
  let maskWidth = 0
  let maskHeight = 0
  if (segmentation) {
    personMask = segmentation.getAsFloat32Array()
    maskWidth = segmentation.width
    maskHeight = segmentation.height
  }

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    const normalizedY = ((y + .5) / TEXTURE_SIZE - .5) * 2
    const sourceNormalizedY = frame.centerY + normalizedY * frame.halfHeight
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const normalizedX = ((x + .5) / TEXTURE_SIZE - .5) * 2
      const edgeDistance = 1 - normalizedX * normalizedX - normalizedY * normalizedY
      const softHeadEdge = smoothstep(-.025, .16, edgeDistance)
      let person = 1
      if (personMask && maskWidth && maskHeight) {
        // Texture pixels are mirrored, while MediaPipe masks use source-space.
        const sourceNormalizedX = frame.centerX - normalizedX * frame.halfWidth
        const maskX = THREE.MathUtils.clamp(Math.floor(sourceNormalizedX * maskWidth), 0, maskWidth - 1)
        const maskY = THREE.MathUtils.clamp(Math.floor(sourceNormalizedY * maskHeight), 0, maskHeight - 1)
        person = smoothstep(.08, .68, personMask[maskY * maskWidth + maskX])
      }
      image.data[(y * TEXTURE_SIZE + x) * 4 + 3] = Math.round(255 * softHeadEdge * person)
    }
  }

  headTextureContext.putImageData(image, 0, 0)
  headTexture.needsUpdate = true
  hasCleanHeadTexture = true
}

function updateHead(
  face: NormalizedLandmark[],
  leftHand: NormalizedLandmark[] | undefined,
  rightHand: NormalizedLandmark[] | undefined,
  segmentation: MPMask | undefined,
  now: number,
) {
  const frame = getHeadFrame(face)
  const { sourceWidth, sourceHeight, scale, offsetX, offsetY } = videoLayout()
  const forehead = face[10]
  const chin = face[152]
  const leftCheek = face[234]
  const rightCheek = face[454]
  const nose = face[1]
  const leftEye = face[33]
  const rightEye = face[263]
  const faceWidth = Math.max(.001, Math.abs(rightCheek.x - leftCheek.x))
  const faceHeight = Math.max(.001, Math.abs(chin.y - forehead.y))
  const cheekMiddleX = (leftCheek.x + rightCheek.x) / 2
  const eyeDeltaX = Math.max(.001, Math.abs(rightEye.x - leftEye.x))

  targetHelmetRotationY = THREE.MathUtils.clamp(-(nose.x - cheekMiddleX) / faceWidth * 1.85, -.58, .58)
  targetHelmetRotationX = THREE.MathUtils.clamp(((nose.y - forehead.y) / faceHeight - .53) * 1.7, -.34, .34)
  targetHelmetRotationZ = THREE.MathUtils.clamp(-Math.atan((rightEye.y - leftEye.y) / eyeDeltaX), -.38, .38)

  const targetX = window.innerWidth - (frame.centerX * sourceWidth * scale + offsetX)
  const targetY = frame.centerY * sourceHeight * scale + offsetY
  const targetHalfWidth = frame.halfWidth * sourceWidth * scale
  const targetHalfHeight = frame.halfHeight * sourceHeight * scale
  const smoothing = smoothedHeadHalfWidth ? .3 : 1
  smoothedHeadX += (targetX - smoothedHeadX) * smoothing
  smoothedHeadY += (targetY - smoothedHeadY) * smoothing
  smoothedHeadHalfWidth += (targetHalfWidth - smoothedHeadHalfWidth) * smoothing
  smoothedHeadHalfHeight += (targetHalfHeight - smoothedHeadHalfHeight) * smoothing
  headAnchor.position.set(smoothedHeadX - window.innerWidth / 2, window.innerHeight / 2 - smoothedHeadY, 0)
  headAnchor.scale.set(
    smoothedHeadHalfWidth,
    smoothedHeadHalfHeight,
    Math.sqrt(smoothedHeadHalfWidth * smoothedHeadHalfHeight),
  )
  headAnchor.visible = true
  faceReady = true

  // Do not bake a hand into the rotating head when a gesture crosses it.
  if (!handOverlapsHead(leftHand, frame) && !handOverlapsHead(rightHand, frame)) {
    updateHeadTexture(frame, segmentation, now)
  }
}

function updateIndexRotation(side: HandSide, landmarks: NormalizedLandmark[], now: number) {
  const motion = fingerMotion[side]
  if (visorTarget < .5 || visorProgress < .72 || !isPointingIndex(landmarks)) {
    motion.present = false
    return
  }

  motion.lastSeenAt = now
  const tip = landmarks[8]
  const x = 1 - tip.x
  const y = tip.y
  if (motion.present && !rotationBlocked) {
    const elapsed = Math.max(16, now - motion.time)
    const dx = x - motion.x
    const dy = y - motion.y
    const travelled = Math.hypot(dx, dy)
    const speed = travelled / elapsed * 1000
    const canTakeControl = !activeRotationHand
      || activeRotationHand === side
      || now - fingerMotion[activeRotationHand].lastSeenAt > 550

    if (canTakeControl && travelled > .005 && speed > .12) {
      activeRotationHand = side
      lastPointerMotionAt = now
      const targetY = THREE.MathUtils.clamp(dx / elapsed * 1000 * 6.4, -4.6, 4.6)
      const targetX = THREE.MathUtils.clamp(dy / elapsed * 1000 * 5.1, -3.1, 3.1)
      spinVelocityY += (targetY - spinVelocityY) * .62
      spinVelocityX += (targetX - spinVelocityX) * .52
      latestRotationAt = now
      setStatus('헬멧을 쓴 머리가 회전 중', 'action')
    }
  }

  motion.x = x
  motion.y = y
  motion.time = now
  motion.present = true
}

function updateFistGesture(leftFist: boolean, rightFist: boolean, now: number) {
  const fist = leftFist || rightFist
  if (fist) {
    if (!fistSince) fistSince = now
    if (!fistActionLatched && now - fistSince >= 55) {
      spinVelocityX = 0
      spinVelocityY = 0
      rotationBlocked = true
      fistActionLatched = true
      visorTarget = 0
      resetSpinToDefault = true
      spinAngleX = Math.atan2(Math.sin(spinAngleX), Math.cos(spinAngleX))
      spinAngleY = Math.atan2(Math.sin(spinAngleY), Math.cos(spinAngleY))
      latestStopAt = now
      setStatus('회전을 멈추고 앞면 덮개를 열었어요', 'stopped')
    }
  } else {
    fistSince = 0
    fistActionLatched = false
    rotationBlocked = false
  }
}

function updateVisorGesture(
  leftHand: NormalizedLandmark[] | undefined,
  rightHand: NormalizedLandmark[] | undefined,
  now: number,
) {
  const openPalm = Boolean((leftHand && isOpenPalm(leftHand)) || (rightHand && isOpenPalm(rightHand)))
  if (visorTarget < .5 && openPalm) {
    if (!openPalmSince) openPalmSince = now
    if (now - openPalmSince >= 120) {
      visorTarget = 1
      openPalmSince = 0
      setStatus('헬멧 앞면 덮개를 닫는 중', 'action')
    }
  } else {
    openPalmSince = 0
  }
}

function updateTrackingMessage(now: number) {
  if (!cameraReady) setStatus('카메라 준비 중')
  else if (!modelReady) setStatus('얼굴과 손 인식 준비 중')
  else if (!faceReady) setStatus('얼굴을 카메라에 보여주세요')
  else if (Math.abs(visorProgress - visorTarget) > .025) {
    setStatus(visorTarget > .5 ? '헬멧 앞면 덮개를 닫는 중' : '헬멧 앞면 덮개를 여는 중', 'action')
  } else if (now - latestStopAt < 900) setStatus('회전을 멈추고 앞면 덮개를 열었어요', 'stopped')
  else if (now - latestRotationAt < 700 || Math.hypot(spinVelocityX, spinVelocityY) > .01) {
    setStatus('헬멧을 쓴 머리가 회전 중', 'action')
  } else if (visorTarget > .5) setStatus('검지를 움직이면 헬멧을 쓴 머리가 회전해요', 'ready')
  else setStatus('손바닥을 펼치면 앞면 덮개가 닫혀요', 'ready')
}

function detect(now: number) {
  if (!modelReady || !holisticLandmarker || !cameraReady || document.hidden || video.readyState < 2) return
  if (now - lastDetectionAt < DETECTION_INTERVAL || lastVideoTime === video.currentTime) return
  lastDetectionAt = now
  lastVideoTime = video.currentTime

  try {
    const result = holisticLandmarker.detectForVideo(video, now)
    const face = result.faceLandmarks[0]
    const leftHand = result.leftHandLandmarks[0]
    const rightHand = result.rightHandLandmarks[0]
    const segmentation = result.poseSegmentationMasks[0]

    faceReady = Boolean(face)
    if (face) {
      updateHead(face, leftHand, rightHand, segmentation, now)
    } else {
      headAnchor.visible = false
    }

    updateVisorGesture(leftHand, rightHand, now)

    const leftFist = Boolean(leftHand && isFist(leftHand))
    const rightFist = Boolean(rightHand && isFist(rightHand))
    updateFistGesture(leftFist, rightFist, now)

    if (leftHand) updateIndexRotation('left', leftHand, now)
    else fingerMotion.left.present = false
    if (rightHand) updateIndexRotation('right', rightHand, now)
    else fingerMotion.right.present = false

    // A new pointing hand may take control after the previous hand has gone.
    if (activeRotationHand && now - fingerMotion[activeRotationHand].lastSeenAt > 1200 && now - lastPointerMotionAt > 1200) {
      activeRotationHand = null
    }
  } catch {
    // MediaPipe may occasionally reject a duplicate camera timestamp.
  }
  updateTrackingMessage(now)
}

async function createTracker() {
  if (holisticLandmarker) return
  const { FilesetResolver, HolisticLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  const options = {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/holistic_landmarker.task`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    minFaceDetectionConfidence: .55,
    minFacePresenceConfidence: .55,
    minHandLandmarksConfidence: .5,
    outputFaceBlendshapes: false,
    outputPoseSegmentationMasks: true,
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
  permissionCopy.textContent = '카메라와 얼굴·손 인식 모델을 준비하고 있어요.'
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
    setStatus('얼굴을 카메라에 보여주세요')
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
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25))
  renderer.setSize(width, height, false)
  sceneCamera.left = -width / 2
  sceneCamera.right = width / 2
  sceneCamera.top = height / 2
  sceneCamera.bottom = -height / 2
  sceneCamera.updateProjectionMatrix()
}

function render(now: number) {
  const delta = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  detect(now)

  if (visorTarget > .5 && !rotationBlocked) {
    spinAngleX += spinVelocityX * delta
    spinAngleY += spinVelocityY * delta
  }
  if (resetSpinToDefault) {
    const resetSmoothing = Math.exp(-delta * 9)
    spinAngleX *= resetSmoothing
    spinAngleY *= resetSmoothing
    if (Math.abs(spinAngleX) < .002 && Math.abs(spinAngleY) < .002) {
      spinAngleX = 0
      spinAngleY = 0
      resetSpinToDefault = false
      activeRotationHand = null
    }
  }
  spinGroup.rotation.set(spinAngleX, spinAngleY, 0, 'YXZ')

  const poseSmoothing = 1 - Math.exp(-delta * 9)
  helmetRotationX += (targetHelmetRotationX - helmetRotationX) * poseSmoothing
  helmetRotationY += (targetHelmetRotationY - helmetRotationY) * poseSmoothing
  helmetRotationZ += (targetHelmetRotationZ - helmetRotationZ) * poseSmoothing
  helmetPose.rotation.set(helmetRotationX, helmetRotationY, helmetRotationZ, 'YXZ')

  const visorStep = delta * 3.2
  if (visorProgress < visorTarget) visorProgress = Math.min(visorTarget, visorProgress + visorStep)
  else if (visorProgress > visorTarget) visorProgress = Math.max(visorTarget, visorProgress - visorStep)
  const visorEase = visorProgress * visorProgress * (3 - 2 * visorProgress)
  visor.visible = visorProgress > .002
  visor.position.y = THREE.MathUtils.lerp(.72, -.015, visorEase)
  visor.scale.set(
    THREE.MathUtils.lerp(.82, .98, visorEase),
    THREE.MathUtils.lerp(.78, .94, visorEase),
    1,
  )
  visorMaterial.opacity = .92 * visorEase
  headMaterial.opacity = hasCleanHeadTexture ? visorEase : 0

  renderer.render(scene, sceneCamera)
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
window.addEventListener('resize', resize, { passive: true })
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

resize()
requestAnimationFrame(render)
void startCamera()
