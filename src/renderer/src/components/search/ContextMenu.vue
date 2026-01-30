<script setup>
import { onClickOutside } from '@vueuse/core'
import { computed, getCurrentInstance, onMounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContextMenu } from '../../composables/useContextMenu'
import DialogPopup from '../common/DialogPopup.vue'

const props = defineProps({
  useOnlyCustomOptions: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['item-edited'])

const { t } = useI18n()

const contextMenu = useContextMenu()
const menuRef = ref(null)

// State management
const selectedItem = ref(null)
const showNotesDialog = ref(false)
const noteContent = ref('')

// Computed properties
const isMenuVisible = computed(() => contextMenu.showContextMenu.value)
const menuPosition = computed(() => contextMenu.contextMenuPosition.value)
const menuItems = computed(() => contextMenu.menuItems.value)

// Setup click outside handler when menu is visible
watchEffect(() => {
  if (!isMenuVisible.value || !menuRef.value)
    return

  const { stop } = onClickOutside(menuRef, () => {
    // Only close menu if notes dialog isn't open
    if (!showNotesDialog.value) {
      contextMenu.closeMenu()
    }
  })

  return stop // Clean up handler when effect re-runs
})

/**
 * Register this component instance with the contextMenuPlugin
 * This allows the plugin to access and control this component
 */
const instance = getCurrentInstance()
if (instance && instance.appContext.app.config.globalProperties.$setContextMenuInstance) {
  instance.appContext.app.config.globalProperties.$setContextMenuInstance({
    get selectedItem() {
      return selectedItem.value
    },
    set selectedItem(value) {
      selectedItem.value = value
      // If we receive a new selected item, get its notes
      if (value?.path) {
        getItemNotes(value)
      }
    },
    get showNotesDialog() {
      return showNotesDialog.value
    },
    set showNotesDialog(value) {
      showNotesDialog.value = value
    },
  })
}

/**
 * Fetch notes for an item
 * @param {object} item - The item to get notes for
 */
async function getItemNotes(item) {
  try {
    selectedItem.value = item
    const response = await contextMenu.getNote()
    noteContent.value = response.success ? (response.notes || '') : ''
  }
  catch (error) {
    console.error('Failed to get notes:', error)
    noteContent.value = ''
  }
}

/**
 * Set up callback for actions that need to notify parent components
 */
onMounted(() => {
  contextMenu.setActionCompleteCallback((item) => {
    emit('item-edited', item)
  })
})

/**
 * Handle confirmation of notes dialog
 */
async function handleNotesConfirm() {
  try {
    const { success } = await contextMenu.addNote(noteContent.value)
    if (success) {
      showNotesDialog.value = false
      contextMenu.closeMenu()
    }
  }
  catch (error) {
    console.error('Failed to save note:', error)
  }
}

/**
 * Handle cancellation of notes dialog
 */
function handleNotesCancel() {
  showNotesDialog.value = false
  contextMenu.closeMenu()
}
</script>

<template>
  <Teleport v-if="isMenuVisible" to="body">
    <!-- Context Menu -->
    <div
      ref="menuRef"
      class="context-menu fixed z-20 min-w-[200px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1"
      :style="{ left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }"
      @click.stop
    >
      <template v-for="(item, index) in menuItems" :key="item.id || index">
        <!-- Separator -->
        <div
          v-if="item.isSeparator"
          class="mx-2 my-1 border-t border-gray-200 dark:border-gray-700"
        />

        <!-- Menu item -->
        <button
          v-else-if="!item.hidden"
          class="flex items-center w-full gap-2 px-4 py-2 text-left text-black dark:text-gray-100 hover:text-white hover:bg-accent-500"
          @click="item.action"
        >
          <span v-if="item.icon" class="material-symbols-outlined">{{ item.icon }}</span>
          {{ item.label.startsWith('contextMenu.') ? t(item.label) : item.label }}
        </button>
      </template>
    </div>

    <!-- Notes Dialog -->
    <DialogPopup
      :title="t('search.notes.title')"
      :is-open="showNotesDialog"
      @close="handleNotesCancel"
      @confirm="handleNotesConfirm"
    >
      <textarea
        v-model="noteContent"
        class="w-full h-32 p-2 border rounded-sm dark:bg-gray-700 dark:border-gray-600"
        :placeholder="t('search.notes.placeholder')"
      />
    </DialogPopup>
  </Teleport>
</template>
