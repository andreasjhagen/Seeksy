<script setup>
import { IPC_CHANNELS } from '../../../../main/ipc/ipcChannels'

async function showAppDataFolder() {
  await window.api.invoke(IPC_CHANNELS.SHOW_APP_DATA_EXPLORER)
}
</script>

<template>
  <span
    class="text-sm cursor-pointer text-accent-600 hover:text-accent-700 dark:text-accent-300 dark:hover:text-accent-200"
    @click="showAppDataFolder"
  >
    Show App Data Folder
  </span>
</template>
