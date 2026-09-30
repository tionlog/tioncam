import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="welcome">
    <a class="home-logo" href="${import.meta.env.BASE_URL}" aria-label="홈으로 이동" title="홈으로 이동">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v8.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-8.6Z"/><path d="M9.2 21v-6.8h5.6V21"/></svg>
    </a>
    <div class="dock-icon-layer" aria-hidden="true">
      ${Array.from({ length: 8 }, (_, index) => `<span class="dock-icon" data-icon="${index}"></span>`).join('')}
    </div>

    <section class="orb-scene" role="img" aria-label="포인터를 바라보고 클릭하면 윙크하는 둥근 얼굴">
      <span class="orb-ear orb-ear--left" aria-hidden="true"></span>
      <span class="orb-ear orb-ear--right" aria-hidden="true"></span>

      <div class="orb">
        <div class="orb__hair" aria-hidden="true"></div>
        <div class="orb__rage-shadow" aria-hidden="true"></div>

        <div class="orb__face" aria-hidden="true">
          <span class="rage-brow rage-brow--left"></span>
          <span class="rage-brow rage-brow--right"></span>
          <span class="face-eye face-eye--left">
            <span class="face-pupil"><span class="face-pupil__glint"></span></span>
            <span class="wink-mark"></span>
          </span>
          <span class="face-eye face-eye--right">
            <span class="face-pupil"><span class="face-pupil__glint"></span></span>
            <span class="wink-mark"></span>
          </span>
          <span class="rage-wrinkles"><i></i><i></i><i></i></span>
          <span class="face-nose"></span>
          <span class="face-mouth"></span>
        </div>
      </div>

      <span class="laser-beam laser-beam--left" aria-hidden="true"></span>
      <span class="laser-beam laser-beam--right" aria-hidden="true"></span>
    </section>

    <div class="effect-layer" aria-hidden="true"></div>
  </main>
