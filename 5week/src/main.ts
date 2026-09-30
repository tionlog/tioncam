import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createMoon, moonSurfaceRadius, CLEARING_NORMAL } from './moon'
import { createMoonGarden } from './garden'
import { createPortrait } from './portrait'
import { characterStyles, characterNames, updateRareVests } from './population'
import type { CharacterStyle } from './population'
import { createRareVest } from './costumes'
import { createCharacterBody } from './character-body'
import { captureOriginalFace } from './capture'
import { loadResidents, saveResidents, canvasToBlob, blobToCanvas } from './storage'
import type { ResidentRecord } from './storage'
import type { Resident } from './resident'
import { residentRecord } from './resident'
import { createClearing } from './clearing'
import { createInteractions } from './interactions'
import { stepResidentMotion } from './motion'
import { createResidentAdmin } from './resident-admin'
import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="week-five">
    <header class="topbar">
      <a class="home-button" href="/" aria-label="홈으로 이동">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v8.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-8.6Z"/><path d="M9.2 21v-6.8h5.6V21"/></svg>
      </a>
      <nav class="example-tabs" id="exampleTabs" role="tablist" aria-label="5주차 예제">
        <button class="example-tab active" type="button" role="tab" aria-selected="true" data-tab="moon-forest">
          <span aria-hidden="true">🌕</span> 예제 1
        </button>
        <button class="add-tab" id="addTab" type="button" aria-label="새 예제 탭 추가">＋</button>
      </nav>
      <button id="adminSettings" class="settings-button" type="button" aria-label="관리자 설정" title="관리자 설정" disabled>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 3-.6 2.1-1.7 1L5 5.6 2.5 9.9l1.6 1.6v2L2.5 15 5 19.3l2.2-.5 1.7 1 .6 2.1h5l.6-2.1 1.7-1 2.2.5 2.5-4.3-1.6-1.5v-2l1.6-1.6L19 5.6l-2.2.5-1.7-1L14.5 3Z"/><circle cx="12" cy="12.5" r="3.2"/></svg>
      </button>
    </header>

    <section class="example-panel active" id="moon-forest" role="tabpanel">
      <div class="scene" id="scene" aria-label="드래그하고 확대할 수 있는 3D 보름달"></div>
      <div class="aurora" aria-hidden="true"></div>

      <div class="world-toolbar">
        <button class="move-in-button" id="moveIn" type="button" disabled><span>입주하기</span><i aria-hidden="true">→</i></button>
        <button id="meetingButton" type="button" disabled>주민 회의</button>
        <button id="overviewButton" type="button">전체 보기</button>
        <button id="undoDismiss" type="button" hidden>방출 되돌리기</button>
        <div class="resident-directory" id="residentDirectory">
          <button class="resident-count" id="residentCount" type="button" aria-expanded="false" aria-controls="residentDropdown"><i aria-hidden="true"></i><span>입주민 0명</span><b aria-hidden="true">⌄</b></button>
          <section id="residentDropdown" class="resident-dropdown" aria-labelledby="residentDirectoryTitle" hidden>
            <h2 id="residentDirectoryTitle">입주민 프로필</h2>
            <ul id="residentProfiles" class="profile-list"></ul>
          </section>
        </div>
        <span id="saveStatus" class="sr-only" role="status">주민 불러오는 중…</span>
      </div>
      <p id="worldHint" class="sr-only" role="status">주민 클릭: 대화 · 주민 드래그: 이동 · 표시된 구덩이 안에 놓기: 방출</p>
      <section id="residentPanel" class="resident-panel" aria-labelledby="selectedName" hidden>
        <header><div><small id="selectedStyle"></small><h2 id="selectedName"></h2></div><button id="leaveResident" type="button">전체 보기</button></header>
        <p id="residentSpeech" role="status" aria-live="polite"></p>
        <div class="conversation-choices">
          <button type="button" data-topic="hello">안녕!</button><button type="button" data-topic="day">오늘 어때?</button>
          <button type="button" data-topic="vest">조끼 이야기</button><button type="button" data-topic="meeting">친구들 이야기</button>
          <button type="button" id="editPortrait">얼굴 텍스처 수정</button>
        </div>
      </section>
    </section>

    <section class="empty-panel" id="emptyPanel" hidden>
      <div class="empty-orbit" aria-hidden="true"><span></span></div>
      <p>NEW EXPERIMENT</p>
      <h2 id="emptyTitle">새 예제</h2>
      <span>새로운 인터랙션을 담을 준비가 된 탭이에요.</span>
    </section>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>

    <dialog class="move-in-dialog" id="moveInDialog" aria-labelledby="dialogTitle">
      <button class="dialog-close" id="dialogClose" type="button" aria-label="닫기">×</button>
      <div class="dialog-heading">
        <p>MOON RESIDENT CARD</p>
        <h2 id="dialogTitle">어떤 모습으로 입주할까요?</h2>
        <span>캐릭터를 고르고 얼굴을 촬영하면 달 위에 나만의 주민이 만들어져요.</span>
      </div>

      <div class="character-picker" role="radiogroup" aria-label="캐릭터 선택">
        <button class="character-option selected" type="button" role="radio" aria-checked="true" data-character="rabbit">
          <i class="character-preview rabbit" aria-hidden="true">🐰</i><span>달토끼</span><small data-population="rabbit">0명</small>
        </button>
        <button class="character-option" type="button" role="radio" aria-checked="false" data-character="astronaut">
          <i class="character-preview astronaut" aria-hidden="true">🧑‍🚀</i><span>우주인</span><small data-population="astronaut">0명</small>
        </button>
        <button class="character-option" type="button" role="radio" aria-checked="false" data-character="sprout">
          <i class="character-preview sprout" aria-hidden="true">🌱</i><span>새싹이</span><small data-population="sprout">0명</small>
        </button>
        <button class="character-option" type="button" role="radio" aria-checked="false" data-character="tinkerbell">
          <i class="character-preview tinkerbell" aria-hidden="true">🧚</i><span>팅커벨</span><small data-population="tinkerbell">0명</small>
        </button>
      </div>

      <label class="name-field">주민 이름 <input id="residentName" type="text" maxlength="16" placeholder="최대 16자" autocomplete="off" required></label>
      <div class="camera-card">
        <video id="camera" muted playsinline></video>
        <div class="camera-placeholder" id="cameraPlaceholder">
          <span aria-hidden="true">◉</span>
          <b>카메라를 준비하고 있어요</b>
          <small>브라우저에서 카메라 사용을 허용해 주세요.</small>
        </div>
        <div class="face-guide" aria-hidden="true"></div>
      </div>

      <p class="camera-message" id="cameraMessage" role="status" aria-live="polite">원 안에 얼굴을 맞춰 주세요. 촬영한 사진을 보정 없이 사용해요.</p>
      <p class="privacy-note">사진은 이 브라우저에서 처리·저장되며 서버로 전송되지 않아요.</p>
      <button class="capture-button" id="capture" type="button" disabled><i aria-hidden="true"></i> 사진 찍고 입주하기</button>
    </dialog>
  </main>
