import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { keySamplerMarkup, setupKeySampler } from './keySampler'
import './style.css'

type Phase = 'ready' | 'lowering' | 'closing' | 'lifting' | 'delivering' | 'opening' | 'dropping' | 'failed' | 'resetting'
type ToyKind = 'bear' | 'rabbit' | 'cat' | 'duck' | 'dino'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="week-layout">
    <nav class="experiment-tabs" role="tablist" aria-label="2주차 인터랙션 목록">
      <a class="home-logo" href="${import.meta.env.BASE_URL}" aria-label="홈으로 이동" title="홈으로 이동">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v8.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-8.6Z"/><path d="M9.2 21v-6.8h5.6V21"/></svg>
      </a>
      <span class="week-label">WEEK 02</span>
      <button class="experiment-tab active" id="clawTab" role="tab" aria-selected="true" aria-controls="clawPanel" data-tab="claw">
        <span>01</span> 3D 인형뽑기
      </button>
      <button class="experiment-tab" id="samplerTab" role="tab" aria-selected="false" aria-controls="samplerPanel" data-tab="sampler" tabindex="-1">
        <span>02</span> key sampler
      </button>
    </nav>
    <section class="tab-panel" id="clawPanel" role="tabpanel" aria-labelledby="clawTab">
    <main class="game-shell">
    <canvas id="game" aria-label="3차원 인형뽑기 게임"></canvas>
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span><span>LUCKY<br><b>CLAW</b></span></div>
      <div class="status" aria-live="polite"><i></i><span id="statusText">집게를 움직여 인형을 노려보세요</span></div>
      <div class="prize-count"><span>GET</span><strong id="score">0</strong></div>
    </div>
    <section class="guide">
      <p class="eyebrow">HOW TO PLAY</p>
      <h1>잡고 싶은 인형 위로<br>집게를 움직여 보세요.</h1>
      <div class="key-guide">
        <div class="arrow-keys" aria-hidden="true">
          <span></span><kbd>↑</kbd><span></span><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
        </div>
        <p><b>방향키</b><br>앞 · 뒤 · 좌 · 우 이동</p>
      </div>
      <div class="space-guide"><kbd>SPACE</kbd><p><b>집게 내리기</b><br>한 번 누르면 자동으로 움직여요</p></div>
      <p class="tip">마우스를 드래그하면 시점을 돌릴 수 있어요.<br>가운데를 정확히 노릴수록 잘 잡혀요.</p>
    </section>
    <section class="mobile-controls" aria-label="집게 조작 버튼">
      <div class="dpad">
        <button data-key="ArrowUp" aria-label="뒤로 이동">↑</button>
        <button data-key="ArrowLeft" aria-label="왼쪽 이동">←</button>
        <button data-key="ArrowDown" aria-label="앞으로 이동">↓</button>
        <button data-key="ArrowRight" aria-label="오른쪽 이동">→</button>
      </div>
      <button class="drop-button" id="dropButton"><span>DROP</span><small>SPACE</small></button>
    </section>
    <div class="toast" id="toast"><span>★</span><b id="toastTitle">NICE CATCH!</b><small id="toastCopy">인형이 출구로 나왔어요</small></div>
    <div class="loading" id="loading"><div></div><span>기계 전원 켜는 중</span></div>
    </main>
    </section>
    <section class="tab-panel sampler-panel" id="samplerPanel" role="tabpanel" aria-labelledby="samplerTab" hidden>
      ${keySamplerMarkup}
    </section>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const statusText = document.querySelector<HTMLSpanElement>('#statusText')!
const statusWrap = document.querySelector<HTMLDivElement>('.status')!
const scoreEl = document.querySelector<HTMLElement>('#score')!
const dropButton = document.querySelector<HTMLButtonElement>('#dropButton')!
const toast = document.querySelector<HTMLDivElement>('#toast')!
const toastTitle = document.querySelector<HTMLElement>('#toastTitle')!
const toastCopy = document.querySelector<HTMLElement>('#toastCopy')!
const clawPanel = document.querySelector<HTMLElement>('#clawPanel')!
const samplerPanel = document.querySelector<HTMLElement>('#samplerPanel')!
const tabButtons = [...document.querySelectorAll<HTMLButtonElement>('.experiment-tab')]
const keySampler = setupKeySampler(samplerPanel)
let isClawVisible = true

