import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { stepResidentMotion, residentNormal } from '../src/motion.ts'

function resident(id, offset = 0) {
  const angle = Math.PI / 2 + offset
  return { id, angle, latitude: 0, speed: .15, greetingUntil: 0,
    heading: new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)),
    fallenUntil: 0, collisionCooldown: 0, fallTilt: 0, walking: true,
    dragging: false, meetingTarget: null }
}

test('a collision topples the resident ahead and separates the follower', () => {
  const behind = resident('behind')
  const ahead = resident('ahead', .10)
  assert.deepEqual(stepResidentMotion([behind, ahead], 1000, .016), ['ahead'])
  assert.equal(behind.fallenUntil, 0)
  assert.ok(ahead.fallenUntil > 1000 && ahead.fallTilt > 0)
  assert.ok(residentNormal(behind).distanceTo(residentNormal(ahead)) > .14)
})

test('walkers turn sideways before reaching a fallen resident ahead', () => {
  const walker = resident('walker')
  const fallen = resident('fallen', .23)
  fallen.fallenUntil = 5000
  const before = walker.heading.clone()
  stepResidentMotion([walker, fallen], 1000, .05)
  assert.ok(Math.abs(walker.heading.y) > .05)
  assert.ok(walker.heading.distanceTo(before) > .05)
  assert.equal(walker.fallenUntil, 0)
  assert.equal(fallen.walking, false)
})

test('fallen residents stand back up and resume walking', () => {
  const character = resident('recovering')
  character.fallenUntil = 1000
  character.fallTilt = Math.PI * .46
  const before = character.angle
  for (let frame = 0; frame < 180; frame++) stepResidentMotion([character], 1100 + frame * 16, .016)
  assert.ok(character.fallTilt < .01)
  assert.ok(character.angle > before)
  assert.equal(character.walking, true)
})

test('dragged residents do not fall or shift under the pointer', () => {
  const held = resident('held')
  held.dragging = true
  const walker = resident('walker', .04)
  const before = held.angle
  assert.deepEqual(stepResidentMotion([held, walker], 1000, .05), [])
  assert.equal(held.angle, before)
})

test('meeting residents already at their seats do not topple each other', () => {
  const a = resident('a')
  const b = resident('b', .1)
  a.meetingTarget = residentNormal(a)
  b.meetingTarget = residentNormal(b)
  assert.deepEqual(stepResidentMotion([a, b], 1000, .016), [])
})
