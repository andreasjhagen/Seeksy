/**
 * Configuration for performance settings in the indexer
 *
 * Auto Mode Behavior:
 * - When only one folder is actively indexing: uses optimized settings
 * - When multiple folders are indexing: increases delay, reduces batch size proportionally
 * - When only watching (no active indexing): uses minimal delay for responsiveness
 *
 * Manual Mode:
 * - User-defined delay and batch size are used until app restart
 * - Auto mode resets to optimal settings on restart
 */
export const performanceConfig = {
  // Default processing delay in milliseconds
  defaultDelay: 50,

  // Minimum allowed delay (used when only watching)
  minDelay: 10,

  // Maximum allowed delay (used under heavy load)
  maxDelay: 2000,

  // Factor to reduce delay when only watching (not actively indexing)
  watchingDelayFactor: 0.5,

  // Auto mode settings - balanced for most systems
  auto: {
    // Moderate settings when only one folder is indexing
    // Not too aggressive to avoid impacting system responsiveness
    singleFolderDelay: 25, // Balanced: fast but not overwhelming
    singleFolderBatchSize: 10, // Moderate batches

    // Conservative settings when multiple folders are active
    multiFolderDelayMultiplier: 1.5, // Gentler scaling
    multiFolderBatchDivisor: 1.5, // Keep reasonable batch sizes
  },

  // Batch processing settings
  batching: {
    // Default batch size (number of files to process together)
    defaultBatchSize: 10,

    // Whether batching is enabled by default
    enableByDefault: true,

    // Time to wait collecting events before processing a batch (ms)
    defaultCollectTime: 200,

    // Maximum batch size allowed
    maxBatchSize: 50,

    // Minimum batch size allowed
    minBatchSize: 1,

    // Batch size during initial scan (smaller for smoother progress)
    initialScanBatchSize: 3,
  },
}
