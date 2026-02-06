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
const { handleOpenFile, handleShowInDirectory, handleCopyEmoji, handleLaunch } = useSearchActions()
let originalCallback = null

// Drag and drop state
const draggedIndex = ref(null)
const dragOverIndex = ref(null)

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
    case 'launch-app':
      handleLaunch(data)
      break
  }
}

// Drag and drop handlers
function handleDragStart(event, index) {
  // Stop propagation to prevent ResultSection's drag handling from triggering
  event.stopPropagation()

  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index.toString())

  // Create a properly sized drag image
  const rect = event.target.getBoundingClientRect()
  const dragImage = event.target.cloneNode(true)
  dragImage.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    pointer-events: none;
    opacity: 0.8;
    transform: none;
  `
  document.body.appendChild(dragImage)
  event.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2)

  // Clean up after drag image is captured
  requestAnimationFrame(() => {
    document.body.removeChild(dragImage)
  })
}

function handleDragEnd(event) {
  event.stopPropagation()
  draggedIndex.value = null
  dragOverIndex.value = null
}

function handleDragOver(event, index) {
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
}

function handleDragLeave(event) {
  event.stopPropagation()
  dragOverIndex.value = null
}

async function handleDrop(event, dropIndex) {
  event.preventDefault()
  event.stopPropagation()
  const fromIndex = draggedIndex.value

  if (fromIndex === null || fromIndex === dropIndex)
    return

  // Reorder the array
  const item = favorites.value[fromIndex]
  const newFavorites = [...favorites.value]
  newFavorites.splice(fromIndex, 1)
  newFavorites.splice(dropIndex, 0, item)
  favorites.value = newFavorites

  // Reset drag state
  draggedIndex.value = null
  dragOverIndex.value = null

  // Persist the new order
  await persistOrder()
}

async function persistOrder() {
  const orderedFavorites = favorites.value.map(fav => ({
    path: fav.path,
    type: fav.type,
  }))

  try {
    await window.api.invoke(IPC_CHANNELS.FAVORITES_REORDER, orderedFavorites)
  }
  catch (error) {
    console.error('Failed to persist favorites order:', error)
    // Reload to get the correct order from DB
    loadFavorites()
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
    <div
      v-for="(item, index) in favorites"
      :key="item.path"
      class="relative transition-transform duration-150"
      :class="{
        'scale-95 opacity-50': draggedIndex === index,
        'ring-2 ring-accent-400 ring-offset-2 ring-offset-gray-200 dark:ring-offset-gray-800 rounded-lg': dragOverIndex === index && draggedIndex !== index,
      }"
      draggable="true"
      @dragstart="handleDragStart($event, index)"
      @dragend="handleDragEnd"
      @dragover="handleDragOver($event, index)"
      @dragleave="handleDragLeave"
      @drop="handleDrop($event, index)"
    >
      <UnifiedFavoriteItem
        :item="item"
        :is-selected="false"
        @refresh="loadFavorites"
        @contextmenu="handleContextMenuEvent"
        @copy="(char) => handleItemAction('copy', char)"
        @open-file="(item) => handleItemAction('open-file', item)"
        @show-in-directory="(path) => handleItemAction('show-in-directory', path)"
        @launch-app="(app) => handleItemAction('launch-app', app)"
      />
    </div>
  </ResultSection>
</template>
