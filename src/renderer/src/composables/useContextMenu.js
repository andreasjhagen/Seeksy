import { computed, ref } from 'vue'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'
import { useSelectionStore } from '../stores/selection-store'

/**
 * Composable for handling context menu functionality and related item operations
 * Manages the context menu state, position, and item-specific actions like favorites and notes
 */
export function useContextMenu() {
  // State for tracking the currently selected item and context menu visibility
  const selectedItem = ref(null)
  const showContextMenu = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const selectionStore = useSelectionStore()

  // Computed properties for accessing selected item details
  const getSelectedItem = computed(() => selectedItem.value)
  const getSelectedItemType = computed(() => (selectedItem.value ? selectedItem.value.type : null))
  const isFavorite = computed(() => (selectedItem.value ? selectedItem.value.isFavorite : false))

  /**
   * Updates the currently selected item
   * @param {Object} item - The item to be selected
   */
  function setSelectedItem(item) {
    selectedItem.value = item
  }

  /**
   * Adds the currently selected item to favorites
   * @returns {Promise<Object>} Response indicating success/failure
   */
  async function addToFavorites() {
    try {
      const response = await window.api.invoke(
        IPC_CHANNELS.FAVORITES_ADD,
        selectedItem.value.path,
        selectedItem.value.type,
      )
      return response
    }
    catch (error) {
      console.error('Failed to add to favorites:', error)
      return { success: false }
    }
  }

  /**
   * Removes the currently selected item from favorites
   * @returns {Promise<Object>} Response indicating success/failure
   */
  async function removeFavorites() {
    try {
      const response = await window.api.invoke(
        IPC_CHANNELS.FAVORITES_REMOVE,
        selectedItem.value.path,
      )
      return response
    }
    catch (error) {
      console.error('Failed to remove from favorites:', error)
      return { success: false }
    }
  }

  /**
   * Adds or updates a note for the currently selected item
   * @param {string} noteContent - The content of the note
   * @returns {Promise<Object>} Response indicating success/failure
   */
  async function addNote(noteContent) {
    try {
      const response = await window.api.invoke(
        IPC_CHANNELS.NOTES_SET,
        selectedItem.value.path,
        noteContent,
      )
      return response
    }
    catch (error) {
      console.error('Failed to save notes:', error)
      return { success: false }
    }
  }

  /**
   * Retrieves the note associated with the currently selected item
   * @returns {Promise<Object>} Response containing the note content
   */
  async function getNote() {
    try {
      const response = await window.api.invoke(IPC_CHANNELS.NOTES_GET, selectedItem.value.path)
      return response
    }
    catch (error) {
      console.error('Failed to load notes:', error)
      return { success: false, notes: '' }
    }
  }

  /**
   * Finds images similar to the currently selected image
   * @returns {Promise<Object>} Response containing similar images results
   */
  async function getSimilarImages() {
    try {
      const response = await window.api.invoke(
        IPC_CHANNELS.FIND_SIMILAR_IMAGES,
        selectedItem.value.path,
      )
      return response
    }
    catch (error) {
      console.error('Failed to find similar images:', error)
      return { success: false, results: [] }
    }
  }

  /**
   * Handles the right-click context menu event
   * @param {Event} event - The context menu event
   * @param {Object} item - The item being right-clicked
   */
  function handleContextMenu(event, item) {
    event.preventDefault()
    // Update selection store and position context menu at click coordinates
    selectionStore.setSelectedItem(item, item.type === 'app' ? 'apps' : 'files')
    contextMenuPosition.value = {
      x: event.clientX,
      y: event.clientY,
    }
    showContextMenu.value = true
  }

  /**
   * Closes the context menu
   */
  function handleContextMenuClose() {
    showContextMenu.value = false
  }

  // Expose composable functionality
  return {
    selectedItem,
    getSelectedItem,
    getSelectedItemType,
    isFavorite,
    setSelectedItem,
    addToFavorites,
    removeFavorites,
    addNote,
    getNote,
    getSimilarImages,
    showContextMenu,
    contextMenuPosition,
    handleContextMenu,
    handleContextMenuClose,
  }
}
