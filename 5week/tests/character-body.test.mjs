import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createCharacterBody } from '../src/character-body.ts'

const features = {
  rabbit: ['rabbit-ear', 'pink-inner-ear', 'mint-rabbit-tunic', 'bunny-applique', 'cotton-tail', 'pink-paw-pad'],
  astronaut: ['space-control-panel', 'oxygen-backpack', 'oxygen-tank', 'helmet-communicator', 'helmet-antenna', 'oxygen-hose'],
  sprout: ['large-sprout-leaf', 'leaf-vein', 'overall-bib', 'overall-strap', 'seed-pocket', 'seed-satchel', 'garden-shoe-strap'],
  tinkerbell: ['fairy-leaf-dress', 'fairy-hair-bun', 'fairy-wing-pivot', 'fairy-shoe-pompom', 'fairy-wand', 'fairy-wand-star'],
}

for (const [style, names] of Object.entries(features)) {
  test(`${style} has distinct costume details and short articulated limbs`, () => {
    const root = new THREE.Group()
    const body = createCharacterBody(style, root)
    for (const name of names) assert.ok(root.getObjectByName(name), name)
    assert.equal(body.head.name, 'character-head')
    assert.ok(body.head.scale.x > 1)
    assert.equal(body.head.scale.x, body.head.scale.y)
    for (const joint of [body.leftArm, body.rightArm, body.leftLeg, body.rightLeg]) assert.equal(joint.parent, root)
    const bounds = new THREE.Box3().setFromObject(root)
    assert.ok(bounds.min.y >= 0, 'shoes stay above the ground')
    assert.ok(bounds.max.y < 1.8, 'accessories stay within the compact character silhouette')
    let hands = 0, shoes = 0
    root.traverse((object) => { if (object.name === 'round-mitten') hands++; if (object.name === 'round-shoe') shoes++ })
    assert.equal(hands, 2); assert.equal(shoes, 2)
    if (style === 'tinkerbell') {
      assert.equal(body.wings.length, 2)
      const star = root.getObjectByName('fairy-wand-star')
      assert.equal(star.parent.parent, body.rightArm)
      const before = star.getWorldPosition(new THREE.Vector3())
      body.rightArm.rotation.x = .6
      assert.ok(before.distanceTo(star.getWorldPosition(new THREE.Vector3())) > .01)
    }
    const geometries = new Set(), materials = new Set()
    root.traverse((object) => {
      if (object.isMesh) { geometries.add(object.geometry); materials.add(object.material) }
    })
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
  })
}

test('a deleted costume cannot dispose another resident’s body geometry', () => {
  const first = new THREE.Group(), second = new THREE.Group()
  createCharacterBody('rabbit', first); createCharacterBody('rabbit', second)
  assert.notEqual(first.getObjectByName('soft-short-torso').geometry, second.getObjectByName('soft-short-torso').geometry)
})
