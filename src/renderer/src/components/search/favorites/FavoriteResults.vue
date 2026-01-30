<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IPC_CHANNELS } from '../../../../../main/ipc/ipcChannels'
import { useContextMenu } from '../../../composables/useContextMenu'
import { useSearchActions } from '../../../composables/useSearchActions'
import ResultSection from '../ResultSection.vue'
import UnifiedFavoriteItem from './UnifiedFavoriteItem.vue'

const { t } = useI18n()
const favorites = ref([])
const contextMenu = useContextMenu()
const { handleOpenFile, handleShowInDirectory, handleCopyEmoji } = useSearchActions()
let originalCallback = null

async function loadFavorites() {
  const result = await window.api.invoke(IPC_CHANNELS.FAVORITES_GET_ALL)
  if (result.success) {
    favorites.value = result.favorites
  }
}

function handleItemEdited() {
  loadFavorites()
}

function handleContextMenuEvent(event, item) {
  contextMenu.handleContextMenu(event, item)
}

function handleItemAction(actionType, data) {
  switch (actionType) {
    case 'copy':
      handleCopyEmoji(data)
      break
    case 'open-file':
      handleOpenFile(data)
      break
    case 'show-in-directory':
      handleShowInDirectory(data)
      break
  }
}

onMounted(() => {
  loadFavorites()

  // Store any existing callback
  if (contextMenu.getActionCompleteCallback) {
    originalCallback = contextMenu.getActionCompleteCallback()
  }

  // Set our callback to reload favorites and then call original if it exists
  contextMenu.setActionCompleteCallback((item) => {
    loadFavorites()
    // Call the original callback if it exists
    if (typeof originalCallback === 'function') {
      originalCallback(item)
    }
  })
})

// Restore original callback on unmount if it exists
onBeforeUnmount(() => {
  if (typeof originalCallback === 'function') {
    contextMenu.setActionCompleteCallback(originalCallback)
  }
})
</script>

<template>
  <ResultSection
    v-if="favorites?.length > 0"
    result-type="favorites"
    :custom-title="t('search.favorites')"
    custom-grid-cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    class="p-6 space-y-4 bg-gray-200 shadow-md rounded-2xl dark:bg-gray-800 focus:outline-hidden"
  >
    <UnifiedFavoriteItem
      v-for="item in favorites"
      :key="item.path"
      :item="item"
      :is-selected="false"
      @refresh="loadFavorites"
      @contextmenu="handleContextMenuEvent"
      @copy="(char) => handleItemAction('copy', char)"
      @open-file="(item) => handleItemAction('open-file', item)"
      @show-in-directory="(path) => handleItemAction('show-in-directory', path)"
    />
  </ResultSection>
</template>
