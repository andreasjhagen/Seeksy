/**
 * Common configuration settings for the folder watcher system
 * Optimized for midrange systems to prevent resource exhaustion
 */
export const watcherConfig = {
  // Processing settings
  processing: {
    // Default delay between processing files (ms)
    // Higher = more responsive system, slower indexing
    defaultDelay: 75,

    // Batch processing settings
    defaultBatchSize: 10,
    enableBatching: true,
    batchCollectTime: 300, // Wait longer to collect more events per batch
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
