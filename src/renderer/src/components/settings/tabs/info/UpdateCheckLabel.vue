<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { IPC } from '../../../../../../main/ipc/ipcChannels'

// Remove props and add currentVersion as a ref
const currentVersion = ref('Unknown')
const updateStatus = ref('checking') // 'checking', 'up-to-date', 'available', 'downloaded', 'downloading', 'error'
const latestVersion = ref('Checking...')
const downloadProgress = ref(0)
const error = ref(null)
const lastCheckTime = ref(null)
const debugInfo = ref(null)
const checkInProgress = ref(false)
const wasDownloaded = ref(false) // Track if an update was previously downloaded
const downloadedVersion = ref(null) // Track which version was downloaded

// Get current app version on component mount
async function getCurrentVersion() {
  try {
    const systemInfo = await window.api.invoke(IPC.SYSTEM.GET_SYSTEM_INFO)
    currentVersion.value = systemInfo.version || 'Unknown'
  }
  catch (err) {
    console.error('Error getting current version:', err)
    currentVersion.value = 'Unknown'
  }
}

// Force check for updates with no caching
async function forceCheckForUpdates() {
  // Prevent multiple simultaneous checks
  if (checkInProgress.value) {
    console.log('Update check already in progress, skipping')
    return
  }

  // Remember if we had a downloaded update before checking
  const previousStatus = updateStatus.value
  wasDownloaded.value = previousStatus === 'downloaded'
  // We save the downloaded version to compare with any new version that might be available
  const previousVersion = latestVersion.value

  try {
    checkInProgress.value = true

    // Only change status to checking if we didn't have a downloaded update
    if (!wasDownloaded.value) {
      updateStatus.value = 'checking'
      latestVersion.value = 'Checking...'
    }

    // Always use FORCE_CHECK_FOR_UPDATES to bypass caching
    const result = await window.api.invoke(IPC.UPDATER.FORCE_CHECK_FOR_UPDATES)
    console.log('Force update check result:', result)

    // Check if we have a downloaded update, and if a newer version is available on the server
    if (wasDownloaded.value && !result.error) {
      console.log('Previously downloaded version:', previousVersion)
      console.log('New available version:', result.remoteVersion)

      // Store the downloaded version if not already set
      if (!downloadedVersion.value && wasDownloaded.value) {
        downloadedVersion.value = previousVersion
      }

      // If we have valid version info to compare
      if (result.remoteVersion && downloadedVersion.value) {
        try {
          // Compare versions - if server has newer version than what we've downloaded
          // This uses the built-in semver comparison that autoUpdater uses
          const hasNewerVersion = result.isNewerThanDownloaded

          if (hasNewerVersion) {
            console.log('Newer version available than what was previously downloaded')
            // Override the downloaded status to show "update available" for the newer version
            result.updateDownloaded = false
            wasDownloaded.value = false
          }
          else {
            console.log('Preserving downloaded update status - no newer version available')
            result.updateDownloaded = true
          }
        }
        catch (error) {
          console.error('Version comparison error:', error)
          // Preserve downloaded status if version comparison fails
          result.updateDownloaded = true
        }
      }
      else {
        // If we can't compare versions, preserve the downloaded status
        result.updateDownloaded = true
      }
    }

    handleUpdateResult(result)
  }
  catch (err) {
    console.error('Error force-checking for updates:', err)
    // Restore previous status if it was 'downloaded'
    if (wasDownloaded.value) {
      updateStatus.value = 'downloaded'
      latestVersion.value = downloadedVersion.value || previousVersion
    }
    else {
      updateStatus.value = 'error'
      error.value = err.message
      latestVersion.value = currentVersion.value
    }
  }
  finally {
    checkInProgress.value = false
  }
}

async function checkForUpdates() {
  // Use the force check to ensure we get fresh results every time
  await forceCheckForUpdates()
}

function handleUpdateResult(result) {
  // Store debug info for advanced users
  debugInfo.value = {
    currentVersion: currentVersion.value,
    downloadedVersion: downloadedVersion.value,
    remoteVersion: result.remoteVersion || result.updateInfo?.version,
    updateAvailable: result.updateAvailable,
    updateInfo: result.updateInfo,
    lastCheck: result.lastCheck,
    error: result.error,
    updateDownloaded: result.updateDownloaded,
    isNewerThanDownloaded: result.isNewerThanDownloaded,
  }

  // Update last check time
  if (result.lastCheck) {
    lastCheckTime.value = new Date(result.lastCheck).toLocaleTimeString()
  }

  // Handle error case specifically
  if (result.error) {
    // Keep the downloaded status if that was our previous state
    if (wasDownloaded.value) {
      console.log('Error occurred, but preserving downloaded status')
      return
    }

    updateStatus.value = 'error'
    error.value = result.error
    latestVersion.value = currentVersion.value
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
    // Keep the downloaded status if that was our previous state
    if (wasDownloaded.value) {
      console.log('Check failed, but preserving downloaded status')
      return
    }

    error.value = 'Failed to check for updates'
    updateStatus.value = 'error'
    latestVersion.value = currentVersion.value
    return
  }

  // If a newer version is available than what was downloaded, prioritize showing that
  if (result.isNewerThanDownloaded) {
    updateStatus.value = 'available'
    latestVersion.value = result.remoteVersion || result.updateInfo?.version || 'newer version'
    return
  }

  // Update state based on the result - with priority order
  // Downloaded takes priority over available
  if (result.updateDownloaded) {
    updateStatus.value = 'downloaded'
    latestVersion.value = result.remoteVersion || result.updateInfo?.version || downloadedVersion.value || 'newer version'
    downloadedVersion.value = latestVersion.value
  }
  else if (result.updateAvailable) {
    updateStatus.value = 'available'
    latestVersion.value = result.remoteVersion || result.updateInfo?.version || 'newer version'
  }
  else {
    // Only change to up-to-date if we didn't have a downloaded update
    if (!wasDownloaded.value) {
      updateStatus.value = 'up-to-date'
      latestVersion.value = result.remoteVersion || currentVersion.value
    }
  }
}

