<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IPC } from '../../../../../../main/ipc/ipcChannels'
import { useAutoPerformance } from '../../../../composables/useAutoPerformance'
import ToggleButton from '../../../common/ToggleButton.vue'

const { t } = useI18n()

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
      {{ t('settings.performance.title') }}
    </h2>

    <!-- Auto/Manual Toggle -->
    <div class="mb-4">
      <ToggleButton
        :title="t('settings.performance.autoMode')"
        :description="isAutoMode ? t('settings.performance.autoModeEnabled') : t('settings.performance.autoModeDisabled')"
        :value="isAutoMode"
        @toggle="toggleAutoMode(!isAutoMode)"
      />
    </div>

    <!-- Auto Mode View -->
    <div v-if="isAutoMode" class="mb-6 space-y-4">
      <div class="p-4 border border-blue-100 rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
        <h3 class="mb-2 font-medium text-blue-800 dark:text-blue-300">
          {{ t('settings.performance.automaticTitle') }}
          <span class="ml-1 text-sm font-normal text-blue-600 dark:text-blue-400">
            ({{ t('settings.performance.indexingWatching', { active: activeWatchers, watching: watchingWatchers }) }})
          </span>
        </h3>

        <!-- Auto Mode Stats -->
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-gray-600 dark:text-gray-300">{{ t('settings.performance.currentDelay') }}</span>
            <span class="font-medium text-gray-800 dark:text-gray-200">{{ processingDelay }}ms</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-600 dark:text-gray-300">{{ t('settings.performance.currentBatchSize') }}</span>
            <span class="font-medium text-gray-800 dark:text-gray-200">{{ batchSize }} {{ t('settings.performance.filesUnit') }}</span>
          </div>
        </div>

        <p class="mt-3 text-sm text-blue-600 dark:text-blue-400">
          {{ t('settings.performance.autoDescription') }}
        </p>
      </div>
    </div>

    <!-- Manual Mode View -->
    <div v-else class="space-y-4">
      <div class="p-4 border border-gray-100 rounded-lg bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700">
        <h3 class="mb-3 font-medium text-gray-800 dark:text-gray-200">
          {{ t('settings.performance.manualTitle') }}
        </h3>

        <!-- Processing Delay Slider -->
        <div class="mb-5">
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('settings.performance.processingDelay') }} {{ processingDelay }}ms
            </label>
            <span class="text-xs text-gray-500">{{ t('settings.performance.delayRange', { min: minDelay, max: maxDelay }) }}</span>
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
            {{ t('settings.performance.delayDescription') }}
          </p>
        </div>

        <!-- Batch Size Slider (always visible in manual mode) -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('settings.performance.batchSize') }} {{ batchSize }} {{ t('settings.performance.filesUnit') }}
            </label>
            <span class="text-xs text-gray-500">{{ t('settings.performance.batchRange', { min: minBatchSize, max: maxBatchSize }) }}</span>
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
            {{ t('settings.performance.batchDescription') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
