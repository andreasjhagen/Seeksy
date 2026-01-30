<script setup>
import { marked } from 'marked'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IPC_CHANNELS } from '../../../../../../main/ipc/ipcChannels'

defineProps({
  currentVersion: {
    type: String,
    default: '',
  },
})

const { t } = useI18n()

// Configure marked for safe rendering
marked.setOptions({
  breaks: true, // Convert line breaks to <br>
  gfm: true, // GitHub Flavored Markdown
})

// Update state
const updateStatus = ref('idle') // 'idle', 'checking', 'available', 'downloading', 'ready', 'error'
const updateInfo = ref(null)
const downloadProgress = ref(null)
const errorMessage = ref('')
const showChangelog = ref(false)

// Computed property to format release notes (for update available/ready states)
const formattedChangelog = computed(() => {
  if (!updateInfo.value?.releaseNotes) {
    return null
  }

  const notes = updateInfo.value.releaseNotes

  // Handle array format (when fullChangelog is true)
  if (Array.isArray(notes)) {
    return notes.map(note => ({
      version: note.version,
      note: marked.parse(note.note || ''),
    }))
  }

  // Handle string format
  if (typeof notes === 'string') {
    return [{ version: updateInfo.value.version, note: marked.parse(notes) }]
  }

  return null
})

// Format bytes to human readable
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0)
    return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

// Format speed to human readable
function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond)
    return ''
  return `${formatBytes(bytesPerSecond)}/s`
}

// Check for updates
async function checkForUpdates() {
  try {
    updateStatus.value = 'checking'
    errorMessage.value = ''
    const result = await window.api.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES)

    if (!result.success) {
      updateStatus.value = 'error'
      errorMessage.value = result.error || t('errors.checkUpdateFailed')
    }
    // Status will be updated by IPC listeners
  }
  catch (error) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || t('errors.checkUpdateFailed')
  }
}

// Download update
async function downloadUpdate() {
  try {
    updateStatus.value = 'downloading'
    downloadProgress.value = { percent: 0 }
    errorMessage.value = ''
    const result = await window.api.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE)

    if (!result.success) {
      updateStatus.value = 'error'
      errorMessage.value = result.error || t('errors.downloadUpdateFailed')
    }
    // Progress will be updated by IPC listeners
  }
  catch (error) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || t('errors.downloadUpdateFailed')
  }
}

// Install update
function installUpdate() {
  try {
    window.api.invoke(IPC_CHANNELS.INSTALL_UPDATE)
  }
  catch (error) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || t('errors.installUpdateFailed')
  }
}

// Open GitHub releases page
function openReleasesPage() {
  window.open('https://github.com/andreasjhagen/Seeksy/releases')
}

// Set up IPC listeners
function setupListeners() {
  window.api.on(IPC_CHANNELS.CHECKING_FOR_UPDATE, () => {
    updateStatus.value = 'checking'
  })

  window.api.on(IPC_CHANNELS.UPDATE_AVAILABLE, (data) => {
    updateStatus.value = 'available'
    updateInfo.value = data
  })

  window.api.on(IPC_CHANNELS.UPDATE_NOT_AVAILABLE, () => {
    updateStatus.value = 'idle'
    updateInfo.value = null
  })

  window.api.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, (data) => {
    downloadProgress.value = data
  })

  window.api.on(IPC_CHANNELS.UPDATE_DOWNLOADED, (data) => {
    updateStatus.value = 'ready'
    updateInfo.value = data
    downloadProgress.value = null
  })

  window.api.on(IPC_CHANNELS.ERROR, (data) => {
    updateStatus.value = 'error'
    errorMessage.value = data.message || 'An error occurred'
  })
}

// Get initial status
async function getInitialStatus() {
  try {
    const status = await window.api.invoke(IPC_CHANNELS.GET_UPDATE_STATUS)
    if (status.updateDownloaded) {
      updateStatus.value = 'ready'
      updateInfo.value = status.updateInfo
    }
    else if (status.updateAvailable) {
      updateStatus.value = 'available'
      updateInfo.value = status.updateInfo
    }
  }
  catch (error) {
    console.error('Failed to get update status:', error)
  }
}

