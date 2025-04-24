<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { IPC } from '../../../../../../main/ipc/ipcChannels'

const props = defineProps({
  currentVersion: {
    type: String,
    required: true,
    default: 'Unknown',
  },
})

const updateStatus = ref('checking') // 'checking', 'up-to-date', 'available', 'downloaded', 'downloading', 'error'
const latestVersion = ref('Checking...')
const downloadProgress = ref(0)
const error = ref(null)
const lastCheckTime = ref(null)
const debugInfo = ref(null)

// Added new function to force check updates
async function forceCheckForUpdates() {
  try {
    updateStatus.value = 'checking'
    latestVersion.value = 'Checking...'

    // Add a new IPC channel for force-checking updates
    const result = await window.api.invoke(IPC.UPDATER.FORCE_CHECK_FOR_UPDATES)
    console.log('Force update check result:', result)

    handleUpdateResult(result)
  }
  catch (err) {
    console.error('Error force-checking for updates:', err)
    updateStatus.value = 'error'
    error.value = err.message
    latestVersion.value = props.currentVersion
  }
}

async function checkForUpdates() {
  try {
    updateStatus.value = 'checking'
    latestVersion.value = 'Checking...'

    const result = await window.api.invoke(IPC.UPDATER.CHECK_FOR_UPDATES)
    console.log('Update check result:', result)

    handleUpdateResult(result)
  }
  catch (err) {
    console.error('Error checking for updates:', err)
    updateStatus.value = 'error'
    error.value = err.message
    latestVersion.value = props.currentVersion
  }
}

function handleUpdateResult(result) {
  // Store debug info for advanced users
  debugInfo.value = {
    currentVersion: props.currentVersion,
    remoteVersion: result.remoteVersion || result.updateInfo?.version,
    updateAvailable: result.updateAvailable,
    updateInfo: result.updateInfo,
    lastCheck: result.lastCheck,
    error: result.error,
  }

  // Update last check time
  if (result.lastCheck) {
    lastCheckTime.value = new Date(result.lastCheck).toLocaleTimeString()
  }

  // Handle error case specifically
  if (result.error) {
    updateStatus.value = 'error'
    error.value = result.error
    latestVersion.value = props.currentVersion
    return
  }

  // Handle the case where the check is still in progress
  if (result.checkingInProgress) {
    // Don't update UI if check is still running, let the status listener handle it
    console.log('Update check still in progress, waiting for completion...')
    return
  }

  // Only throw an error if success is explicitly false and there's no error message
  if (result.success === false && !result.error) {
    error.value = 'Failed to check for updates'
    updateStatus.value = 'error'
    latestVersion.value = props.currentVersion
    return
  }

  // Update state based on the result
  if (result.updateAvailable) {
    updateStatus.value = 'available'
    latestVersion.value = result.remoteVersion || result.updateInfo?.version || 'newer version'
  }
  else if (result.updateDownloaded) {
    updateStatus.value = 'downloaded'
    latestVersion.value = result.remoteVersion || result.updateInfo?.version || 'newer version'
  }
  else {
    updateStatus.value = 'up-to-date'
    latestVersion.value = result.remoteVersion || props.currentVersion
  }
}

async function downloadUpdate() {
  try {
    updateStatus.value = 'downloading'
    const result = await window.api.invoke(IPC.UPDATER.DOWNLOAD_UPDATE)

    if (!result.success) {
      throw new Error(result.error || 'Failed to download update')
    }
  }
  catch (err) {
    console.error('Error downloading update:', err)
    error.value = err.message
    updateStatus.value = 'error'
  }
}

async function installUpdate() {
  try {
    await window.api.invoke(IPC.UPDATER.INSTALL_UPDATE)
  }
  catch (err) {
    console.error('Error installing update:', err)
    error.value = err.message
  }
}

// Listen for update status changes
function setupUpdateStatusListener() {
  window.api.on(IPC.UPDATER.STATUS, (status) => {
    console.log('Update status received:', status)

    if (status.updateAvailable) {
      updateStatus.value = status.updateDownloaded ? 'downloaded' : 'available'
      latestVersion.value = status.updateInfo?.version || 'newer version'
    }
    else if (status.checking) {
      updateStatus.value = 'checking'
      latestVersion.value = 'Checking...'
    }
    else if (!status.error) {
      updateStatus.value = 'up-to-date'
      latestVersion.value = props.currentVersion
    }
    else {
      updateStatus.value = 'error'
      error.value = status.error
      latestVersion.value = props.currentVersion
    }

    // Update download progress
    downloadProgress.value = status.downloadProgress || 0
  })
}

// Cleanup listener when component is unmounted
onUnmounted(() => {
  window.api.removeAllListeners(IPC.UPDATER.STATUS)
})

onMounted(() => {
  // Set up status listener
  setupUpdateStatusListener()

  // Check for updates when component mounts
  checkForUpdates()
})
</script>

<template>
  <div class="flex flex-col">
    <div class="flex items-center gap-2">
      <!-- Update status indicator -->
      <span v-if="updateStatus === 'checking'" class="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded-full dark:bg-gray-700 dark:text-gray-300">
        Checking for updates...
      </span>

      <span v-else-if="updateStatus === 'up-to-date'" class="px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-full dark:bg-green-900/20 dark:text-green-400">
        Up to date
      </span>

      <span
        v-else-if="updateStatus === 'available'"
        class="px-2 py-1 text-xs font-medium text-white rounded-full cursor-pointer bg-accent hover:bg-accent-700"
        @click="downloadUpdate"
      >
        Update available ({{ latestVersion }})
      </span>

      <div v-else-if="updateStatus === 'downloading'" class="flex items-center gap-2">
        <span class="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full dark:bg-blue-900/20 dark:text-blue-400">
          Downloading... {{ Math.round(downloadProgress) }}%
        </span>
        <div class="w-20 h-1 overflow-hidden bg-gray-200 rounded-full dark:bg-gray-700">
          <div class="h-full bg-accent" :style="{ width: `${downloadProgress}%` }" />
        </div>
      </div>

      <span
        v-else-if="updateStatus === 'downloaded'"
        class="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded-full cursor-pointer hover:bg-green-700"
        @click="installUpdate"
      >
        Install update ({{ latestVersion }})
      </span>

      <span
        v-else
        class="px-2 py-1 text-xs font-medium text-orange-600 bg-orange-100 rounded-full cursor-pointer dark:bg-orange-900/20 dark:text-orange-400"
        :title="error"
        @click="checkForUpdates"
      >
        Retry check
      </span>

      <div class="flex gap-1">
        <button
          class="text-xs text-gray-500 cursor-pointer dark:text-gray-400 hover:text-accent dark:hover:text-accent-300"
          title="Check for updates"
          @click="checkForUpdates"
        >
          ↻
        </button>

        <button
          class="text-xs text-gray-500 cursor-pointer dark:text-gray-400 hover:text-accent dark:hover:text-accent-300"
          title="Force check for updates (bypasses cache)"
          @click="forceCheckForUpdates"
        >
          ⟳
        </button>
      </div>
    </div>

    <!-- Update info details -->
    <div v-if="lastCheckTime" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
      Last checked: {{ lastCheckTime }}
      <span v-if="debugInfo?.currentVersion && debugInfo?.remoteVersion">
        ({{ debugInfo.currentVersion }} → {{ debugInfo.remoteVersion }})
      </span>
    </div>
  </div>
</template>