const scene = new THREE.Scene()
scene.background = new THREE.Color('#f1eee9')
scene.fog = new THREE.Fog('#f1eee9', 17, 28)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.12

const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100)
camera.position.set(8.5, 6.2, 11.5)
camera.lookAt(0, 2.65, 0)
const viewControls = new OrbitControls(camera, canvas)
viewControls.target.set(.5, 2.7, 0)
viewControls.enableDamping = true
viewControls.dampingFactor = .075
viewControls.enablePan = false
viewControls.rotateSpeed = .55
viewControls.zoomSpeed = .7
viewControls.minDistance = 10.5
viewControls.maxDistance = 18
viewControls.minPolarAngle = .85
viewControls.maxPolarAngle = 1.42
viewControls.minAzimuthAngle = -1.05
viewControls.maxAzimuthAngle = 1.05
viewControls.update()

scene.add(new THREE.HemisphereLight('#fff7ed', '#826f68', 2.5))
const keyLight = new THREE.DirectionalLight('#fff5e2', 4.5)
keyLight.position.set(3, 10, 7)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
keyLight.shadow.camera.left = -7
keyLight.shadow.camera.right = 7
keyLight.shadow.camera.top = 8
keyLight.shadow.camera.bottom = -3
scene.add(keyLight)
const rimLight = new THREE.PointLight('#ff4c72', 22, 10)
rimLight.position.set(-4, 4, -3)
scene.add(rimLight)

const metal = new THREE.MeshStandardMaterial({ color: '#ded8d2', metalness: .8, roughness: .22 })
const darkMetal = new THREE.MeshStandardMaterial({ color: '#343036', metalness: .88, roughness: .23 })
const pink = new THREE.MeshPhysicalMaterial({ color: '#ef315f', metalness: .22, roughness: .25, clearcoat: 1, clearcoatRoughness: .13 })
const palePink = new THREE.MeshPhysicalMaterial({ color: '#ff8da6', roughness: .3, clearcoat: .8 })
const cream = new THREE.MeshStandardMaterial({ color: '#f7efe7', roughness: .48 })
const black = new THREE.MeshStandardMaterial({ color: '#17141a', roughness: .38 })
const glass = new THREE.MeshPhysicalMaterial({ color: '#d9f3f3', transparent: true, opacity: .14, roughness: .06, transmission: .32, thickness: .1, side: THREE.DoubleSide, depthWrite: false })

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], cast = true) {
  const item = new THREE.Mesh(geometry, material)
  item.position.set(...position)
  item.castShadow = cast
  item.receiveShadow = true
  return item
}

function box(size: [number, number, number], material: THREE.Material, position: [number, number, number], cast = true) {
  return mesh(new THREE.BoxGeometry(...size), material, position, cast)
}

function cylinder(radius: number, height: number, material: THREE.Material, position: [number, number, number], radial = 24) {
  return mesh(new THREE.CylinderGeometry(radius, radius, height, radial), material, position)
}

function makeTextTexture(top: string, bottom: string) {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 256
  const ctx = c.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 1024, 256)
  gradient.addColorStop(0, '#ef315f'); gradient.addColorStop(1, '#ff6e8c')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, c.width, c.height)
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff9ef'
  ctx.font = '900 104px Arial'; ctx.fillText(top, 512, 117)
  ctx.font = '700 32px Arial'; ctx.letterSpacing = '13px'; ctx.fillText(bottom, 512, 191)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const machine = new THREE.Group()
machine.position.x = .8
scene.add(machine)
machine.add(box([6.2, .7, 5], pink, [0, .35, 0]))
machine.add(box([6.05, .18, 4.85], cream, [0, .78, 0]))
machine.add(box([6.2, .35, 5], pink, [0, 6.05, 0]))
machine.add(box([6.35, .72, 5.15], new THREE.MeshBasicMaterial({ map: makeTextTexture('LUCKY CLAW', 'PRIZE EVERY DAY') }), [0, 6.55, 0]))
machine.add(box([6.18, .14, 5.02], palePink, [0, 6.98, 0]))

