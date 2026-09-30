import * as THREE from 'three'
import { CLEARING_NORMAL, moonSurfaceRadius } from './moon'

const up = new THREE.Vector3(0, 1, 0)
const orientation = new THREE.Quaternion().setFromUnitVectors(up, CLEARING_NORMAL)

export function meetingSpot(index: number, total: number) {
  // Golden-angle spacing keeps every place inside the plaza, even as it grows.
  const angle = index * Math.PI * (3 - Math.sqrt(5))
  const radius = .35 * Math.sqrt((index + .5) / Math.max(1, total))
  return new THREE.Vector3(Math.cos(angle) * radius, 1, Math.sin(angle) * radius).normalize().applyQuaternion(orientation)
}

export function createClearing() {
  const group = new THREE.Group()
  group.name = '주민 회의 공터'
  const point = new THREE.Vector3()
  // Subdivide the fan so its center follows the globe instead of cutting into it.
  const rings = new THREE.RingGeometry(0, .40, 80, 18)
  const ringPositions = rings.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < ringPositions.count; i++) {
    point.set(ringPositions.getX(i), 1, ringPositions.getY(i)).normalize().applyQuaternion(orientation)
    point.multiplyScalar(moonSurfaceRadius(point) + .018)
    ringPositions.setXYZ(i, point.x, point.y, point.z)
  }
  rings.computeVertexNormals()
  const patch = new THREE.Mesh(rings, new THREE.MeshStandardMaterial({ color: '#c0bb9b', roughness: 1, side: THREE.DoubleSide }))
  group.add(patch)

  const signNormal = new THREE.Vector3(0, 1, -.42).normalize().applyQuaternion(orientation)
  const sign = new THREE.Group()
  sign.position.copy(signNormal).multiplyScalar(moonSurfaceRadius(signNormal))
  sign.quaternion.setFromUnitVectors(up, signNormal)
  const wood = new THREE.MeshStandardMaterial({ color: '#896148', roughness: .95 })
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.026, .034, .42, 10), wood)
  post.position.y = .21
  const board = new THREE.Mesh(new THREE.BoxGeometry(.49, .23, .055), wood)
  board.position.y = .44
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 256
  const context = canvas.getContext('2d')!
  context.fillStyle = '#ad8057'; context.fillRect(0, 0, 512, 256)
  context.strokeStyle = '#78563b'; context.lineWidth = 3
  for (let y = 12; y < 256; y += 27) {
    context.beginPath(); context.moveTo(0, y); context.bezierCurveTo(150, y + 16, 300, y - 18, 512, y + 6); context.stroke()
  }
  context.font = 'bold 142px "Apple SD Gothic Neo", sans-serif'
  context.fillStyle = '#fff3ca'; context.textAlign = 'center'; context.textBaseline = 'middle'
  context.fillText('공터', 256, 137)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const label = new THREE.Mesh(new THREE.PlaneGeometry(.46, .21), new THREE.MeshBasicMaterial({ map: texture }))
  label.position.set(0, .44, .029)
  const back = label.clone(); back.rotation.y = Math.PI; back.position.z = -.029
  sign.add(post, board, label, back)
  group.add(sign)
  return group
}
