import { computed, onMounted, onUnmounted, ref } from 'vue'
import { IPC, IPC_CHANNELS } from '../../../main/ipc/ipcChannels'

export function useWatcherStatus() {
  const status = ref({
    folders: [],
    totalFiles: 0,
    processedFiles: 0,
    isPaused: false,
    status: 'initializing',
    totalWatchers: 0,
  })

  // Status update timer
  let statusUpdateTimer = null

  async function updateWatcherStatus() {
    try {
      const newStatus = await window.api.invoke(IPC_CHANNELS.INDEXER_GET_STATUS)
      if (newStatus) {
        status.value = newStatus
        return true
      }
      return false
    }
    catch (error) {
      console.error('Failed to update watcher status:', error)
      return false
    }
  }

  // Setup a status update listener that the main process can trigger
  function setupStatusListener() {
    window.api.on(IPC.BACKEND.INDEXER_GET_STATUS, async (event) => {
      await updateWatcherStatus()
    })
  }

  // Start periodic status updates when component mounts
  function startStatusUpdates(interval = 1000) {
    stopStatusUpdates()
    statusUpdateTimer = setInterval(updateWatcherStatus, interval)
  }

  // Clear status updates when component unmounts
  function stopStatusUpdates() {
    if (statusUpdateTimer) {
      clearInterval(statusUpdateTimer)
      statusUpdateTimer = null
    }
  }

  async function toggleGlobalPause() {
    const channel = status.value.isPaused
      ? IPC_CHANNELS.INDEXER_RESUME_ALL
      : IPC_CHANNELS.INDEXER_PAUSE_ALL

    try {
      await window.api.invoke(channel)
      // Force immediate status update
      await updateWatcherStatus()

      // Double-check status after a brief delay to ensure changes are applied
      setTimeout(async () => {
        await updateWatcherStatus()
      }, 500)

      return { success: true }
    }
    catch (error) {
      console.error('Error toggling pause state:', error)
      return { success: false, error: error.message }
    }
  }

  async function addWatchPath(path, options = { depth: Infinity }) {
    try {
      await window.api.invoke(IPC_CHANNELS.INDEXER_ADD_PATH, path, options)
      await updateWatcherStatus()
      return { success: true }
    }
    catch (error) {
      return { success: false, error: error.message }
    }
  }

  async function removeWatchPath(path) {
    await window.api.invoke(IPC_CHANNELS.INDEXER_REMOVE_PATH, path)
    await updateWatcherStatus()
  }

  async function toggleFolderPause(folderPath) {
    const currentStatus = await window.api.invoke(IPC_CHANNELS.WATCHER_GET_STATUS, folderPath)

    const result = await window.api.invoke(
      currentStatus.isPaused
        ? IPC_CHANNELS.WATCHER_RESUME
        : IPC_CHANNELS.WATCHER_PAUSE,
      folderPath,
    )

    if (!result.success) {
      throw new Error('Failed to toggle folder pause state')
    }

    // Force status update
    await updateWatcherStatus()

    return result.status
  }

  function formatFileCount(processed, total) {
    return `${(processed || 0).toLocaleString()} / ${(total || 0).toLocaleString()} files`
  }

  function formatDepth(depth) {
    if (depth === null || depth === undefined || depth === Infinity || depth === -1) {
      return '∞'
    }
    return depth.toString()
  }

  function getFolderStatusInfo(folder) {
    const statusMap = {
      scanning: { text: 'Initial Scan', class: 'bg-purple-100 text-purple-800', progress: 'bg-purple-500' },
      indexing: {
        text: folder.pendingTasks > 0 ? `Processing Files (${folder.pendingTasks})` : 'Processing Changes',
        class: 'bg-accent-100 text-accent-800',
        progress: 'bg-accent-500',
      },
      watching: { text: 'Watching', class: 'bg-green-100 text-green-800', progress: 'bg-green-500' },
      ready: { text: 'Watching', class: 'bg-green-100 text-green-800', progress: 'bg-green-500' }, // For backward compatibility
      error: { text: 'Error', class: 'bg-red-100 text-red-800', progress: 'bg-red-500' },
      paused: { text: 'Paused', class: 'bg-orange-100 text-orange-800', progress: 'bg-yellow-500' },
      initializing: { text: 'Initializing', class: 'bg-blue-100 text-blue-800', progress: 'bg-blue-500' },
    }

    // Use folder's state directly from watcher status
    const currentState = folder.isPaused ? 'paused' : folder.state
    const state = statusMap[currentState] || {
      text: 'Waiting',
      class: 'bg-gray-100 text-gray-800',
      progress: 'bg-accent-500',
    }

    return {
      statusText: state.text,
      statusClass: state.class,
      progressBarClass: state.progress,
      actionButtonClass: folder.isPaused ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700',
    }
  }

  const hasWatchedFolders = computed(() => status.value.totalWatchers > 0)

  // Setup lifecycle hooks
  onMounted(() => {
    setupStatusListener()
    updateWatcherStatus() // Initial status update
    startStatusUpdates(2000) // Periodic updates every 2 seconds
  })

  onUnmounted(() => {
    stopStatusUpdates()
  })

  return {
    status,
    hasWatchedFolders,
    updateWatcherStatus,
    toggleGlobalPause,
    addWatchPath,
    removeWatchPath,
    toggleFolderPause,
    formatFileCount,
    formatDepth,
    getFolderStatusInfo,
    startStatusUpdates,
    stopStatusUpdates,
  }
}
