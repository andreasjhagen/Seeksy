import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createIpcApi } from '../src/preload/createIpcApi.js'

class FakeIpcRenderer extends EventEmitter {
  invoke(channel, ...args) {
    return Promise.resolve({ channel, args })
  }

  send(channel, ...args) {
    this.emit('sent', channel, ...args)
  }
}

test('IPC subscriptions forward payloads and dispose the wrapped listener', () => {
  const ipcRenderer = new FakeIpcRenderer()
  const api = createIpcApi(ipcRenderer, ['status'])
  const payloads = []
  const dispose = api.on('status', payload => payloads.push(payload))

  ipcRenderer.emit('status', { sender: 'internal' }, { ready: true })
  dispose()
  ipcRenderer.emit('status', { sender: 'internal' }, { ready: false })

  assert.deepEqual(payloads, [{ ready: true }])
  assert.equal(ipcRenderer.listenerCount('status'), 0)
})

test('IPC bridge ignores channels outside the allowlist', async () => {
  const ipcRenderer = new FakeIpcRenderer()
  const api = createIpcApi(ipcRenderer, ['allowed'])

  assert.equal(await api.invoke('blocked'), undefined)
  assert.doesNotThrow(() => api.on('blocked', () => {})())
})