async function downloadUpdate() {
  try {
    updateStatus.value = 'downloading'
    const result = await window.api.invoke(IPC.UPDATER.DOWNLOAD_UPDATE)

    if (!result.success) {
      throw new Error(result.error || 'Failed to download update')
    }

    // When successfully downloaded, store the version we downloaded
    if (latestVersion.value && latestVersion.value !== 'Checking...') {
      downloadedVersion.value = latestVersion.value
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

    // Store any diagnostic info for debugging
    if (status.diagnosticInfo) {
      debugInfo.value = {
        ...debugInfo.value,
        diagnosticInfo: status.diagnosticInfo,
      }
    }

    // Maintain download progress state during the entire process
    if (status.downloadProgress) {
      downloadProgress.value = status.downloadProgress || 0
    }

    // If a newer version exists than what we've downloaded, prioritize that
    if (status.isNewerThanDownloaded) {
      updateStatus.value = 'available'
      latestVersion.value = status.updateInfo?.version || status.remoteVersion || 'newer version'
      return
    }

    // Handle states in priority order (downloaded > downloading > available > checking > up-to-date)

    // Downloaded is the highest priority state
    if (status.updateDownloaded) {
      updateStatus.value = 'downloaded'
      latestVersion.value = status.updateInfo?.version || status.remoteVersion || 'newer version'
      downloadedVersion.value = latestVersion.value
      wasDownloaded.value = true
      return
    }

    // If we're downloading, maintain the downloading state
    if (updateStatus.value === 'downloading' && status.downloadProgress) {
      // Keep the downloading state, only update the progress
      return
    }

    // Handle error state - but don't override downloaded
    if (status.error && !wasDownloaded.value) {
      updateStatus.value = 'error'
      error.value = status.error

      // If the error includes "checksum", add a more user-friendly message
      if (status.error.toLowerCase().includes('checksum')) {
        error.value = `Checksum verification failed: ${status.error}. The downloaded file may be corrupt or tampered with.`
      }

      latestVersion.value = currentVersion.value
      return
    }

    // Only update other states if we haven't downloaded an update or if there's a newer version
    if (!wasDownloaded.value || status.isNewerThanDownloaded) {
      if (status.checking) {
        updateStatus.value = 'checking'
        latestVersion.value = 'Checking...'
      }
      else if (status.updateAvailable) {
        updateStatus.value = 'available'
        latestVersion.value = status.updateInfo?.version || status.remoteVersion || 'newer version'
      }
      else {
        updateStatus.value = 'up-to-date'
        latestVersion.value = status.remoteVersion || currentVersion.value
      }
    }

    // Update last check time if provided
    if (status.lastCheck) {
      lastCheckTime.value = new Date(status.lastCheck).toLocaleTimeString()
    }
  })
}

// Cleanup listener when component is unmounted
onUnmounted(() => {
  window.api.removeAllListeners(IPC.UPDATER.STATUS)
})

onMounted(() => {
  // Get the current version first
  getCurrentVersion().then(() => {
    // Set up status listener
    setupUpdateStatusListener()

    // Check for updates when component mounts
    checkForUpdates()
  })
})
</script>

<template>
  <div class="flex flex-col items-start">
    <div class="flex flex-row items-center justify-center gap-2">
      {{ currentVersion }}
      <div class="flex items-center gap-2">
        <!-- Update status indicator -->
        <span v-if="updateStatus === 'checking'" class="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded-full dark:bg-gray-700 dark:text-gray-300">
          Checking for updates...
        </span>

        <span v-else-if="updateStatus === 'up-to-date'" class="px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-full dark:bg-green-900/60 dark:text-green-400">
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
          <span class="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full dark:bg-blue-900/60 dark:text-blue-400">
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
        </div>
      </div>
    </div>

    <!-- Update info details -->
    <div v-if="lastCheckTime" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
      Last checked: {{ lastCheckTime }}
    </div>

    <!-- Display checksum error details if present -->
    <div v-if="error" class="mt-1 text-xs text-red-500">
      {{ error }}
    </div>
  </div>
</template>
