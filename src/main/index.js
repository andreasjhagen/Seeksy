import path, { join } from 'node:path'
// === Imports ===
// Electron core
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, Menu, Tray } from 'electron'

// Utils
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'

// App Icons
import appIcon from '../../resources/icon.ico?asset'
import trayIcon from '../../resources/trayIcon.png?asset'

// IPC Handlers
import setupDatabaseItemHandlers from './ipc/handlers/databaseItemHandlers.js'
import setupDiskReaderHandlers from './ipc/handlers/diskReaderHandlers'
import setupFileIndexerHandlers from './ipc/handlers/indexHandlers.js'
import setupAppIndexerHandlers from './ipc/handlers/installedAppsHandlers.js'
import setupSettingsHandlers from './ipc/handlers/settingsHandlers.js'
import setupSystemHandlers from './ipc/handlers/systemHandlers.js'
import setupWindowHandlers from './ipc/handlers/windowHandlers.js'

// Project imports
import { IPC } from './ipc/ipcChannels.js'

// Services
import { applicationLauncher } from './services/application-indexer/ApplicationLauncher.js'
import { fileDB } from './services/database/database'
import { IndexController } from './services/folder-indexer/IndexController.js'
import { registerFileProtocol } from './services/registerFileProtocol'

// Disable hardware acceleration if causing issues
// app.disableHardwareAcceleration()

// Configure high-DPI scaling
app.commandLine.appendSwitch('high-dpi-support', 1)
app.commandLine.appendSwitch('force-device-scale-factor', 1)

// === Global Variables ===
let mainWindow = null
let settingsWindow = null
let tray = null

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
      zoomFactor: 1.0, // Control zoom level for high-DPI displays
    },
  })

  // Handle scale factor for high-DPI displays
  const scaleFactor = require('electron').screen.getPrimaryDisplay().scaleFactor
  if (scaleFactor > 1) {
    mainWindow.webContents.setZoomFactor(1.0 / scaleFactor)
  }

  setupMainWindowEventHandlers()
  loadWindowContent(mainWindow)
}

function setupMainWindowEventHandlers() {
  mainWindow.on('blur', () => {
    mainWindow.hide()
    mainWindow.webContents.send(IPC.WINDOW.SEARCH_WINDOW_FOCUS_LOST)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // The theme handling is now managed by SettingsHandler
  mainWindow.on('show', () => {
    // Handled by the WindowHandler
  })
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
      zoomFactor: 1.0, // Control zoom level for high-DPI displays
    },
  })

  // Handle scale factor for high-DPI displays
  const scaleFactor = require('electron').screen.getPrimaryDisplay().scaleFactor
  if (scaleFactor > 1) {
    settingsWindow.webContents.setZoomFactor(1.0 / scaleFactor)
  }

  setupSettingsWindowEventHandlers()
  loadWindowContent(settingsWindow)

  // When settings window is loaded, send message to show settings page
  settingsWindow.webContents.on('did-finish-load', () => {
    settingsWindow.webContents.send(IPC.WINDOW.SHOW_SETTINGS_PAGE)
  })
}

function setupSettingsWindowEventHandlers() {
  settingsWindow.on('close', (event) => {
    // Prevent window from being destroyed
    event.preventDefault()
    settingsWindow.hide()
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

  tray = new Tray(systemTrayIcon)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Search',
      click: () => {
        settingsWindow.hide()
        mainWindow.webContents.send(IPC.WINDOW.SEARCH_KEYCOMBO_DOWN)
        mainWindow.show()
        mainWindow.focus()
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
  tray.on('click', () => {
    mainWindow.webContents.send(IPC.WINDOW.SEARCH_KEYCOMBO_DOWN)
    mainWindow.show()
    mainWindow.focus()
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
    .then(apps => console.log(`Installed ${apps.length} apps indexed`))
    .catch(err => console.error('Error in initial app indexing:', err))
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

  // Clean up handlers
  if (app._handlers) {
    app._handlers.forEach(handler => handler.cleanup())
  }
}

// === Handler initialization ===
function initializeHandlers(indexer) {
  const handlers = [
    setupWindowHandlers(mainWindow, settingsWindow), // Move this to first position
    setupSystemHandlers(indexer),
    setupDatabaseItemHandlers(),
    setupSettingsHandlers(mainWindow, settingsWindow),
    setupAppIndexerHandlers(indexer),
    setupFileIndexerHandlers(indexer),
    setupDiskReaderHandlers(),
  ]

  // Store handlers for cleanup
  app._handlers = handlers
}

// === App Initialization ===
app.whenReady().then(() => {
  // Set up error handling
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)
    cleanup()
    process.exit(1)
  })

  electronApp.setAppUserModelId('com.electron')

  // Initialize services
  const indexer = new IndexController(fileDB)

  // Create windows
  createMainWindow()
  createSettingsWindow()

  // Initialize app components
  initializeHandlers(indexer)
  registerProtocols()
  createTray()

  // Set up app lifecycle event handlers
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

  // Initialize the application
  initializeAppIndexing()

  // Hide windows until explicitly shown
  mainWindow.hide()
  settingsWindow.hide()

  // Set the app icon for macOS
  if (process.platform === 'darwin') {
    const nativeImage = require('electron').nativeImage
    app.dock?.setIcon(nativeImage.createFromPath(appIcon))
  }
})
