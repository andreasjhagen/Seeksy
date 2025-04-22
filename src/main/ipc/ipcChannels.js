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

    // Favorites operations
    FAVORITES_ADD: 'favorites:add',
    FAVORITES_REMOVE: 'favorites:remove',
    FAVORITES_CHECK: 'favorites:check',
    FAVORITES_GET_ALL: 'favorites:get-all',

    // Notes operations
    NOTES_SET: 'notes:set',
    NOTES_GET: 'notes:get',

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

    // Settings management
    SETTINGS_GET: 'settings:get',
    SETTINGS_SET: 'settings:set',
    SETTINGS_GET_ALL: 'settings:get-all',
    SETTINGS_CHANGED: 'settings:changed',

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
}

// For backwards compatibility, export all channels as flat map.
// This will be deprecated in the future
export const IPC_CHANNELS = {
  ...IPC.WINDOW,
  ...IPC.FRONTEND,
  ...IPC.BACKEND,
  ...IPC.SYSTEM,
}

export const validChannels = Object.values(IPC_CHANNELS)
