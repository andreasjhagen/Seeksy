<script setup>
import { onMounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../../main/ipc/ipcChannels'
import { useContextMenu } from '../../composables/useContextMenu'
import { useSearchActions } from '../../composables/useSearchActions'
import ContextMenu from './ContextMenu.vue'
import FavoriteItem from './items/FavoriteItem.vue'
import ResultSection from './ResultSection.vue'

const favorites = ref([])

async function loadFavorites() {
  const result = await window.api.invoke(IPC_CHANNELS.FAVORITES_GET_ALL)
  if (result.success) {
    favorites.value = result.favorites
  }
}

const { handleOpenFile, handleShowInDirectory } = useSearchActions()
const { showContextMenu, contextMenuPosition, handleContextMenu, handleContextMenuClose } = useContextMenu()

function reloadFavorites() {
  loadFavorites()
}

onMounted(() => {
  loadFavorites()
})
</script>

<template>
  <ResultSection
    v-if="favorites?.length > 0"
    title="Favorites"
    grid-cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    class="p-6 space-y-4 bg-gray-200 shadow-md rounded-2xl dark:bg-gray-800 focus:outline-hidden"
  >
    <template v-for="item in favorites" :key="item.path">
      <FavoriteItem
        :item="item"
        :is-selected="false"
        @refresh="loadFavorites"
        @contextmenu="(e, item) => handleContextMenu(e, item)"
        @open-file="handleOpenFile"
        @show-in-directory="handleShowInDirectory"
      />
    </template>

    <ContextMenu
      :show="showContextMenu"
      :position="contextMenuPosition"
      @close="handleContextMenuClose"
      @item-edited="reloadFavorites"
      @open-file="handleOpenFile"
      @show-in-directory="handleShowInDirectory"
    />
  </ResultSection>
</template>
