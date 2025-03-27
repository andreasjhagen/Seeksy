<script setup>
import { computed, ref } from 'vue'
import { useWatcherStatus } from '../../../../composables/useWatcherStatus'

const props = defineProps({
  folder: {
    type: Object,
    required: true,
    default: () => ({
      path: '',
      depth: Infinity,
      totalFiles: 0,
      processedFiles: 0,
      state: 'initializing',
      isPaused: false,
    }),
  },
})

defineEmits(['remove'])

const { toggleFolderPause, formatFileCount, formatDepth, getFolderStatusInfo } = useWatcherStatus()

const isToggling = ref(false)

const statusInfo = computed(() => getFolderStatusInfo(props.folder))

const statusText = computed(() => statusInfo.value.statusText)
const statusClass = computed(() => statusInfo.value.statusClass)
const progressBarClass = computed(() => statusInfo.value.progressBarClass)
const actionButtonClass = computed(() => statusInfo.value.actionButtonClass)

const progress = computed(() => {
  if (props.folder.totalFiles === 0)
    return 0
  return Math.round((props.folder.processedFiles / props.folder.totalFiles) * 100)
})

const buttonText = computed(() => {
  if (isToggling.value)
    return 'Working...'
  return props.folder.isPaused ? 'Resume' : 'Pause'
})

const buttonIcon = computed(() => {
  if (isToggling.value)
    return 'sync'
  return props.folder.isPaused ? 'play_arrow' : 'pause'
})

async function onPauseResume() {
  if (isToggling.value)
    return

  isToggling.value = true
  try {
    await toggleFolderPause(props.folder.path)
  }
  catch (error) {
    console.error('Failed to toggle folder pause state:', error)
  }
  finally {
    isToggling.value = false
  }
}
</script>

<template>
  <div class="p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded transition-colors group">
    <!-- First row: Path and status -->
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2 overflow-hidden">
        <h3 class="text-sm font-medium text-gray-800 truncate dark:text-gray-200">
          {{ props.folder.path }}
        </h3>
        <span class="px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0" :class="statusClass">
          {{ statusText }}
        </span>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-1 shrink-0">
        <button
          class="flex items-center gap-0.5 px-2 py-0.5 text-xs transition-all duration-200 rounded-md cursor-pointer"
          :class="[
            actionButtonClass,
            isToggling ? 'opacity-75 cursor-wait' : '',
            props.folder.isPaused ? 'hover:bg-emerald-300' : 'hover:bg-orange-300'
          ]" :disabled="isToggling" @click="onPauseResume">
          <span class="text-xs material-symbols-outlined"
            :class="{ 'animate-spin': isToggling && buttonIcon === 'sync' }">
            {{ buttonIcon }}
          </span>
          <span class="hidden sm:inline">{{ buttonText }}</span>
        </button>
        <button
          class="flex items-center p-0.5 text-xs text-white transition-all duration-200 bg-red-600 rounded-md cursor-pointer hover:bg-red-700"
          title="Remove folder" @click="$emit('remove', props.folder.path)">
          <span class="text-xs material-symbols-outlined">close</span>
        </button>
      </div>
    </div>

    <div class="grid items-center grid-cols-12 gap-2">
      <div class="col-span-9 relative h-1.5 bg-gray-200 rounded-full dark:bg-gray-700">
        <div class="absolute h-full transition-all duration-300 rounded-full"
          :class="[progressBarClass, props.folder.isPaused ? 'opacity-50' : '']" :style="{ width: `${progress}%` }" />
      </div>

      <div
        class="col-span-3 flex justify-end gap-1.5 text-xs text-gray-600 dark:text-gray-400 shrink-0 whitespace-nowrap">
        <span class="tabular-nums">{{ formatFileCount(props.folder.processedFiles, props.folder.totalFiles) }}</span>
        <span class="text-gray-500 dark:text-gray-500">
          Depth:{{ formatDepth(props.folder.depth) }}
        </span>
      </div>
    </div>
  </div>
</template>