const posts: [number, number][] = [[-2.98, -2.38], [2.98, -2.38], [-2.98, 2.38], [2.98, 2.38]]
posts.forEach(([x, z]) => machine.add(box([.22, 5.3, .22], pink, [x, 3.42, z])))
machine.add(box([6.15, .18, .2], pink, [0, 5.95, 2.38]))
machine.add(box([6.15, .18, .2], pink, [0, 5.95, -2.38]))
machine.add(box([.2, .18, 4.7], pink, [-2.98, 5.95, 0]))
machine.add(box([.2, .18, 4.7], pink, [2.98, 5.95, 0]))
machine.add(box([5.7, 5, .035], glass, [0, 3.35, -2.39], false))
machine.add(box([.035, 5, 4.5], glass, [-2.99, 3.35, 0], false))
machine.add(box([.035, 5, 4.5], glass, [2.99, 3.35, 0], false))
machine.add(box([1.55, 5, .025], glass, [-2.08, 3.35, 2.39], false))
machine.add(box([3.6, 5, .025], glass, [1.15, 3.35, 2.39], false))

const chute = new THREE.Group()
chute.position.set(-1.75, .78, 2.5)
machine.add(chute)
chute.add(box([1.85, 1.25, .55], black, [0, .45, .12]))
chute.add(box([1.55, .7, .08], darkMetal, [0, .45, .43]))
const flap = box([1.3, .5, .06], darkMetal, [0, .43, .49])
flap.geometry.translate(0, -.25, 0)
chute.add(flap)
chute.add(box([1.55, .2, .08], palePink, [0, 1.16, .43]))
machine.add(box([1.75, .16, 1.35], darkMetal, [-1.75, .92, 1.55]))
machine.add(box([1.42, .04, 1.05], black, [-1.75, 1.02, 1.5]))

machine.add(box([5.45, .14, .18], darkMetal, [0, 5.55, -1.75]))
machine.add(box([5.45, .14, .18], darkMetal, [0, 5.55, 1.75]))
const bridge = new THREE.Group()
bridge.position.set(.6, 5.5, 0)
machine.add(bridge)
bridge.add(box([.28, .2, 3.7], metal, [0, 0, 0]))
bridge.add(cylinder(.15, .32, darkMetal, [0, .15, -1.75]))
bridge.add(cylinder(.15, .32, darkMetal, [0, .15, 1.75]))

const carriage = new THREE.Group()
bridge.add(carriage)
carriage.add(box([.62, .28, .62], pink, [0, .02, 0]))
const cable = cylinder(.035, 1, darkMetal, [0, -.5, 0], 12)
carriage.add(cable)
const claw = new THREE.Group()
claw.position.y = -1
carriage.add(claw)
claw.add(cylinder(.25, .28, metal, [0, 0, 0]))
claw.add(cylinder(.15, .18, pink, [0, -.2, 0]))

const fingers: THREE.Group[] = []
for (let i = 0; i < 3; i++) {
  const pivot = new THREE.Group()
  pivot.rotation.y = i * Math.PI * 2 / 3
  claw.add(pivot)
  const finger = new THREE.Group()
  finger.position.set(0, -.14, 0)
  pivot.add(finger)
  const upper = cylinder(.045, .72, metal, [0, -.34, 0])
  upper.rotation.z = -.48
  upper.position.x = .16
  finger.add(upper)
  const tip = cylinder(.055, .48, metal, [.39, -.72, 0])
  tip.rotation.z = .7
  finger.add(tip)
  finger.add(mesh(new THREE.SphereGeometry(.09, 16, 12), pink, [.54, -.55, 0]))
  fingers.push(finger)
}

interface Toy { group: THREE.Group; name: string; kind: ToyKind; caught: boolean }
const toys: Toy[] = []
const eyeMat = new THREE.MeshStandardMaterial({ color: '#211a20', roughness: .35 })

function sphere(r: number, mat: THREE.Material, p: [number, number, number], scale?: [number, number, number]) {
  const item = mesh(new THREE.SphereGeometry(r, 28, 20), mat, p)
  if (scale) item.scale.set(...scale)
  return item
}

function addFace(group: THREE.Group, y: number, z: number, spacing = .13) {
  group.add(sphere(.055, eyeMat, [-spacing, y, z]))
  group.add(sphere(.055, eyeMat, [spacing, y, z]))
  group.add(sphere(.055, eyeMat, [0, y - .12, z + .015], [1, .72, .5]))
}

