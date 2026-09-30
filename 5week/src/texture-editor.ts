import { blobToCanvas, canvasToBlob } from './storage'
import type { Resident } from './resident'

export function createTextureEditor(onSave: () => Promise<void>, notify: (message: string) => void) {
  const dialog = document.createElement('dialog')
  dialog.className = 'texture-dialog'
  dialog.setAttribute('aria-labelledby', 'textureTitle')
  dialog.innerHTML = `
    <h2 id="textureTitle">얼굴 텍스처 다듬기</h2>
    <p>이미지를 손가락이나 마우스로 문질러 수정하세요. 적용하면 주민의 얼굴에도 저장돼요.</p>
    <canvas width="512" height="512" aria-label="문질러 편집할 얼굴 이미지"></canvas>
    <div class="brush-tools">
      <label>도구 <select id="brushMode"><option value="smudge">문지르기</option><option value="paint">색칠하기</option><option value="erase">지우기</option><option value="restore">원본 복원</option></select></label>
      <label>크기 <input id="brushSize" type="range" min="6" max="70" value="26"></label>
      <label>색 <input id="brushColor" type="color" value="#f4b7c6"></label>
    </div>
    <div class="editor-actions"><button id="undoTexture" type="button">한 단계 취소</button><button id="resetTexture" type="button">원본으로</button><button id="cancelTexture" type="button">닫기</button><button id="applyTexture" class="primary" type="button">적용 · 저장</button></div>`
  document.body.append(dialog)
  const canvas = dialog.querySelector('canvas')!
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  const mode = dialog.querySelector<HTMLSelectElement>('#brushMode')!
  const size = dialog.querySelector<HTMLInputElement>('#brushSize')!
  const color = dialog.querySelector<HTMLInputElement>('#brushColor')!
  const apply = dialog.querySelector<HTMLButtonElement>('#applyTexture')!
  const history: ImageData[] = []
  let resident: Resident | null = null
  let original: HTMLCanvasElement | null = null
  let last: { x: number; y: number } | null = null
  let pointer: number | null = null
  let session = 0
  const brushCanvas = document.createElement('canvas')
  const scratch = document.createElement('canvas')
  brushCanvas.width = scratch.width = 160
  brushCanvas.height = scratch.height = 160
  const brushContext = brushCanvas.getContext('2d')!
  const scratchContext = scratch.getContext('2d')!

  function position(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * 512 / rect.width, y: (event.clientY - rect.top) * 512 / rect.height }
  }
  function remember() {
    history.push(context.getImageData(0, 0, 512, 512))
    if (history.length > 20) history.shift()
  }
  function dab(x: number, y: number, previousX: number, previousY: number) {
    const radius = Number(size.value)
    const diameter = radius * 2
    brushContext.clearRect(0, 0, 160, 160)
    brushContext.globalCompositeOperation = 'source-over'
    if (mode.value === 'paint') {
      brushContext.fillStyle = color.value
      brushContext.fillRect(0, 0, diameter, diameter)
    } else if (mode.value === 'restore' && original) {
      brushContext.drawImage(original, x - radius, y - radius, diameter, diameter, 0, 0, diameter, diameter)
    } else if (mode.value === 'smudge') {
      scratchContext.clearRect(0, 0, 160, 160)
      scratchContext.drawImage(canvas, previousX - radius, previousY - radius, diameter, diameter, 0, 0, diameter, diameter)
      brushContext.drawImage(scratch, 0, 0)
    } else {
      brushContext.fillStyle = 'white'; brushContext.fillRect(0, 0, diameter, diameter)
    }
    const feather = brushContext.createRadialGradient(radius, radius, radius * .2, radius, radius, radius)
    feather.addColorStop(0, 'rgba(255,255,255,.65)'); feather.addColorStop(1, 'rgba(255,255,255,0)')
    brushContext.globalCompositeOperation = 'destination-in'
    brushContext.fillStyle = feather; brushContext.fillRect(0, 0, diameter, diameter)
    context.save()
    context.globalCompositeOperation = mode.value === 'erase' ? 'destination-out' : 'source-over'
    context.drawImage(brushCanvas, 0, 0, diameter, diameter, x - radius, y - radius, diameter, diameter)
    context.restore()
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointer !== null) return
    pointer = event.pointerId
    canvas.setPointerCapture(event.pointerId)
    remember(); last = position(event)
    dab(last.x, last.y, last.x, last.y)
    event.preventDefault()
  })
  canvas.addEventListener('pointermove', (event) => {
    if (!last || event.pointerId !== pointer) return
    const next = position(event)
    const steps = Math.ceil(Math.hypot(next.x - last.x, next.y - last.y) / 3)
    for (let step = 1; step <= steps; step++) {
      const x = last.x + (next.x - last.x) * step / steps
      const y = last.y + (next.y - last.y) * step / steps
      dab(x, y, x - (next.x - last.x) / steps, y - (next.y - last.y) / steps)
    }
    last = next
  })
  const stop = () => { pointer = null; last = null }
  canvas.addEventListener('pointerup', stop)
  canvas.addEventListener('pointercancel', stop)
  canvas.addEventListener('lostpointercapture', stop)
  dialog.addEventListener('close', () => { session++; stop(); resident = null })
  dialog.querySelector('#cancelTexture')!.addEventListener('click', () => dialog.close())
  dialog.querySelector('#undoTexture')!.addEventListener('click', () => {
    const previous = history.pop(); if (previous) context.putImageData(previous, 0, 0)
  })
  dialog.querySelector('#resetTexture')!.addEventListener('click', () => {
    if (!original) return
    remember(); context.clearRect(0, 0, 512, 512); context.drawImage(original, 0, 0)
  })
  apply.addEventListener('click', async () => {
    if (!resident) return
    const target = resident
    const currentSession = session
    apply.disabled = true
    try {
      const portrait = await canvasToBlob(canvas)
      if (session !== currentSession) return
      target.faceCanvas.getContext('2d')!.clearRect(0, 0, 512, 512)
      target.faceCanvas.getContext('2d')!.drawImage(canvas, 0, 0)
      target.refreshFaceTexture()
      target.portrait = portrait
      await onSave()
      dialog.close()
      notify('얼굴 텍스처를 적용하고 저장했어요.')
    } catch { notify('저장하지 못했어요. 편집창에서 다시 적용해 주세요.') }
    finally { apply.disabled = false }
  })

  return {
    async open(target: Resident) {
      const currentSession = ++session
      try {
        const source = await blobToCanvas(target.originalPortrait)
        if (session !== currentSession) return
        resident = target; original = source; history.length = 0
        context.clearRect(0, 0, 512, 512); context.drawImage(target.faceCanvas, 0, 0)
        dialog.showModal()
      } catch { notify('원본 이미지를 열지 못했어요.') }
    },
    get active() { return dialog.open },
  }
}
