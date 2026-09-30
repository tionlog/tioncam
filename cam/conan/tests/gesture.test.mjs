import assert from 'node:assert/strict'
import test from 'node:test'
import { isConanPose, PoseHold } from '../src/gesture.ts'

function pointingHand() {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  const set = (i, x, y, z) => { points[i] = { x, y, z } }
  set(1, -.35, .35, 0)
  set(2, -.65, .45, -.03)
  set(3, -.95, .5, -.06)
  set(4, -1.25, .55, -.09)
  set(5, -.4, 1, 0)
  set(6, -.4, 1.04, -.35)
  set(7, -.4, 1.08, -.7)
  set(8, -.4, 1.12, -1)
  for (const [mcp, x, y] of [[9, 0, 1.1], [13, .35, 1], [17, .65, .85]]) {
    set(mcp, x, y, 0)
    set(mcp + 1, x, y + .35, -.1)
    set(mcp + 2, x, y + .05, -.45)
    set(mcp + 3, x, y - .15, -.45)
  }
  return points
}

function normalized(points, aspect = 1) {
  return points.map(p => ({ x: .5 + p.x * .12, y: (.5 - p.y * .12) * aspect, z: p.z * .12 }))
}

function recognizes(points, aspect = 1) {
  return isConanPose(normalized(points, aspect), points, aspect)
}

test('recognizes a foreshortened index and open thumb on either hand', () => {
  const hand = pointingHand()
  assert.equal(recognizes(hand), true)
  assert.equal(recognizes(hand.map(p => ({ ...p, x: -p.x }))), true)
})

test('recognizes different scales, camera aspect ratios, and missing world landmarks', () => {
  for (const aspect of [9 / 16, 1, 16 / 9]) {
    const hand = pointingHand().map(p => ({ x: p.x * .25, y: p.y * .25, z: p.z * .25 }))
    assert.equal(recognizes(hand, aspect), true)
    assert.equal(isConanPose(normalized(hand, aspect), undefined, aspect), true)
  }
})

test('rejects sideways and away-facing pointing', () => {
  const away = pointingHand().map(p => ({ ...p, z: -p.z }))
  assert.equal(recognizes(away), false)
  const side = pointingHand().map(p => ({ x: p.z, y: p.y, z: p.x }))
  assert.equal(recognizes(side), false)
})

test('rejects an open palm, V sign, closed thumb, and a fist', () => {
  const palm = pointingHand()
  for (const mcp of [9, 13, 17]) {
    for (let step = 1; step <= 3; step++) palm[mcp + step] = { ...palm[mcp], y: palm[mcp].y + step * .3 }
  }
  assert.equal(recognizes(palm), false)
  const closedThumb = pointingHand()
  closedThumb[4] = { ...closedThumb[5] }
  assert.equal(recognizes(closedThumb), false)
  const v = structuredClone(closedThumb)
  for (let step = 1; step <= 3; step++) v[9 + step] = { ...v[9], y: v[9].y + step * .3 }
  assert.equal(recognizes(v), false)
  const fist = pointingHand()
  fist[8] = { ...fist[5], y: .75, z: -.1 }
  assert.equal(recognizes(fist), false)
})

test('rejects incomplete, nonfinite, or collapsed landmarks', () => {
  assert.equal(isConanPose([], undefined, 1), false)
  const invalid = pointingHand()
  invalid[8].z = NaN
  assert.equal(recognizes(invalid), false)
  assert.equal(recognizes(Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))), false)
})

test('requires sustained detection, tolerates brief dropout, and then releases', () => {
  const hold = new PoseHold()
  assert.equal(hold.update(true, 0), false)
  assert.equal(hold.update(true, 100), false)
  assert.equal(hold.update(true, 190), true)
  assert.equal(hold.update(false, 300), true)
  assert.equal(hold.update(true, 400), true)
  assert.equal(hold.update(false, 700), true)
  assert.equal(hold.update(false, 850), false)
})

test('a one-frame false positive never activates and reset clears a held pose', () => {
  const hold = new PoseHold()
  hold.update(true, 0)
  hold.update(false, 100)
  assert.equal(hold.update(true, 200), false)
  assert.equal(hold.update(true, 400), true)
  hold.reset()
  assert.equal(hold.active, false)
  assert.equal(hold.update(true, 500), false)
})