`

const effectLayer = document.querySelector<HTMLDivElement>('.effect-layer')!
const orbScene = document.querySelector<HTMLElement>('.orb-scene')!
const orb = document.querySelector<HTMLDivElement>('.orb')!
const orbFace = document.querySelector<HTMLDivElement>('.orb__face')!
const leftEye = document.querySelector<HTMLSpanElement>('.face-eye--left .face-pupil')!
const rightEye = document.querySelector<HTMLSpanElement>('.face-eye--right .face-pupil')!
const leftLaser = document.querySelector<HTMLSpanElement>('.laser-beam--left')!
const rightLaser = document.querySelector<HTMLSpanElement>('.laser-beam--right')!
const dockIcons = Array.from(document.querySelectorAll<HTMLSpanElement>('.dock-icon'))

const backgroundSize = { width: 1672, height: 941 }
const iconSourceRects = [
  { x: 142, y: 842, width: 72, height: 78 },
  { x: 265, y: 846, width: 53, height: 74 },
  { x: 373, y: 840, width: 65, height: 80 },
  { x: 489, y: 845, width: 72, height: 75 },
  { x: 1097, y: 839, width: 82, height: 82 },
  { x: 1215, y: 843, width: 75, height: 78 },
  { x: 1330, y: 840, width: 86, height: 82 },
  { x: 1443, y: 843, width: 82, height: 78 },
]

function layoutDockIcons() {
  const scale = Math.max(
    window.innerWidth / backgroundSize.width,
    window.innerHeight / backgroundSize.height,
  )
  const renderedWidth = backgroundSize.width * scale
  const renderedHeight = backgroundSize.height * scale
  const offsetX = (window.innerWidth - renderedWidth) / 2
  const offsetY = (window.innerHeight - renderedHeight) / 2

  dockIcons.forEach((icon, index) => {
    const source = iconSourceRects[index]

    icon.style.left = `${offsetX + source.x * scale}px`
    icon.style.top = `${offsetY + source.y * scale}px`
    icon.style.width = `${source.width * scale}px`
    icon.style.height = `${source.height * scale}px`
    icon.style.setProperty('--sprite-size', `${renderedWidth}px ${renderedHeight}px`)
    icon.style.setProperty('--sprite-position', `${-source.x * scale}px ${-source.y * scale}px`)
  })
}

const lookTarget = { x: 0, y: 0 }
const currentLook = { x: 0, y: 0 }
const pointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
let winkTimer: number | undefined

function setLookTarget(clientX: number, clientY: number) {
  const bounds = orb.getBoundingClientRect()
  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2
  const rangeX = Math.max(window.innerWidth * 0.42, bounds.width / 2)
  const rangeY = Math.max(window.innerHeight * 0.42, bounds.height / 2)
  let x = (clientX - centerX) / rangeX
  let y = (clientY - centerY) / rangeY
  const distance = Math.hypot(x, y)

  pointerPosition.x = clientX
  pointerPosition.y = clientY

  if (distance > 1) {
    x /= distance
    y /= distance
  }

  lookTarget.x = x
  lookTarget.y = y
}

type LaserRay = {
  x: number
  y: number
  directionX: number
  directionY: number
  length: number
}

function aimLaser(eye: HTMLSpanElement, laser: HTMLSpanElement): LaserRay {
  const sceneBounds = orbScene.getBoundingClientRect()
  const eyeBounds = eye.getBoundingClientRect()
  const startX = eyeBounds.left + eyeBounds.width / 2
  const startY = eyeBounds.top + eyeBounds.height / 2
  const deltaX = pointerPosition.x - startX
  const deltaY = pointerPosition.y - startY
  const angle = Math.atan2(deltaY, deltaX)
  const length = Math.max(
    Math.hypot(deltaX, deltaY) + 320,
    Math.hypot(window.innerWidth, window.innerHeight) * 1.18,
  )

  laser.style.left = `${startX - sceneBounds.left}px`
  laser.style.top = `${startY - sceneBounds.top}px`
  laser.style.width = `${length}px`
  laser.style.setProperty('--laser-angle', `${angle}rad`)

  return {
    x: startX,
    y: startY,
    directionX: Math.cos(angle),
    directionY: Math.sin(angle),
    length,
  }
}

function rayHitScore(ray: LaserRay, bounds: DOMRect) {
  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2
  const deltaX = centerX - ray.x
  const deltaY = centerY - ray.y
  const projection = deltaX * ray.directionX + deltaY * ray.directionY

  if (projection < 0 || projection > ray.length) return Number.POSITIVE_INFINITY

  const perpendicularDistance = Math.abs(deltaX * ray.directionY - deltaY * ray.directionX)
  const hitRadius = Math.hypot(bounds.width, bounds.height) * 0.42 + 8

  return perpendicularDistance <= hitRadius
    ? perpendicularDistance + projection * 0.0001
    : Number.POSITIVE_INFINITY
}

function updateHitIcon(rays: LaserRay[]) {
  let closestIcon = -1
  let closestScore = Number.POSITIVE_INFINITY

  if (orbScene.matches(':hover')) {
    dockIcons.forEach((icon, index) => {
      const bounds = icon.getBoundingClientRect()
      const score = Math.min(...rays.map((ray) => rayHitScore(ray, bounds)))

      if (score < closestScore) {
        closestScore = score
        closestIcon = index
      }
    })
  }

  dockIcons.forEach((icon, index) => icon.classList.toggle('is-hit', index === closestIcon))
}

function animateFace() {
  currentLook.x += (lookTarget.x - currentLook.x) * 0.11
  currentLook.y += (lookTarget.y - currentLook.y) * 0.11

  orb.style.setProperty('--feature-x', `${(currentLook.x * 8).toFixed(2)}px`)
  orb.style.setProperty('--feature-y', `${(currentLook.y * 6).toFixed(2)}px`)
  orb.style.setProperty('--pupil-x', `${(currentLook.x * 7).toFixed(2)}px`)
  orb.style.setProperty('--pupil-y', `${(currentLook.y * 6).toFixed(2)}px`)
  orb.style.setProperty('--face-tilt', `${(currentLook.x * 1.8).toFixed(2)}deg`)

  const leftRay = aimLaser(leftEye, leftLaser)
  const rightRay = aimLaser(rightEye, rightLaser)
  updateHitIcon([leftRay, rightRay])

  requestAnimationFrame(animateFace)
}

window.addEventListener('pointermove', (event) => {
  setLookTarget(event.clientX, event.clientY)
})

window.addEventListener(
  'pointerdown',
  (event) => {
    if (event.button !== 0) return

    setLookTarget(event.clientX, event.clientY)
    const winkClass = event.clientX < window.innerWidth / 2 ? 'is-winking-right' : 'is-winking-left'

    orbFace.classList.remove('is-winking-left', 'is-winking-right')
    void orbFace.offsetWidth
    orbFace.classList.add(winkClass)

    window.clearTimeout(winkTimer)
    winkTimer = window.setTimeout(
      () => orbFace.classList.remove('is-winking-left', 'is-winking-right'),
      680,
    )
  },
  { capture: true },
)

requestAnimationFrame(animateFace)
layoutDockIcons()
window.addEventListener('resize', layoutDockIcons)

type GrowingBubble = {
  element: HTMLSpanElement
  pointerId: number
  startedAt: number
  animationFrame: number
}

let growingBubble: GrowingBubble | null = null
let lastTrailTime = 0
let lastTrailX = 0
let lastTrailY = 0

function makePointerBubble(x: number, y: number) {
  const bubble = document.createElement('span')
  const orb = document.createElement('span')

  bubble.className = 'pointer-bubble pointer-bubble--growing'
  bubble.style.left = `${x}px`
  bubble.style.top = `${y}px`
  orb.className = 'pointer-bubble__orb'
  bubble.append(orb)
  effectLayer.append(bubble)

  return bubble
}

function makeTrailBubble(x: number, y: number) {
  const bubble = document.createElement('span')
  const orb = document.createElement('span')
  const size = 14 + Math.random() * 20

  bubble.className = 'trail-bubble'
  bubble.style.left = `${x}px`
  bubble.style.top = `${y}px`
  bubble.style.setProperty('--trail-size', `${size}px`)
  bubble.style.setProperty('--trail-drift', `${-34 + Math.random() * 68}px`)
  bubble.style.setProperty('--trail-lift', `${78 + Math.random() * 92}px`)
  bubble.style.setProperty('--trail-duration', `${820 + Math.random() * 620}ms`)
  orb.className = 'pointer-bubble__orb trail-bubble__orb'
  bubble.append(orb)
  effectLayer.append(bubble)
  bubble.addEventListener('animationend', () => bubble.remove(), { once: true })
}

function growBubble(bubble: GrowingBubble, now: number) {
  const elapsed = now - bubble.startedAt
  const scale = 0.82 + Math.log1p(elapsed / 480) * 0.78

  bubble.element.style.setProperty('--bubble-scale', scale.toFixed(3))
  bubble.animationFrame = requestAnimationFrame((time) => growBubble(bubble, time))
}

function releaseBubble() {
  if (!growingBubble) return

  const releasedBubble = growingBubble.element

  cancelAnimationFrame(growingBubble.animationFrame)
  releasedBubble.classList.remove('pointer-bubble--growing')
  releasedBubble.classList.add('pointer-bubble--released')
  releasedBubble.style.setProperty('--drift', `${-90 + Math.random() * 180}px`)
  releasedBubble.addEventListener(
    'animationend',
    (event) => {
      if (event.animationName === 'pointer-bubble-release-flight') {
        releasedBubble.remove()
      }
    },
    { once: true },
  )

  growingBubble = null
}

window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || growingBubble) return

  const bubble = makePointerBubble(event.clientX, event.clientY)
  growingBubble = {
    element: bubble,
    pointerId: event.pointerId,
    startedAt: performance.now(),
    animationFrame: 0,
  }
  growingBubble.animationFrame = requestAnimationFrame((time) => growBubble(growingBubble!, time))
})

window.addEventListener('pointermove', (event) => {
  const isTouchDrag = event.pointerType === 'touch' && growingBubble?.pointerId === event.pointerId
  const canLeaveTrail = event.pointerType === 'mouse' || event.pointerType === 'pen' || isTouchDrag

  if (!canLeaveTrail) return

  const now = performance.now()
  const distance = Math.hypot(event.clientX - lastTrailX, event.clientY - lastTrailY)

  if (now - lastTrailTime < 34 || distance < 9) return

  makeTrailBubble(event.clientX, event.clientY)
  lastTrailTime = now
  lastTrailX = event.clientX
  lastTrailY = event.clientY
})

window.addEventListener('pointerup', (event) => {
  if (event.button === 0 && growingBubble?.pointerId === event.pointerId) {
    releaseBubble()
  }

})

window.addEventListener('pointercancel', () => {
  releaseBubble()
})
window.addEventListener('blur', releaseBubble)
