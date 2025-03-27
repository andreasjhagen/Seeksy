<script setup>
import { ref, watch } from 'vue'
import { IPC } from '../../../../../../main/ipc/ipcChannels'
import { useAutoPerformance } from '../../../../composables/useAutoPerformance'
import ToggleButton from '../../../common/ToggleButton.vue'

// Default value should match the backend performanceConfig.defaultDelay
const processingDelay = ref(200)
const {
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
} = useAutoPerformance(processingDelay.value)

// More efficient update function with debounce
let updateTimeoutId = null
function debouncedUpdate(value) {
  if (updateTimeoutId)
    clearTimeout(updateTimeoutId)
  updateTimeoutId = setTimeout(() => {
    updateProcessingDelay(value)
    updateTimeoutId = null
  }, 300)
}

// Update baseDelay when manually changing processingDelay
watch(processingDelay, (newValue) => {
  if (!isAutoMode.value) {
    debouncedUpdate(newValue)
  }
})

// Apply auto mode delay when computed delay changes
watch(computedDelay, (newDelay) => {
  if (isAutoMode.value) {
    processingDelay.value = newDelay
  }
})

// Sync with baseDelay when it changes
watch(baseDelay, (newValue) => {
  // Update the UI value when base delay changes and we're not in auto mode
  if (!isAutoMode.value) {
    processingDelay.value = newValue
  }
})

async function updateProcessingDelay(value) {
  await window.api.invoke(IPC.BACKEND.INDEXER_SET_PROCESSING_DELAY, value)
}

// Handle batch settings
let batchUpdateTimeoutId = null
function debouncedUpdateBatchSize(value) {
  if (batchUpdateTimeoutId)
    clearTimeout(batchUpdateTimeoutId)
  batchUpdateTimeoutId = setTimeout(() => {
    updateBatchSize(value)
    batchUpdateTimeoutId = null
  }, 300)
}

async function updateBatchSize(value) {
  await window.api.invoke(IPC.BACKEND.INDEXER_SET_BATCH_SIZE, value)
}

// Handle mode switching
async function toggleAutoMode(enabled) {
  isAutoMode.value = enabled

  // The backend will handle the appropriate delay updates
  await window.api.invoke(IPC.BACKEND.INDEXER_SET_AUTO_PERFORMANCE, enabled)

  // Get the updated settings after mode change
  const settings = await window.api.invoke(IPC.BACKEND.INDEXER_GET_PERFORMANCE_SETTINGS)

  // Always use the currentDelay value regardless of mode
  // This allows users to start manual adjustments from the last auto value
  processingDelay.value = settings.currentDelay
  batchSize.value = settings.batchSize
}
</script>

<template>
  <div>
    <h2 class="pb-2 mb-3 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700">
      Performance Settings
    </h2>

    <!-- Auto/Manual Toggle -->
    <div class="mb-4">
      <ToggleButton
        title="Auto Mode"
        :description="`${isAutoMode ? 'System optimizes indexing performance automatically' : 'Manually configure indexing performance settings'}`"
        :value="isAutoMode"
        @toggle="toggleAutoMode(!isAutoMode)"
      />
    </div>

    <!-- Auto Mode View -->
    <div v-if="isAutoMode" class="mb-6 space-y-4">
      <div class="p-4 border border-blue-100 rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
        <h3 class="mb-2 font-medium text-blue-800 dark:text-blue-300">
          Automatic Performance Management
          <span class="ml-1 text-sm font-normal text-blue-600 dark:text-blue-400">
            ({{ activeWatchers }} indexing, {{ watchingWatchers }} watching)
          </span>
        </h3>

        <!-- Auto Mode Stats -->
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-gray-600 dark:text-gray-300">Current processing delay:</span>
            <span class="font-medium text-gray-800 dark:text-gray-200">{{ processingDelay }}ms</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-600 dark:text-gray-300">Current batch size:</span>
            <span class="font-medium text-gray-800 dark:text-gray-200">{{ batchSize }} files</span>
          </div>
        </div>

        <p class="mt-3 text-sm text-blue-600 dark:text-blue-400">
          Settings are being automatically adjusted for optimal performance based on system load and activity.
        </p>
      </div>
    </div>

    <!-- Manual Mode View -->
    <div v-else class="space-y-4">
      <div class="p-4 border border-gray-100 rounded-lg bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700">
        <h3 class="mb-3 font-medium text-gray-800 dark:text-gray-200">
          Manual Performance Settings
        </h3>

        <!-- Processing Delay Slider -->
        <div class="mb-5">
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm text-gray-600 dark:text-gray-400">
              Processing Delay: {{ processingDelay }}ms
            </label>
            <span class="text-xs text-gray-500">({{ minDelay }}ms - {{ maxDelay }}ms)</span>
          </div>
          <input
            v-model.number="processingDelay"
            type="range"
            :min="minDelay"
            :max="maxDelay"
            step="50"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            @change="updateProcessingDelay(processingDelay)"
          >
          <p class="mt-1 text-xs text-gray-500">
            Higher values reduce system load but slow down indexing
          </p>
        </div>

        <!-- Batch Size Slider (always visible in manual mode) -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm text-gray-600 dark:text-gray-400">
              Batch Size: {{ batchSize }} files
            </label>
            <span class="text-xs text-gray-500">({{ minBatchSize }} - {{ maxBatchSize }})</span>
          </div>
          <input
            v-model.number="batchSize"
            type="range"
            :min="minBatchSize"
            :max="maxBatchSize"
            step="1"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            @change="debouncedUpdateBatchSize(batchSize)"
          >
          <p class="mt-1 text-xs text-gray-500">
            Larger batch sizes can improve performance but may use more memory
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
