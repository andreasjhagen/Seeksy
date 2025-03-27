import os from 'node:os'
import { app, BrowserWindow, Notification } from 'electron'
import { fileDB } from '../../services/database/database'
import { appSettings } from '../../services/electron-store/AppSettingsStore'
import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'

export class SystemHandler extends BaseHandler {
  constructor(indexer) {
    super()
    this.indexer = indexer
    this.registerHandlers({
      [IPC.SYSTEM.GET_SYSTEM_INFO]: this.handleGetSystemInfo.bind(this),
      [IPC.SYSTEM.CHECK_FOR_UPDATES]: this.handleCheckForUpdates.bind(this),
      [IPC.SYSTEM.RESET_APPLICATION]: this.handleResetApplication.bind(this),
      [IPC.SYSTEM.SHOW_NOTIFICATION]: this.handleShowNotification.bind(this),
      [IPC.SYSTEM.SET_PROGRESS_BAR]: this.handleSetProgressBar.bind(this),
    })
  }

  async handleGetSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    }
  }

  async handleCheckForUpdates() {
    try {
      return {
        hasUpdate: false,
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
        updateUrl: null,
      }
    }
    catch (error) {
      console.error('Update check failed:', error)
      return { error: error.message, hasUpdate: false }
    }
  }

  async handleResetApplication() {
    try {
      await this.indexer.cleanup()
      fileDB.resetDatabase()
      appSettings.reset()
      appSettings.store.set('version', app.getVersion())
      return { success: true }
    }
    catch (error) {
      console.error('Application reset failed:', error)
      return { success: false, error: error.message }
    }
  }

  async handleShowNotification(event, { title, body, icon }) {
    try {
      if (!Notification.isSupported()) {
        throw new Error('Notifications are not supported on this system')
      }

      const notification = new Notification({
        title: title || 'Seeksy',
        body: body || '',
        icon: icon || undefined,
      })

      notification.show()
      return { success: true }
    }
    catch (error) {
      console.error('Failed to show notification:', error)
      return { success: false, error: error.message }
    }
  }

  async handleSetProgressBar(event, { progress, mode = 'normal' }) {
    try {
      const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      if (!window) {
        throw new Error('No window available')
      }

      // Handle different progress modes
      switch (mode) {
        case 'none':
          window.setProgressBar(-1)
          break
        case 'indeterminate':
          window.setProgressBar(2)
          break
        case 'error':
          window.setProgressBar(1, { mode: 'error' })
          break
        case 'normal':
        default:
          // Ensure progress is between 0 and 1
          const normalizedProgress = Math.max(0, Math.min(1, progress || 0))
          window.setProgressBar(normalizedProgress)
          break
      }

      return { success: true }
    }
    catch (error) {
      console.error('Failed to set progress bar:', error)
      return { success: false, error: error.message }
    }
  }
}

export default function setupSystemHandlers(indexer, fileDB) {
  return new SystemHandler(indexer, fileDB)
}

/*
// Examples:
ipcRenderer.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, { progress: 0.5 }) // 50% progress
ipcRenderer.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, { mode: 'indeterminate' }) // Loading state
ipcRenderer.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, { mode: 'none' }) // Hide progress
ipcRenderer.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, { mode: 'error' }) // Error state

ipcRenderer.invoke(IPC.SYSTEM.SHOW_NOTIFICATION, {
  title: 'Hello',
  body: 'This is a notification',
  icon: 'optional/path/to/icon.png'
})
  */
