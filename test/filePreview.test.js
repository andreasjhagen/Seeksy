import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readTextPreview } from '../src/main/utils/filePreview.js'

test('text previews return complete small files', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seeksy-preview-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'small.txt')
  await fs.writeFile(filePath, 'Seeksy preview')

  assert.equal(await readTextPreview(filePath, 32), 'Seeksy preview')
})

test('text previews cap reads and clearly mark truncation', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seeksy-preview-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'large.txt')
  await fs.writeFile(filePath, 'abcdefghijklmnopqrstuvwxyz')

  const preview = await readTextPreview(filePath, 10)
  assert.equal(preview, 'abcdefghij...\n\n[Content truncated. Open file to see more]')
})
