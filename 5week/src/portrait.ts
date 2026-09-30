import * as THREE from 'three'

export function createPortrait(texture: THREE.Texture) {
  // Display the photograph as-is inside the hood: no spherical UV stretching,
  // invented facial relief, skin shader, lighting, fog or tone-mapping effects.
  const geometry = new THREE.CircleGeometry(.254, 80)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: texture, transparent: true, alphaTest: .01, toneMapped: false, fog: false,
  }))
  mesh.position.z = .146
  mesh.name = 'original-photo-face'
  return mesh
}

export function createFaceHood(color: number, liningColor: number, helmet = false) {
  const hood = new THREE.Group()
  hood.name = 'sculpted-face-hood'
  const radius = .294, opening = 1.055
  const shellGeometry = new THREE.SphereGeometry(radius, 64, 48, 0, Math.PI * 2, opening, Math.PI - opening)
  shellGeometry.rotateX(Math.PI / 2)
  const outer = new THREE.Mesh(shellGeometry, new THREE.MeshStandardMaterial({
    color, roughness: helmet ? .43 : .72, metalness: helmet ? .08 : 0, side: THREE.DoubleSide,
  }))
  outer.scale.y = 1.025
  hood.add(outer)
  const rimRadius = radius * Math.sin(opening)
  const rimZ = radius * Math.cos(opening)
  // Recessed lining and rounded lip provide actual occlusion at the opening.
  const lining = new THREE.Mesh(new THREE.TorusGeometry(rimRadius - .008, .018, 16, 80),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(liningColor).multiplyScalar(.42), roughness: .9 }))
  lining.position.z = rimZ - .014
  lining.scale.y = 1.025
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rimRadius, .012, 16, 80),
    new THREE.MeshStandardMaterial({ color: liningColor, roughness: helmet ? .46 : .72 }))
  rim.position.z = rimZ
  rim.scale.y = 1.025
  hood.add(lining, rim)
  return hood
}

// Invert object-fit: cover so the captured crop matches the visible guide on
// both wide desktop previews and narrow mobile previews.
export function getPortraitCrop(sourceWidth: number, sourceHeight: number, previewWidth: number, previewHeight: number, guideWidth: number, guideHeight: number) {
  const scale = Math.max(previewWidth / sourceWidth, previewHeight / sourceHeight)
  const width = Math.min(sourceWidth, guideWidth / scale)
  const height = Math.min(sourceHeight, guideHeight / scale)
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height }
}