onMounted(() => {
  setupListeners()
  getInitialStatus()
})

onUnmounted(() => {
  // Remove listeners
  window.api.removeAllListeners(IPC_CHANNELS.CHECKING_FOR_UPDATE)
  window.api.removeAllListeners(IPC_CHANNELS.UPDATE_AVAILABLE)
  window.api.removeAllListeners(IPC_CHANNELS.UPDATE_NOT_AVAILABLE)
  window.api.removeAllListeners(IPC_CHANNELS.DOWNLOAD_PROGRESS)
  window.api.removeAllListeners(IPC_CHANNELS.UPDATE_DOWNLOADED)
  window.api.removeAllListeners(IPC_CHANNELS.ERROR)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {{ t('settings.info.updates') }}
      </h3>
      <span class="text-sm text-gray-500 dark:text-gray-400">
        {{ t('settings.info.currentVersion', { version: currentVersion }) }}
      </span>
    </div>

    <!-- Status Display -->
    <div class="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
      <!-- Idle State -->
      <div v-if="updateStatus === 'idle'" class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30">
            <span class="text-green-600 dark:text-green-400 material-symbols-rounded text-xl">check_circle</span>
          </span>
          <div>
            <p class="font-medium text-gray-900 dark:text-gray-100">
              {{ t('settings.info.upToDate') }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('settings.info.upToDateMessage', { version: currentVersion }) }}
            </p>
          </div>
        </div>
        <button
          class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-accent-600 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
          @click="checkForUpdates"
        >
          {{ t('settings.info.checkForUpdates') }}
        </button>
      </div>

      <!-- Checking State -->
      <div v-else-if="updateStatus === 'checking'" class="flex items-center gap-3">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30">
          <span class="text-blue-600 dark:text-blue-400 material-symbols-rounded text-xl animate-spin">progress_activity</span>
        </span>
        <div>
          <p class="font-medium text-gray-900 dark:text-gray-100">
            {{ t('settings.info.checkingForUpdates') }}
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('settings.info.pleaseWait') }}
          </p>
        </div>
      </div>

      <!-- Update Available State -->
      <div v-else-if="updateStatus === 'available'" class="space-y-4">
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30">
            <span class="text-amber-600 dark:text-amber-400 material-symbols-rounded text-xl">new_releases</span>
          </span>
          <div>
            <p class="font-medium text-gray-900 dark:text-gray-100">
              {{ t('settings.info.updateAvailable') }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('settings.info.versionReady', { version: updateInfo?.version }) }}
            </p>
          </div>
        </div>

        <!-- Collapsible Changelog -->
        <div v-if="formattedChangelog" class="border border-gray-200 rounded-lg dark:border-gray-600">
          <button
            class="flex items-center justify-between w-full px-4 py-3 text-left transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50"
            @click="showChangelog = !showChangelog"
          >
            <span class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <span class="material-symbols-rounded text-base">description</span>
              {{ t('settings.info.whatsNew', { version: updateInfo?.version }) }}
            </span>
            <span
              class="transition-transform duration-200 material-symbols-rounded text-gray-500"
              :class="{ 'rotate-180': showChangelog }"
            >
              expand_more
            </span>
          </button>
          <div
            v-show="showChangelog"
            class="px-4 pb-4 border-t border-gray-200 dark:border-gray-600"
          >
            <div
              v-for="(entry, index) in formattedChangelog"
              :key="index"
              class="pt-3"
            >
              <div
                class="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300"
                v-html="entry.note"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-accent-600 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
            @click="downloadUpdate"
          >
            {{ t('settings.info.downloadUpdate') }}
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            @click="openReleasesPage"
          >
            {{ t('settings.info.viewOnGithub') }}
          </button>
          <button
            class="inline-flex items-center justify-center w-9 h-9 text-gray-600 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
            :title="t('settings.info.checkForUpdates')"
            @click="checkForUpdates"
          >
            <span class="material-symbols-rounded text-xl">refresh</span>
          </button>
        </div>
      </div>

      <!-- Downloading State -->
      <div v-else-if="updateStatus === 'downloading'" class="space-y-4">
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30">
            <span class="text-blue-600 dark:text-blue-400 material-symbols-rounded text-xl">downloading</span>
          </span>
          <div class="flex-1">
            <p class="font-medium text-gray-900 dark:text-gray-100">
              {{ t('settings.info.downloading') }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ downloadProgress ? `${formatBytes(downloadProgress.transferred)} / ${formatBytes(downloadProgress.total)}` : t('settings.info.downloadStarting') }}
              <span v-if="downloadProgress?.bytesPerSecond" class="ml-2">
                ({{ formatSpeed(downloadProgress.bytesPerSecond) }})
              </span>
            </p>
          </div>
        </div>
        <!-- Progress bar -->
        <div class="w-full h-2 bg-gray-200 rounded-full dark:bg-gray-600">
          <div
            class="h-2 transition-all duration-300 rounded-full bg-accent-600"
            :style="{ width: `${downloadProgress?.percent || 0}%` }"
          />
        </div>
        <p class="text-sm text-center text-gray-500 dark:text-gray-400">
          {{ t('settings.info.downloadProgress', { percent: Math.round(downloadProgress?.percent || 0) }) }}
        </p>
      </div>

      <!-- Ready to Install State -->
      <div v-else-if="updateStatus === 'ready'" class="space-y-4">
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30">
            <span class="text-green-600 dark:text-green-400 material-symbols-rounded text-xl">download_done</span>
          </span>
          <div>
            <p class="font-medium text-gray-900 dark:text-gray-100">
              {{ t('settings.info.updateReady') }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('settings.info.versionDownloaded', { version: updateInfo?.version }) }}
            </p>
          </div>
        </div>

        <!-- Collapsible Changelog -->
        <div v-if="formattedChangelog" class="border border-gray-200 rounded-lg dark:border-gray-600">
          <button
            class="flex items-center justify-between w-full px-4 py-3 text-left transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50"
            @click="showChangelog = !showChangelog"
          >
            <span class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <span class="material-symbols-rounded text-base">description</span>
              {{ t('settings.info.whatsNew', { version: updateInfo?.version }) }}
            </span>
            <span
              class="transition-transform duration-200 material-symbols-rounded text-gray-500"
              :class="{ 'rotate-180': showChangelog }"
            >
              expand_more
            </span>
          </button>
          <div
            v-show="showChangelog"
            class="px-4 pb-4 border-t border-gray-200 dark:border-gray-600"
          >
            <div
              v-for="(entry, index) in formattedChangelog"
              :key="index"
              class="pt-3"
            >
              <div
                class="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300"
                v-html="entry.note"
              />
            </div>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            @click="installUpdate"
          >
            {{ t('settings.info.installAndRestart') }}
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            @click="openReleasesPage"
          >
            {{ t('settings.info.viewOnGithub') }}
          </button>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ t('settings.info.autoInstallNote') }}
        </p>
      </div>

      <!-- Error State -->
      <div v-else-if="updateStatus === 'error'" class="space-y-4">
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30">
            <span class="text-red-600 dark:text-red-400 material-symbols-rounded text-xl">error</span>
          </span>
          <div>
            <p class="font-medium text-gray-900 dark:text-gray-100">
              {{ t('settings.info.updateCheckFailed') }}
            </p>
            <p class="text-sm text-red-500 dark:text-red-400">
              {{ errorMessage }}
            </p>
          </div>
        </div>
        <div class="flex gap-3">
          <button
            class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-accent-600 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
            @click="checkForUpdates"
          >
            {{ t('settings.info.tryAgain') }}
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            @click="openReleasesPage"
          >
            {{ t('settings.info.downloadManually') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
