import assert from 'node:assert/strict'
import test from 'node:test'
import { getContrastForeground } from '../src/renderer/src/utils/colorUtils.js'

test('accent foreground uses dark text for light custom colors', () => {
  assert.equal(getContrastForeground('#e769a1'), '#111827')
})

test('accent foreground uses white text for dark custom colors', () => {
  assert.equal(getContrastForeground('#1167b1'), '#ffffff')
})
