import type * as THREE from 'three'
import type { ResidentRecord } from './storage'
import type { MotionState } from './motion'

export type Resident = ResidentRecord & MotionState & {
  vest: THREE.Group
  wings: THREE.Group[]
  root: THREE.Group
  head: THREE.Group
  greetingUntil: number
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  speed: number
  faceTexture: THREE.CanvasTexture
  faceCanvas: HTMLCanvasElement
  refreshFaceTexture: () => void
  meetingTarget: THREE.Vector3 | null
  dragging: boolean
}

export function residentRecord(resident: Resident): ResidentRecord {
  const { id, name, style, angle, latitude, portrait, originalPortrait, depth, alignment } = resident
  return { id, name, style, angle, latitude, portrait, originalPortrait, depth, alignment }
}
