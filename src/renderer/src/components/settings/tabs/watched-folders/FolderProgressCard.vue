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

// Extract folder name from path
const folderName = computed(() => {
  const path = props.folder.path
  // Handle both Windows and Unix paths
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
})

// Get parent path (everything except the folder name)
const parentPath = computed(() => {
  const path = props.folder.path
  const name = folderName.value
  // Remove the folder name from the end, accounting for trailing slash
  let parent = path.slice(0, path.lastIndexOf(name))
  // Clean up any trailing slashes
  return parent.replace(/[/\\]+$/, '') || '/'
})

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
  <div class="p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors group">
    <!-- Main content row -->
    <div class="flex items-start justify-between gap-3">
      <!-- Left: Folder info -->
      <div class="flex-1 min-w-0">
        <!-- Folder name with status badge -->
        <div class="flex items-center gap-2 mb-0.5">
          <span class="material-symbols-rounded text-gray-400 dark:text-gray-500 text-base">folder</span>
          <span class="px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0" :class="statusClass">
            {{ statusText }}
          </span>
          <h3 class="font-medium text-gray-900 truncate dark:text-gray-100">
            {{ folderName }}
          </h3>
        </div>
        <!-- Full path -->
        <p class="text-xs text-gray-500 dark:text-gray-400 truncate pl-6">
          {{ parentPath }}
        </p>
      </div>

      <!-- Right: Stats and actions -->
      <div class="flex items-center gap-3 shrink-0">
        <!-- Stats column -->
        <div class="text-right text-xs">
          <div class="font-medium text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap">
            {{ formatFileCount(props.folder.processedFiles, props.folder.totalFiles) }}
          </div>
          <div class="text-gray-500 dark:text-gray-500 whitespace-nowrap">
            Depth: {{ formatDepth(props.folder.depth) }}
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex items-center gap-1">
          <button
            class="flex items-center gap-0.5 px-2 py-1 text-xs transition-all duration-200 rounded-md cursor-pointer"
            :class="[
              actionButtonClass,
              isToggling ? 'opacity-75 cursor-wait' : '',
              props.folder.isPaused ? 'hover:bg-emerald-300' : 'hover:bg-orange-300',
            ]" :disabled="isToggling" @click="onPauseResume"
          >
            <span
              class="text-sm material-symbols-rounded"
              :class="{ 'animate-spin': isToggling && buttonIcon === 'sync' }"
            >
              {{ buttonIcon }}
            </span>
            <span class="hidden sm:inline">{{ buttonText }}</span>
          </button>
          <button
            class="flex items-center p-1 text-white transition-all duration-200 bg-red-600 rounded-md cursor-pointer hover:bg-red-700"
            title="Remove folder" @click="$emit('remove', props.folder.path)"
          >
            <span class="text-sm material-symbols-rounded">close</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Progress bar - full width -->
    <div class="mt-2 h-1 bg-gray-200 rounded-full dark:bg-gray-700">
      <div
        class="h-full transition-all duration-300 rounded-full"
        :class="[progressBarClass, props.folder.isPaused ? 'opacity-50' : '']"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
</template>
