import './style.css'
import { ConanEffect } from './effect'

const video = document.querySelector<HTMLVideoElement>('#camera')!
const panel = document.querySelector<HTMLElement>('#permissionPanel')!
const title = document.querySelector<HTMLElement>('#panelTitle')!
const copy = document.querySelector<HTMLElement>('#permissionCopy')!
const startButton = document.querySelector<HTMLButtonElement>('#startCamera')!
const switchButton = document.querySelector<HTMLButtonElement>('#switchCamera')!
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen')!
const status = document.querySelector<HTMLElement>('#status')!
const gestureGuide = document.querySelector<HTMLElement>('#gestureGuide')!
const gestureStatus = document.querySelector<HTMLElement>('#gestureStatus')!
const trackingHint = document.querySelector<HTMLElement>('#trackingHint')!
const retryTracking = document.querySelector<HTMLButtonElement>('#retryTracking')!
const effect = new ConanEffect(video, document.querySelector<HTMLCanvasElement>('#conanEffect')!, state => {
  gestureGuide.dataset.active = String(state === 'active' || state === 'cloning' || state === 'costume')
  trackingHint.hidden = state !== 'ready'
  retryTracking.hidden = state !== 'error'
  gestureStatus.textContent = {
    loading: '손과 인물을 인식할 준비를 하고 있어요…',
    ready: '검지·엄지 → 빛 / 얼굴 앞 합장 → 분신 / 입술 아래 손 → 안경·나비넥타이·수트',
    active: '포즈 인식 · 빛이 나타납니다',
    cloning: '합장 인식 · 흑백 분신술',
    costume: '입술 아래 손 인식 · 빛나는 안경과 나비넥타이 수트',
    error: '손 인식을 시작하지 못했습니다. 다시 시도해 주세요.',
  }[state]
}, state => {
  trackingHint.textContent = {
    'face-missing': '얼굴을 카메라 중앙에 보여 주세요',
    'hand-missing': '얼굴 인식됨 · 손을 입술 아래로 가져가세요',
    'hand-away': '손 인식됨 · 손을 입술 아래 턱 가까이 올려 주세요',
    'hand-near': '입술 아래 손 인식됨 · 효과 적용 중',
  }[state]
})

let stream: MediaStream | null = null
let devices: MediaDeviceInfo[] = []
let facing: 'user' | 'environment' = 'user'
let generation = 0
let busy = false
let resumeOnVisible = false

function setStatus(message: string, live = false) {
  status.textContent = message
  status.classList.toggle('live', live)
}

function showPanel(heading: string, message: string, button = '다시 시도') {
  title.textContent = heading
  copy.textContent = message
  startButton.textContent = button
  panel.hidden = false
}

function stopCamera() {
  effect.stop()
  gestureGuide.hidden = true
  // Invalidate pending permission/play requests before releasing the hardware.
  generation += 1
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  video.srcObject = null
  busy = false
  startButton.disabled = false
  switchButton.disabled = true
}

function errorMessage(error: unknown) {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return '카메라 권한이 필요합니다. 브라우저의 사이트 설정과 기기의 개인정보 설정에서 카메라 접근을 허용한 뒤 다시 시도해 주세요.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '사용할 수 있는 카메라가 없습니다. 카메라 연결을 확인해 주세요.'
    case 'NotReadableError':
    case 'TrackStartError':
      return '카메라를 열 수 없습니다. 다른 앱에서 카메라를 사용 중이라면 종료하고, 기기의 카메라 권한을 확인해 주세요.'
    case 'OverconstrainedError':
      return '선택한 카메라를 사용할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.'
    default:
      return '카메라 연결이 중단되었습니다. 다시 시도해 주세요. 앱 안의 브라우저라면 Safari 또는 Chrome에서 열어 주세요.'
  }
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput')
  } catch {
    devices = []
  }
  switchButton.disabled = busy || !stream || devices.length < 2
}

