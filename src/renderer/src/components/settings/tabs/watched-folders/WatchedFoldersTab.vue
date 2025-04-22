<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { IPC } from '../../../../../../main/ipc/ipcChannels'
import { useWatcherStatus } from '../../../../composables/useWatcherStatus'
import AddFolderDialog from './AddFolderDialog.vue'
import FolderProgressCard from './FolderProgressCard.vue'
import PerformanceSettings from './PerformanceSettings.vue'

const { status, toggleGlobalPause, addWatchPath, removeWatchPath, updateWatcherStatus } = useWatcherStatus()

const showDialog = ref(false)
const selectedPaths = ref([]) // Changed to array for multiple paths
const statusInterval = ref(null)
const addFolderDialog = ref(null)
// Single toggle for all folder details
const showFolderDetails = ref(false)

// Toggle folder details visibility
function toggleFolderDetails() {
  showFolderDetails.value = !showFolderDetails.value
}

const globalProgress = computed(() => {
  const { totalFiles, processedFiles } = status.value
  return totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0
})

async function showAddDirectoryDialog() {
  const paths = await window.api.invoke(IPC.FRONTEND.OPEN_FOLDER_DIALOG, { multiSelection: true })
  if (paths && paths.length > 0) {
    selectedPaths.value = paths
    showDialog.value = true
  }
}

// Utility function to check if a path is contained within another path
function isSubpathOf(childPath, parentPath) {
  // Normalize paths for comparison (handle slashes consistently)
  const normalizedChild = childPath.replace(/[\\/]+/g, '/')
  const normalizedParent = parentPath.replace(/[\\/]+/g, '/')

  // Check if the child path starts with parent path plus a slash
  return normalizedChild !== normalizedParent
    && normalizedChild.startsWith(`${normalizedParent}/`)
}

// Function to validate paths before adding
function validatePath(newPath) {
  // Check for exact duplicates
  const exactMatch = status.value.folders.find(folder => folder.path === newPath)
  if (exactMatch) {
    return {
      valid: false,
      reason: 'duplicate',
      message: `The directory "${newPath}" is already being watched.`,
    }
  }

  // Check if path is a subfolder of an existing watched folder
  const parentFolder = status.value.folders.find(folder =>
    isSubpathOf(newPath, folder.path),
  )
  if (parentFolder) {
    return {
      valid: false,
      reason: 'subfolder',
      message: `The directory "${newPath}" is already included in watched folder "${parentFolder.path}".`,
    }
  }

  // Check if path is a parent folder of any existing watched folders
  const childFolders = status.value.folders.filter(folder =>
    isSubpathOf(folder.path, newPath),
  )
  if (childFolders.length > 0) {
    return {
      valid: true,
      reason: 'parent',
      childFolders,
      message: `This folder contains ${childFolders.length} already watched subfolder(s). Adding this folder will replace those individual folders.`,
    }
  }

  // Path is valid
  return { valid: true, reason: 'valid' }
}

async function handleConfirm({ paths, depth }) {
  if (paths && paths.length > 0) {
    try {
      showDialog.value = false
      let hasErrors = false
      const warnings = []

      for (const path of paths) {
        // Validate path first
        const validation = validatePath(path)

        if (!validation.valid && validation.reason === 'duplicate') {
          // Skip with a warning for duplicates
          warnings.push(validation.message)
          continue
        }

        if (!validation.valid && validation.reason === 'subfolder') {
          // Skip with a warning for subfolders
          warnings.push(validation.message)
          continue
        }

        if (validation.valid && validation.reason === 'parent') {
          // If parent folder, ask user if they want to replace child folders
          const childPaths = validation.childFolders.map(f => f.path).join('\n- ')
          const confirmReplace = window.confirm(
            `The directory "${path}" contains these already watched folders:\n- ${childPaths}\n\nAdding this parent folder will replace the individual subfolders. Continue?`,
          )

          if (confirmReplace) {
            // Remove child folders first
            for (const childFolder of validation.childFolders) {
              await removeWatchPath(childFolder.path)
            }
          }
          else {
            // User cancelled, skip this path
            continue
          }
        }

        // Add the path
        const result = await addWatchPath(path, { depth })
        if (!result.success) {
          hasErrors = true
          warnings.push(`Failed to add directory: ${path}`)
        }
      }

      if (warnings.length > 0) {
        addFolderDialog.value?.setError(warnings.join('\n'))
        hasErrors = true
      }

      if (!hasErrors) {
        // Auto-expand folder details when new folders are successfully added
        showFolderDetails.value = true
      }

      selectedPaths.value = []
    }
    catch (error) {
      addFolderDialog.value?.setError(error.message || 'Failed to add directories')
    }
  }
}

