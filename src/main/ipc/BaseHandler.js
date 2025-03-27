import { ipcMain } from 'electron'

export class BaseHandler {
  constructor() {
    this.handlers = new Map()
    this.registeredChannels = new Set()
  }

  /**
   * Register an IPC handler
   * @param {string} channel - The IPC channel name
   * @param {Function} handler - The handler function
   */
  registerHandler(channel, handler) {
    if (this.registeredChannels.has(channel)) {
      console.warn(`Handler for channel ${channel} already registered`)
      return
    }

    this.handlers.set(channel, handler)
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args)
      }
      catch (error) {
        console.error(`Error in handler for ${channel}:`, error)
        return { error: error.message, success: false }
      }
    })
    this.registeredChannels.add(channel)
  }

  /**
   * Register multiple handlers at once
   * @param {object} handlers - Object with channel-handler pairs
   */
  registerHandlers(handlers) {
    Object.entries(handlers).forEach(([channel, handler]) => {
      this.registerHandler(channel, handler)
    })
  }

  /**
   * Cleanup all registered handlers
   */
  cleanup() {
    this.registeredChannels.forEach((channel) => {
      ipcMain.removeHandler(channel)
    })
    this.handlers.clear()
    this.registeredChannels.clear()
  }
}
