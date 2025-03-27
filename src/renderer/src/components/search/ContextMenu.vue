<script setup>
import { onClickOutside } from '@vueuse/core'
import { computed, ref, watchEffect } from 'vue'
import { useContextMenu } from '../../composables/useContextMenu'
import { useSearchResultsStore } from '../../stores/search-results-store'
import { useSelectionStore } from '../../stores/selection-store'
import DialogPopup from '../common/DialogPopup.vue'

const props = defineProps({
  position: {
    type: Object,
    required: true,
    default: () => ({ x: 0, y: 0 }),
  },
  show: {
    type: Boolean,
    required: true,
  },
  customMenuOptions: {
    type: Array,
    default: () => [],
    validator: (options) => {
      return options.every(option =>
        typeof option.id === 'string'
        && typeof option.label === 'string'
        && typeof option.action === 'function',
      )
    },
  },
  useOnlyCustomOptions: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['close', 'update:show', 'itemEdited', 'openFile', 'showInDirectory'])
const contextMenu = useContextMenu()
const selectionStore = useSelectionStore()
const searchResultsStore = useSearchResultsStore()

const showNotesDialog = ref(false)
const noteContent = ref('')
const menuRef = ref(null)

watchEffect(() => {
  if (!props.show)
    return

  if (menuRef.value) {
    const { stop } = onClickOutside(menuRef, () => {
      !showNotesDialog.value && closeMenu()
    })
    return stop // Cleanup handler
  }

  if (selectionStore.selectedItem) {
    contextMenu.setSelectedItem(selectionStore.selectedItem)
  }
})

const menuOptions = computed(() => {
  if (!selectionStore.selectedItem)
    return []

  // Default menu options
  const defaultOptions = !props.useOnlyCustomOptions
    ? [
        { id: 'open', label: 'Open', icon: 'open_in_new', action: () => emit('openFile', selectionStore.selectedItem) },
        { id: 'show-in-explorer', label: 'Show in Explorer', icon: 'folder', action: () => emit('showInDirectory', selectionStore.selectedItem.path) },
        {
          id: 'add-to-favorites',
          label: 'Add to Favorites',
          icon: 'star',
          condition: !contextMenu.isFavorite.value,
          action: async () => {
            const { success } = await contextMenu.addToFavorites()
            success && handleEditSuccess()
          },
        },
        {
          id: 'remove-from-favorites',
          label: 'Remove from Favorites',
          icon: 'star_border',
          condition: contextMenu.isFavorite.value,
          action: async () => {
            const { success } = await contextMenu.removeFavorites()
            success && handleEditSuccess()
          },
        },
        {
          id: 'edit-notes',
          label: 'Edit Notes',
          icon: 'edit_note',
          action: async () => {
            const { success, notes } = await contextMenu.getNote()
            if (success) {
              noteContent.value = notes || ''
              showNotesDialog.value = true
            }
          },
        },
        {
          id: 'copy-path',
          label: 'Copy Path',
          icon: 'content_copy',
          action: () => navigator.clipboard.writeText(selectionStore.selectedItem.path),
        },
      ]
    : []

  return [...defaultOptions, ...props.customMenuOptions]
})

function handleEditSuccess() {
  emit('itemEdited', selectionStore.selectedItem)
  searchResultsStore.refreshSearch()
}

function closeMenu() {
  emit('close')
}

async function handleSelect(option) {
  await option.action()
  if (!showNotesDialog.value)
    closeMenu()
}

async function handleNotesConfirm() {
  const { success } = await contextMenu.addNote(noteContent.value)
  if (success) {
    searchResultsStore.refreshSearch()
    showNotesDialog.value = false
    emit('itemEdited', selectionStore.selectedItem, noteContent.value)
    closeMenu()
  }
}
</script>

<template>
  <Teleport v-if="show" to="body">
    <div
      ref="menuRef"
      class="context-menu fixed z-20 min-w-[200px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      @click.stop
    >
      <button
        v-for="option in menuOptions"
        v-show="option.condition === undefined || option.condition"
        :key="option.id"
        class="flex items-center w-full gap-2 px-4 py-2 text-left text-black dark:text-gray-100 hover:text-white hover:bg-accent-500"
        @click="handleSelect(option)"
      >
        <span class="material-symbols-outlined">{{ option.icon }}</span>
        {{ option.label }}
      </button>
    </div>

    <DialogPopup
      title="Edit Notes"
      :is-open="showNotesDialog"
      @close="showNotesDialog = false"
      @confirm="handleNotesConfirm"
    >
      <textarea
        v-model="noteContent"
        class="w-full h-32 p-2 border rounded-sm dark:bg-gray-700 dark:border-gray-600"
        placeholder="Enter notes here..."
      />
    </DialogPopup>
  </Teleport>
</template>