function createToy(kind: ToyKind, color: string, accent: string, name: string, x: number, z: number, rot = 0) {
  const g = new THREE.Group()
  const fabric = new THREE.MeshStandardMaterial({ color, roughness: .92 })
  const detail = new THREE.MeshStandardMaterial({ color: accent, roughness: .87 })
  g.add(sphere(.38, fabric, [0, .43, 0], [.92, 1.15, .76]))
  if (kind === 'duck') {
    g.add(sphere(.32, fabric, [0, .92, .02], [1, .95, .9]))
    g.add(sphere(.16, detail, [0, .82, .31], [1.25, .45, .8]))
    g.add(sphere(.14, fabric, [-.39, .48, 0], [.5, 1, .7]), sphere(.14, fabric, [.39, .48, 0], [.5, 1, .7]))
    addFace(g, .98, .29, .12)
  } else if (kind === 'dino') {
    g.add(sphere(.3, fabric, [0, .93, .03], [1, 1.05, .92]))
    g.add(sphere(.16, fabric, [.24, .94, .19], [1.1, .75, .8]))
    for (let i = 0; i < 4; i++) {
      const spike = mesh(new THREE.ConeGeometry(.1, .2, 12), detail, [0, .68 + i * .16, -.28])
      spike.rotation.x = -.35; g.add(spike)
    }
    const tail = mesh(new THREE.ConeGeometry(.13, .65, 18), fabric, [0, .42, -.5]); tail.rotation.x = -1.15; g.add(tail)
    addFace(g, 1, .28, .11)
  } else {
    g.add(sphere(.31, fabric, [0, .95, .015], [1, .95, .9]))
    if (kind === 'rabbit') {
      g.add(sphere(.17, fabric, [-.15, 1.4, 0], [.55, 1.65, .55]), sphere(.17, fabric, [.15, 1.4, 0], [.55, 1.65, .55]))
      g.add(sphere(.09, detail, [-.15, 1.42, .1], [.45, 1.35, .3]), sphere(.09, detail, [.15, 1.42, .1], [.45, 1.35, .3]))
    } else if (kind === 'cat') {
      const ear1 = mesh(new THREE.ConeGeometry(.16, .3, 3), fabric, [-.19, 1.24, 0]); ear1.rotation.z = -.08
      const ear2 = mesh(new THREE.ConeGeometry(.16, .3, 3), fabric, [.19, 1.24, 0]); ear2.rotation.z = .08
      g.add(ear1, ear2)
    } else {
      g.add(sphere(.16, fabric, [-.25, 1.17, 0], [1, .9, .65]), sphere(.16, fabric, [.25, 1.17, 0], [1, .9, .65]))
      g.add(sphere(.11, detail, [0, .89, .27], [1.15, .8, .55]))
    }
    g.add(sphere(.12, fabric, [-.35, .32, .05], [.72, 1.2, .7]), sphere(.12, fabric, [.35, .32, .05], [.72, 1.2, .7]))
    addFace(g, 1, .285, .12)
  }
  g.add(sphere(.15, fabric, [-.2, .1, .02], [.85, .6, 1]), sphere(.15, fabric, [.2, .1, .02], [.85, .6, 1]))
  g.position.set(x, 1.03, z)
  g.rotation.y = rot
  g.rotation.z = (Math.random() - .5) * .15
  machine.add(g)
  toys.push({ group: g, name, kind, caught: false })
}

createToy('bear', '#b88666', '#edd4ba', '밀크티 베어', -2.25, -.8, .2)
createToy('rabbit', '#f2e8e4', '#ff92ad', '솜사탕 토끼', -1.2, -.9, -.25)
createToy('cat', '#7f78b7', '#f5d6df', '라벤더 고양이', -.15, -1.15, .15)
createToy('duck', '#f1c847', '#ef743f', '레몬 오리', 1.1, -.9, -.1)
createToy('dino', '#75b995', '#f0c95f', '민트 공룡', 2.15, -.65, -.35)
createToy('cat', '#e88a8c', '#f8e1cb', '코랄 고양이', -2.35, .35, -.15)
createToy('bear', '#7195bd', '#e9d6c4', '블루 베어', -1.05, .45, .35)
createToy('dino', '#a6ca61', '#f3a45d', '라임 공룡', .2, .25, -.1)
createToy('rabbit', '#dda9c7', '#fff0f2', '베리 토끼', 1.4, .4, .2)
createToy('duck', '#f5d668', '#f09058', '허니 오리', 2.25, .65, -.2)
createToy('bear', '#cf9d73', '#f1dfcc', '쿠키 베어', .75, 1.25, .1)

