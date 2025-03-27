/**
 * Configuration for performance settings in the indexer
 */
export const performanceConfig = {
  // Default processing delay in milliseconds
  defaultDelay: 50,
  
  // Minimum allowed delay
  minDelay: 5,
  
  // Maximum allowed delay
  maxDelay: 2000,
  
  // Factor to reduce delay when only watching (not actively indexing)
  watchingDelayFactor: 0.5,
  
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
    minBatchSize: 1
  }
}
