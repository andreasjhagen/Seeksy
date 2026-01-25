<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()

const { toggleFolderPause, formatDepth, getFolderStatusInfo } = useWatcherStatus()

const isToggling = ref(false)

const statusInfo = computed(() => getFolderStatusInfo(props.folder))

// Translate status text
const statusText = computed(() => {
  const info = statusInfo.value
  if (info.statusKey === 'processingFiles') {
    return t('settings.watchedFolders.status.processingFiles', { count: props.folder.pendingTasks || 0 })
  }
  return t(`settings.watchedFolders.status.${info.statusKey}`)
})
const statusClass = computed(() => statusInfo.value.statusClass)
const progressBarClass = computed(() => statusInfo.value.progressBarClass)
const actionButtonClass = computed(() => statusInfo.value.actionButtonClass)

// File count formatted
const fileCountText = computed(() => {
  const processed = (props.folder.processedFiles || 0).toLocaleString()
  const total = (props.folder.totalFiles || 0).toLocaleString()
  return `${processed} / ${total}`
})

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
  // Clean up any trailing slashes but preserve drive letter format on Windows (e.g., "D:\")
  parent = parent.replace(/[/\\]+$/, '')
  // If parent is just a drive letter (e.g., "D:"), add the backslash back
  if (/^[A-Z]:$/i.test(parent)) {
    return `${parent}\\`
  }
  return parent || '/'
})

const progress = computed(() => {
  if (props.folder.totalFiles === 0)
    return 0
  return Math.round((props.folder.processedFiles / props.folder.totalFiles) * 100)
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
  <!-- Compact two-row layout: name/stats on top, path below -->
  <div class="py-1.5 px-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded transition-colors group">
    <!-- Row 1: Folder icon, status, name, stats, actions -->
    <div class="flex items-center gap-2">
      <!-- Folder icon -->
      <span class="material-symbols-rounded text-gray-400 dark:text-gray-500 text-base shrink-0">folder</span>

      <!-- Status badge - compact -->
      <span class="px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0" :class="statusClass">
        {{ statusText }}
      </span>

      <!-- Folder name - flexible width -->
      <span class="flex-1 min-w-0 font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
        {{ folderName }}
      </span>

      <!-- File count - right aligned -->
      <div class="text-xs text-right tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-400 shrink-0">
        <span class="font-medium">{{ fileCountText }}</span>
        <span class="text-gray-400 dark:text-gray-500 text-[10px] ml-1">{{ t('settings.watchedFolders.card.depth') }}{{ formatDepth(props.folder.depth) }}</span>
      </div>

      <!-- Inline progress bar - narrow -->
      <div class="w-16 h-1.5 bg-gray-200 rounded-full dark:bg-gray-700 shrink-0 hidden md:block">
        <div
          class="h-full transition-all duration-300 rounded-full"
          :class="[progressBarClass, props.folder.isPaused ? 'opacity-50' : '']"
          :style="{ width: `${progress}%` }"
        />
      </div>

      <!-- Action buttons - compact -->
      <div class="flex items-center gap-1 shrink-0">
        <button
          class="flex items-center justify-center w-7 h-7 text-xs transition-all duration-200 rounded cursor-pointer"
          :class="[
            actionButtonClass,
            isToggling ? 'opacity-75 cursor-wait' : '',
            props.folder.isPaused ? 'hover:brightness-110' : 'hover:brightness-110',
          ]"
          :disabled="isToggling"
          :title="props.folder.isPaused ? t('common.resume') : t('common.pause')"
          @click="onPauseResume"
        >
          <span
            class="text-base material-symbols-rounded"
            :class="{ 'animate-spin': isToggling && buttonIcon === 'sync' }"
          >
            {{ buttonIcon }}
          </span>
        </button>
        <button
          class="flex items-center justify-center w-7 h-7 text-white transition-all duration-200 bg-red-600 rounded cursor-pointer hover:bg-red-700"
          :title="t('settings.watchedFolders.card.removeFolder')"
          @click="$emit('remove', props.folder.path)"
        >
          <span class="text-base material-symbols-rounded">close</span>
        </button>
      </div>
    </div>

    <!-- Row 2: Full path - not truncated, wraps if needed -->
    <p class="text-[11px] text-gray-400 dark:text-gray-500 pl-6 mt-0.5 break-all">
      {{ parentPath }}
    </p>
  </div>
</template>
