import { globalShortcut } from 'electron'
import { appSettings } from '../../services/electron-store/AppSettingsStore'
import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'

/**
 * WindowHandler: Manages window-related IPC events
 *
 * Handles window visibility, focus, and shortcut registration
 */
export class WindowHandler extends BaseHandler {
  constructor(mainWindow, settingsWindow) {
    super()
    this.mainWindow = mainWindow
    this.settingsWindow = settingsWindow
    this.registeredShortcut = null

    this.registerHandlers({
      [IPC.WINDOW.HIDE_MAIN_WINDOW]: this.handleHideMainWindow.bind(this),
      [IPC.WINDOW.SHOW_MAIN_WINDOW]: this.handleShowMainWindow.bind(this),
      [IPC.WINDOW.SHOW_SETTINGS_PAGE]: this.handleShowSettingsPage.bind(this),
      [IPC.WINDOW.SHOW_SEARCH_PAGE]: this.handleShowSearchPage.bind(this),
      [IPC.WINDOW.GET_ALL_DISPLAYS]: this.handleGetAllDisplays.bind(this),
      [IPC.BACKEND.VALIDATE_GLOBAL_SHORTCUT]: this.handleValidateShortcut.bind(this),
    })

    // Listen for shortcut setting changes
    appSettings.on('setting-changed', ({ key }) => {
      if (key === 'searchShortcut') {
        this.registerGlobalShortcut()
      }
    })

    // Register initial shortcut
    this.registerGlobalShortcut()
  }

  async handleHideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide()
      return { success: true }
    }
    return { success: false, error: 'No main window available' }
  }

  async handleShowMainWindow() {
    if (this.mainWindow) {
      this.showMainWindow()
      return { success: true }
    }
    return { success: false, error: 'No main window available' }
  }

  async handleShowSettingsPage() {
    if (this.settingsWindow) {
      this.settingsWindow.show()
      this.settingsWindow.focus()
      return { success: true }
    }
    return { success: false, error: 'No settings window available' }
  }

  async handleShowSearchPage() {
    if (this.mainWindow && this.settingsWindow) {
      this.settingsWindow.hide()
      this.showMainWindow()
      return { success: true }
    }
    return { success: false, error: 'Windows not available' }
  }

  async handleValidateShortcut(_, shortcut) {
    try {
      // Temporarily register to test if valid
      const isValid = globalShortcut.register(shortcut, () => {})
      if (isValid) {
        globalShortcut.unregister(shortcut)
      }
      return isValid
    }
    catch {
      return false
    }
  }

  async handleGetAllDisplays() {
    const screen = require('electron').screen
    const displays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()

    return displays.map((display, index) => ({
      id: display.id,
      label: display.label || `Display ${index + 1}`,
      isPrimary: display.id === primaryDisplay.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
    }))
  }

  // Helper methods
  showMainWindow() {
    if (!this.mainWindow)
      return

    // Get the target display using the extracted function
    const display = this.determineTargetDisplay()

    this.mainWindow.setBounds({
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    })

    // Update theme
    const preferences = appSettings.getAllPreferences()
    this.mainWindow.webContents.send(IPC.BACKEND.SETTINGS_CHANGED, {
      key: 'darkMode',
      value: preferences.darkMode,
    })

    this.mainWindow.show()
    this.mainWindow.focus()
    this.mainWindow.webContents.send(IPC.WINDOW.WINDOW_OPENED)
    this.mainWindow.webContents.send(IPC.WINDOW.FOCUS_SEARCH)
  }

  determineTargetDisplay() {
    const screen = require('electron').screen
    const displaySetting = appSettings.getSetting('windowDisplay') || 'cursor'

    if (displaySetting === 'cursor') {
      // Get current cursor position
      const cursorPosition = screen.getCursorScreenPoint()
      // Get the display that contains the cursor
      return screen.getDisplayNearestPoint(cursorPosition)
    }
    else if (displaySetting === 'primary') {
      // Primary display setting
      return screen.getPrimaryDisplay()
    }
    else {
      // Specific display ID setting - try to find the display by ID
      const displays = screen.getAllDisplays()
      const displayId = Number.parseInt(displaySetting, 10)
      const targetDisplay = displays.find(d => d.id === displayId)
      // Fall back to primary display if the specific display is not found
      return targetDisplay || screen.getPrimaryDisplay()
    }
  }

  registerGlobalShortcut() {
    if (this.registeredShortcut) {
      globalShortcut.unregister(this.registeredShortcut)
      this.registeredShortcut = null
    }

    const shortcut = appSettings.getSetting('searchShortcut')

    // Special handling for the default shortcut
    const shortcutToRegister
      = shortcut === 'CommandOrControl+Space'
        ? process.platform === 'darwin'
          ? 'Command+Space'
          : 'Control+Space'
        : shortcut

    if (
      globalShortcut.register(shortcutToRegister, () => {
        this.mainWindow.webContents.send(IPC.WINDOW.SEARCH_KEYCOMBO_DOWN)
        this.showMainWindow()
      })
    ) {
      this.registeredShortcut = shortcutToRegister
    }
  }

  cleanup() {
    super.cleanup()

    // Unregister shortcuts
    if (this.registeredShortcut) {
      globalShortcut.unregister(this.registeredShortcut)
      this.registeredShortcut = null
    }
  }
}

export default function setupWindowHandlers(mainWindow, settingsWindow) {
  return new WindowHandler(mainWindow, settingsWindow)
}
