import path, { join } from 'node:path'
// === Imports ===
// Electron core
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray } from 'electron'
// Utils
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
// App  Icons
import appIcon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/trayIcon.png?asset'
import setupDatabaseItemHandlers from './ipc/handlers/databaseItemHandlers.js'
import setupDiskReaderHandlers from './ipc/handlers/diskReaderHandlers'
import setupFileIndexerHandlers from './ipc/handlers/indexHandlers.js'

import setupAppIndexerHandlers from './ipc/handlers/installedAppsHandlers.js'
import setupSettingsHandlers from './ipc/handlers/settingsHandlers.js'
import setupSystemHandlers from './ipc/handlers/systemHandlers.js'
// Project imports
import { IPC_CHANNELS } from './ipc/ipcChannels.js'
// Services
import { applicationLauncher } from './services/application-indexer/ApplicationLauncher.js'
import { fileDB } from './services/database/database'

import { appSettings } from './services/electron-store/AppSettingsStore.js'
import { IndexController } from './services/folder-indexer/IndexController.js'
import { registerFileProtocol } from './services/registerFileProtocol'

// === Global Variables ===
let mainWindow = null
let settingsWindow = null
let tray = null
let registeredShortcut = null

/**
 * Determines which display to show the main window on based on settings
 * @returns {Electron.Display} The target display
 */
function determineTargetDisplay() {
  const screen = require('electron').screen
  const displaySetting = appSettings.getSetting('windowDisplay') || 'cursor'

  // Simplified logic with just two options
  if (displaySetting === 'cursor') {
    // Get current cursor position
    const cursorPosition = screen.getCursorScreenPoint()
    // Get the display that contains the cursor
    return screen.getDisplayNearestPoint(cursorPosition)
  }
  else {
    // Default to primary display for any other setting
    return screen.getPrimaryDisplay()
  }
}

// === Search Window Management ===
function createMainWindow() {
  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width,
    height,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: appIcon, // Add window icon
    ...(process.platform === 'darwin' ? { vibrancy: 'dark' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      nodeIntegration: true,
    },
  })

  setupMainWindowEventHandlers()
  loadWindowContent(mainWindow)
}

function setupMainWindowEventHandlers() {
  mainWindow.on('blur', () => {
    mainWindow.hide()
    mainWindow.webContents.send(IPC_CHANNELS.SEARCH_WINDOW_FOCUS_LOST)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Remove the old theme handling code and use the new settings system
  mainWindow.webContents.on('did-finish-load', () => {
    const preferences = appSettings.getAllPreferences()
    mainWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, {
      key: 'darkMode',
      value: preferences.darkMode,
    })
  })

  mainWindow.on('show', () => {
    const preferences = appSettings.getAllPreferences()
    mainWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, {
      key: 'darkMode',
      value: preferences.darkMode,
    })
  })
}

function showMainWindow() {
  if (!mainWindow)
    return

  // Get the target display using the extracted function
  const display = determineTargetDisplay()

  mainWindow.setBounds({
    x: display.workArea.x,
    y: display.workArea.y,
    width: display.workArea.width,
    height: display.workArea.height,
  })

  // Update theme handling when showing window
  const preferences = appSettings.getAllPreferences()
  mainWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, {
    key: 'darkMode',
    value: preferences.darkMode,
  })

  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send(IPC_CHANNELS.WINDOW_OPENED)
  mainWindow.webContents.send(IPC_CHANNELS.FOCUS_SEARCH)
}

// === Settings Window Management ===
function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    frame: true,
    transparent: false,
    icon: appIcon, // Add window icon
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      nodeIntegration: true,
    },
  })

  setupSettingsWindowEventHandlers()
  loadWindowContent(settingsWindow)

  // When settings window is loaded, send message to show settings page
  settingsWindow.webContents.on('did-finish-load', () => {
    settingsWindow.webContents.send(IPC_CHANNELS.SHOW_SETTINGS_PAGE)
  })
}

function setupSettingsWindowEventHandlers() {
  settingsWindow.on('close', (event) => {
    // Prevent window from being destroyed
    event.preventDefault()
    settingsWindow.hide()
  })

  // Update theme handling for settings window
  settingsWindow.webContents.on('did-finish-load', () => {
    const preferences = appSettings.getAllPreferences()
    settingsWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, {
      key: 'darkMode',
      value: preferences.darkMode,
    })
  })
}

// === Shared Window Functions ===
function loadWindowContent(window) {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
    installVueDevTools()
  }
  else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// === System Tray Management ===
