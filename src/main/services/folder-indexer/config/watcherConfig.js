/**
 * Common configuration settings for the folder watcher system
 */
export const watcherConfig = {
  // Processing settings
  processing: {
    // Default delay between processing files (ms)
    defaultDelay: 50,
    
    // Batch processing settings
    defaultBatchSize: 10,
    enableBatching: true,
    batchCollectTime: 200,
  },

  // Status update settings
  status: {
    // How often to send status updates (ms)
    defaultUpdateInterval: 1000,
  },

  // File watcher settings
  watcher: {
    // chokidar config
    stabilityThreshold: 1000,
    pollInterval: 100,
    usePolling: false,
    followSymlinks: false,
  },
}
