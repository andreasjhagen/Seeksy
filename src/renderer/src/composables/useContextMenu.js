import { computed, inject, provide, ref } from 'vue'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'
import { useSearchResultsStore } from '../stores/search-results-store'
import { useSelectionStore } from '../stores/selection-store'

// Unique symbol for providing/injecting the context menu service
const contextMenuKey = Symbol('contextMenu')

/**
 * Composable for providing a global context menu service
 * Creates a unified, application-wide context menu that can be controlled from anywhere
 */
export function provideContextMenuService() {
  // State for tracking the currently selected item and context menu visibility
  const selectedItem = ref(null)
  const showContextMenu = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const menuItems = ref([])
  const selectionStore = useSelectionStore()
  const searchResultsStore = useSearchResultsStore()

  // Allow for custom callbacks when actions complete
  const onActionComplete = ref(null)

  // Computed properties for accessing selected item details
  const getSelectedItem = computed(() => selectedItem.value)
  const getSelectedItemType = computed(() => (selectedItem.value ? selectedItem.value.type : null))
  const isFavorite = computed(() => (selectedItem.value ? selectedItem.value.isFavorite : false))
  const hasNotes = computed(() => (selectedItem.value ? !!selectedItem.value.notes : false))

  /**
   * Updates the currently selected item
   * @param {object} item - The item to be selected
   */
  function setSelectedItem(item) {
    selectedItem.value = item
  }

  /**
   * Set a callback to be executed when an action completes
   * @param {Function} callback - The callback function
   */
  function setActionCompleteCallback(callback) {
    onActionComplete.value = callback
  }

  /**
   * Get the current action complete callback
   * @returns {Function} The current callback function
   */
  function getActionCompleteCallback() {
    return onActionComplete.value
  }

  /**
   * Builds the menu items directly from the search-results-store
   */
  function buildMenu() {
    if (!selectedItem.value) {
      menuItems.value = []
      return
    }

    const allItems = []
    const itemType = getSelectedItemType.value

    // Find the corresponding result type in the store
    const resultType = searchResultsStore.resultGroups.find((r) => {
      if (itemType === 'app')
        return r.name === 'application'
      if (itemType === 'emoji')
        return r.name === 'emoji'
      if (itemType === 'file' || itemType === 'folder')
        return r.name === 'disk'
      return r.name === itemType
    })

    if (resultType && resultType.contextMenuActions) {
      // Sort actions by order first
      const sortedActions = [...resultType.contextMenuActions].sort((a, b) => {
        // Default to high order value if not specified
        const orderA = a.order !== undefined ? a.order : 999
        const orderB = b.order !== undefined ? b.order : 999
        return orderA - orderB
      })

      // Group items by their group property for better organization
      const groupedItems = {}

      sortedActions.forEach((action) => {
        if (!groupedItems[action.group]) {
          groupedItems[action.group] = []
        }

        // Transform store action definition to menu item format
        groupedItems[action.group].push({
          id: action.name.toLowerCase().replace(/\s+/g, '-'),
          label: action.name,
          icon: getIconForAction(action.name),
          order: action.order || 999, // Store the order for sorting within groups
          keepMenuOpen: !!action.keepMenuOpen, // Pass the keepMenuOpen flag to the menu item
          action: () => {
            const promise = action.actionCall(selectedItem.value)
            // Check if we should keep the menu open
            const shouldKeepOpen = !!action.keepMenuOpen

            if (promise && promise.then) {
              promise
                .then((result) => {
                  if (result && result.success && onActionComplete.value) {
                    onActionComplete.value(selectedItem.value)
                  }
                })
                .catch((err) => {
                  console.error('Error executing menu action:', err)
                })
                .finally(() => {
                  // Only close the menu if we're not supposed to keep it open
                  if (!shouldKeepOpen) {
                    closeMenu()
                  }
                })
            }
            else {
              // For synchronous actions
              if (onActionComplete.value) {
                onActionComplete.value(selectedItem.value)
              }
              // Only close the menu if we're not supposed to keep it open
              if (!shouldKeepOpen) {
                closeMenu()
              }
            }
          },
        })
      })

      // Sort each group by order
      Object.keys(groupedItems).forEach((group) => {
        groupedItems[group].sort((a, b) => a.order - b.order)
      })

      // Add items group by group with separators between groups
      // Order groups based on the minimum order value in each group
      const groups = Object.keys(groupedItems).sort((a, b) => {
        const minOrderA = Math.min(...groupedItems[a].map(item => item.order))
        const minOrderB = Math.min(...groupedItems[b].map(item => item.order))
        return minOrderA - minOrderB
      })

      groups.forEach((group, index) => {
        // Add separator between groups (but not before the first group)
        if (index > 0) {
          allItems.push({ id: `sep-${group}`, isSeparator: true })
        }

        // Add all items from this group
        allItems.push(...groupedItems[group])
      })
    }

    menuItems.value = allItems
  }

  /**
   * Helper function to get appropriate icon for a menu action
   */
  function getIconForAction(actionName) {
    const iconMap = {
      'Open': 'open_in_new',
      'Launch': 'open_in_new',
      'Show in Folder': 'folder',
      'Show in Directory': 'folder',
      'Copy': 'content_copy',
      'Copy Path': 'content_copy',
      'Edit Note': 'edit_note',
      'Toggle Favorite': 'star',
      'Add to Favorites': 'star',
      'Remove from Favorites': 'star_border',
    }

    return iconMap[actionName] || null
  }

  /**
   * Adds the currently selected item to favorites
   * @returns {Promise<object>} Response indicating success/failure
   */
  async function addToFavorites() {
    try {
      const response = await window.api.invoke(
        IPC_CHANNELS.FAVORITES_ADD,
        selectedItem.value.path,
        selectedItem.value.type,
      )

      if (response.success) {
        // Update the item in place to show immediate feedback
        if (selectedItem.value) {
          selectedItem.value.isFavorite = true
        }
        searchResultsStore.refreshSearch()
        onActionComplete.value && onActionComplete.value(selectedItem.value)
      }

      return response
    }
    catch (error) {
      console.error('Failed to add to favorites:', error)
      return { success: false }
    }
  }

  /**
   * Removes the currently selected item from favorites
   * @returns {Promise<object>} Response indicating success/failure
   */
  async function removeFavorites() {
    try {
      const response = await window.api.invoke(
        IPC_CHANNELS.FAVORITES_REMOVE,
        selectedItem.value.path,
      )

      if (response.success) {
        // Update the item in place to show immediate feedback
        if (selectedItem.value) {
          selectedItem.value.isFavorite = false
        }
        searchResultsStore.refreshSearch()
        onActionComplete.value && onActionComplete.value(selectedItem.value)
      }

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
   * @returns {Promise<object>} Response indicating success/failure
   */
  async function addNote(noteContent) {
    try {
      const response = await window.api.invoke(
        IPC_CHANNELS.NOTES_SET,
        selectedItem.value.path,
        noteContent,
      )

      if (response.success) {
        // Update the item in place to show immediate feedback
        if (selectedItem.value) {
          selectedItem.value.notes = noteContent
        }
        searchResultsStore.refreshSearch()
        onActionComplete.value && onActionComplete.value(selectedItem.value, noteContent)
      }

      return response
    }
    catch (error) {
      console.error('Failed to save notes:', error)
      return { success: false }
    }
  }

  /**
   * Retrieves the note associated with the currently selected item
   * @returns {Promise<object>} Response containing the note content
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
   * Shows the context menu at the specified position with the given item
   * @param {object} position - The position {x, y} where menu should appear
   * @param {object} item - The item being acted upon
   */
  function showMenu(position, item) {
    // Update selection store with the selected item
    const resultType = item.type === 'app'
      ? 'application'
      : item.type === 'emoji' ? 'emoji' : 'disk'
    selectionStore.setSelectedItem(item, resultType)

    // Update local state
    selectedItem.value = item
    contextMenuPosition.value = position

    // Build menu items based on the selected item
    buildMenu()

    // Show the menu
    showContextMenu.value = true
  }

  /**
   * Handles the right-click context menu event
   * @param {Event} event - The context menu event
   * @param {object} item - The item being right-clicked
   */
  function handleContextMenu(event, item) {
    event.preventDefault()

    showMenu(
      {
        x: event.clientX,
        y: event.clientY,
      },
      item,
    )
  }

  /**
   * Closes the context menu
   */
  function closeMenu() {
    showContextMenu.value = false
  }

  // Create the context menu service object
  const contextMenuService = {
    // State
    selectedItem,
    showContextMenu,
    contextMenuPosition,
    menuItems,

    // Computed
    getSelectedItem,
    getSelectedItemType,
    isFavorite,
    hasNotes,

    // Methods
    setSelectedItem,
    setActionCompleteCallback,
    getActionCompleteCallback,
    buildMenu,
    showMenu,
    closeMenu,
    handleContextMenu,

    // Actions
    addToFavorites,
    removeFavorites,
    addNote,
    getNote,
  }

  // Provide the context menu service to descendants
  provide(contextMenuKey, contextMenuService)

  return contextMenuService
}

/**
 * Composable for using the context menu service from any component
 * @returns {object} The context menu service
 */
export function useContextMenu() {
  const contextMenuService = inject(contextMenuKey, null)

  if (!contextMenuService) {
    console.warn('No context menu service provided. Make sure to call provideContextMenuService() in a parent component.')

    // Return a minimal implementation to prevent errors
    return {
      selectedItem: ref(null),
      showContextMenu: ref(false),
      contextMenuPosition: ref({ x: 0, y: 0 }),
      menuItems: ref([]),
      getSelectedItem: computed(() => null),
      getSelectedItemType: computed(() => null),
      isFavorite: computed(() => false),
      hasNotes: computed(() => false),
      setSelectedItem: () => {},
      setActionCompleteCallback: () => {},
      getActionCompleteCallback: () => null,
      buildMenu: () => {},
      showMenu: () => {},
      closeMenu: () => {},
      handleContextMenu: () => {},
      addToFavorites: async () => ({ success: false }),
      removeFavorites: async () => ({ success: false }),
      addNote: async () => ({ success: false }),
      getNote: async () => ({ success: false, notes: '' }),
    }
  }

  return contextMenuService
}
