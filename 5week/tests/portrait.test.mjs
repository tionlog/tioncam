import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createPortrait, createFaceHood, getPortraitCrop } from '../src/portrait.ts'

test('a square camera guide crops without changing the original proportions', () => {
  const crop = getPortraitCrop(1920, 1080, 560, 315, 180, 180)
  assert.equal(crop.width, crop.height)
  assert.equal(crop.x + crop.width / 2, 960)
  assert.equal(crop.y + crop.height / 2, 540)
})

test('portrait camera and mobile previews retain a square centered crop', () => {
  const crop = getPortraitCrop(720, 1280, 320, 240, 128, 128)
  assert.equal(crop.width, crop.height)
  assert.equal(crop.x + crop.width / 2, 360)
  assert.equal(crop.y + crop.height / 2, 640)
})

test('portrait uses the unmodified photo without lighting, tone mapping or relief', () => {
  const texture = new THREE.Texture()
  const mesh = createPortrait(texture)
  assert.equal(mesh.material.map, texture)
  assert.equal(mesh.material.type, 'MeshBasicMaterial')
  assert.equal(mesh.material.toneMapped, false)
  assert.equal(mesh.material.fog, false)
  assert.equal(mesh.material.vertexColors, false)
  assert.equal(mesh.material.color.getHex(), 0xffffff)
  const positions = mesh.geometry.getAttribute('position')
  const normals = mesh.geometry.getAttribute('normal')
  const uv = mesh.geometry.getAttribute('uv')
  for (let i = 0; i < positions.count; i++) {
    assert.equal(positions.getZ(i), 0)
    assert.ok(Number.isFinite(normals.getX(i)) && Number.isFinite(normals.getZ(i)))
    assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1)
  }
  mesh.geometry.dispose(); mesh.material.dispose()
})

test('hood opening includes a recessed lining and a separate rounded lip', () => {
  const hood = createFaceHood(0xffccdd, 0xffffff)
  assert.equal(hood.children.length, 3)
  assert.ok(hood.children[1].position.z < hood.children[2].position.z)
  for (const mesh of hood.children) { mesh.geometry.dispose(); mesh.material.dispose() }
})
