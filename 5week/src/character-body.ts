import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { CharacterStyle } from './population'
import { createFaceHood } from './portrait.ts'
import { addTinkerbellCostume } from './costumes.ts'

/** Costume geometry only; photographed faces never pass through this builder. */
export function createCharacterBody(style: CharacterStyle, root: THREE.Group) {
  const material = (color: number, roughness = .72) => new THREE.MeshStandardMaterial({ color, roughness })
  const white = material(0xfff8ef), pink = material(0xf99eab), mint = material(0x56c6b4)
  const green = material(0x68ac64), leafLight = material(0xa7d975), yellow = material(0xf8d18c)
  const navy = material(0x6275ad), blue = material(0xa8cde4), dark = material(0x404655)
  const gold = material(0xf2ce68), brown = material(0xad7858), cream = material(0xffe5c7)
  // Shared inside this resident only: deleting another resident cannot free it.
  const sphere = new THREE.SphereGeometry(1, 32, 24)
  function round(parent: THREE.Object3D, name: string, mat: THREE.Material, scale: [number, number, number], position: [number, number, number]) {
    const mesh = new THREE.Mesh(sphere, mat)
    mesh.name = name; mesh.scale.set(...scale); mesh.position.set(...position); parent.add(mesh)
    return mesh
  }
  function box(parent: THREE.Object3D, name: string, mat: THREE.Material, size: [number, number, number], position: [number, number, number], radius = .025) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 3, radius), mat)
    mesh.name = name; mesh.position.set(...position); parent.add(mesh)
    return mesh
  }
  function capsule(parent: THREE.Object3D, name: string, mat: THREE.Material, radius: number, length: number, position: [number, number, number]) {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 20), mat)
    mesh.name = name; mesh.position.set(...position); parent.add(mesh)
    return mesh
  }

  const head = new THREE.Group()
  head.name = 'character-head'
  head.position.y = .96
  head.scale.setScalar(1.14)
  const hoodColors = {
    rabbit: [0xfff8ef, 0xffd0dc], astronaut: [0x6275ad, 0xe9f4fc],
    sprout: [0xf8d18c, 0x83b971], tinkerbell: [0xf4d272, 0xffecc3],
  } as const
  head.add(createFaceHood(hoodColors[style][0], hoodColors[style][1], style === 'astronaut'))
  root.add(head)

  const bodyMat = style === 'rabbit' ? mint : style === 'astronaut' ? white : style === 'sprout' ? yellow : green
  const limbMat = style === 'rabbit' || style === 'astronaut' ? white : cream
  const shoeMat = style === 'rabbit' ? white : style === 'astronaut' ? navy : style === 'sprout' ? brown : green
  const torso = round(root, 'soft-short-torso', bodyMat,
    [style === 'tinkerbell' ? .165 : .215, .205, .155], [0, .47, 0])
  round(root, 'rounded-collar', bodyMat, [.135, .06, .125], [0, .65, 0])

  function arm(side: number) {
    const pivot = new THREE.Group()
    pivot.name = side < 0 ? 'left-arm-pivot' : 'right-arm-pivot'
    pivot.position.set(side * (style === 'tinkerbell' ? .18 : .215), .605, 0)
    // Resting splay lives below the animated joint, so walking/falling can still
    // animate rotation.x/z without straightening the mitten silhouette.
    const sleeve = new THREE.Group()
    sleeve.rotation.z = side * .24
    pivot.add(sleeve)
    round(sleeve, 'puff-sleeve', style === 'tinkerbell' ? cream : bodyMat, [.073, .086, .076], [0, -.044, 0])
    capsule(sleeve, 'short-forearm', limbMat, .045, .055, [0, -.13, .006])
    round(sleeve, 'round-mitten', limbMat, [.062, .065, .06], [0, -.205, .016])
    round(sleeve, 'mitten-thumb', limbMat, [.028, .037, .033], [-side * .046, -.188, .045])
    if (style === 'astronaut') round(sleeve, 'space-glove-cuff', navy, [.062, .025, .062], [0, -.151, .006])
    root.add(pivot)
    return { pivot, sleeve }
  }
  function leg(side: number) {
    const pivot = new THREE.Group()
    pivot.name = side < 0 ? 'left-leg-pivot' : 'right-leg-pivot'
    pivot.position.set(side * .097, .315, 0)
    round(pivot, 'rounded-shorts', style === 'sprout' ? green : bodyMat, [.09, .079, .107], [0, -.015, 0])
    capsule(pivot, 'short-leg', limbMat, .053, .095, [0, -.12, 0])
    round(pivot, 'sock-cuff', style === 'sprout' ? yellow : white, [.057, .035, .06], [0, -.187, 0])
    round(pivot, 'round-shoe', shoeMat, [.088, .065, .12], [0, -.237, .035])
    round(pivot, 'shoe-sole', style === 'sprout' ? cream : style === 'astronaut' ? blue : shoeMat,
      [.089, .015, .119], [0, -.287, .037])
    if (style === 'rabbit') round(pivot, 'pink-paw-pad', pink, [.048, .019, .054], [0, -.213, .113])
    if (style === 'tinkerbell') round(pivot, 'fairy-shoe-pompom', white, [.04, .04, .04], [0, -.195, .116])
    if (style === 'sprout') box(pivot, 'garden-shoe-strap', green, [.137, .027, .032], [0, -.193, .056], .012)
    root.add(pivot)
    return pivot
  }
  const left = arm(-1), right = arm(1)
  const leftLeg = leg(-1), rightLeg = leg(1)
  let wings: THREE.Group[] = []

  if (style === 'rabbit') {
    // White fur, peach-pink inner ears, a mint A-line tunic and cotton tail.
    for (const side of [-1, 1]) {
      const ear = new THREE.Group()
      ear.name = 'rabbit-ear'; ear.position.set(side * .123, .37, -.035)
      ear.rotation.z = -side * .1
      capsule(ear, 'fluffy-ear', white, .075, .255, [0, 0, 0])
      capsule(ear, 'pink-inner-ear', pink, .044, .195, [0, .008, .061]).scale.z = .36
      head.add(ear)
    }
    const tunic = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0, .315), new THREE.Vector2(.22, .315), new THREE.Vector2(.237, .335),
      new THREE.Vector2(.226, .385), new THREE.Vector2(.18, .56), new THREE.Vector2(.145, .63), new THREE.Vector2(0, .652),
    ], 40), mint)
    tunic.name = 'mint-rabbit-tunic'; root.add(tunic)
    // Small geometric bunny applique rather than any modification to the photo.
    round(root, 'bunny-applique', white, [.075, .063, .014], [0, .457, .225])
    for (const side of [-1, 1]) {
      round(root, 'applique-ear', white, [.02, .042, .012], [side * .031, .523, .218])
      round(root, 'applique-inner-ear', pink, [.009, .025, .005], [side * .031, .525, .23])
      round(root, 'applique-eye', dark, [.005, .008, .004], [side * .025, .459, .239])
    }
    round(root, 'cotton-tail', white, [.095, .092, .09], [0, .395, -.205])
    round(root, 'tail-fluff', white, [.064, .065, .056], [.047, .427, -.224])
  } else if (style === 'astronaut') {
    torso.scale.set(.224, .211, .174)
    box(root, 'space-control-panel', navy, [.166, .139, .045], [0, .505, .172])
    box(root, 'space-panel-screen', blue, [.116, .041, .012], [0, .535, .199], .008)
    for (let i = 0; i < 3; i++) round(root, 'space-panel-button', [pink, gold, green][i], [.013, .013, .01], [(i - 1) * .038, .48, .20])
    round(root, 'space-waist-band', navy, [.212, .032, .171], [0, .356, 0])
    box(root, 'oxygen-backpack', navy, [.255, .26, .115], [0, .475, -.184], .04)
    for (const side of [-1, 1]) {
      capsule(root, 'oxygen-tank', blue, .052, .16, [side * .095, .49, -.259])
      round(head, 'helmet-communicator', white, [.046, .083, .075], [side * .287, -.018, -.018])
      round(head, 'communicator-center', blue, [.019, .045, .045], [side * .322, -.018, -.016])
    }
    capsule(head, 'helmet-antenna', blue, .012, .13, [-.232, .23, -.065])
    round(head, 'antenna-tip', pink, [.027, .027, .027], [-.232, .316, -.065])
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(.19, .55, -.15), new THREE.Vector3(.27, .46, -.04),
      new THREE.Vector3(.23, .38, .12), new THREE.Vector3(.14, .39, .16),
    ])
    const tube = new THREE.Mesh(new THREE.TubeGeometry(hose, 20, .018, 8, false), gold)
    tube.name = 'oxygen-hose'; root.add(tube)
  } else if (style === 'sprout') {
    round(root, 'green-overalls', green, [.22, .132, .17], [0, .375, .004])
    box(root, 'overall-bib', green, [.23, .185, .047], [0, .497, .141], .035)
    for (const side of [-1, 1]) {
      const strap = box(root, 'overall-strap', green, [.041, .161, .022], [side * .087, .572, .141], .015)
      strap.rotation.z = -side * .13
      round(root, 'overall-button', gold, [.021, .021, .011], [side * .083, .522, .176])
    }
    box(root, 'seed-pocket', leafLight, [.122, .075, .022], [0, .447, .18], .02)
    round(root, 'pocket-seed', cream, [.018, .025, .009], [0, .45, .196]).rotation.z = -.3
    const stem = capsule(head, 'sprout-stem', green, .024, .17, [0, .3, -.01])
    stem.rotation.z = -.08
    for (const side of [-1, 1]) {
      const leaf = round(head, 'large-sprout-leaf', side < 0 ? leafLight : green, [.19, .072, .091], [side * .14, .403, -.01])
      leaf.rotation.z = side * .38
      const vein = round(head, 'leaf-vein', yellow, [.117, .009, .012], [side * .146, .412, .069])
      vein.rotation.z = side * .38
    }
    round(root, 'seed-satchel', brown, [.135, .143, .063], [0, .465, -.17])
    round(root, 'satchel-flap', yellow, [.127, .06, .029], [0, .535, -.217])
  } else {
    const costume = addTinkerbellCostume(root, head)
    wings = costume.wings
    // The wand belongs to the hand's animated subtree, never floats in place.
    const wand = capsule(right.sleeve, 'fairy-wand', gold, .01, .19, [.072, -.136, .049])
    wand.rotation.z = -.18
    const star = new THREE.Shape()
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .026 : .056
      if (i === 0) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    star.closePath()
    const tip = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: .012, bevelEnabled: true, bevelSize: .004, bevelThickness: .004, bevelSegments: 2, steps: 1 }), gold)
    tip.name = 'fairy-wand-star'; tip.position.set(.052, -.019, .05); right.sleeve.add(tip)
  }
  return { head, leftArm: left.pivot, rightArm: right.pivot, leftLeg, rightLeg, wings }
}
