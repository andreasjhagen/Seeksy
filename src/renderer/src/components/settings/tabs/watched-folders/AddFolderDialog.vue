<script setup>
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'
import { ref, watch } from 'vue'
import { IPC } from '../../../../../../main/ipc/ipcChannels'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  selectedPaths: {
    type: Array,
    required: false,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'confirm', 'error'])

const depth = ref('3')
const error = ref('')
const loading = ref(false)
const fileCount = ref(0)
const showFileCountWarning = ref(false)
const countComplete = ref(false)
const FILE_COUNT_THRESHOLD = 20000

// Reset file count when depth changes
watch(() => depth.value, () => {
  countComplete.value = false
  showFileCountWarning.value = false
})

function onClose() {
  error.value = ''
  showFileCountWarning.value = false
  countComplete.value = false
  emit('close')
}

function onConfirm() {
  error.value = ''
  emit('confirm', {
    paths: props.selectedPaths,
    depth: depth.value === '-1' ? Infinity : Number.parseInt(depth.value),
  })
}

async function checkFileCount() {
  if (props.selectedPaths.length === 0)
    return

  error.value = ''
  loading.value = true
  countComplete.value = false
  fileCount.value = 0

  try {
    const depthValue = depth.value === '-1' ? Infinity : Number.parseInt(depth.value)
    let totalFiles = 0

    // Count files for each selected path
    for (const path of props.selectedPaths) {
      const result = await window.api.invoke(IPC.FRONTEND.COUNT_FOLDER_FILES, {
        path,
        depth: depthValue,
      })

      if (result.error) {
        throw new Error(`Error with ${path}: ${result.error}`)
      }

      totalFiles += result.fileCount
    }

    fileCount.value = totalFiles
    showFileCountWarning.value = fileCount.value > FILE_COUNT_THRESHOLD
    countComplete.value = true
  }
  catch (err) {
    error.value = `Error checking folder size: ${err.message}`
    emit('error', error.value)
  }
  finally {
    loading.value = false
  }
}

function setError(message) {
  error.value = message
}

// Expose setError method to parent
defineExpose({ setError })
</script>

<template>
  <Dialog as="div" class="relative z-10" :open="isOpen" @close="onClose">
    <div class="fixed inset-0 bg-black/80" />

    <div class="fixed inset-0 z-10 overflow-y-auto">
      <div class="flex items-center justify-center min-h-full p-4">
        <DialogPanel
          class="w-full max-w-md p-6 rounded-lg bg-slate-100 dark:bg-gray-800 dark:text-gray-100"
        >
          <DialogTitle class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Add {{ selectedPaths.length > 1 ? 'Directories' : 'Directory' }}
          </DialogTitle>

          <!-- Error Message -->
          <div
            v-if="error"
            class="p-3 mb-4 text-sm text-red-600 bg-red-100 rounded-lg dark:bg-red-900/50 dark:text-red-400"
          >
            {{ error }}
          </div>

          <!-- Loading Indicator -->
          <div
            v-if="loading"
            class="p-3 mb-4 text-sm text-blue-600 bg-blue-100 rounded-lg dark:bg-blue-900/50 dark:text-blue-400"
          >
            <p class="font-medium">
              Checking folder contents...
            </p>
            <p>Please wait while we analyze the folder size.</p>
          </div>

          <!-- File Count Warning -->
          <div
            v-else-if="showFileCountWarning"
            class="p-3 mb-4 text-sm rounded-lg text-amber-600 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400"
          >
            <p class="font-medium">
              Warning: Large Folder Selection Detected
            </p>
            <p>Selected folders contain {{ fileCount.toLocaleString() }} files, which exceeds the recommended limit of {{ FILE_COUNT_THRESHOLD.toLocaleString() }} files.</p>
            <p class="mt-1">
              Indexing a large number of files may degrade application performance.
            </p>
          </div>

          <!-- Regular File Count Info -->
          <div
            v-else-if="countComplete"
            class="p-3 mb-4 text-sm text-blue-600 rounded-lg bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300"
          >
            <p>
              <span class="font-medium">File count: </span>
              {{ fileCount.toLocaleString() }} file{{ fileCount !== 1 ? 's' : '' }}
            </p>
          </div>

          <div class="mb-4">
            <label class="block mb-2 text-sm text-gray-700 dark:text-gray-300">
              Selected {{ selectedPaths.length > 1 ? 'Paths' : 'Path' }}:
            </label>
            <div class="overflow-y-auto max-h-40">
              <div
                v-for="(path, index) in selectedPaths"
                :key="index"
                class="p-2 mb-1 text-sm bg-gray-200 rounded-lg dark:bg-gray-600"
              >
                {{ path }}
              </div>
            </div>
          </div>
          <div class="mb-4">
            <label class="block mb-2 text-sm text-gray-700 dark:text-gray-300">Recursive Depth:</label>
            <select
              v-model="depth"
              class="w-full p-2 border rounded-sm dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
              :disabled="loading"
            >
              <option value="0">
                Current directory only
              </option>
              <option value="1">
                One level deep
              </option>
              <option value="2">
                Two levels deep
              </option>
              <option value="3">
                Three levels deep
              </option>
              <option value="-1">
                Unlimited depth (all subfolders)
              </option>
            </select>
          </div>
          <div class="mb-4">
            <button
              class="w-full px-4 py-2 text-white bg-blue-500 rounded-sm cursor-pointer disabled:opacity-50 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
              :disabled="loading || props.selectedPaths.length === 0"
              @click="checkFileCount"
            >
              {{ loading ? 'Checking...' : 'Check File Count' }}
            </button>
          </div>
          <div class="flex justify-end space-x-2">
            <button
              class="px-4 py-2 text-gray-600 border rounded-sm cursor-pointer dark:text-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="onClose"
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 text-white rounded-sm cursor-pointer bg-accent-500 disabled:opacity-50 hover:bg-accent dark:bg-accent dark:hover:bg-accent-700"
              :disabled="loading"
              @click="onConfirm"
            >
              Add {{ selectedPaths.length > 1 ? 'All Directories' : 'Directory' }}
            </button>
          </div>
        </DialogPanel>
      </div>
    </div>
  </Dialog>
</template>
