import assert from 'node:assert/strict'
import test from 'node:test'
import { writePersonMask } from '../src/person-mask.ts'

test('empty GPU masks cannot trigger an effect over the whole person', () => {
  for (const confidence of [0, .01, .3, 1, NaN, Infinity]) {
    const values = new Float32Array(100).fill(confidence)
    assert.equal(writePersonMask(values, new Uint8ClampedArray(400)), false)
  }
  assert.equal(writePersonMask(new Float32Array(), new Uint8ClampedArray()), false)
  assert.equal(writePersonMask(new Float32Array(100), new Uint8ClampedArray(4)), false)
})

test('face and body interiors stay fully opaque, with feathering only at the edge', () => {
  const values = new Float32Array([0, .02, .08, .2, .4, .5, .65, .8, 1])
  const pixels = new Uint8ClampedArray(values.length * 4)
  assert.equal(writePersonMask(values, pixels), true)
  const alpha = values.map((_, i) => pixels[i * 4 + 3])
  assert.deepEqual([...alpha.slice(0, 3)], [0, 0, 0])
  assert.ok(alpha[3] > 0 && alpha[3] < alpha[4] && alpha[4] < 255)
  assert.deepEqual([...alpha.slice(5)], [255, 255, 255, 255])
})

test('the dedicated mask removes low-confidence background while retaining solid foreground', () => {
  const values = new Float32Array([0, .08, .2, .45, .72, 1])
  const pixels = new Uint8ClampedArray(values.length * 4)
  assert.equal(writePersonMask(values, pixels, true), true)
  assert.equal(pixels[3], 0)
  assert.equal(pixels[7], 0)
  assert.ok(pixels[11] > 0 && pixels[11] < 64)
  assert.equal(pixels[19], 255)
  assert.equal(pixels[23], 255)
})
