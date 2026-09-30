import assert from 'node:assert/strict'
import test from 'node:test'
import { isPrayerPose, PoseHold } from '../src/gesture.ts'
import { grayscalePixels } from '../src/clone.ts'

function hand(x) {
  const points = Array.from({ length: 21 }, () => ({ x, y: .65, z: 0 }))
  points[0] = { x, y: .7, z: 0 }
  for (const [base, dx, y, length] of [[5, -.024, .57, .16], [9, 0, .56, .18], [13, .013, .575, .15], [17, .024, .6, .12]]) {
    for (let i = 0; i < 4; i++) points[base + i] = { x: x + dx, y: y - length * i / 3, z: -.01 * i }
  }
  return points
}

function scene() {
  const face = Array.from({ length: 468 }, () => ({ x: .5, y: .4, z: 0 }))
  face[10] = { x: .5, y: .25, z: 0 }
  face[152] = { x: .5, y: .56, z: 0 }
  face[234] = { x: .38, y: .4, z: 0 }
  face[454] = { x: .62, y: .4, z: 0 }
  const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .4, z: 0, visibility: 1 }))
  pose[7].x = .41
  pose[8].x = .59
  return { left: hand(.47), right: hand(.53), face, pose }
}

const check = s => isPrayerPose(s.left, s.right, s.face, s.pose, 1)
const move = (points, x, y) => points.map(p => ({ ...p, x: p.x + x, y: p.y + y }))

test('detects joined upright hands in front of the face, independent of handedness', () => {
  const s = scene()
  assert.equal(check(s), true)
  assert.equal(check({ ...s, left: s.right, right: s.left }), true)
  for (const aspect of [9 / 16, 16 / 9]) {
    const adjust = points => points.map(p => ({ ...p, y: p.y * aspect }))
    assert.equal(isPrayerPose(adjust(s.left), adjust(s.right), adjust(s.face), adjust(s.pose), aspect), true)
  }
})

test('uses body head landmarks when hands obscure the face mesh', () => {
  assert.equal(check({ ...scene(), face: [] }), true)
  const s = scene()
  s.face = []
  s.pose[0].visibility = .1
  assert.equal(check(s), false)
})

test('rejects chest-level prayer, separated hands, and hands beside the face', () => {
  const s = scene()
  assert.equal(check({ ...s, left: move(s.left, 0, .3), right: move(s.right, 0, .3) }), false)
  assert.equal(check({ ...s, left: move(s.left, -.2, 0), right: move(s.right, .2, 0) }), false)
  assert.equal(check({ ...s, left: move(s.left, .35, 0), right: move(s.right, .35, 0) }), false)
})

test('rejects missing hands, fists, horizontal clapping hands and invalid points', () => {
  const s = scene()
  assert.equal(check({ ...s, right: [] }), false)
  const fist = points => points.map((p, i) => [8, 12, 16, 20].includes(i) ? { ...p, y: .66 } : p)
  assert.equal(check({ ...s, left: fist(s.left), right: fist(s.right) }), false)
  const sideways = points => points.map(p => ({ ...p, x: .5 + (.7 - p.y), y: .5 + (p.x - .5) }))
  assert.equal(check({ ...s, left: sideways(s.left), right: sideways(s.right) }), false)
  s.left[9].x = NaN
  assert.equal(check(s), false)
})

test('prayer hold rejects a brief clap and tolerates short hand occlusion', () => {
  const hold = new PoseHold(280, 500)
  assert.equal(hold.update(true, 0), false)
  assert.equal(hold.update(true, 100), false)
  assert.equal(hold.update(false, 200), false)
  assert.equal(hold.update(true, 400), false)
  assert.equal(hold.update(true, 700), true)
  assert.equal(hold.update(false, 950), true)
  assert.equal(hold.update(false, 1250), false)
})

test('clone grayscale preserves alpha and does not alter the original pixels', () => {
  const original = new Uint8ClampedArray([220, 30, 10, 255, 40, 160, 80, 128, 180, 180, 180, 0])
  const copy = original.slice()
  grayscalePixels(copy)
  for (let i = 0; i < copy.length; i += 4) {
    assert.equal(copy[i], copy[i + 1])
    assert.equal(copy[i], copy[i + 2])
    assert.equal(copy[i + 3], original[i + 3])
  }
  assert.deepEqual([...original.slice(0, 4)], [220, 30, 10, 255])
})
