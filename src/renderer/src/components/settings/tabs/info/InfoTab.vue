<script setup>
import { onMounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../../../../main/ipc/ipcChannels'
import ConfirmationModal from '../../../common/ConfirmationModal.vue'
import ShowAppDataFolderButton from '../../ShowAppDataFolderButton.vue'
import UpdateSection from './UpdateSection.vue'

const systemInfo = ref({
  platform: '',
  arch: '',
})

// Modal state
const showResetModal = ref(false)
const showClearCacheModal = ref(false)

// Thumbnail cache stats
const cacheStats = ref(null)

function openExternalLink(url) {
  window.open(url)
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0)
    return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}

// Reset application handlers
function openResetModal() {
  showResetModal.value = true
}

function closeResetModal() {
  showResetModal.value = false
}

async function confirmResetApplication() {
  try {
    const result = await window.api.invoke(IPC_CHANNELS.RESET_APPLICATION)
    if (result.success) {
      localStorage.clear()
      await window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
      window.location.reload()
    }
  }
  catch (error) {
    console.error('Failed to reset application:', error)
  }
  finally {
    showResetModal.value = false
  }
}

// Clear thumbnail cache handlers
async function openClearCacheModal() {
  // Fetch cache stats before showing modal
  try {
    const result = await window.api.invoke(IPC_CHANNELS.GET_THUMBNAIL_CACHE_STATS)
    if (result.success) {
      cacheStats.value = result.stats
    }
  }
  catch (error) {
    console.error('Failed to get cache stats:', error)
  }
  showClearCacheModal.value = true
}

function closeClearCacheModal() {
  showClearCacheModal.value = false
}

async function confirmClearCache() {
  try {
    const result = await window.api.invoke(IPC_CHANNELS.CLEAR_THUMBNAIL_CACHE)
    if (result.success) {
      cacheStats.value = null
    }
  }
  catch (error) {
    console.error('Failed to clear thumbnail cache:', error)
  }
  finally {
    showClearCacheModal.value = false
  }
}

onMounted(async () => {
  // Get system info
  const info = await window.api.invoke(IPC_CHANNELS.GET_SYSTEM_INFO)
  systemInfo.value = info

  // Get initial cache stats
  try {
    const result = await window.api.invoke(IPC_CHANNELS.GET_THUMBNAIL_CACHE_STATS)
    if (result.success) {
      cacheStats.value = result.stats
    }
  }
  catch (error) {
    console.error('Failed to get cache stats:', error)
  }
})
</script>

<template>
  <div class="p-6 bg-white shadow-xs rounded-xl dark:bg-gray-800">
    <!-- App Info -->
    <div class="space-y-6">
      <div class="space-y-2">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          About Seeksy
        </h3>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div class="text-gray-500 dark:text-gray-400">
            Version
          </div>
          <div class="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            {{ systemInfo.version }}
          </div>

          <div class="text-gray-500 dark:text-gray-400">
            Author
          </div>
          <div class="text-gray-900 dark:text-gray-100">
            Andreas Hagen
          </div>

          <div class="text-gray-500 dark:text-gray-400">
            License
          </div>
          <div class="text-gray-900 dark:text-gray-100">
            GPL-3.0
          </div>
        </div>
      </div>

      <!-- Update Section -->
      <div class="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
        <UpdateSection :current-version="systemInfo.version" />
      </div>

      <div class="pt-4 mt-6 border-t border-gray-200 dark:border-gray-700">
        <div class="flex flex-col items-start gap-2">
          <button
            class="text-sm cursor-pointer text-accent-600 hover:text-accent-700 dark:text-accent-300 dark:hover:text-accent-200"
            @click="openExternalLink('https://github.com/andreasjhagen/seeksy')"
          >
            GitHub Repository
          </button>
          <ShowAppDataFolderButton />
        </div>
      </div>

      <!-- Maintenance Section -->
      <div class="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Maintenance
          </h3>
          <div class="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100">
                Clear Thumbnail Cache
              </h4>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                <template v-if="cacheStats">
                  {{ cacheStats.fileCount }} cached thumbnails ({{ formatFileSize(cacheStats.totalSize) }})
                </template>
                <template v-else>
                  Remove all cached image and video thumbnails to free up disk space.
                </template>
              </p>
            </div>
            <button
              class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-accent-600 hover:bg-accent-700"
              @click="openClearCacheModal"
            >
              Clear Cache
            </button>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-red-600 dark:text-red-400">
            Danger Zone
          </h3>
          <div class="flex items-center justify-between p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
            <div>
              <h4 class="font-medium text-red-600 dark:text-red-400">
                Reset Application
              </h4>
              <p class="text-sm text-red-500 dark:text-red-300">
                This will clear all settings and indexed data. This action cannot be undone.
              </p>
            </div>
            <button
              class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg cursor-pointer hover:bg-red-700"
              @click="openResetModal"
            >
              Reset App
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Reset Application Modal -->
    <ConfirmationModal
      :is-open="showResetModal"
      title="Reset Application"
      message="Are you sure you want to reset the application? This will clear all settings, indexed data, and favorites. This action cannot be undone."
      confirm-text="Reset Application"
      variant="danger"
      icon="restart_alt"
      @confirm="confirmResetApplication"
      @cancel="closeResetModal"
    />

    <!-- Clear Thumbnail Cache Modal -->
    <ConfirmationModal
      :is-open="showClearCacheModal"
      title="Clear Thumbnail Cache"
      :message="`This will remove ${cacheStats?.fileCount || 'all'} cached thumbnails${cacheStats ? ` (${formatFileSize(cacheStats.totalSize)})` : ''}. Thumbnails will be regenerated as needed.`"
      confirm-text="Clear Cache"
      variant="warning"
      icon="delete_sweep"
      @confirm="confirmClearCache"
      @cancel="closeClearCacheModal"
    />
  </div>
</template>
