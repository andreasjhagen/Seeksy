import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
import { validChannels } from '../main/ipc/ipcChannels'

// Create a more consistent API
const api = {
  invoke: (channel, ...args) => {
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
  },
  send: (channel, ...args) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },
  on: (channel, callback) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args))
      return () => ipcRenderer.removeListener(channel, callback)
    }
  },
  removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback),
  removeAllListeners: channel => ipcRenderer.removeAllListeners(channel),
}

// Expose our safe APIs
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electron', electronAPI)
  }
  catch (error) {
    console.error('Failed to expose APIs:', error)
  }
}
else {
  window.api = api
  window.electron = electronAPI
}
