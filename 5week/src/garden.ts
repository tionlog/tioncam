import * as THREE from 'three'
import { MOON_RADIUS, moonSurfaceRadius, isInClearing } from './moon'

const up = new THREE.Vector3(0, 1, 0)

function random(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453
  return value - Math.floor(value)
}

export function createMoonGarden() {
  const garden = new THREE.Group()
  garden.name = 'Moon garden · blossoms, clouds, pearls, pears and tiered trees'
  const trees = new THREE.Group()
  const sphere = new THREE.SphereGeometry(1, 14, 10)
  const cylinder = new THREE.CylinderGeometry(.7, 1, 1, 9)
  const palettes = [
    ['#b5a1e8', '#e2cafa', '#fff0f7'],
    ['#e7aacb', '#f9cfe0', '#fff2cf'],
    ['#88c7b3', '#b7e2ca', '#f5ecd1'],
    ['#8baed9', '#bfdbf0', '#ecdaff'],
    ['#c5a9df', '#ead1ee', '#ffe3b3'],
  ].map((palette) => palette.map((color) => new THREE.MeshStandardMaterial({
    color, roughness: .84, metalness: 0,
    emissive: color, emissiveIntensity: .045,
  })))
  const bark = new THREE.MeshStandardMaterial({ color: '#88646e', roughness: 1 })
  const flowerCenter = new THREE.MeshStandardMaterial({ color: '#ffd593', roughness: .8 })

  function ball(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    const mesh = new THREE.Mesh(sphere, material)
    mesh.position.set(x, y, z)
    mesh.scale.set(sx, sy, sz)
    parent.add(mesh)
    return mesh
  }

  function branch(parent: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, width: number) {
    const mesh = new THREE.Mesh(cylinder, bark)
    const direction = to.clone().sub(from)
    mesh.position.copy(from).add(to).multiplyScalar(.5)
    mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize())
    mesh.scale.set(width, direction.length(), width)
    parent.add(mesh)
  }

  function blossom(parent: THREE.Group, position: THREE.Vector3, normal: THREE.Vector3, size: number, material: THREE.Material, phase: number) {
    const flower = new THREE.Group()
    flower.position.copy(position)
    flower.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    flower.rotateZ(phase)
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal * Math.PI * 2 / 5
      const mesh = ball(flower, material, Math.cos(angle) * size * .52, Math.sin(angle) * size * .52, 0,
        size * .52, size * .34, size * .16)
      mesh.rotation.z = angle
    }
    ball(flower, flowerCenter, 0, 0, size * .13, size * .20, size * .20, size * .16)
    parent.add(flower)
  }

  const treeNormals: THREE.Vector3[] = []
  for (let index = 0; index < 34; index += 1) {
    // Even distribution avoids dense clumps hiding the crater design.
    const y = 1 - 2 * (index + .5) / 34
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + .48
    const normal = new THREE.Vector3(Math.sqrt(1 - y * y) * Math.cos(angle), y, Math.sqrt(1 - y * y) * Math.sin(angle))
    if (isInClearing(normal) || moonSurfaceRadius(normal) < MOON_RADIUS - .10) continue
    treeNormals.push(normal)
    const tree = new THREE.Group()
    const variant = index % 5
    const palette = palettes[(index * 3 + Math.floor(index / 5)) % palettes.length]
    branch(tree, new THREE.Vector3(0, -.02, 0), new THREE.Vector3(0, .32, 0), .031)
    branch(tree, new THREE.Vector3(0, .14, 0), new THREE.Vector3(-.10, .32, .015), .016)
    branch(tree, new THREE.Vector3(0, .18, 0), new THREE.Vector3(.11, .35, -.01), .014)

    if (variant === 0) {
      // Flowering tree: a cloud crown wrapped in small five-petal blossoms.
      ball(tree, palette[0], 0, .42, 0, .19, .19, .18)
      for (let lobe = 0; lobe < 5; lobe += 1) {
        const a = lobe * Math.PI * 2 / 5
        ball(tree, palette[lobe % 2], Math.cos(a) * .115, .39 + (lobe % 2) * .06, Math.sin(a) * .10, .125)
      }
      for (let flower = 0; flower < 21; flower += 1) {
        const fy = 1 - 1.65 * (flower + .5) / 21
        const a = flower * 2.39996
        const n = new THREE.Vector3(Math.sqrt(1 - fy * fy) * Math.cos(a), fy, Math.sqrt(1 - fy * fy) * Math.sin(a))
        blossom(tree, new THREE.Vector3(n.x * .225, .42 + n.y * .195, n.z * .21), n,
          .039 + random(index * 40 + flower) * .014, palette[flower % 3 === 0 ? 2 : 1], a)
      }
    } else if (variant === 1) {
      // Soft cloud: three broad lobes and a little top tuft.
      ball(tree, palette[0], -.12, .35, 0, .145, .13, .145)
      ball(tree, palette[1], .12, .38, -.015, .16, .14, .145)
      ball(tree, palette[0], 0, .46, .015, .19, .17, .165)
      ball(tree, palette[1], -.025, .59, 0, .075, .07, .07)
    } else if (variant === 2) {
      // Round pom-poms at different heights, with candy-like berries.
      for (let tuft = 0; tuft < 3; tuft += 1) {
        const x = (tuft - 1) * .13
        const height = tuft === 1 ? .52 : .37
        branch(tree, new THREE.Vector3(0, .21, 0), new THREE.Vector3(x, height, 0), .018)
        ball(tree, palette[tuft % 2], x, height, 0, .135)
        for (let berry = 0; berry < 3; berry += 1) {
          ball(tree, palette[2], x + (berry - 1) * .053, height + .018 * (berry % 2), .125, .025)
        }
      }
    } else if (variant === 3) {
      // A tall pear-shaped canopy with a tiny two-leaf sprout.
      ball(tree, palette[0], 0, .41, 0, .19, .20, .17)
      ball(tree, palette[1], 0, .56, 0, .13, .17, .12)
      ball(tree, palette[1], -.045, .72, 0, .065, .025, .035).rotation.z = -.4
      ball(tree, palette[0], .045, .73, 0, .065, .025, .035).rotation.z = .4
    } else {
      // Three rounded tiers, like a small scoop of gelato.
      ball(tree, palette[0], 0, .32, 0, .22, .105, .18)
      ball(tree, palette[1], -.015, .45, 0, .17, .12, .145)
      ball(tree, palette[0], .015, .57, 0, .11, .12, .10)
      blossom(tree, new THREE.Vector3(.06, .53, .12), new THREE.Vector3(.2, .2, 1).normalize(), .055, palette[2], 0)
    }

    const size = .78 + random(index + 190) * .38
    tree.scale.set(size, size * (.9 + random(index + 700) * .2), size)
    tree.position.copy(normal).multiplyScalar(moonSurfaceRadius(normal) - .008)
    tree.quaternion.setFromUnitVectors(up, normal)
    tree.rotateY(random(index + 310) * Math.PI * 2)
    trees.add(tree)
  }

  // Batch repeated petals and canopy lobes: variety without thousands of draws.
  trees.updateMatrixWorld(true)
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }>()
  trees.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const material = object.material as THREE.Material
    const key = `${object.geometry.uuid}:${material.uuid}`
    let batch = batches.get(key)
    if (!batch) {
      batch = { geometry: object.geometry, material, matrices: [] }
      batches.set(key, batch)
    }
    batch.matrices.push(object.matrixWorld.clone())
  })
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length)
    batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    garden.add(mesh)
  }

  const starShape = new THREE.Shape()
  for (let point = 0; point < 10; point += 1) {
    const angle = Math.PI / 2 + point * Math.PI / 5
    const radius = point % 2 === 0 ? 1 : .48
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (point === 0) starShape.moveTo(x, y)
    else starShape.lineTo(x, y)
  }
  starShape.closePath()
  const starGeometry = new THREE.ExtrudeGeometry(starShape, {
    depth: .22, bevelEnabled: true, bevelThickness: .14, bevelSize: .10, bevelSegments: 3, steps: 1,
  })
  starGeometry.translate(0, 0, -.11)
  const starMaterials = ['#ffe68f', '#ffd4a0', '#fff0b5'].map((color) => new THREE.MeshStandardMaterial({
    color, emissive: '#ffbe42', emissiveIntensity: .8, roughness: .48, metalness: 0,
  }))
  const haloCanvas = document.createElement('canvas')
  haloCanvas.width = haloCanvas.height = 64
  const context = haloCanvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,220,115,.6)')
  gradient.addColorStop(.3, 'rgba(255,197,70,.22)')
  gradient.addColorStop(1, 'rgba(255,190,65,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const haloTexture = new THREE.CanvasTexture(haloCanvas)
  haloTexture.colorSpace = THREE.SRGBColorSpace
  const halos: THREE.Sprite[] = []

  for (let index = 0; index < 22; index += 1) {
    const y = 1 - 2 * (index + .5) / 22
    const angle = index * 2.39996 + 1.65
    const normal = new THREE.Vector3(Math.sqrt(1 - y * y) * Math.cos(angle), y, Math.sqrt(1 - y * y) * Math.sin(angle))
    if (isInClearing(normal) || treeNormals.some((treeNormal) => treeNormal.distanceTo(normal) < .19)) continue
    const size = .105 + random(index + 900) * .095
    const anchor = new THREE.Group()
    anchor.position.copy(normal).multiplyScalar(moonSurfaceRadius(normal) - .006)
    anchor.quaternion.setFromUnitVectors(up, normal)
    anchor.rotateY(random(index + 1000) * Math.PI * 2)
    const star = new THREE.Mesh(starGeometry, starMaterials[index % starMaterials.length])
    star.scale.setScalar(size)
    star.position.y = size * .9
    star.rotation.z = (random(index + 1100) - .5) * .4
    anchor.add(star)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture, transparent: true, opacity: .5,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    }))
    halo.position.copy(star.position)
    halo.scale.setScalar(size * 4.5)
    anchor.add(halo)
    halos.push(halo)
    garden.add(anchor)
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return {
    group: garden,
    update(time: number) {
      if (reducedMotion) return
      halos.forEach((halo, index) => {
        halo.material.opacity = .42 + Math.sin(time * .0012 + index * 1.8) * .12
      })
    },
  }
}
