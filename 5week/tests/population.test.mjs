import assert from 'node:assert/strict'
import test from 'node:test'
import { characterStyles, updateRareVests } from '../src/population.ts'

function population(counts) {
  return characterStyles.flatMap((style, index) => Array.from({ length: counts[index] }, () => ({
    style, vest: { visible: false },
  })))
}

function checkVests(residents, expected) {
  const result = updateRareVests(residents)
  assert.equal(result.rarest, expected)
  for (const resident of residents) assert.equal(resident.vest.visible, resident.style === expected)
  return result
}

test('vests transfer from rabbits through a tie to astronauts as residents arrive', () => {
  const residents = population([3, 4, 5, 6])
  assert.deepEqual(checkVests(residents, 'rabbit').counts, { rabbit: 3, astronaut: 4, sprout: 5, tinkerbell: 6 })
  assert.equal(residents.filter((r) => r.vest.visible).length, 3)
  residents.push({ style: 'rabbit', vest: { visible: false } })
  checkVests(residents, null)
  residents.push({ style: 'rabbit', vest: { visible: false } })
  checkVests(residents, 'astronaut')
  assert.equal(residents.filter((r) => r.vest.visible).length, 4)
})

test('every type, including Tinkerbell, can be the single rarest type', () => {
  for (const [index, style] of characterStyles.entries()) {
    const counts = [3, 3, 3, 3]
    counts[index] = 2
    checkVests(population(counts), style)
  }
})

test('two-way, three-way and four-way minima never receive vests', () => {
  for (const counts of [[1, 1, 2, 3], [1, 1, 1, 3], [2, 2, 2, 2]]) {
    const residents = population(counts)
    // Verify stale vests are actively removed, not just skipped.
    residents.forEach((resident) => { resident.vest.visible = true })
    checkVests(residents, null)
  }
})

test('all four populations participate, including zero counts', () => {
  for (const counts of [[0, 0, 0, 0], [1, 0, 0, 0], [1, 1, 1, 0]]) {
    checkVests(population(counts), null)
  }
})