function createTray() {
  // Create tray with native image. The @2x.png is for retina displays and loaded automatically
  const nativeImage = require('electron').nativeImage
  const systemTrayIcon = nativeImage.createFromPath(trayIcon)

  // Resize icon for better display in tray
  /*
  const resizedTrayIcon = systemTrayIcon.resize({
    width: 16,
    height: 16
  })
*/

  tray = new Tray(systemTrayIcon)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Search',
      click: () => {
        settingsWindow.hide()
        showMainWindow()
      },
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow.hide()
        settingsWindow.show()
        settingsWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        cleanup()
        app.quit()
      },
    },
  ])
  tray.setToolTip('Seeksy')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => showMainWindow())
}

// === IPC & Event Handlers ===
function setupAppEventHandlers() {
  // Window management events
  ipcMain.handle(IPC_CHANNELS.HIDE_MAIN_WINDOW, () => {
    if (mainWindow)
      mainWindow.hide()
  })

  ipcMain.handle(IPC_CHANNELS.SHOW_MAIN_WINDOW, () => {
    if (mainWindow)
      mainWindow.show()
  })

  ipcMain.handle(IPC_CHANNELS.SHOW_SETTINGS_PAGE, () => {
    settingsWindow.show()
    settingsWindow.focus()
  })

  ipcMain.handle(IPC_CHANNELS.SHOW_SEARCH_PAGE, () => {
    settingsWindow.hide()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send(IPC_CHANNELS.FOCUS_SEARCH)
  })

  // App lifecycle events
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', () => {
    if (!mainWindow && !settingsWindow) {
      createMainWindow()
      createSettingsWindow()
    }
  })

  app.on('will-quit', () => {
    cleanup()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      cleanup()
      app.quit()
    }
  })

  // Add shortcut validation handler
  ipcMain.handle(IPC_CHANNELS.VALIDATE_GLOBAL_SHORTCUT, (_, shortcut) => {
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
  })

  // Listen for shortcut setting changes
  appSettings.on('setting-changed', ({ key }) => {
    if (key === 'searchShortcut') {
      registerGlobalShortcut()
    }
  })
}

// === Utility Functions ===
function installVueDevTools() {
  installExtension(VUEJS_DEVTOOLS)
    .then(ext => console.log(`Added Extension: ${ext.name}`))
    .catch(err => console.log('Vue DevTools installation error', err))
}

function registerProtocols() {
  const userData = app.getPath('userData')
  registerFileProtocol('app-icon', path.join(userData, 'app-icons'))
}

function initializeAppIndexing() {
  console.log('Starting initial app indexing...')
  applicationLauncher
    .indexApplications()
    .then(apps => console.log('Installed apps', apps))
    .catch(err => console.error('Error in initial app indexing:', err))
}

function registerGlobalShortcut() {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut)
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
      mainWindow.webContents.send(IPC_CHANNELS.SEARCH_KEYCOMBO_DOWN)
      showMainWindow()
    })
  ) {
    registeredShortcut = shortcutToRegister
  }
}

function cleanup() {
  // Destroy windows first
  if (mainWindow) {
    mainWindow.destroy()
    mainWindow = null
  }
  if (settingsWindow) {
    settingsWindow.destroy()
    settingsWindow = null
  }

  // Clean up tray
  if (tray) {
    tray.destroy()
    tray = null
  }

  // Unregister shortcuts
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut)
    registeredShortcut = null
  }

  // Clean up handlers
  if (app._handlers) {
    app._handlers.forEach(handler => handler.cleanup())
  }
}

// New handler initialization
function initializeHandlers(indexer, fileDB) {
  const handlers = [
    setupSystemHandlers(indexer, fileDB),
    setupDatabaseItemHandlers(fileDB),
    setupSettingsHandlers(mainWindow, settingsWindow),
    setupAppIndexerHandlers(indexer, fileDB),
    setupFileIndexerHandlers(indexer, fileDB),
    setupDiskReaderHandlers(), // Add disk reader handler to the handlers array
  ]

  // Store handlers for cleanup
  app._handlers = handlers

  // Register cleanup on app quit
  app.on('will-quit', () => {
    handlers.forEach(handler => handler.cleanup())
  })
}

// === App Initialization ===
app.whenReady().then(() => {
  // Remove the process handlers since they might interfere with clean exit
  // process.on('exit', cleanup)
  // process.on('SIGINT', cleanup)
  // process.on('SIGTERM', cleanup)

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)
    cleanup()
    process.exit(1)
  })

  electronApp.setAppUserModelId('com.electron')

  const indexer = new IndexController(fileDB)

  createMainWindow()
  createSettingsWindow()

  initializeHandlers(indexer, fileDB) // Single handler initialization
  registerProtocols()

  createTray()

  registerGlobalShortcut()

  setupAppEventHandlers()
  initializeAppIndexing()

  mainWindow.hide()
  settingsWindow.hide()

  // Set the app icon
  const nativeImage = require('electron').nativeImage
  app.dock?.setIcon(nativeImage.createFromPath(appIcon)) // For macOS
})