const floor = mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#f1eee9', roughness: .9 }), [0, 0, 0], false)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)
const shadowDisc = mesh(new THREE.CircleGeometry(4.7, 48), new THREE.MeshBasicMaterial({ color: '#d7d0ca', transparent: true, opacity: .28, depthWrite: false }), [1, .01, .25], false)
shadowDisc.rotation.x = -Math.PI / 2
scene.add(shadowDisc)

let phase: Phase = 'ready'
let phaseTime = 0
let score = 0
let carried: Toy | null = null
let unstable = false
let unstableDropAt = 0
let failureStartHeight = 0
let failureStartX = 0
let failureStartZ = 0
const releaseVelocity = new THREE.Vector3()
let clawHeight = 0
const keys = new Set<string>()
let lastFrame = performance.now()
let elapsed = 0
const outlet = new THREE.Vector2(-1.75, 1.48)
const attemptPosition = new THREE.Vector2(bridge.position.x, carriage.position.z)
const temp = new THREE.Vector3()
const dropDepth = 2.58

const phaseCopy: Record<Phase, string> = {
  ready: '집게를 움직여 인형을 노려보세요', lowering: '집게가 내려가고 있어요', closing: '인형을 잡는 중…', lifting: '조심조심 들어 올리는 중…', delivering: '출구로 옮기는 중…', opening: '집게를 펼치는 중…', dropping: '인형이 출구로 나오고 있어요!', failed: '아쉽게 놓쳤어요. 바로 다시 도전!', resetting: '다음 게임을 준비하고 있어요',
}

function setPhase(next: Phase) {
  phase = next; phaseTime = 0
  statusText.textContent = phaseCopy[next]
  const busy = next !== 'ready'
  statusWrap.classList.toggle('busy', busy)
  dropButton.disabled = busy
  document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => button.disabled = busy)
  if (next === 'ready') keys.clear()
}

let audioCtx: AudioContext | null = null
function sound(type: 'move' | 'drop' | 'clamp' | 'win' | 'miss') {
  try {
    audioCtx ??= new AudioContext()
    const now = audioCtx.currentTime
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    const frequencies = { move: 180, drop: 110, clamp: 260, win: 520, miss: 100 }
    osc.frequency.setValueAtTime(frequencies[type], now)
    if (type === 'win') osc.frequency.exponentialRampToValueAtTime(900, now + .35)
    if (type === 'drop') osc.frequency.exponentialRampToValueAtTime(65, now + .35)
    gain.gain.setValueAtTime(.035, now); gain.gain.exponentialRampToValueAtTime(.001, now + (type === 'move' ? .08 : .4))
    osc.start(now); osc.stop(now + (type === 'move' ? .09 : .42))
  } catch { /* Audio is a progressive enhancement. */ }
}

function tryDrop() {
  if (phase !== 'ready') return
  attemptPosition.set(bridge.position.x, carriage.position.z)
  keys.clear(); setPhase('lowering'); sound('drop')
}

function nearestToy(): { toy: Toy | null; distance: number } {
  let result: Toy | null = null; let distance = Infinity
  const clawX = bridge.position.x
  const clawZ = carriage.position.z
  toys.forEach((toy) => {
    if (toy.caught || toy.group.parent !== machine) return
    const d = Math.hypot(toy.group.position.x - clawX, toy.group.position.z - clawZ)
    if (d < distance) { distance = d; result = toy }
  })
  return { toy: result, distance }
}

function closeClaw() {
  const target = nearestToy()
  if (target.toy && target.distance < .62) {
    const accuracy = 1 - target.distance / .62
    if (Math.random() < .28 + accuracy * .72) {
      target.toy.caught = true
      carried = target.toy
      unstable = accuracy < .62 || Math.random() > .82
      unstableDropAt = 1 + Math.random() * 2.5
    }
  }
  sound('clamp')
}

function releaseToy(success: boolean) {
  if (!carried) return
  const worldPos = carried.group.getWorldPosition(temp)
  scene.attach(carried.group)
  carried.group.position.copy(worldPos)
  releaseVelocity.set((Math.random() - .5) * .3, success ? -.15 : -.3, success ? .38 : (Math.random() - .5) * .2)
  if (!success) carried.caught = false
}