`

const sceneHost = document.querySelector<HTMLDivElement>('#scene')!
const moveInButton = document.querySelector<HTMLButtonElement>('#moveIn')!
const dialog = document.querySelector<HTMLDialogElement>('#moveInDialog')!
const dialogClose = document.querySelector<HTMLButtonElement>('#dialogClose')!
const video = document.querySelector<HTMLVideoElement>('#camera')!
const cameraPlaceholder = document.querySelector<HTMLDivElement>('#cameraPlaceholder')!
const cameraMessage = document.querySelector<HTMLParagraphElement>('#cameraMessage')!
const captureButton = document.querySelector<HTMLButtonElement>('#capture')!
const residentCount = document.querySelector<HTMLButtonElement>('#residentCount')!
const addTabButton = document.querySelector<HTMLButtonElement>('#addTab')!
const tabs = document.querySelector<HTMLElement>('#exampleTabs')!
const moonPanel = document.querySelector<HTMLElement>('#moon-forest')!
const emptyPanel = document.querySelector<HTMLElement>('#emptyPanel')!
const emptyTitle = document.querySelector<HTMLHeadingElement>('#emptyTitle')!
const toast = document.querySelector<HTMLDivElement>('#toast')!
const nameInput = document.querySelector<HTMLInputElement>('#residentName')!
const saveStatus = document.querySelector<HTMLElement>('#saveStatus')!
const undoDismiss = document.querySelector<HTMLButtonElement>('#undoDismiss')!

let selectedCharacter: CharacterStyle = 'rabbit'
let cameraStream: MediaStream | null = null
let residentTotal = 0
let newTabTotal = 0
let toastTimer = 0
let cameraSession = 0
let capturing = false
let storageReady = false
let saveRevision = 0
let interactions: ReturnType<typeof createInteractions> | null = null
let dismissedResident: Resident | null = null
let admin: ReturnType<typeof createResidentAdmin> | null = null
let deletingResidents = false

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
sceneHost.append(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x070914, 0.036)

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
camera.position.set(0.2, 0.15, 9.6)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.055
controls.enablePan = false
controls.minDistance = 4.4
controls.maxDistance = 11
controls.rotateSpeed = 0.58
controls.zoomSpeed = 0.78
controls.target.set(0, 0, 0)

const moonWorld = new THREE.Group()
scene.add(moonWorld)

function seededRandom(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453
  return value - Math.floor(value)
}

const moon = createMoon()
moonWorld.add(moon)

scene.add(new THREE.HemisphereLight(0xfff5d8, 0x666b56, 1.7))
const moonLight = new THREE.DirectionalLight(0xfff0bd, 3.1)
moonLight.position.set(5, 2.8, 2.6)
scene.add(moonLight)
const rimLight = new THREE.DirectionalLight(0xffe8ab, 0.7)
rimLight.position.set(-3, -1, -4)
scene.add(rimLight)
// A restrained camera-side soft fill reaches both head and body. The warm moon
// key still provides form, without leaving the photographed face in deep shade.
const portraitFill = new THREE.DirectionalLight(0xf2f5ff, .75)
portraitFill.position.set(-3, 4, 5)
camera.add(portraitFill, portraitFill.target)
portraitFill.target.position.set(0, 0, -5)
scene.add(camera)

function addStars() {
  const positions = new Float32Array(780 * 3)
  for (let index = 0; index < 780; index += 1) {
    const radius = 15 + seededRandom(index + 700) * 22
    const theta = seededRandom(index + 900) * Math.PI * 2
    const phi = Math.acos(2 * seededRandom(index + 1100) - 1)
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[index * 3 + 1] = radius * Math.cos(phi)
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xe4e8ff,
    size: 0.035,
    transparent: true,
    opacity: 0.82,
    sizeAttenuation: true,
  }))
  scene.add(points)
}

addStars()

const moonGarden = createMoonGarden()
moonWorld.add(moonGarden.group)
moonWorld.add(createClearing())

const residents: Resident[] = []
const localUp = new THREE.Vector3(0, 1, 0)

function createResident(record: ResidentRecord, faceCanvas: HTMLCanvasElement) {
  const { style } = record
  const faceTexture = new THREE.CanvasTexture(faceCanvas)
  faceTexture.colorSpace = THREE.SRGBColorSpace
  faceTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
  const root = new THREE.Group()
  root.name = record.name
  root.scale.setScalar(0.62)

  const { head, leftArm, rightArm, leftLeg, rightLeg, wings } = createCharacterBody(style, root)
  head.add(createPortrait(faceTexture))

  const vest = createRareVest()
  root.add(vest)
  const resident: Resident = {
    ...record,
    faceTexture,
    faceCanvas,
    refreshFaceTexture: () => {
      faceTexture.needsUpdate = true
    },
    meetingTarget: null,
    dragging: false,
    heading: new THREE.Vector3(-Math.sin(record.angle), 0, Math.cos(record.angle)),
    fallenUntil: 0,
    collisionCooldown: performance.now() + 3500,
    fallTilt: 0,
    walking: false,
    vest,
    wings,
    root,
    head,
    greetingUntil: performance.now() + 3200,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    speed: 0.12 + (residentTotal % 3) * 0.018,
  }
  moonWorld.add(root)
  residents.push(resident)
  refreshPopulation()
  updateResidentPosition(resident)
  return resident
}

function refreshPopulation() {
  const { counts } = updateRareVests(residents)
  residentTotal = residents.length
  for (const style of characterStyles) {
    document.querySelector<HTMLElement>(`[data-population="${style}"]`)!.textContent = `${counts[style]}명`
  }
  residentCount.querySelector('span')!.textContent = `입주민 ${residentTotal}명`
  residentCount.title = characterStyles.map((style) => `${characterNames[style]} ${counts[style]}명`).join(' · ')
  interactions?.refresh()
  admin?.refresh()
}

function updateResidentPosition(resident: Resident) {
  const normal = new THREE.Vector3(
    Math.cos(resident.latitude) * Math.cos(resident.angle),
    Math.sin(resident.latitude),
    Math.cos(resident.latitude) * Math.sin(resident.angle),
  ).normalize()
  resident.root.position.copy(normal).multiplyScalar(moonSurfaceRadius(normal) + 0.025)
  resident.root.quaternion.setFromUnitVectors(localUp, normal)
  const greeting = performance.now() < resident.greetingUntil
  const forward = resident.meetingTarget && !resident.walking
    ? CLEARING_NORMAL.clone().projectOnPlane(normal)
    : greeting
    ? camera.position.clone().sub(resident.root.position).projectOnPlane(normal)
    : resident.heading.clone()
  forward.applyQuaternion(resident.root.quaternion.clone().invert())
  resident.root.rotateY(Math.atan2(forward.x, forward.z))
  resident.root.rotateX(resident.fallTilt)
  resident.root.position.addScaledVector(normal, Math.sin(resident.fallTilt) * .10)
  // The body follows the path; the head turns toward the visitor when possible.
  const viewer = camera.position.clone().sub(resident.root.position)
    .applyQuaternion(resident.root.quaternion.clone().invert())
  resident.head.rotation.y = THREE.MathUtils.clamp(Math.atan2(viewer.x, viewer.z), -1.1, 1.1)
  resident.head.rotation.x = -THREE.MathUtils.clamp(Math.atan2(viewer.y, Math.hypot(viewer.x, viewer.z)), -.45, 1.15)
  if (resident.fallTilt > .1) resident.head.rotation.set(0, 0, 0)
}

async function startCamera() {
  const session = ++cameraSession
  captureButton.disabled = true
  cameraPlaceholder.hidden = false
  cameraPlaceholder.querySelector('b')!.textContent = '카메라를 준비하고 있어요'
  cameraPlaceholder.querySelector('small')!.textContent = '브라우저에서 카메라 사용을 허용해 주세요.'
  cameraMessage.textContent = '카메라 권한을 확인하고 있어요.'
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('HTTPS 접속과 카메라 권한을 확인해 주세요.')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } },
    })
    if (session !== cameraSession || !dialog.open) { stream.getTracks().forEach((track) => track.stop()); return }
    cameraStream = stream
    video.srcObject = stream
    await video.play()
    if (session !== cameraSession || !dialog.open) return
    cameraPlaceholder.hidden = true
    captureButton.disabled = false
    cameraMessage.textContent = '원 안에 얼굴을 맞춰 주세요. 색상·질감·이목구비 보정 없이 촬영해요.'
  } catch (error) {
    if (session !== cameraSession || !dialog.open) return
    cameraPlaceholder.hidden = false
    cameraPlaceholder.querySelector('b')!.textContent = '카메라를 열 수 없어요'
    cameraPlaceholder.querySelector('small')!.textContent = '브라우저와 운영체제의 카메라 권한을 확인해 주세요.'
    cameraMessage.textContent = `${error instanceof Error ? error.message : '카메라 권한이 필요합니다.'} 닫은 뒤 입주하기를 눌러 다시 시도할 수 있어요.`
  }
}

function stopCamera() {
  cameraSession++
  cameraStream?.getTracks().forEach((track) => track.stop())
  cameraStream = null
  video.srcObject = null
  captureButton.disabled = true
}

function closeDialog() {
  stopCamera()
  dialog.close()
}

function showToast(message: string) {
  toast.textContent = message
  toast.classList.add('visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600)
}

moveInButton.addEventListener('click', () => {
  nameInput.value = ''
  dialog.showModal()
  void startCamera()
})

dialogClose.addEventListener('click', closeDialog)
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog()
})
dialog.addEventListener('cancel', () => stopCamera())

document.querySelectorAll<HTMLButtonElement>('.character-option').forEach((option) => {
  option.addEventListener('click', () => {
    selectedCharacter = option.dataset.character as CharacterStyle
    document.querySelectorAll<HTMLButtonElement>('.character-option').forEach((button) => {
      const selected = button === option
      button.classList.toggle('selected', selected)
      button.setAttribute('aria-checked', String(selected))
    })
  })
})

captureButton.addEventListener('click', async () => {
  if (!video.videoWidth || capturing) return
  const name = nameInput.value.trim().slice(0, 16)
  if (!name) { nameInput.setCustomValidity('주민의 이름을 지어 주세요.'); nameInput.reportValidity(); nameInput.focus(); return }
  const session = cameraSession
  const style = selectedCharacter
  capturing = true
  captureButton.disabled = true
  cameraMessage.textContent = '촬영한 사진을 그대로 저장하고 있어요…'
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const preview = video.getBoundingClientRect()
    const guide = dialog.querySelector<HTMLElement>('.face-guide')!.getBoundingClientRect()
    const faceCanvas = captureOriginalFace(video, preview.width, preview.height, guide.width)
    const portrait = await canvasToBlob(faceCanvas)
    if (session !== cameraSession || !dialog.open) return
    const direction = camera.position.clone().normalize()
    createResident({
      id: crypto.randomUUID(), name, style, portrait, originalPortrait: portrait, depth: [],
      angle: Math.atan2(direction.z, direction.x) + (residentTotal % 3 - 1) * .14,
      latitude: THREE.MathUtils.clamp(Math.asin(direction.y) + .4, -1.15, 1.15),
    }, faceCanvas)
    residentCount.classList.add('pop')
    window.setTimeout(() => residentCount.classList.remove('pop'), 550)
    closeDialog()
    await persistResidents()
    showToast(`${name}님이 입주했어요. 클릭해서 이야기를 나눠 보세요!`)
  } catch (error) {
    if (session === cameraSession && dialog.open) cameraMessage.textContent = error instanceof Error ? error.message : '촬영을 다시 시도해 주세요.'
  } finally {
    capturing = false
    if (dialog.open && session === cameraSession) captureButton.disabled = false
  }
})
nameInput.addEventListener('input', () => nameInput.setCustomValidity(''))

async function persistResidents() {
  if (!storageReady) throw new Error('저장 공간을 사용할 수 없어요.')
  const revision = ++saveRevision
  saveStatus.textContent = '저장 중…'
  try {
    await saveResidents(residents.map(residentRecord))
    if (revision === saveRevision) saveStatus.textContent = '이 브라우저에 저장됨'
  } catch (error) {
    saveStatus.textContent = '저장 실패 · 브라우저 저장 공간을 확인해 주세요'
    showToast('저장하지 못했어요. 이 창을 닫기 전에 저장 공간을 확인해 주세요.')
    throw error
  }
}

function dismissResident(resident: Resident) {
  const index = residents.indexOf(resident)
  if (index < 0) return
  residents.splice(index, 1)
  moonWorld.remove(resident.root)
  resident.meetingTarget = null
  dismissedResident = resident
  undoDismiss.hidden = false
  refreshPopulation()
  void persistResidents().catch(() => {})
  showToast(`${resident.name}님이 방출됐어요. ‘방출 되돌리기’로 다시 데려올 수 있어요.`)
}

undoDismiss.addEventListener('click', () => {
  if (!dismissedResident) return
  const resident = dismissedResident
  dismissedResident = null
  resident.angle = Math.atan2(CLEARING_NORMAL.z, CLEARING_NORMAL.x)
  resident.latitude = Math.asin(CLEARING_NORMAL.y)
  resident.dragging = false
  residents.push(resident)
  moonWorld.add(resident.root)
  updateResidentPosition(resident)
  refreshPopulation()
  undoDismiss.hidden = true
  void persistResidents().catch(() => {})
  showToast(`${resident.name}님이 돌아왔어요.`)
})

interactions = createInteractions({ renderer, camera, controls, moon, world: moonWorld, residents,
  updatePosition: updateResidentPosition, save: persistResidents, remove: dismissResident, notify: showToast })

admin = createResidentAdmin({ residents, notify: showToast, remove: async (ids) => {
  if (!storageReady || deletingResidents) throw new Error('삭제할 수 없는 상태입니다.')
  deletingResidents = true
  interactions?.cancelPointer()
  const previous = [...residents]
  const targets = new Set(ids)
  const removed = residents.filter((resident) => targets.has(resident.id))
  residents.splice(0, residents.length, ...residents.filter((resident) => !targets.has(resident.id)))
  removed.forEach((resident) => moonWorld.remove(resident.root))
  refreshPopulation()
  try {
    // Persist one atomic snapshot. Pause background snapshots while pending so
    // a failed delete can roll back without a queued save deleting it again.
    await persistResidents()
    removed.forEach((resident) => {
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      function release(node: THREE.Object3D) {
        // Vest resources are shared across residents; leave those intact.
        if (node === resident.vest) return
        if (node instanceof THREE.Mesh) {
          geometries.add(node.geometry)
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material)
        }
        node.children.forEach(release)
      }
      release(resident.root)
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      resident.faceTexture.dispose()
    })
  } catch (error) {
    residents.splice(0, residents.length, ...previous)
    removed.forEach((resident) => moonWorld.add(resident.root))
    refreshPopulation()
    throw error
  } finally { deletingResidents = false }
} })

async function restoreResidents() {
  try {
    const records = await loadResidents()
    let unreadable = 0
    for (const record of records) {
      try { createResident(record, await blobToCanvas(record.portrait)) }
      catch { unreadable++ }
    }
    storageReady = unreadable === 0
    saveStatus.textContent = storageReady ? '이 브라우저에 자동 저장' : '일부 사진 복원 실패 · 원본 보호를 위해 저장 중지'
    if (records.length) showToast(`${residents.length}명의 주민을 다시 불러왔어요.`)
  } catch {
    saveStatus.textContent = '저장 공간을 열지 못했어요 · 새로고침해 주세요'
    showToast('브라우저에서 이 사이트의 저장 공간을 허용해 주세요.')
  } finally {
    moveInButton.disabled = !storageReady
    document.querySelector<HTMLButtonElement>('#adminSettings')!.disabled = !storageReady
    refreshPopulation()
  }
}
void restoreResidents()
window.setInterval(() => {
  if (storageReady && !deletingResidents && !residents.some((resident) => resident.dragging)) void persistResidents().catch(() => {})
}, 15000)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { interactions?.cancelPointer(); if (storageReady && !deletingResidents) void persistResidents().catch(() => {}) }
})
window.addEventListener('pagehide', () => { stopCamera(); if (storageReady && !deletingResidents) void persistResidents().catch(() => {}) })

function activateTab(button: HTMLButtonElement) {
  document.querySelectorAll<HTMLButtonElement>('.example-tab').forEach((tab) => {
    const active = tab === button
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', String(active))
  })
  const isMoon = button.dataset.tab === 'moon-forest'
  moonPanel.classList.toggle('active', isMoon)
  emptyPanel.hidden = isMoon
  if (!isMoon) emptyTitle.textContent = button.textContent?.trim() || '새 예제'
}

tabs.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.example-tab')
  if (button) activateTab(button)
})

addTabButton.addEventListener('click', () => {
  newTabTotal += 1
  const button = document.createElement('button')
  button.className = 'example-tab'
  button.type = 'button'
  button.role = 'tab'
  button.dataset.tab = `new-example-${newTabTotal}`
  button.setAttribute('aria-selected', 'false')
  button.innerHTML = `<span aria-hidden="true">✦</span> 새 예제 ${newTabTotal + 1}`
  tabs.insertBefore(button, addTabButton)
  activateTab(button)
  showToast('새 예제 탭을 만들었어요.')
})

function resize() {
  const width = sceneHost.clientWidth
  const height = sceneHost.clientHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / Math.max(height, 1)
  const fitDistance = 3.6 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect))
  controls.maxDistance = Math.max(11, fitDistance * 1.25)
  if (!interactions?.active) camera.position.setLength(fitDistance)
  camera.updateProjectionMatrix()
}

const resizeObserver = new ResizeObserver(resize)
resizeObserver.observe(sceneHost)

let previousTime = performance.now()
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function animate(time: number) {
  const delta = Math.min((time - previousTime) / 1000, 0.05)
  previousTime = time
  if (!interactions?.active) controls.update()
  moonGarden.update(time)
  stepResidentMotion(residents, time, delta)
  residents.forEach((resident, index) => {
    if (resident.dragging) return
    const walking = resident.walking
    updateResidentPosition(resident)
    const stride = walking ? Math.sin(time * 0.006 + index * 1.7) * 0.55 : 0
    resident.leftArm.rotation.x = stride
    resident.rightArm.rotation.x = -stride
    resident.leftLeg.rotation.x = -stride * 0.72
    resident.rightLeg.rotation.x = stride * 0.72
    resident.leftArm.rotation.z = -Math.sin(resident.fallTilt) * .65
    resident.rightArm.rotation.z = Math.sin(resident.fallTilt) * .65
    resident.wings.forEach((wing, wingIndex) => {
      wing.rotation.y = (wingIndex === 0 ? -1 : 1) * (.18 + (reducedMotion ? 0 : Math.sin(time * .012 + index) * .22))
    })
    if (walking) resident.root.position.addScaledVector(resident.root.position.clone().normalize(), Math.abs(Math.sin(time * 0.006 + index)) * 0.018)
  })
  interactions?.update(delta)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

resize()
requestAnimationFrame(animate)
