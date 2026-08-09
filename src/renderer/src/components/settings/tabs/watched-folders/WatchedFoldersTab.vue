<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IPC } from '../../../../../../main/ipc/ipcChannels'
import { useWatcherStatus } from '../../../../composables/useWatcherStatus'
import ConfirmationModal from '../../../common/ConfirmationModal.vue'
import AddFolderDialog from './AddFolderDialog.vue'
import FolderProgressCard from './FolderProgressCard.vue'
import PerformanceSettings from './PerformanceSettings.vue'

const { t } = useI18n()
const { status, toggleGlobalPause, addWatchPath, removeWatchPath, updateWatcherStatus, startStatusUpdates } = useWatcherStatus()

const showDialog = ref(false)
const selectedPaths = ref([]) // Changed to array for multiple paths
const addFolderDialog = ref(null)
// Single toggle for all folder details
const showFolderDetails = ref(false)

// Remove folder confirmation modal state
const showRemoveFolderModal = ref(false)
const folderToRemove = ref(null)
const showReplaceFoldersModal = ref(false)
const replaceFoldersMessage = ref('')
let resolveReplaceFolders = null

// Removed folders notification state
const removedFolders = ref([])

// Toggle folder details visibility
function toggleFolderDetails() {
  showFolderDetails.value = !showFolderDetails.value
}

// Fetch removed folders notification
async function fetchRemovedFolders() {
  try {
    const folders = await window.api.invoke(IPC.BACKEND.INDEXER_GET_REMOVED_FOLDERS)
    removedFolders.value = folders || []
  }
  catch (error) {
    console.error('Failed to fetch removed folders:', error)
    removedFolders.value = []
  }
}

