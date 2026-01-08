import path, { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// === Imports ===
// Electron core
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'

// Utils
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
// IPC Handlers
import setupDatabaseItemHandlers from './ipc/handlers/databaseItemHandlers.js'
import setupDiskReaderHandlers from './ipc/handlers/diskReaderHandlers'
import setupFileIndexerHandlers from './ipc/handlers/indexHandlers.js'
import setupAppIndexerHandlers from './ipc/handlers/installedAppsHandlers.js'
import setupSettingsHandlers from './ipc/handlers/settingsHandlers.js'

import setupSystemHandlers from './ipc/handlers/systemHandlers.js'

import setupUpdateHandlers from './ipc/handlers/updateHandlers.js'
import setupWindowHandlers from './ipc/handlers/windowHandlers.js'
// Project imports
import { IPC } from './ipc/ipcChannels.js'

// Services
import { applicationLauncher } from './services/application-indexer/ApplicationLauncher.js'
import { autoUpdaterService } from './services/auto-updater/AutoUpdaterService.js'
import { fileDB } from './services/database/database'
import { IndexController } from './services/folder-indexer/IndexController.js'
import { registerFileProtocol } from './services/registerFileProtocol'

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Disable hardware acceleration if causing issues
// app.disableHardwareAcceleration()

// Configure high-DPI scaling
app.commandLine.appendSwitch('high-dpi-support', 1)
app.commandLine.appendSwitch('force-device-scale-factor', 1)

// === Global Variables ===
let mainWindow = null
let settingsWindow = null
let tray = null

// Get icon path based on platform
function getIconPath() {
  const basePath = app.isPackaged ? path.dirname(app.getAppPath()) : path.join(__dirname, '../../resources')
  if (process.platform === 'win32')
    return path.join(basePath, 'icon.ico')
  if (process.platform === 'darwin')
    return path.join(basePath, 'icon.icns')
  if (process.platform === 'linux')
    return path.join(basePath, 'icon.png')
  return undefined
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
    title: 'Seeksy',
    icon: getIconPath(),
    ...(process.platform === 'win32' && {
      backgroundColor: '#0f172a',
      roundedCorners: true,
    }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
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
    title: 'Seeksy Settings',
    transparent: false,
    skipTaskbar: false, // Explicitly show in taskbar for Windows
    icon: getIconPath(),
    ...(process.platform === 'win32' && {
      backgroundColor: '#0f172a',
      roundedCorners: true,
    }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
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
let updateAvailable = false
let updateDownloaded = false
let updateInfo = null

function createTray() {
  const iconPath = getIconPath()
  let systemTrayIcon = nativeImage.createFromPath(iconPath)

  // Resize icon to 16x16 for tray
  systemTrayIcon = systemTrayIcon.resize({ width: 16, height: 16 })

  tray = new Tray(systemTrayIcon)
  updateTrayMenu()
  tray.on('click', () => {
    mainWindow.webContents.send(IPC.WINDOW.SEARCH_KEYCOMBO_DOWN)
    mainWindow.show()
    mainWindow.focus()
  })
}

function updateTrayMenu() {
  const menuTemplate = [
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
  ]

  // Add update-related menu items
  if (updateDownloaded) {
    menuTemplate.push({
      label: `🔄 Install Update (v${updateInfo?.version || 'new'})`,
      click: () => {
        autoUpdaterService.installUpdate()
      },
    })
    menuTemplate.push({ type: 'separator' })
  }
  else if (updateAvailable) {
    menuTemplate.push({
      label: `⬇️ Update Available (v${updateInfo?.version || 'new'})`,
      click: () => {
        mainWindow.hide()
        settingsWindow.show()
        settingsWindow.focus()
        // Navigate to info tab (index 2)
        settingsWindow.webContents.send(IPC.WINDOW.SHOW_SETTINGS_PAGE, { tabIndex: 2 })
      },
    })
    menuTemplate.push({ type: 'separator' })
  }

  menuTemplate.push({
    label: 'Quit',
    click: () => {
      cleanup()
      app.quit()
    },
  })

  const contextMenu = Menu.buildFromTemplate(menuTemplate)

  // Update tooltip to show update status
  if (updateAvailable && !updateDownloaded) {
    tray.setToolTip(`Seeksy - Update available (v${updateInfo?.version || 'new'})`)
  }
  else if (updateDownloaded) {
    tray.setToolTip(`Seeksy - Update ready to install (v${updateInfo?.version || 'new'})`)
  }
  else {
    tray.setToolTip('Seeksy')
  }

  tray.setContextMenu(contextMenu)
}

/**
 * Callback for auto-updater to update tray menu
 */
function onTrayUpdateStatusChange(available, info, downloaded = false) {
  updateAvailable = available
  updateInfo = info
  updateDownloaded = downloaded
  if (tray) {
    updateTrayMenu()
  }
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
  // Clean up auto-updater
  autoUpdaterService.cleanup()

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
    setupUpdateHandlers(),
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

  // Set the app user model ID for Windows taskbar grouping
  electronApp.setAppUserModelId('com.andreashagen.seeksy')

  // Initialize services
  const indexer = new IndexController(fileDB)

  // Create windows
  createMainWindow()
  createSettingsWindow()

  // Initialize app components
  initializeHandlers(indexer)
  registerProtocols()
  createTray()

  // Initialize auto-updater with references to windows and tray callback
  autoUpdaterService.initialize(mainWindow, settingsWindow, tray, onTrayUpdateStatusChange)

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
    app.dock?.setIcon(nativeImage.createFromPath(getIconPath()))
  }
})
