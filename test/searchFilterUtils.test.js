import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSearchFilters } from '../src/renderer/src/utils/searchFilterUtils.js'

test('date filters become numeric local-day boundaries', () => {
  const filters = normalizeSearchFilters({
    type: ['document'],
    dateRange: { from: '2026-08-09', to: '2026-08-10' },
  })

  const from = new Date(filters.dateRange.from)
  const to = new Date(filters.dateRange.to)
  assert.equal(from.getFullYear(), 2026)
  assert.equal(from.getMonth(), 7)
  assert.equal(from.getDate(), 9)
  assert.equal(from.getHours(), 0)
  assert.equal(to.getDate(), 10)
  assert.equal(to.getHours(), 23)
  assert.equal(to.getMilliseconds(), 999)
  assert.deepEqual(filters.type, ['document'])
})

test('empty date filters stay null', () => {
  const filters = normalizeSearchFilters({ dateRange: { from: null, to: null } })
  assert.deepEqual(filters.dateRange, { from: null, to: null })
})
