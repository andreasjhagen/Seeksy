import path, { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// === Imports ===
// Electron core
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'

// Utils
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
// i18n for main process
import { setLanguage as setMainLanguage, t } from './i18n/translations.js'
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
import { crashReporterService } from './services/crash-reporter/CrashReporter.js'
import { fileDB } from './services/database/database'
import { appSettings } from './services/electron-store/AppSettingsStore.js'
import { IndexController } from './services/folder-indexer/IndexController.js'
import { registerFileProtocol } from './services/registerFileProtocol'

// Define module path for ES modules
const __dirnamePath = dirname(fileURLToPath(import.meta.url))

// Initialize crash reporter early
crashReporterService.initialize()

// Disable hardware acceleration if causing issues
// app.disableHardwareAcceleration()

// === Global Variables ===
let mainWindow = null
let settingsWindow = null
let tray = null
let indexerInstance = null
let isIndexingPaused = false

// Get icon path based on platform
function getIconPath() {
  // For packaged apps, resources are extracted to the same directory as the app
  // For Linux AppImage, we need to look in process.resourcesPath
  let basePath
  if (app.isPackaged) {
    // process.resourcesPath points to the resources directory in packaged apps
    basePath = process.resourcesPath
  }
  else {
    basePath = path.join(__dirnamePath, '../../resources')
  }

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
    title: t('window.search'),
    icon: getIconPath(),
    // Keep rounded corners but avoid setting a background color so the
    // transparent main window remains transparent on Windows desktop
    ...(process.platform === 'win32' && {
      roundedCorners: true,
    }),
    webPreferences: {
      preload: join(__dirnamePath, '../preload/index.mjs'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
      devTools: is.dev,
    },
  })

  setupMainWindowEventHandlers()
  crashReporterService.setupRendererHandlers(mainWindow, 'main')
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
    title: t('window.settings'),
    transparent: false,
    skipTaskbar: false, // Explicitly show in taskbar for Windows
    icon: getIconPath(),
    ...(process.platform === 'win32' && {
      backgroundColor: '#0f172a',
      roundedCorners: true,
    }),
    webPreferences: {
      preload: join(__dirnamePath, '../preload/index.mjs'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
      devTools: is.dev,
    },
  })

  setupSettingsWindowEventHandlers()
  crashReporterService.setupRendererHandlers(settingsWindow, 'settings')
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
    window.loadFile(join(__dirnamePath, '../renderer/index.html'))
  }
}

/**
 * Check if developer tools should be enabled
 * @returns {boolean} True if dev tools should be enabled
 */
function shouldEnableDevTools() {
  return is.dev
}

// === System Tray Management ===
let updateAvailable = false
let updateDownloaded = false
let updateInfo = null

/**
 * Get the appropriate tray icon path based on platform and screen scale
 * Uses dedicated tray icons with multiple resolutions
 */
function getTrayIconPath() {
  let basePath
  if (app.isPackaged) {
    basePath = process.resourcesPath
  }
  else {
    basePath = path.join(__dirnamePath, '../../resources')
  }

  // Use the base tray icon - Electron will automatically use @2x, @3x versions
  // for high DPI displays on macOS/Linux
  return path.join(basePath, 'trayIcon.png')
}

