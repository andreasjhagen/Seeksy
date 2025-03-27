import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { IPC } from '../../../main/ipc/ipcChannels'
import { useWatcherStatus } from './useWatcherStatus'

// Default delay value - should match the backend performanceConfig.defaultDelay
const DEFAULT_DELAY = 200

export function useAutoPerformance(initialDelay = DEFAULT_DELAY) {
  const { status, updateWatcherStatus } = useWatcherStatus()
  const isAutoMode = ref(false)
  const baseDelay = ref(initialDelay)
  const computedDelay = ref(initialDelay)

  // Range constraints - should match the backend performanceConfig
  const minDelay = ref(0)
  const maxDelay = ref(3000)

  // Batch settings
  const batchSize = ref(10)
  const minBatchSize = ref(1)
  const maxBatchSize = ref(50)
  const enableBatching = ref(true)

  // More efficient computed properties with direct property access
  const activeWatchers = computed(() =>
    'activeIndexingWatchers' in status.value
      ? status.value.activeIndexingWatchers
      : status.value.folders.filter(f =>
        !f.isPaused && ['scanning', 'indexing', 'initializing'].includes(f.state),
      ).length,
  )

  const watchingWatchers = computed(() =>
    'watchingWatchers' in status.value
      ? status.value.watchingWatchers
      : status.value.folders.filter(f =>
        !f.isPaused && f.state === 'watching',
      ).length,
  )

  // Load initial performance settings from backend
  onMounted(async () => {
    try {
      const settings = await window.api.invoke(IPC.BACKEND.INDEXER_GET_PERFORMANCE_SETTINGS)
      isAutoMode.value = settings.isAutoMode
      baseDelay.value = settings.baseDelay
      computedDelay.value = settings.currentDelay

      // Get range constraints from backend
      if (settings.minDelay !== undefined)
        minDelay.value = settings.minDelay
      if (settings.maxDelay !== undefined)
        maxDelay.value = settings.maxDelay

      // Get batch settings from backend
      if (settings.batchSize !== undefined)
        batchSize.value = settings.batchSize
      if (settings.enableBatching !== undefined)
        enableBatching.value = settings.enableBatching
    }
    catch (err) {
      console.error('Failed to load performance settings:', err)
    }

    // Start listening for status updates
    window.api.on('indexer:status', (status) => {
      activeWatchers.value = status.activeIndexingWatchers || 0
      watchingWatchers.value = status.watchingWatchers || 0

      // Update computed delay from status updates
      if (isAutoMode.value) {
        computedDelay.value = status.currentDelay || computedDelay.value
      }
    })
  })

  onUnmounted(() => {
    window.api.removeAllListeners('indexer:status')
  })

  // Sync auto mode changes with backend
  watch(isAutoMode, async (enabled) => {
    try {
      await window.api.invoke(IPC.BACKEND.INDEXER_SET_AUTO_PERFORMANCE, enabled)

      // After toggling mode, update both the status and settings
      await updateWatcherStatus()

      // Refresh settings to ensure all values are in sync
      const settings = await window.api.invoke(IPC.BACKEND.INDEXER_GET_PERFORMANCE_SETTINGS)
      baseDelay.value = settings.baseDelay
      computedDelay.value = settings.currentDelay
    }
    catch (err) {
      console.error('Failed to update auto performance mode:', err)
    }
  })

  // Update status periodically when in auto mode
  let autoUpdateInterval = null

  watch(isAutoMode, (isAuto) => {
    if (autoUpdateInterval) {
      clearInterval(autoUpdateInterval)
      autoUpdateInterval = null
    }

    if (isAuto) {
      autoUpdateInterval = setInterval(async () => {
        await updateWatcherStatus()
        // The actual delay calculation is now done in the backend
        const settings = await window.api.invoke(IPC.BACKEND.INDEXER_GET_PERFORMANCE_SETTINGS)
        baseDelay.value = settings.baseDelay
        computedDelay.value = settings.currentDelay
      }, 2000)
    }
  })

  return {
    isAutoMode,
    baseDelay,
    computedDelay,
    activeWatchers,
    watchingWatchers,
    minDelay,
    maxDelay,
    batchSize,
    minBatchSize,
    maxBatchSize,
    enableBatching,
  }
}