async function playCamera(request: number) {
  try {
    // Set properties as well as HTML attributes for Safari's inline autoplay.
    video.muted = true
    video.playsInline = true
    await video.play()
    if (request !== generation) return
    panel.hidden = true
    setStatus('LIVE', true)
    gestureGuide.hidden = false
    void effect.start()
  } catch {
    if (request !== generation) return
    setStatus('재생 대기')
    showPanel('카메라를 재생해 주세요', '아래 버튼을 누르면 카메라 영상이 시작됩니다.', '영상 재생')
  }
}

async function startCamera(deviceId?: string) {
  if (busy) return
  if (!window.isSecureContext) {
    setStatus('보안 연결 필요')
    showPanel('HTTPS로 접속해 주세요', '카메라는 HTTPS 또는 localhost에서 사용할 수 있습니다. 휴대폰에서도 HTTPS 주소로 접속해 주세요.')
    return
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('카메라 지원 필요')
    showPanel('브라우저를 확인해 주세요', '이 브라우저에서는 카메라를 사용할 수 없습니다. 최신 Safari, Chrome, Edge 또는 Firefox에서 열어 주세요.')
    return
  }

  stopCamera()
  const request = generation
  busy = true
  startButton.disabled = true
  setStatus('연결 중')
  showPanel('카메라 연결 중', '브라우저에서 카메라 접근을 허용해 주세요.', '연결 중…')

  try {
    let nextStream: MediaStream
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      })
    } catch (error) {
      if (request !== generation) return
      // Retry with basic constraints when a driver rejects the preferred format.
      if (!(error instanceof DOMException) || !['OverconstrainedError', 'NotFoundError'].includes(error.name)) throw error
      nextStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing } } })
    }
    if (request !== generation || document.hidden) {
      nextStream.getTracks().forEach(track => track.stop())
      return
    }

    stream = nextStream
    const track = stream.getVideoTracks()[0]
    if (!track) throw new Error('No video track')
    const actualFacing = track.getSettings().facingMode
    if (actualFacing === 'user' || actualFacing === 'environment') facing = actualFacing
    video.classList.toggle('mirrored', actualFacing === 'user' || (!actualFacing && facing === 'user'))
    track.addEventListener('ended', () => {
      if (request !== generation) return
      stopCamera()
      setStatus('연결 끊김')
      showPanel('카메라 연결이 끊겼습니다', '카메라 연결과 권한을 확인한 뒤 다시 시작해 주세요.')
    })
    video.srcObject = stream
    await playCamera(request)
  } catch (error) {
    if (request !== generation) return
    stopCamera()
    setStatus('연결 확인')
    showPanel('카메라를 시작할 수 없습니다', errorMessage(error))
  } finally {
    if (request === generation) {
      busy = false
      startButton.disabled = false
      void refreshDevices()
    }
  }
}

startButton.addEventListener('click', () => {
  if (stream) void playCamera(generation)
  else void startCamera()
})

retryTracking.addEventListener('click', () => { if (stream) void effect.start() })

switchButton.addEventListener('click', () => {
  if (busy || !stream || devices.length < 2) return
  const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId
  const index = devices.findIndex(device => device.deviceId === currentId)
  const nextDevice = devices[(index + 1) % devices.length]
  facing = facing === 'user' ? 'environment' : 'user'
  void startCamera(nextDevice?.deviceId)
})

// CSS always fills the viewport; native fullscreen is an optional enhancement.
fullscreenButton.hidden = !document.fullscreenEnabled
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    setStatus('전체 화면 전환 불가')
  }
})
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? '전체 화면 해제' : '전체 화면'
})

function suspendCamera() {
  resumeOnVisible = resumeOnVisible || !!stream || busy
  stopCamera()
  if (resumeOnVisible) {
    setStatus('일시 정지')
    showPanel('카메라가 일시 정지되었습니다', '화면으로 돌아오면 카메라가 다시 연결됩니다.', '카메라 다시 시작')
  }
}

function resumeCamera() {
  if (document.hidden || !resumeOnVisible) return
  resumeOnVisible = false
  void startCamera()
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendCamera()
  else resumeCamera()
})
window.addEventListener('pagehide', suspendCamera)
window.addEventListener('pagehide', event => { if (!event.persisted) effect.dispose() })
window.addEventListener('pageshow', resumeCamera)
navigator.mediaDevices?.addEventListener('devicechange', () => { void refreshDevices() })

void startCamera()