function createTray() {
  const iconPath = getTrayIconPath()
  const systemTrayIcon = nativeImage.createFromPath(iconPath)

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
      label: t('tray.openSearch'),
      click: () => {
        settingsWindow.hide()
        mainWindow.webContents.send(IPC.WINDOW.SEARCH_KEYCOMBO_DOWN)
        mainWindow.show()
        mainWindow.focus()
      },
    },
    {
      label: t('tray.settings'),
      click: () => {
        mainWindow.hide()
        settingsWindow.show()
        settingsWindow.focus()
      },
    },
    { type: 'separator' },
    // Pause/Resume indexing option
    {
      label: isIndexingPaused ? t('tray.resumeIndexing') : t('tray.pauseIndexing'),
      click: () => {
        if (indexerInstance) {
          if (isIndexingPaused) {
            indexerInstance.resumeAll()
            isIndexingPaused = false
          }
          else {
            indexerInstance.pauseAll()
            isIndexingPaused = true
          }
          updateTrayMenu() // Refresh menu to show updated state
        }
      },
    },
    { type: 'separator' },
  ]

  // Add update-related menu items
  if (updateDownloaded) {
    menuTemplate.push({
      label: `🔄 ${t('tray.installUpdate', { version: updateInfo?.version || 'new' })}`,
      click: () => {
        autoUpdaterService.installUpdate()
      },
    })
    menuTemplate.push({ type: 'separator' })
  }
  else if (updateAvailable) {
    menuTemplate.push({
      label: `⬇️ ${t('tray.updateAvailable', { version: updateInfo?.version || 'new' })}`,
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
    label: t('tray.quit'),
    click: () => {
      // app.quit() will trigger before-quit which handles cleanup
      app.quit()
    },
  })

  const contextMenu = Menu.buildFromTemplate(menuTemplate)

  // Update tooltip to show status
  if (updateAvailable && !updateDownloaded) {
    tray.setToolTip(t('tooltip.updateAvailable', { version: updateInfo?.version || 'new' }))
  }
  else if (updateDownloaded) {
    tray.setToolTip(t('tooltip.updateReady', { version: updateInfo?.version || 'new' }))
  }
  else if (isIndexingPaused) {
    tray.setToolTip(t('tooltip.paused'))
  }
  else {
    tray.setToolTip(t('tooltip.default'))
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

/**
 * Initialize the main process language from settings
 * This handles tray menu and other native UI translations
 */
function initializeMainProcessLanguage() {
  // Get saved language or auto-detect from OS
  const savedLanguage = appSettings.getSetting('language')
  const osLanguage = app.getLocale().split('-')[0] // Get base language code (e.g., 'en' from 'en-US')
  const language = savedLanguage || osLanguage || 'en'

  // Set the language for main process translations
  setMainLanguage(language)

  // Listen for language changes from renderer
  appSettings.on('setting-changed', ({ key, value }) => {
    if (key === 'language') {
      // If null, revert to OS language
      const newLang = value || app.getLocale().split('-')[0] || 'en'
      setMainLanguage(newLang)
      // Update tray menu with new language
      if (tray) {
        updateTrayMenu()
      }
    }
  })
}

function initializeAppIndexing() {
  console.log('Starting initial app indexing...')
  applicationLauncher
    .indexApplications()
    .then(apps => console.log(`Installed ${apps.length} apps indexed`))
    .catch(err => console.error('Error in initial app indexing:', err))
}

let isCleaningUp = false

async function cleanup() {
  // Prevent multiple cleanup calls
  if (isCleaningUp)
    return
  isCleaningUp = true

  // Clean up auto-updater
  autoUpdaterService.cleanup()

  // Clean up indexer (file watchers) - must happen before closing database
  if (indexerInstance) {
    try {
      await indexerInstance.cleanup()
    }
    catch (error) {
      console.error('Error cleaning up indexer:', error)
    }
    indexerInstance = null
  }

  // Close database connection
  if (fileDB) {
    fileDB.close()
  }

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

// === Single Instance Lock ===
// Prevent multiple instances of the app
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit()
}
else {
  // This is the primary instance
  app.on('second-instance', () => {
    // When a second instance tries to start, focus the existing window
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// === App Initialization ===
app.whenReady().then(() => {
  // Set up error handlers using the crash reporter service
  crashReporterService.setupMainProcessHandlers(cleanup)

  // Set the app user model ID for Windows taskbar grouping
  electronApp.setAppUserModelId('com.andreashagen.seeksy')

  // Clean up old crash logs (older than 30 days)
  crashReporterService.clearOldLogs(30)

  // Initialize language for main process (tray menu, etc.)
  initializeMainProcessLanguage()

  // Initialize services
  const indexer = new IndexController(fileDB)
  indexerInstance = indexer // Store reference globally for tray menu access

  // Listen for indexer status changes to sync tray menu
  indexer.on('status-update', (status) => {
    const shouldBePaused = status.isPaused
    if (shouldBePaused !== isIndexingPaused) {
      isIndexingPaused = shouldBePaused
      if (tray) {
        updateTrayMenu() // Refresh tray to reflect indexer state
      }
    }
  })

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

  // Handle app quit - use before-quit to properly cleanup async resources
  app.on('before-quit', async (event) => {
    if (!isCleaningUp) {
      event.preventDefault()
      await cleanup()
      app.quit()
    }
  })

  app.on('will-quit', () => {
    // Synchronous cleanup already handled by before-quit
    // This is a fallback for any remaining cleanup
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
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