// Dismiss removed folders notification
async function dismissRemovedFoldersNotice() {
  try {
    await window.api.invoke(IPC.BACKEND.INDEXER_CLEAR_REMOVED_FOLDERS)
    removedFolders.value = []
  }
  catch (error) {
    console.error('Failed to clear removed folders:', error)
  }
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

function normalizeComparablePath(path) {
  let normalized = path.replace(/[\\/]+/g, '/').replace(/\/$/, '')
  if (navigator.platform.toLowerCase().includes('win')) {
    normalized = normalized.toLowerCase()
  }
  return normalized
}

function relativeDepth(childPath, parentPath) {
  const child = normalizeComparablePath(childPath)
  const parent = normalizeComparablePath(parentPath)
  if (!child.startsWith(`${parent}/`))
    return -1
  return child.slice(parent.length + 1).split('/').filter(Boolean).length
}

// Function to validate paths before adding
function validatePath(newPath, newDepth) {
  // Check for exact duplicates
  const comparablePath = normalizeComparablePath(newPath)
  const exactMatch = status.value.folders.find(folder => normalizeComparablePath(folder.path) === comparablePath)
  if (exactMatch) {
    return {
      valid: false,
      reason: 'duplicate',
      message: t('settings.watchedFolders.folderAlreadyWatched', { path: newPath }),
    }
  }

  // Check if path is a subfolder of an existing watched folder
  const parentFolder = status.value.folders.find((folder) => {
    const depth = relativeDepth(newPath, folder.path)
    return depth > 0 && (folder.depth === Infinity || folder.depth === -1 || depth <= folder.depth)
  })
  if (parentFolder) {
    return {
      valid: false,
      reason: 'subfolder',
      message: t('settings.watchedFolders.folderIsSubfolder', { path: newPath, parent: parentFolder.path }),
    }
  }

  // Check if path is a parent folder of any existing watched folders
  const childFolders = status.value.folders.filter((folder) => {
    const depth = relativeDepth(folder.path, newPath)
    return depth > 0 && (newDepth === Infinity || newDepth === -1 || depth <= newDepth)
  })
  if (childFolders.length > 0) {
    return {
      valid: true,
      reason: 'parent',
      childFolders,
      message: t('settings.watchedFolders.folderContainsWatched', { count: childFolders.length }),
    }
  }

  // Path is valid
  return { valid: true, reason: 'valid' }
}

function confirmFolderReplacement(message) {
  replaceFoldersMessage.value = message
  showReplaceFoldersModal.value = true
  return new Promise((resolve) => {
    resolveReplaceFolders = resolve
  })
}

function finishFolderReplacement(confirmed) {
  showReplaceFoldersModal.value = false
  resolveReplaceFolders?.(confirmed)
  resolveReplaceFolders = null
}

async function restoreRemovedFolders(folders, warnings) {
  for (const folder of folders) {
    const result = await addWatchPath(folder.path, { depth: folder.depth })
    if (!result.success) {
      warnings.push(result.error || t('settings.watchedFolders.failedToAdd', { path: folder.path }))
    }
  }
}

async function handleConfirm({ paths, depth }) {
  if (paths && paths.length > 0) {
    try {
      let hasErrors = false
      const warnings = []

      for (const path of paths) {
        const removedChildFolders = []
        // Validate path first
        const validation = validatePath(path, depth)

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
          const confirmReplace = await confirmFolderReplacement(
            t('settings.watchedFolders.confirmReplaceMessage', { path, folders: `- ${childPaths}` }),
          )

          if (confirmReplace) {
            // Remove child folders first
            try {
              for (const childFolder of validation.childFolders) {
                await removeWatchPath(childFolder.path)
                removedChildFolders.push(childFolder)
              }
            }
            catch (error) {
              hasErrors = true
              warnings.push(error.message || t('settings.watchedFolders.failedToAdd', { path }))
              await restoreRemovedFolders(removedChildFolders, warnings)
              continue
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
          // Show detailed error for overlapping folders
          if (result.error) {
            warnings.push(result.error)
          }
          else {
            warnings.push(t('settings.watchedFolders.failedToAdd', { path }))
          }

          // Replacing children must be transactional from the user's perspective.
          // Restore every successfully removed watch if the parent cannot be added.
          await restoreRemovedFolders(removedChildFolders, warnings)
        }
      }

      if (warnings.length > 0) {
        addFolderDialog.value?.setError(warnings.join('\n'))
        hasErrors = true
      }

      if (!hasErrors) {
        // Auto-expand folder details when new folders are successfully added
        showFolderDetails.value = true
        showDialog.value = false
        selectedPaths.value = []
      }
    }
    catch (error) {
      addFolderDialog.value?.setError(error.message || 'Failed to add directories')
    }
  }
}

async function removeDirectory(path) {
  folderToRemove.value = path
  showRemoveFolderModal.value = true
}

function cancelRemoveDirectory() {
  showRemoveFolderModal.value = false
  folderToRemove.value = null
}

async function confirmRemoveDirectory() {
  if (folderToRemove.value) {
    await removeWatchPath(folderToRemove.value)
  }
  showRemoveFolderModal.value = false
  folderToRemove.value = null
}

onMounted(() => {
  updateWatcherStatus()
  fetchRemovedFolders()
  startStatusUpdates(500)
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
  window.api.invoke(IPC.SYSTEM.SET_PROGRESS_BAR, { mode: 'none' })
})
</script>

<template>
  <div class="p-6 bg-white shadow-xs rounded-xl dark:bg-gray-800">
    <h2 class="pb-2 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700">
      {{ t('settings.watchedFolders.title') }}
    </h2>

    <!-- Removed Folders Notification -->
    <div
      v-if="removedFolders.length > 0"
      class="flex items-start gap-3 p-3 mt-4 border rounded-lg bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50"
    >
      <span class="shrink-0 text-xl text-amber-600 dark:text-amber-400 material-symbols-rounded">warning</span>
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-medium text-amber-800 dark:text-amber-200">
          {{ t('settings.watchedFolders.removedFoldersNotice.title') }}
        </h4>
        <p class="mt-1 text-sm text-amber-700 dark:text-amber-300">
          {{ t('settings.watchedFolders.removedFoldersNotice.message') }}
        </p>
        <ul class="pl-4 mt-2 text-sm list-disc text-amber-600 dark:text-amber-400">
          <li v-for="folder in removedFolders" :key="folder" class="truncate">
            {{ folder }}
          </li>
        </ul>
      </div>
      <button
        class="shrink-0 inline-flex cursor-pointer p-1 transition-colors rounded text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:text-amber-200 dark:hover:bg-amber-800/30"
        :title="t('settings.watchedFolders.removedFoldersNotice.dismiss')"
        @click="dismissRemovedFoldersNotice"
      >
        <span class="text-xl material-symbols-rounded">close</span>
      </button>
    </div>

    <div class="flex items-center justify-between py-2 ">
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {{ t('settings.watchedFolders.description') }}
      </p>
      <button
        class="px-4 py-2 text-sm font-medium text-accentForeground rounded-lg cursor-pointer bg-accent hover:bg-accent-700"
        @click="showAddDirectoryDialog"
      >
        {{ t('settings.watchedFolders.addFolder') }}
      </button>
    </div>

    <!-- Folder Cards -->
    <!-- Global Status -->
    <div v-if="status.totalFiles > 0" class="pt-4">
      <div class="p-4 border border-gray-200 rounded-lg dark:border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ t('settings.watchedFolders.totalProgress') }}
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ t('common.filesProcessed', { processed: status.processedFiles, total: status.totalFiles }) }}
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
            <span>{{ status.isPaused ? t('common.resume') : t('common.pause') }}</span>
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
          <button
            type="button"
            class="flex items-center justify-between w-full mt-3 text-left cursor-pointer rounded dark:border-gray-700"
            :aria-expanded="showFolderDetails"
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
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ t('settings.watchedFolders.indexedFolders') }} ({{ status.folders.length
              }})</span>
            </div>
          </button>

          <!-- Expandable folder details -->
          <div
            v-if="showFolderDetails"
            class="mt-2 transition-all duration-300 ease-in-out divide-y divide-gray-100 dark:divide-gray-700/50"
          >
            <div v-for="folder in status.folders" :key="folder.path">
              <FolderProgressCard :folder="folder" @remove="removeDirectory" />
            </div>
          </div>
        </div>

        <div v-else class="pt-4 text-sm text-gray-500 dark:text-gray-400">
          {{ t('settings.watchedFolders.noFolders') }} {{ t('settings.watchedFolders.noFoldersHint') }}
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

    <!-- Remove Folder Confirmation Modal -->
    <ConfirmationModal
      :is-open="showRemoveFolderModal"
      :title="t('settings.watchedFolders.confirmRemoveTitle')"
      :message="t('settings.watchedFolders.confirmRemoveMessage', { path: folderToRemove })"
      :confirm-text="t('settings.watchedFolders.confirmRemoveButton')"
      variant="danger"
      icon="folder_off"
      @confirm="confirmRemoveDirectory"
      @cancel="cancelRemoveDirectory"
    />

    <ConfirmationModal
      :is-open="showReplaceFoldersModal"
      :title="t('settings.watchedFolders.addFolder')"
      :message="replaceFoldersMessage"
      :confirm-text="t('common.confirm')"
      variant="warning"
      icon="folder_managed"
      @confirm="finishFolderReplacement(true)"
      @cancel="finishFolderReplacement(false)"
    />
  </div>

  <div v-if="status.folders.length > 0" class="p-6 mt-6 bg-white shadow-xs rounded-xl dark:bg-gray-800">
    <PerformanceSettings />
  </div>
</template>