async function removeDirectory(path) {
  if (confirm(`Remove "${path}" from watched directories?`)) {
    await removeWatchPath(path)
  }
}

onMounted(() => {
  updateWatcherStatus()
  statusInterval.value = setInterval(updateWatcherStatus, 250)
})

// Progress bar update
watch(globalProgress, async (newProgress) => {
  // Show progress only if there are files being processed
  if (status.value.totalFiles > 0) {
    const progressValue = newProgress / 100 // Convert percentage to decimal

    // Clear progress bar if indexing is complete
    if (progressValue >= 1 && status.value.processedFiles >= status.value.totalFiles) {
      await window.api.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, { mode: 'none' })
    }
    else {
      await window.api.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, {
        progress: progressValue,
        mode: status.value.isPaused ? 'error' : 'normal',
      })
    }
  }
  else {
    // Hide progress bar when no files are being processed
    await window.api.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, { mode: 'none' })
  }
})

// Cleanup progress bar on unmount
onBeforeUnmount(() => {
  clearInterval(statusInterval.value)
  window.api.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, { mode: 'none' })
})
</script>

<template>
  <div class="p-6 bg-white shadow-xs rounded-xl dark:bg-gray-800">
    <h2 class="pb-2 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700">
      Watched Directories
    </h2>

    <div class="flex items-center justify-between py-2 ">
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Manage directories for file indexing
      </p>
      <button
        class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-accent hover:bg-accent-700"
        @click="showAddDirectoryDialog"
      >
        Add Directory
      </button>
    </div>

    <!-- Folder Cards -->
    <!-- Global Status -->
    <div v-if="status.totalFiles > 0" class="pt-4">
      <div class="p-4 border border-gray-200 rounded-lg dark:border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
              Total Indexing Progress
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ status.processedFiles }}/{{ status.totalFiles }} files processed
            </p>
          </div>
          <button
            class="p-1 px-2 text-sm font-medium rounded-md shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
            :class="status.isPaused
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
              : 'bg-amber-600 text-white hover:bg-amber-500 shadow-amber-500/20'" @click="toggleGlobalPause"
          >
            <!-- Material Design Icons -->
            <span class="text-base material-symbols-rounded">
              {{ status.isPaused ? 'play_arrow' : 'pause' }}
            </span>
            <span>{{ status.isPaused ? 'Resume' : 'Pause' }}</span>
          </button>
        </div>

        <div class="relative h-2.5 overflow-hidden bg-gray-100 rounded-full dark:bg-gray-700">
          <div
            class="absolute h-full transition-all duration-300 rounded-full"
            :class="[status.isPaused ? 'bg-gray-400' : 'bg-accent']" :style="{ width: `${globalProgress}%` }"
          />
        </div>

        <!-- Folder summary section with toggle -->
        <div v-if="status.folders.length > 0">
          <!-- Folders summary header with chevron -->
          <div
            class="flex items-center justify-between mt-3 cursor-pointer dark:border-gray-700"
            @click="toggleFolderDetails"
          >
            <div class="flex items-center space-x-2">
              <svg
                class="w-5 h-5 transition-transform duration-200"
                :class="{ 'transform rotate-180': showFolderDetails }" xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="font-medium text-gray-900 dark:text-gray-100">Indexed Folders ({{ status.folders.length
              }})</span>
            </div>
          </div>

          <!-- Expandable folder details -->
          <div
            v-if="showFolderDetails"
            class="mt-2 space-y-3 transition-all duration-300 ease-in-out divide-y divide-gray-200 dark:divide-gray-700"
          >
            <div v-for="folder in status.folders" :key="folder.path">
              <FolderProgressCard :folder="folder" @remove="removeDirectory" />
            </div>
          </div>
        </div>

        <div v-else class="pt-4 text-sm text-gray-500 dark:text-gray-400">
          No folders are currently being watched. Add a directory to begin indexing.
        </div>
      </div>
    </div>

    <AddFolderDialog
      ref="addFolderDialog"
      :is-open="showDialog"
      :selected-paths="selectedPaths"
      @close="showDialog = false"
      @confirm="handleConfirm"
    />
  </div>

  <div v-if="status.folders.length > 0" class="p-6 mt-6 bg-white shadow-xs rounded-xl dark:bg-gray-800">
    <PerformanceSettings />
  </div>
</template>
