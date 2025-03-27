<script setup>
import { IPC_CHANNELS } from '../../../../main/ipc/ipcChannels'

async function openSettings() {
  await window.api.invoke(IPC_CHANNELS.SHOW_SETTINGS_PAGE)
}
</script>

<template>
  <div class="p-6 space-y-4 bg-gray-200 shadow-md rounded-2xl dark:bg-gray-800 focus:outline-hidden">
    <div class="flex flex-col items-center justify-center p-8 text-center text-gray-500">
      <p class="mb-4">
        No folders are being watched yet. Add some folders to start searching!
      </p>
      <button
        class="px-4 py-2 text-sm text-white bg-blue-500 rounded-sm cursor-pointer hover:bg-blue-600"
        @click="openSettings"
      >
        Open Settings
      </button>
    </div>
  </div>
</template>
