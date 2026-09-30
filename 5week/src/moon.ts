import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

export const MOON_RADIUS = 2.48
export const CLEARING_NORMAL = new THREE.Vector3(-.35, .46, .82).normalize()
export const CLEARING_RADIUS = .44

export function isInClearing(direction: THREE.Vector3) {
  return direction.distanceTo(CLEARING_NORMAL) < CLEARING_RADIUS + .10
}

type Crater = {
  center: THREE.Vector3
  tangent: THREE.Vector3
  bitangent: THREE.Vector3
  size: number
  depth: number
  seed: number
  fractured: boolean
}

function crater(x: number, y: number, z: number, size: number, depth: number, seed: number, fractured = false): Crater {
  const center = new THREE.Vector3(x, y, z).normalize()
  const tangent = new THREE.Vector3(0, 1, 0).cross(center).normalize()
  return { center, tangent, bitangent: center.clone().cross(tangent), size, depth, seed, fractured }
}

// The initial view has one fractured impact basin and several quieter round
// craters, matching the reference's asymmetrical composition. The far side is
// sculpted too, so the design holds up when the moon is rotated.
const craters: Crater[] = [
  crater(.34, .30, .89, .31, .28, 1, true),
  crater(-.43, .06, .90, .235, .13, 2),
  crater(-.13, -.39, .91, .175, .12, 3),
  crater(-.43, .65, .62, .18, .12, 4),
  crater(.04, .62, .80, .105, .07, 5),
  crater(.58, .68, .47, .15, .09, 6),
  crater(.67, -.47, .59, .185, .12, 7),
  crater(.48, -.17, .86, .125, .095, 8),
  crater(.16, -.79, .59, .18, .11, 9),
  crater(-.34, -.68, .65, .075, .05, 10),
  crater(.91, .04, .39, .11, .075, 11),
  crater(-.89, -.11, .45, .14, .09, 12),
  crater(-.72, .45, -.52, .23, .15, 13),
  crater(.20, .48, -.86, .29, .24, 14, true),
  crater(.75, -.24, -.62, .19, .12, 15),
  crater(-.39, -.68, -.62, .22, .14, 16),
  crater(-.05, -.13, -.99, .13, .09, 17),
  crater(.54, -.76, -.36, .10, .07, 18),
  crater(-.89, -.43, -.16, .12, .08, 19),
  crater(.03, .97, -.22, .15, .10, 20),
]

function sampleSurface(direction: THREE.Vector3) {
  // Broad, continuous undulations keep shared triangle vertices watertight.
  const { x, y, z } = direction
  let radius = MOON_RADIUS + .012 * Math.sin(x * 11 + y * 4) * Math.cos(z * 9 - y * 7)
    + .009 * Math.sin(y * 15 + z * 3) * Math.cos(x * 8)
  let basin = 0
  let rim = 0
  let ejecta = 0

  for (const impact of craters) {
    const distance = direction.distanceTo(impact.center)
    if (distance > impact.size * 1.65) continue
    const angle = Math.atan2(direction.dot(impact.bitangent), direction.dot(impact.tangent))
    const irregularity = impact.fractured
      ? .055 * Math.sin(angle * 7 + impact.seed) + .02 * Math.sin(angle * 11)
      : .025 * Math.sin(angle * 5 + impact.seed)
    const t = distance / (impact.size * (1 + irregularity))
    const floor = 1 - THREE.MathUtils.smoothstep(t, .26, .88)
    const lip = Math.exp(-(((t - .98) / .17) ** 2))
    const apron = Math.exp(-(((t - 1.18) / .23) ** 2))
    const rays = impact.fractured ? Math.max(0, Math.cos(angle * 9 + impact.seed)) ** 10 : 0
    radius += -impact.depth * floor + impact.depth * .23 * lip + .013 * apron
      + rays * .022 * Math.exp(-(((t - 1.24) / .25) ** 2))
    basin = Math.max(basin, floor)
    rim = Math.max(rim, lip)
    ejecta = Math.max(ejecta, apron * (.2 + rays * .8))
  }

  const clearing = 1 - THREE.MathUtils.smoothstep(direction.distanceTo(CLEARING_NORMAL), .35, .47)
  radius = THREE.MathUtils.lerp(radius, MOON_RADIUS + .012, clearing)
  return { radius, basin: basin * (1 - clearing), rim: rim * (1 - clearing), ejecta: ejecta * (1 - clearing) }
}

// Stay fully clear of the neighboring meeting area, including its safety margin.
export const DISMISSAL_RADIUS = craters[0].size * .55

export function isCraterDrop(direction: THREE.Vector3) {
  const impact = craters[0]
  return !isInClearing(direction) && direction.distanceTo(impact.center) < DISMISSAL_RADIUS
}

// Only the first, large front-facing basin is a dismissal zone. Draw its exact
// boundary while dragging; all the other craters remain ordinary terrain.
export function createDismissalGuide() {
  const impact = craters[0]
  const angle = 2 * Math.asin(DISMISSAL_RADIUS / 2)
  const points = Array.from({ length: 96 }, (_, index) => {
    const phase = index / 96 * Math.PI * 2
    const direction = impact.center.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(impact.tangent, Math.sin(angle) * Math.cos(phase))
      .addScaledVector(impact.bitangent, Math.sin(angle) * Math.sin(phase)).normalize()
    return direction.multiplyScalar(moonSurfaceRadius(direction) + .022)
  })
  const guide = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: '#ff9b87', transparent: true, opacity: .9, toneMapped: false }))
  guide.name = 'dismissal-boundary'
  guide.visible = false
  return guide
}

export function moonSurfaceRadius(direction: THREE.Vector3) {
  return sampleSurface(direction).radius
}

export function createMoon() {
  // Weld adjacent triangles before recomputing normals: merely switching off
  // flatShading on the old non-indexed mesh still leaves triangle seams.
  const source = new THREE.IcosahedronGeometry(1, 64)
  source.deleteAttribute('uv')
  source.deleteAttribute('normal')
  const geometry = mergeVertices(source)
  source.dispose()
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const colors = new Float32Array(positions.count * 3)
  const direction = new THREE.Vector3()
  const color = new THREE.Color()
  const base = new THREE.Color('#bdb792')
  const shadow = new THREE.Color('#7e8471')
  const highlight = new THREE.Color('#e8dfa8')

  for (let index = 0; index < positions.count; index += 1) {
    direction.fromBufferAttribute(positions, index).normalize()
    const surface = sampleSurface(direction)
    positions.setXYZ(index, direction.x * surface.radius, direction.y * surface.radius, direction.z * surface.radius)
    const mineral = Math.sin(direction.x * 17 + direction.z * 9) * Math.cos(direction.y * 14 - direction.x * 4)
    color.copy(base).lerp(shadow, surface.basin * .43)
      .lerp(highlight, Math.min(.65, surface.rim * .5 + surface.ejecta * .24))
      .multiplyScalar(1 + mineral * .018)
    color.toArray(colors, index * 3)
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    roughness: .88,
    metalness: 0,
  }))
}
