import { characterStyles } from './population'
import type { CharacterStyle } from './population'
import type { FacePoint } from './face-alignment'

export type ResidentRecord = {
  id: string
  name: string
  style: CharacterStyle
  angle: number
  latitude: number
  portrait: Blob
  originalPortrait: Blob
  depth: number[]
  alignment?: FacePoint[]
}

let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('moon-forest', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('residents', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = undefined; reject(request.error) }
    request.onblocked = () => { database = undefined; reject(new Error('다른 창을 닫고 다시 시도해 주세요.')) }
  })
  return database
}

export async function loadResidents(): Promise<ResidentRecord[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('residents').objectStore('residents').getAll()
    request.onsuccess = () => resolve((request.result as ResidentRecord[]).filter((record) => (
      typeof record.id === 'string' && typeof record.name === 'string'
      && characterStyles.includes(record.style) && Number.isFinite(record.angle)
      && Number.isFinite(record.latitude) && Math.abs(record.latitude) <= Math.PI / 2
      && record.portrait instanceof Blob && record.originalPortrait instanceof Blob
      && Array.isArray(record.depth) && (record.depth.length === 0 || record.depth.length === 1089)
      && record.depth.every((value) => Number.isFinite(value) && value >= 0 && value <= .09)
    )))
    request.onerror = () => reject(request.error)
  })
}

let queue: Promise<void> = Promise.resolve()
export function saveResidents(records: ResidentRecord[]) {
  // Complete snapshots are atomic; queue order prevents old saves resurrecting
  // a dismissed resident or overwriting a freshly edited portrait.
  const save = queue.catch(() => {}).then(async () => {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('residents', 'readwrite')
      const store = transaction.objectStore('residents')
      store.clear()
      records.forEach((record) => store.put(record))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  })
  queue = save
  return save
}

export function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (
    blob ? resolve(blob) : reject(new Error('얼굴 이미지를 저장하지 못했어요.'))
  ), 'image/png'))
}

export async function blobToCanvas(blob: Blob) {
  const image = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  canvas.getContext('2d')!.drawImage(image, 0, 0, 512, 512)
  image.close()
  return canvas
}
