// This is the new IPC channel definition constant, sorted by frontend, backend, and system
export const IPC = {
  FRONTEND: {
    // Window management
    HIDE_MAIN_WINDOW: 'hide-window',
    SHOW_MAIN_WINDOW: 'show-window',
    SHOW_SETTINGS_PAGE: 'show-settings-page',
    SHOW_SEARCH_PAGE: 'show-search-page',

    // Callbacks
    WINDOW_OPENED: 'show-window',
    SEARCH_WINDOW_FOCUS_LOST: 'window-hidden',
    FOCUS_SEARCH: 'focus-search-input',
    SEARCH_KEYCOMBO_DOWN: 'search-keycombo-down',

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

    // Find similar images by phash
    FIND_SIMILAR_IMAGES: 'find-similar-images',

    // Shortcut management
    VALIDATE_GLOBAL_SHORTCUT: 'settings:validate-shortcut',

    // Utils
    GET_FILE_ICON: 'get-file-icon',
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
    INDEXER_ADVANCED_SEARCH: 'indexer:advanced-search',
    INDEXER_CLEANUP: 'indexer:cleanup',
    INDEXER_RESET_DATABASE: 'indexer:reset-database',
    INDEXER_SET_PROCESSING_DELAY: 'indexer:set-processing-delay',

    // Performance settings
    INDEXER_SET_AUTO_PERFORMANCE: 'indexer:set-auto-performance',
    INDEXER_GET_PERFORMANCE_SETTINGS: 'indexer:get-performance-settings',

    // New batch-related channels
    INDEXER_SET_BATCH_SIZE: 'indexer:set-batch-size',
    INDEXER_SET_ENABLE_BATCHING: 'indexer:set-enable-batching',

    // Settings management
    SETTINGS_GET: 'settings:get',
    SETTINGS_SET: 'settings:set',
    SETTINGS_GET_ALL: 'settings:get-all',
    SETTINGS_CHANGED: 'settings:changed',

    // Application operations
    APP_INDEX_REFRESH: 'apps:refresh-index',
    APP_SEARCH: 'apps:search',
    APP_LAUNCH: 'apps:launch',
  },
  SYSTEM: {
    // System info and updates
    GET_SYSTEM_INFO: 'get-system-info',
    CHECK_FOR_UPDATES: 'check-for-updates',
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
  ...IPC.FRONTEND,
  ...IPC.BACKEND,
  ...IPC.SYSTEM,
}

export const validChannels = Object.values(IPC_CHANNELS)
