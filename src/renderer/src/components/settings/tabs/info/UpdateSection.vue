<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../../../../main/ipc/ipcChannels'

defineProps({
  currentVersion: {
    type: String,
    default: '',
  },
})

// Update state
const updateStatus = ref('idle') // 'idle', 'checking', 'available', 'downloading', 'ready', 'error'
const updateInfo = ref(null)
const downloadProgress = ref(null)
const errorMessage = ref('')

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
      errorMessage.value = result.error || 'Failed to check for updates'
    }
    // Status will be updated by IPC listeners
  }
  catch (error) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || 'Failed to check for updates'
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
      errorMessage.value = result.error || 'Failed to download update'
    }
    // Progress will be updated by IPC listeners
  }
  catch (error) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || 'Failed to download update'
  }
}

// Install update
function installUpdate() {
  try {
    window.api.invoke(IPC_CHANNELS.INSTALL_UPDATE)
  }
  catch (error) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || 'Failed to install update'
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
        Updates
      </h3>
      <span class="text-sm text-gray-500 dark:text-gray-400">
        Current version: {{ currentVersion }}
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
              You're up to date
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Seeksy v{{ currentVersion }} is the latest version
            </p>
          </div>
        </div>
        <button
          class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-accent-600 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
          @click="checkForUpdates"
        >
          Check for updates
        </button>
      </div>

      <!-- Checking State -->
      <div v-else-if="updateStatus === 'checking'" class="flex items-center gap-3">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30">
          <span class="text-blue-600 dark:text-blue-400 material-symbols-rounded text-xl animate-spin">progress_activity</span>
        </span>
        <div>
          <p class="font-medium text-gray-900 dark:text-gray-100">
            Checking for updates...
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Please wait
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
              Update available!
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Version {{ updateInfo?.version }} is ready to download
            </p>
          </div>
        </div>
        <div class="flex gap-3">
          <button
            class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-accent-600 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
            @click="downloadUpdate"
          >
            Download update
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            @click="openReleasesPage"
          >
            View release notes
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
              Downloading update...
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ downloadProgress ? `${formatBytes(downloadProgress.transferred)} / ${formatBytes(downloadProgress.total)}` : 'Starting...' }}
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
          {{ Math.round(downloadProgress?.percent || 0) }}% complete
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
              Update ready to install!
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Version {{ updateInfo?.version }} has been downloaded
            </p>
          </div>
        </div>
        <div class="flex gap-3">
          <button
            class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            @click="installUpdate"
          >
            Install and restart
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            @click="openReleasesPage"
          >
            View release notes
          </button>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          The update will also be installed automatically when you quit the app.
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
              Update check failed
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
            Try again
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            @click="openReleasesPage"
          >
            Download manually
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
