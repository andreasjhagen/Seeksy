<script setup>
import { useI18n } from 'vue-i18n'
import { IPC } from '../../../../main/ipc/ipcChannels'

const { t } = useI18n()

async function openSettings() {
  await window.api.invoke(IPC.WINDOW.SHOW_SETTINGS_PAGE)
}
</script>

<template>
  <div class="p-6 space-y-4 bg-gray-200 shadow-md rounded-2xl dark:bg-gray-800 focus:outline-hidden">
    <div class="flex flex-col items-center justify-center p-8 text-center text-gray-500">
      <p class="mb-4">
        {{ t('search.noWatchedFolders.description') }}
      </p>
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium text-accentForeground bg-accent-600 rounded-lg cursor-pointer hover:bg-accent-700"
        @click="openSettings"
      >
        {{ t('search.noWatchedFolders.openSettings') }}
      </button>
    </div>
  </div>
</template>
