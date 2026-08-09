import os from 'node:os'
import { app, BrowserWindow, Notification } from 'electron'
import { fileDB } from '../../services/database/database'
import { appSettings } from '../../services/electron-store/AppSettingsStore'
import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'

/**
 * SystemHandler: Handles system-level operations
 *
 * Responsible for system info, notifications, progress bars, and application reset
 */
export class SystemHandler extends BaseHandler {
  constructor(indexer) {
    super()
    this.indexer = indexer
    this.registerHandlers({
      [IPC.SYSTEM.GET_SYSTEM_INFO]: this.handleGetSystemInfo.bind(this),
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

  async handleResetApplication() {
    try {
      await this.indexer.cleanup()
      const resetResult = fileDB.resetDatabase()
      if (!resetResult.success) {
        throw new Error(resetResult.message || 'Failed to reset the database')
      }
      appSettings.reset()
      appSettings.store.set('version', app.getVersion())
      setTimeout(() => {
        app.relaunch()
        app.quit()
      }, 250)
      return { success: true, restarting: true }
    }
    catch (error) {
      console.error('Application reset failed:', error)
      // cleanup() permanently tears down manager listeners, so restart to
      // restore a healthy service graph even when the reset transaction fails.
      setTimeout(() => {
        app.relaunch()
        app.quit()
      }, 1000)
      return { success: false, error: error.message }
    }
  }

  async handleShowNotification(_, { title, body, icon }) {
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
      // Get the window that sent the request (the settings window in this case)
      const senderWindow = BrowserWindow.fromWebContents(event.sender)
      const window = senderWindow || BrowserWindow.getAllWindows()[0]

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
        default: {
          // Ensure progress is between 0 and 1
          const normalizedProgress = Math.max(0, Math.min(1, progress || 0))
          window.setProgressBar(normalizedProgress)
          break
        }
      }

      return { success: true }
    }
    catch (error) {
      console.error('Failed to set progress bar:', error)
      return { success: false, error: error.message }
    }
  }
}

export default function setupSystemHandlers(indexer) {
  return new SystemHandler(indexer)
}
