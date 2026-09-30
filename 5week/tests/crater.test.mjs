import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { isCraterDrop, createDismissalGuide, CLEARING_NORMAL, DISMISSAL_RADIUS } from '../src/moon.ts'

test('only the first large front basin dismisses residents', () => {
  assert.equal(isCraterDrop(new THREE.Vector3(.34, .30, .89).normalize()), true)
  const ordinaryCraters = [
    [-.43,.06,.90], [-.13,-.39,.91], [-.43,.65,.62], [.04,.62,.80],
    [.58,.68,.47], [.67,-.47,.59], [.48,-.17,.86], [.16,-.79,.59],
    [-.34,-.68,.65], [.91,.04,.39], [-.89,-.11,.45], [-.72,.45,-.52],
    [.20,.48,-.86], [.75,-.24,-.62], [-.39,-.68,-.62], [-.05,-.13,-.99],
    [.54,-.76,-.36], [-.89,-.43,-.16], [.03,.97,-.22],
  ]
  for (const xyz of ordinaryCraters) assert.equal(isCraterDrop(new THREE.Vector3(...xyz).normalize()), false)
  assert.equal(isCraterDrop(CLEARING_NORMAL), false)
})

test('the drag guide follows the single dismissal boundary exactly', () => {
  const guide = createDismissalGuide()
  assert.equal(guide.visible, false)
  const center = new THREE.Vector3(.34, .30, .89).normalize()
  const points = guide.geometry.getAttribute('position')
  for (let i = 0; i < points.count; i++) {
    const direction = new THREE.Vector3().fromBufferAttribute(points, i).normalize()
    assert.ok(Math.abs(direction.distanceTo(center) - DISMISSAL_RADIUS) < 1e-6)
    assert.equal(isCraterDrop(direction.clone().lerp(center, .02).normalize()), true)
    assert.equal(isCraterDrop(direction.clone().lerp(center, -.02).normalize()), false)
  }
  guide.geometry.dispose(); guide.material.dispose()
})
