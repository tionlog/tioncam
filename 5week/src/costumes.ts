import * as THREE from 'three'

let vestMaterial: THREE.MeshStandardMaterial | undefined
let labelMaterial: THREE.MeshBasicMaterial | undefined
const vestGeometry = new THREE.CylinderGeometry(.22, .25, .26, 40, 1, true)
const strapGeometry = new THREE.BoxGeometry(.065, .11, .035)
const labelGeometry = new THREE.PlaneGeometry(.39, .145, 24, 4)
const labelPositions = labelGeometry.getAttribute('position') as THREE.BufferAttribute
for (let i = 0; i < labelPositions.count; i += 1) {
  const x = labelPositions.getX(i)
  labelPositions.setZ(i, Math.sqrt(.257 ** 2 - x * x))
}
labelGeometry.computeVertexNormals()

export function createRareVest() {
  if (!vestMaterial || !labelMaterial) {
    vestMaterial = new THREE.MeshStandardMaterial({ color: '#f1c85d', roughness: .8 })
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff7d7'
    context.fillRect(0, 0, 1024, 512)
    context.strokeStyle = '#564221'
    context.lineWidth = 12
    context.strokeRect(14, 14, 996, 484)
    context.fillStyle = '#332817'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '900 163px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
    context.fillText('천연기념물', 512, 268, 930)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    labelMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  }

  const vest = new THREE.Group()
  vest.name = '천연기념물 조끼'
  vest.visible = false
  const shell = new THREE.Mesh(vestGeometry, vestMaterial)
  shell.position.y = .50
  vest.add(shell)
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(strapGeometry, vestMaterial)
    strap.position.set(side * .13, .626, .165)
    strap.rotation.x = -.3
    vest.add(strap)
  }
  const label = new THREE.Mesh(labelGeometry, labelMaterial)
  label.position.y = .50
  vest.add(label)
  // Matching label on the back stays legible while the resident walks away.
  const backLabel = label.clone()
  backLabel.rotation.y = Math.PI
  vest.add(backLabel)
  return vest
}

export function addTinkerbellCostume(root: THREE.Group, head: THREE.Group) {
  const green = new THREE.MeshStandardMaterial({ color: '#83c653', roughness: .7 })
  const gold = new THREE.MeshStandardMaterial({ color: '#f4d272', roughness: .74 })
  const pearl = new THREE.MeshStandardMaterial({ color: '#fff9df', roughness: .7 })
  const wingMaterial = new THREE.MeshPhysicalMaterial({
    color: '#d4f7ed', emissive: '#9fe5e1', emissiveIntensity: .22,
    transparent: true, opacity: .68, roughness: .24, metalness: .05,
    depthWrite: false, side: THREE.DoubleSide,
  })

  const skirtGeometry = new THREE.CylinderGeometry(.13, .24, .19, 60)
  const positions = skirtGeometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < positions.count; i += 1) {
    if (positions.getY(i) >= 0) continue
    const angle = Math.atan2(positions.getZ(i), positions.getX(i))
    positions.setY(i, positions.getY(i) - .035 * (.5 + .5 * Math.cos(angle * 5)))
  }
  skirtGeometry.computeVertexNormals()
  const skirt = new THREE.Mesh(skirtGeometry, green)
  skirt.name = 'fairy-leaf-dress'
  skirt.position.y = .382
  root.add(skirt)

  const hair = new THREE.Mesh(new THREE.SphereGeometry(.303, 48, 32, 0, Math.PI * 2, 0, .85), gold)
  const bun = new THREE.Mesh(new THREE.SphereGeometry(.115, 24, 16), gold)
  bun.name = 'fairy-hair-bun'
  bun.position.set(0, .29, -.065)
  head.add(hair, bun)
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(.079, .015, 8, 24), green)
  ribbon.rotation.x = Math.PI / 2
  ribbon.position.set(0, .25, -.065)
  head.add(ribbon)
  for (const side of [-1, 1]) {
    const bow = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), green)
    bow.scale.set(.057, .029, .027)
    bow.position.set(side * .043, .259, .018)
    bow.rotation.z = side * .25
    head.add(bow)
  }

  const wings: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.name = 'fairy-wing-pivot'
    pivot.position.set(side * .09, .54, -.18)
    const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), wingMaterial)
    upper.scale.set(.16, .36, .026)
    upper.position.set(side * .23, .16, -.045)
    upper.rotation.z = -side * .48
    const lower = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), wingMaterial)
    lower.scale.set(.13, .21, .023)
    lower.position.set(side * .21, -.11, -.025)
    lower.rotation.z = side * .65
    pivot.add(upper, lower)
    root.add(pivot)
    wings.push(pivot)
  }
  // White pom-poms follow the animated feet, rather than staying on the body.
  return { wings, shoeMaterial: green, pompomMaterial: pearl }
}
