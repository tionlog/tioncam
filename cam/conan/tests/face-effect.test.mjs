import assert from 'node:assert/strict'
import test from 'node:test'
import { getCostumeFrame, getPoseCostumeFrame, isHandBelowLips } from '../src/face-effect.ts'

function scene() {
  const face = Array.from({ length: 468 }, () => ({ x: .5, y: .38, z: 0 }))
  const set = (index, x, y) => { face[index] = { x, y, z: 0 } }
  set(10, .5, .16); set(152, .5, .62)
  set(234, .34, .38); set(454, .66, .38)
  set(33, .39, .32); set(133, .47, .32)
  set(362, .53, .32); set(263, .61, .32)
  set(61, .44, .51); set(291, .56, .51)
  set(13, .5, .50); set(14, .5, .53)
  const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .7, z: 0, visibility: 0 }))
  pose[11] = { x: .28, y: .69, z: 0, visibility: 1 }
  pose[12] = { x: .72, y: .69, z: 0, visibility: 1 }
  pose[23] = { x: .32, y: .98, z: 0, visibility: 1 }
  pose[24] = { x: .68, y: .98, z: 0, visibility: 1 }
  return { face, pose }
}

test('any tracked part of a hand below the lips activates the costume', () => {
  const { face, pose } = scene()
  const frame = getCostumeFrame(face, pose)
  assert.ok(frame)
  const hand = [{ x: .51, y: .59, z: 0 }]
  assert.equal(isHandBelowLips(frame, [hand], pose), true)
  assert.equal(isHandBelowLips(frame, [hand.map(p => ({ ...p, x: p.x + .4 }))]), false)
  assert.equal(isHandBelowLips(frame, [hand.map(p => ({ ...p, y: p.y + .29 }))]), false)
  assert.equal(isHandBelowLips(frame, [hand.map(p => ({ ...p, y: p.y - .12 }))]), false)
  assert.equal(isHandBelowLips(frame, []), false)
})

test('one visible body hand point works when the detailed hand mesh is occluded', () => {
  const { face, pose } = scene()
  const frame = getCostumeFrame(face, pose)
  assert.ok(frame)
  pose[15] = { x: .54, y: .61, z: 0, visibility: .3 }
  assert.equal(isHandBelowLips(frame, [], pose), true)
  pose[15].visibility = .19
  assert.equal(isHandBelowLips(frame, [], pose), false)
  pose[15].visibility = .8
  pose[15].y = .88
  assert.equal(isHandBelowLips(frame, [], pose), false)
})

test('body head and shoulders provide a wearable frame while the face mesh is hidden', () => {
  const { pose } = scene()
  pose[0] = { x: .5, y: .42, z: 0, visibility: .9 }
  pose[7] = { x: .36, y: .4, z: 0, visibility: .9 }
  pose[8] = { x: .64, y: .4, z: 0, visibility: .9 }
  pose[19] = { x: .5, y: .61, z: 0, visibility: .5 }
  const frame = getPoseCostumeFrame(pose)
  assert.ok(frame)
  assert.equal(isHandBelowLips(frame, [], pose), true)
  assert.ok(frame.eyeA.x < frame.eyeB.x)
  assert.ok(frame.shoulderA.y > frame.chin.y)
  pose[7].visibility = 0
  assert.ok(getPoseCostumeFrame(pose))
  pose[0].visibility = 0
  assert.equal(getPoseCostumeFrame(pose), null)
})

test('tracked face and shoulders define a wearable frame', () => {
  const { face, pose } = scene()
  const frame = getCostumeFrame(face, pose)
  assert.ok(frame)
  assert.deepEqual(frame.eyeA, { x: .43, y: .32 })
  assert.deepEqual(frame.eyeB, { x: .5700000000000001, y: .32 })
  assert.equal(frame.hipA.y, .98)
  assert.equal(getCostumeFrame([], pose), null)
  face[10].x = NaN
  assert.equal(getCostumeFrame(face, pose), null)
})

test('jacket position remains available when hips leave the camera view', () => {
  const { face, pose } = scene()
  pose[23].visibility = pose[24].visibility = 0
  const frame = getCostumeFrame(face, pose)
  assert.ok(frame)
  assert.ok(frame.hipA.y > frame.shoulderA.y)
  assert.ok(frame.hipB.y > frame.shoulderB.y)
})
