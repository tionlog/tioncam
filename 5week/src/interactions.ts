import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Resident } from './resident'
import { CLEARING_NORMAL, MOON_RADIUS, isCraterDrop, moonSurfaceRadius, createDismissalGuide } from './moon'
import { meetingSpot } from './clearing'
import { characterNames } from './population'
import { createTextureEditor } from './texture-editor'
import { residentProfile } from './resident-profile'

type Options = {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  moon: THREE.Mesh
  world: THREE.Group
  residents: Resident[]
  updatePosition: (resident: Resident) => void
  save: () => Promise<void>
  remove: (resident: Resident) => void
  notify: (message: string) => void
}

export function createInteractions(options: Options) {
  const { renderer, camera, controls, moon, world, residents, updatePosition, save, remove, notify } = options
  const panel = document.querySelector<HTMLElement>('#residentPanel')!
  const title = panel.querySelector<HTMLElement>('#selectedName')!
  const subtitle = panel.querySelector<HTMLElement>('#selectedStyle')!
  const speech = panel.querySelector<HTMLElement>('#residentSpeech')!
  const directory = document.querySelector<HTMLElement>('#residentDirectory')!
  const directoryButton = document.querySelector<HTMLButtonElement>('#residentCount')!
  const dropdown = document.querySelector<HTMLElement>('#residentDropdown')!
  const profiles = document.querySelector<HTMLUListElement>('#residentProfiles')!
  const meetingButton = document.querySelector<HTMLButtonElement>('#meetingButton')!
  const modeHint = document.querySelector<HTMLElement>('#worldHint')!
  const editor = createTextureEditor(save, notify)
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const defaultCamera = camera.position.clone()
  const defaultTarget = controls.target.clone()
  let selected: Resident | null = null
  let meeting = false
  let cameraGoal: THREE.Vector3 | null = null
  let turn = 0
  let drag: {
    resident: Resident; id: number; x: number; y: number; moved: boolean
    angle: number; latitude: number; meetingTarget: THREE.Vector3 | null; valid: boolean
  } | null = null

  const marker = new THREE.Mesh(new THREE.RingGeometry(.10, .14, 40), new THREE.MeshBasicMaterial({
    color: '#b7ffd6', side: THREE.DoubleSide, transparent: true, opacity: .9, depthWrite: false,
  }))
  marker.visible = false
  world.add(marker)
  const dismissalGuide = createDismissalGuide()
  world.add(dismissalGuide)

  function normal(resident: Resident) {
    return new THREE.Vector3(Math.cos(resident.latitude) * Math.cos(resident.angle), Math.sin(resident.latitude), Math.cos(resident.latitude) * Math.sin(resident.angle))
  }
  function setNormal(resident: Resident, position: THREE.Vector3) {
    resident.angle = Math.atan2(position.z, position.x)
    resident.latitude = Math.asin(THREE.MathUtils.clamp(position.y, -1, 1))
    updatePosition(resident)
  }
  function setRay(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    camera.updateMatrixWorld()
    world.updateMatrixWorld(true)
    raycaster.setFromCamera(pointer, camera)
  }
  function hitResident(event: PointerEvent) {
    setRay(event)
    // Including the moon prevents selecting residents on the hidden hemisphere.
    const hits = raycaster.intersectObjects([moon, ...residents.map((resident) => resident.root)], true)
    for (const hit of hits) {
      if (hit.object === moon) return null
      let node: THREE.Object3D | null = hit.object
      while (node) {
        const found = residents.find((resident) => resident.root === node)
        if (found) return found
        node = node.parent
      }
    }
    return null
  }

  function closeDirectory(returnFocus = false) {
    dropdown.hidden = true
    directoryButton.setAttribute('aria-expanded', 'false')
    if (returnFocus) directoryButton.focus()
  }
  directoryButton.addEventListener('click', () => {
    dropdown.hidden = !dropdown.hidden
    directoryButton.setAttribute('aria-expanded', String(!dropdown.hidden))
    if (!dropdown.hidden) refreshProfiles()
  })
  document.addEventListener('pointerdown', (event) => {
    if (!directory.contains(event.target as Node)) closeDirectory()
  })
  directory.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dropdown.hidden) {
      event.stopPropagation(); closeDirectory(true)
    }
    if (event.key === 'ArrowDown' && event.target === directoryButton) {
      event.preventDefault(); dropdown.hidden = false
      directoryButton.setAttribute('aria-expanded', 'true')
      refreshProfiles(); profiles.querySelector('button')?.focus()
    }
  })
  directory.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !directory.contains(event.relatedTarget as Node)) closeDirectory()
  })
  function refreshProfiles() {
    profiles.replaceChildren()
    for (const resident of residents) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'profile-entry'
      button.append(residentProfile(resident))
      button.title = `${characterNames[resident.style]} · 따라가기와 대화`
      button.setAttribute('aria-pressed', String(selected === resident))
      button.addEventListener('click', () => { closeDirectory(true); select(resident) })
      item.append(button); profiles.append(item)
    }
    if (!residents.length) {
      const empty = document.createElement('li')
      empty.className = 'profile-empty'; empty.textContent = '아직 입주민이 없어요.'
      profiles.append(empty)
    }
    meetingButton.disabled = residents.length === 0
  }

  function say(topic: string) {
    if (!selected) return
    const favorites = {
      rabbit: ['달빛 당근을 찾고 있어! 같이 산책할래?', '오늘은 별이 유난히 반짝여. 귀를 쫑긋 세우면 소리가 들릴까?'],
      astronaut: ['오늘의 탐사 기록: 달님의 숲은 아주 평화로워!', '저 구덩이는 깊어 보이네. 끌어서 옮길 때 조심해 줘!'],
      sprout: ['내 머리 위 새싹이 조금 더 자란 것 같아!', '나무들 옆에서 달빛을 쬐면 기분이 좋아져.'],
      tinkerbell: ['날개에 반짝이는 달빛을 모았어. 너에게도 나눠 줄게!', '오늘 공터를 요정들의 무도회장으로 꾸미면 어떨까?'],
    }
    if (topic === 'hello') speech.textContent = `안녕! 나는 ${selected.name}, 이 숲의 ${characterNames[selected.style]}야. 만나서 반가워!`
    else if (topic === 'day') speech.textContent = favorites[selected.style][turn++ % 2]
    else if (topic === 'vest') speech.textContent = selected.vest.visible
      ? `지금 ${characterNames[selected.style]} 주민이 가장 적어서 천연기념물 조끼를 입고 있어. 소중히 대해 줘!`
      : '가장 적은 종류가 하나로 정해지면 그 주민들만 천연기념물 조끼를 입는대!'
    else speech.textContent = meeting ? '친구들이 공터로 모이고 있어. 오늘은 어떤 이야기를 나눌까?' : '주민 회의 버튼을 누르면 공터에서 친구들을 만날 수 있어!'
  }

  function select(resident: Resident) {
    if (editor.active || !residents.includes(resident)) return
    selected = resident
    cameraGoal = null
    controls.enabled = false
    panel.hidden = false
    title.textContent = resident.name
    subtitle.textContent = `${characterNames[resident.style]} · 따라가는 중`
    say('hello'); refreshProfiles()
    modeHint.textContent = '주민을 따라가는 중 · 전체 보기로 돌아가면 끌어서 옮길 수 있어요.'
  }
  function overview(moveCamera = true) {
    selected = null
    panel.hidden = true
    controls.enabled = true
    camera.up.set(0, 1, 0)
    const fitDistance = 3.6 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect))
    if (moveCamera) cameraGoal = meeting ? CLEARING_NORMAL.clone().multiplyScalar(fitDistance) : defaultCamera.clone().setLength(fitDistance)
    controls.target.copy(defaultTarget)
    modeHint.textContent = '주민 클릭: 대화 · 주민 드래그: 이동 · 표시된 구덩이 안에 놓기: 방출'
    refreshProfiles()
  }

  function setMeeting(active: boolean) {
    meeting = active
    residents.forEach((resident, index) => {
      resident.meetingTarget = active ? meetingSpot(index, residents.length) : null
    })
    meetingButton.textContent = active ? '회의 마치기' : '주민 회의'
    overview()
    notify(active ? '모두 공터로 모이고 있어요.' : '회의가 끝났어요. 다시 산책을 시작해요.')
    void save().catch(() => {})
  }
  meetingButton.addEventListener('click', () => setMeeting(!meeting))
  panel.querySelector('#leaveResident')!.addEventListener('click', () => overview())
  panel.querySelector('#editPortrait')!.addEventListener('click', () => { if (selected) void editor.open(selected) })
  panel.querySelectorAll<HTMLButtonElement>('[data-topic]').forEach((button) => button.addEventListener('click', () => say(button.dataset.topic!)))
  document.querySelector('#overviewButton')!.addEventListener('click', () => overview())

  function finishDrag(cancelled: boolean) {
    if (!drag) return
    const current = drag
    drag = null
    current.resident.dragging = false
    marker.visible = false
    dismissalGuide.visible = false
    renderer.domElement.style.cursor = ''
    if (renderer.domElement.hasPointerCapture(current.id)) renderer.domElement.releasePointerCapture(current.id)
    if (cancelled || !current.valid) {
      current.resident.angle = current.angle
      current.resident.latitude = current.latitude
      current.resident.meetingTarget = current.meetingTarget
      updatePosition(current.resident)
    } else if (!current.moved) {
      select(current.resident)
    } else if (isCraterDrop(normal(current.resident))) {
      if (selected === current.resident) overview(false)
      remove(current.resident)
    } else {
      current.resident.meetingTarget = null
      current.resident.greetingUntil = performance.now() + 1800
      void save().catch(() => {})
      notify(`${current.resident.name}의 자리를 옮겼어요.`)
    }
    controls.enabled = !selected
    modeHint.textContent = selected ? '주민을 따라가는 중 · 전체 보기로 돌아갈 수 있어요.' : '주민 클릭: 대화 · 주민 드래그: 이동 · 표시된 구덩이 안에 놓기: 방출'
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || editor.active) return
    const resident = hitResident(event)
    if (!resident) return
    event.stopImmediatePropagation()
    event.preventDefault()
    cameraGoal = null
    controls.enabled = false
    drag = { resident, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
      angle: resident.angle, latitude: resident.latitude, meetingTarget: resident.meetingTarget?.clone() ?? null, valid: true }
    resident.dragging = true
    resident.fallenUntil = 0
    resident.fallTilt = 0
    resident.collisionCooldown = performance.now() + 2200
    renderer.domElement.setPointerCapture(event.pointerId)
  }, true)

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return
    event.stopImmediatePropagation()
    event.preventDefault()
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return
    drag.moved = true
    dismissalGuide.visible = true
    renderer.domElement.style.cursor = 'grabbing'
    setRay(event)
    const hit = raycaster.intersectObject(moon, false)[0]
    drag.valid = Boolean(hit)
    if (!hit) { marker.visible = false; modeHint.textContent = '달 표면 위에 놓아 주세요. 바깥에서 놓으면 원래 자리로 돌아가요.'; return }
    const position = hit.point.clone().normalize()
    setNormal(drag.resident, position)
    drag.resident.root.position.addScaledVector(position, .15)
    const dismiss = isCraterDrop(position)
    marker.visible = true
    marker.position.copy(position).multiplyScalar(moonSurfaceRadius(position) + .025)
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), position)
    marker.material.color.set(dismiss ? '#ff776f' : '#aaffcf')
    modeHint.textContent = dismiss ? '여기서 놓으면 이 주민이 방출돼요.' : '놓으면 이 자리로 이동해요. 붉은 테두리가 있는 구덩이 한 곳에서만 방출돼요.'
  }, true)
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (drag?.id !== event.pointerId) return
    event.stopImmediatePropagation(); finishDrag(false)
  }, true)
  renderer.domElement.addEventListener('pointercancel', () => finishDrag(true), true)
  renderer.domElement.addEventListener('lostpointercapture', () => { if (drag) finishDrag(true) }, true)
  window.addEventListener('blur', () => finishDrag(true))
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if (drag) finishDrag(true)
      else overview()
    }
  })

  return {
    refresh() {
      if (selected && !residents.includes(selected)) overview(false)
      if (meeting) residents.forEach((resident, index) => { resident.meetingTarget = meetingSpot(index, residents.length) })
      refreshProfiles()
    },
    get active() { return Boolean(selected || drag || cameraGoal || editor.active) },
    update(delta: number) {
      if (selected && !drag) {
        const n = normal(selected)
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(selected.root.quaternion).projectOnPlane(n).normalize()
        const target = selected.root.position.clone().addScaledVector(n, .52)
        const destination = selected.root.position.clone().addScaledVector(n, 1.22).addScaledVector(forward, 1.55)
        const mix = 1 - Math.exp(-delta * 4)
        camera.position.lerp(destination, mix)
        if (camera.position.length() < MOON_RADIUS + .45) camera.position.setLength(MOON_RADIUS + .45)
        camera.up.lerp(n, mix).normalize()
        controls.target.lerp(target, mix)
        camera.lookAt(controls.target)
      } else if (cameraGoal && !drag) {
        camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 5))
        if (camera.position.length() < MOON_RADIUS + .45) camera.position.setLength(MOON_RADIUS + .45)
        camera.lookAt(controls.target)
        if (camera.position.distanceTo(cameraGoal) < .015) cameraGoal = null
      }
    },
    cancelPointer: () => finishDrag(true),
  }
}
