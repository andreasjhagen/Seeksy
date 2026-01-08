<script setup>
import { onMounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../../../../main/ipc/ipcChannels'
import ShowAppDataFolderButton from '../../ShowAppDataFolderButton.vue'
import UpdateSection from './UpdateSection.vue'

const systemInfo = ref({
  platform: '',
  arch: '',
})

function openExternalLink(url) {
  window.open(url)
}

async function resetApplication() {
  if (
    !confirm(
      'Are you sure you want to reset the application? This will clear all settings and indexed data.',
    )
  ) {
    return
  }

  try {
    const result = await window.api.invoke(IPC_CHANNELS.RESET_APPLICATION)
    if (result.success) {
      alert('Application has been reset successfully. The application will now close.')
      localStorage.clear()
      await window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
      window.location.reload()
    }
    else {
      alert(`Failed to reset application: ${result.error || 'Unknown error'}`)
    }
  }
  catch (error) {
    alert(`Failed to reset application: ${error.message}`)
  }
}

onMounted(async () => {
  // Get system info
  const info = await window.api.invoke(IPC_CHANNELS.GET_SYSTEM_INFO)
  systemInfo.value = info
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

      <div class="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
        <div class="space-y-2">
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
              @click="resetApplication"
            >
              Reset App
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
