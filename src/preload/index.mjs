import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
import { validChannels } from '../main/ipc/ipcChannels'
import { createIpcApi } from './createIpcApi.js'

const api = createIpcApi(ipcRenderer, validChannels)

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