function showToast(success: boolean) {
  if (success && carried) { score += 1; scoreEl.textContent = String(score); toastCopy.textContent = `${carried.name} 획득!`; toastTitle.textContent = 'NICE CATCH!'; sound('win') }
  else { toastTitle.textContent = 'SO CLOSE!'; toastCopy.textContent = '조금 더 가운데를 노려보세요'; sound('miss') }
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), success ? 2200 : 1800)
}

function failAttempt() {
  if (phase === 'failed') return
  failureStartHeight = clawHeight
  failureStartX = bridge.position.x
  failureStartZ = carriage.position.z
  if (carried) {
    releaseToy(false)
    carried = null
  }
  showToast(false)
  setPhase('failed')
}

function ease(t: number) { return t * t * (3 - 2 * t) }

function updateGame(dt: number) {
  phaseTime += dt
  if (phase === 'ready') {
    let dx = 0; let dz = 0
    if (keys.has('ArrowLeft')) dx -= 1
    if (keys.has('ArrowRight')) dx += 1
    if (keys.has('ArrowUp')) dz -= 1
    if (keys.has('ArrowDown')) dz += 1
    if (dx || dz) {
      const length = Math.hypot(dx, dz)
      bridge.position.x = THREE.MathUtils.clamp(bridge.position.x + dx / length * dt * 1.75, -2.3, 2.3)
      carriage.position.z = THREE.MathUtils.clamp(carriage.position.z + dz / length * dt * 1.75, -1.62, 1.62)
      if (phaseTime > .12) { sound('move'); phaseTime = 0 }
    }
  } else if (phase === 'lowering') {
    const t = Math.min(phaseTime / 1.45, 1)
    clawHeight = ease(t) * dropDepth
    if (t >= 1) { setPhase('closing'); closeClaw() }
  } else if (phase === 'closing') {
    const t = Math.min(phaseTime / .75, 1)
    fingers.forEach((f) => f.rotation.z = ease(t) * .52)
    if (carried) {
      const world = claw.getWorldPosition(temp)
      carried.group.position.lerp(new THREE.Vector3(world.x - machine.position.x, world.y - .84, world.z), Math.min(dt * 5, 1))
    }
    if (t >= 1) {
      if (carried) setPhase('lifting')
      else failAttempt()
    }
  } else if (phase === 'lifting') {
    const t = Math.min(phaseTime / 1.65, 1)
    clawHeight = (1 - ease(t)) * dropDepth
    if (carried && carried.group.parent === machine) {
      const world = claw.getWorldPosition(temp)
      carried.group.position.set(world.x - machine.position.x, world.y - .84, world.z)
      carried.group.rotation.y += dt * .7
      carried.group.rotation.z = Math.sin(phaseTime * 6) * .07
      if (unstable && phaseTime > unstableDropAt) failAttempt()
    }
    if (phase === 'lifting' && t >= 1) setPhase('delivering')
  } else if (phase === 'delivering') {
    const t = Math.min(phaseTime / 1.9, 1)
    bridge.position.x = THREE.MathUtils.lerp(bridge.position.x, outlet.x, Math.min(dt * 2.8, 1))
    carriage.position.z = THREE.MathUtils.lerp(carriage.position.z, outlet.y, Math.min(dt * 2.8, 1))
    if (carried && carried.group.parent === machine) {
      const world = claw.getWorldPosition(temp)
      carried.group.position.set(world.x - machine.position.x, world.y - .84, world.z)
      carried.group.rotation.z = Math.sin(phaseTime * 7) * .055
      if (unstable && phaseTime + 1.65 > unstableDropAt && phaseTime > .55) failAttempt()
    }
    if (phase === 'delivering' && t >= 1) setPhase('opening')
  } else if (phase === 'opening') {
    const t = Math.min(phaseTime / .6, 1)
    fingers.forEach((f) => f.rotation.z = (1 - ease(t)) * .52)
    if (phaseTime >= .18 && carried?.group.parent === machine) { releaseToy(true); setPhase('dropping') }
    else if (t >= 1 && !carried) failAttempt()
  } else if (phase === 'dropping') {
    if (carried) {
      releaseVelocity.y -= 6.5 * dt
      carried.group.position.addScaledVector(releaseVelocity, dt)
      carried.group.rotation.x += dt * 1.5
      if (carried.group.position.y < .52) {
        carried.group.position.y = .52
        releaseVelocity.y = Math.abs(releaseVelocity.y) * .2
        releaseVelocity.z = 1.45
        flap.rotation.x = -.55
      }
      if (phaseTime > .85) {
        carried.group.position.z += dt * 1.5
        carried.group.position.y = Math.max(.3, carried.group.position.y - dt * .45)
      }
      if (phaseTime > 1.6) { showToast(true); setPhase('resetting') }
    }
  } else if (phase === 'failed') {
    const t = Math.min(phaseTime / .72, 1)
    clawHeight = THREE.MathUtils.lerp(failureStartHeight, 0, ease(t))
    bridge.position.x = THREE.MathUtils.lerp(failureStartX, attemptPosition.x, ease(t))
    carriage.position.z = THREE.MathUtils.lerp(failureStartZ, attemptPosition.y, ease(t))
    fingers.forEach((finger) => finger.rotation.z = (1 - ease(t)) * .52)
    if (t >= 1) setPhase('ready')
  } else if (phase === 'resetting') {
    flap.rotation.x = THREE.MathUtils.lerp(flap.rotation.x, 0, dt * 4)
    if (phaseTime > 1.3) {
      if (carried) {
        scene.remove(carried.group)
        const index = toys.indexOf(carried)
        if (index >= 0) toys.splice(index, 1)
        carried = null
      }
      setPhase('ready')
    }
  }

  claw.position.y = -1 - clawHeight
  cable.scale.y = 1 + clawHeight
  cable.position.y = -.5 - clawHeight / 2

  toys.forEach((toy) => {
    if (toy.group.parent === scene && toy !== carried) {
      toy.group.position.y = Math.max(1.03, toy.group.position.y - dt * 3)
      if (toy.group.position.y <= 1.031) {
        machine.attach(toy.group)
        toy.group.position.y = 1.03
      }
    }
  })
}

