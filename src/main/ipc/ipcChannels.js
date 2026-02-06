// This is the new IPC channel definition constant, sorted by functional areas
export const IPC = {
  WINDOW: {
    // Window management
    HIDE_MAIN_WINDOW: 'window:hide-main',
    SHOW_MAIN_WINDOW: 'window:show-main',
    SHOW_SETTINGS_PAGE: 'window:show-settings',
    SHOW_SEARCH_PAGE: 'window:show-search',
    WINDOW_OPENED: 'window:opened',
    WINDOW_HIDDEN: 'window:hidden',
    FOCUS_SEARCH: 'window:focus-search',
    SEARCH_KEYCOMBO_DOWN: 'window:search-keycombo-down',
    SEARCH_WINDOW_FOCUS_LOST: 'window:search-focus-lost',
    GET_ALL_DISPLAYS: 'window:get-all-displays',
  },

  FRONTEND: {
    // Disk operations
    OPEN_FOLDER_DIALOG: 'disk-reader:open-folder-dialog',
    GET_THUMBNAIL: 'disk-reader:get-thumbnail',
    OPEN_FILE: 'disk-reader:open-file',
    SHOW_IN_EXPLORER: 'disk-reader:show-in-explorer',
    SHOW_APP_DATA_EXPLORER: 'disk-reader:show-app-data-explorer',
    COUNT_FOLDER_FILES: 'disk-reader:count-folder-files',
    GET_FILE_CONTENT: 'disk-reader:get-file-content',
    CLEAR_THUMBNAIL_CACHE: 'disk-reader:clear-thumbnail-cache',
    GET_THUMBNAIL_CACHE_STATS: 'disk-reader:get-thumbnail-cache-stats',

    // Favorites operations
    FAVORITES_ADD: 'favorites:add',
    FAVORITES_REMOVE: 'favorites:remove',
    FAVORITES_CHECK: 'favorites:check',
    FAVORITES_BATCH_CHECK: 'favorites:batch-check',
    FAVORITES_GET_ALL: 'favorites:get-all',
    FAVORITES_REORDER: 'favorites:reorder',

    // Notes operations
    NOTES_SET: 'notes:set',
    NOTES_GET: 'notes:get',
    NOTES_BATCH_CHECK: 'notes:batch-check',

    // Utils
    GET_FILE_ICON: 'file:get-icon',
  },

  BACKEND: {
    // Indexing operations
    WATCHER_GET_STATUS: 'watcher:get-status',
    WATCHER_PAUSE: 'watcher:pause',
    WATCHER_RESUME: 'watcher:resume',
    INDEXER_PAUSE_ALL: 'indexer:pause-all',
    INDEXER_RESUME_ALL: 'indexer:resume-all',
    INDEXER_ADD_PATH: 'indexer:add-path',
    INDEXER_INITIALIZE: 'indexer:initialize',
    INDEXER_GET_STATUS: 'indexer:get-status',
    INDEXER_REMOVE_PATH: 'indexer:remove-path',
    INDEXER_QUICK_SEARCH: 'indexer:quick-search',
    INDEXER_FILTERED_SEARCH: 'indexer:filtered-search',
    INDEXER_CLEANUP: 'indexer:cleanup',
    INDEXER_RESET_DATABASE: 'indexer:reset-database',
    INDEXER_SET_PROCESSING_DELAY: 'indexer:set-processing-delay',

    // Performance settings
    INDEXER_SET_AUTO_PERFORMANCE: 'indexer:set-auto-performance',
    INDEXER_GET_PERFORMANCE_SETTINGS: 'indexer:get-performance-settings',
    INDEXER_SET_BATCH_SIZE: 'indexer:set-batch-size',
    INDEXER_SET_ENABLE_BATCHING: 'indexer:set-enable-batching',

    // Removed watched folders tracking
    INDEXER_GET_REMOVED_FOLDERS: 'indexer:get-removed-folders',
    INDEXER_CLEAR_REMOVED_FOLDERS: 'indexer:clear-removed-folders',

    // Settings management
    SETTINGS_GET: 'settings:get',
    SETTINGS_SET: 'settings:set',
    SETTINGS_GET_ALL: 'settings:get-all',
    SETTINGS_CHANGED: 'settings:changed',

    // UI Scale
    SET_UI_SCALE: 'ui:set-scale',

    // Shortcut management
    VALIDATE_GLOBAL_SHORTCUT: 'shortcut:validate',

    // Application operations
    APP_INDEX_REFRESH: 'apps:refresh-index',
    APP_SEARCH: 'apps:search',
    APP_LAUNCH: 'apps:launch',
  },

  SYSTEM: {
    // System info and updates
    GET_SYSTEM_INFO: 'system:get-info',
    CHECK_FOR_UPDATES: 'system:check-updates',
    SET_AUTO_START: 'system:set-auto-start',
    GET_AUTO_START: 'system:get-auto-start',
    SHOW_NOTIFICATION: 'system:show-notification',
    SET_PROGRESS_BAR: 'system:set-progress-bar',

    // System operations
    RESET_APPLICATION: 'system:reset-application',
  },

  UPDATER: {
    // Update commands (renderer -> main)
    CHECK_FOR_UPDATES: 'updater:check-for-updates',
    DOWNLOAD_UPDATE: 'updater:download-update',
    INSTALL_UPDATE: 'updater:install-update',
    GET_UPDATE_STATUS: 'updater:get-update-status',
    GET_RELEASE_NOTES: 'updater:get-release-notes',

    // Update events (main -> renderer)
    CHECKING_FOR_UPDATE: 'updater:checking-for-update',
    UPDATE_AVAILABLE: 'updater:update-available',
    UPDATE_NOT_AVAILABLE: 'updater:update-not-available',
    DOWNLOAD_PROGRESS: 'updater:download-progress',
    UPDATE_DOWNLOADED: 'updater:update-downloaded',
    ERROR: 'updater:error',
  },
}

// For backwards compatibility, export all channels as flat map.
// This will be deprecated in the future
export const IPC_CHANNELS = {
  ...IPC.WINDOW,
  ...IPC.FRONTEND,
  ...IPC.BACKEND,
  ...IPC.SYSTEM,
  ...IPC.UPDATER,
}

export const validChannels = Object.values(IPC_CHANNELS)
