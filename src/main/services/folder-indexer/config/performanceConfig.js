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
 *
 * Performance Philosophy:
 * - Balanced for midrange systems (4-8GB RAM, dual-core+)
 * - Prioritizes system responsiveness over raw indexing speed
 * - Uses longer delays to reduce CPU spikes
 * - Smaller batches to reduce memory pressure
 */
export const performanceConfig = {
  // Default processing delay in milliseconds
  // Higher value = more responsive system, slower indexing
  defaultDelay: 75,

  // Minimum allowed delay (used when only watching)
  minDelay: 15,

  // Maximum allowed delay (used under heavy load)
  maxDelay: 2000,

  // Factor to reduce delay when only watching (not actively indexing)
  watchingDelayFactor: 0.5,

  // Auto mode settings - optimized for midrange systems
  auto: {
    // Settings when only one folder is indexing
    // Moderate pace to avoid impacting system responsiveness
    singleFolderDelay: 50, // Balanced: smooth indexing without CPU spikes
    singleFolderBatchSize: 10, // Moderate batches

    // Settings when multiple folders are active
    // More conservative to prevent system slowdown
    multiFolderDelayMultiplier: 2.0, // Double the delay per additional folder
    multiFolderBatchDivisor: 2.0, // Halve batch size for multiple folders
  },

  // Batch processing settings
  batching: {
    // Default batch size (number of files to process together)
    defaultBatchSize: 8,

    // Whether batching is enabled by default
    enableByDefault: true,

    // Time to wait collecting events before processing a batch (ms)
    // Higher = more efficient batching, slightly delayed response
    defaultCollectTime: 300,

    // Maximum batch size allowed
    maxBatchSize: 30,

    // Minimum batch size allowed
    minBatchSize: 1,

    // Batch size during initial scan (smaller for smoother progress)
    initialScanBatchSize: 3,
  },
}