window.addEventListener('keydown', (event) => {
  if (!isClawVisible) return
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault()
  if (event.code === 'Space') { if (!event.repeat) tryDrop(); return }
  if (event.code.startsWith('Arrow') && phase === 'ready') keys.add(event.code)
})
window.addEventListener('keyup', (event) => keys.delete(event.code))
window.addEventListener('blur', () => keys.clear())

document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => {
  const key = button.dataset.key!
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); if (phase === 'ready') keys.add(key) })
  const stop = () => keys.delete(key)
  button.addEventListener('pointerup', stop)
  button.addEventListener('pointercancel', stop)
  button.addEventListener('pointerleave', stop)
})
dropButton.addEventListener('click', tryDrop)

function selectTab(tabName: 'claw' | 'sampler', moveFocus = false, updateUrl = true) {
  isClawVisible = tabName === 'claw'
  clawPanel.hidden = !isClawVisible
  samplerPanel.hidden = isClawVisible
  keys.clear()
  if (isClawVisible) keySampler.deactivate()
  else keySampler.activate()

  tabButtons.forEach((button) => {
    const selected = button.dataset.tab === tabName
    button.classList.toggle('active', selected)
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
    if (selected && moveFocus) button.focus()
  })

  if (updateUrl) {
    const hash = isClawVisible ? '#3d-claw' : '#key-sampler'
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
  }

  if (isClawVisible) {
    lastFrame = performance.now()
    requestAnimationFrame(resize)
  }
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => selectTab(button.dataset.tab as 'claw' | 'sampler'))
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const goToClaw = event.key === 'ArrowLeft' || event.key === 'Home'
    selectTab(goToClaw ? 'claw' : 'sampler', true)
  })
})

if (location.hash === '#key-sampler') selectTab('sampler', false, false)

function resize() {
  const { width, height } = canvas.getBoundingClientRect()
  if (!width || !height) return
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  if (width < 720) { camera.position.set(9.7, 6.6, 14.5); camera.fov = 36 }
  else { camera.position.set(8.5, 6.2, 11.5); camera.fov = 31 }
  camera.lookAt(.5, 2.7, 0)
  camera.updateProjectionMatrix()
  viewControls.update()
}
window.addEventListener('resize', resize)
resize()

function animate(now = performance.now()) {
  if (!isClawVisible) {
    lastFrame = now
    requestAnimationFrame(animate)
    return
  }
  const dt = Math.min((now - lastFrame) / 1000, .035)
  lastFrame = now
  elapsed += dt
  updateGame(dt)
  machine.rotation.y = Math.sin(elapsed * .18) * .012
  viewControls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()

window.setTimeout(() => document.querySelector('#loading')?.classList.add('hidden'), 550)
