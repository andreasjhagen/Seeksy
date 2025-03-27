import { nextTick } from 'vue'
import { useSearchResultsStore } from '../stores/search-results-store'
import { useSelectionStore } from '../stores/selection-store'
import { useSettingsStore } from '../stores/settings-store'

export function useKeyboardNavigation() {
  const selectionStore = useSelectionStore()
  const searchStore = useSearchResultsStore()
  const settingsStore = useSettingsStore()

  /**
   * Determines which sections are currently visible based on results and settings
   * @returns {string[]} Array of visible section names
   */
  function getVisibleSections() {
    const results = searchStore.getAllResults
    const sections = []

    // Check each section to see if it has results and is enabled in settings
    if (results.applications.length && isSearchTypeEnabled('apps')) 
      sections.push('apps')
    
    if (results.emojis.length && isSearchTypeEnabled('emoji')) 
      sections.push('emoji')
    
    if (results.disk.length && isSearchTypeEnabled('files')) 
      sections.push('files')

    return sections
  }

  /**
   * Checks if a search type is enabled in settings
   * @param {string} typeName The search type name to check
   * @returns {boolean} Whether the search type is enabled
   */
  function isSearchTypeEnabled(typeName) {
    return (
      settingsStore.settings.includedSearchTypes?.find(type => type.name === typeName)?.enabled
      ?? false
    )
  }

  /**
   * Initializes the selection with the first item of the first visible section
   * @returns {boolean} True if selection was initialized, false otherwise
   */
  function initializeSelection() {
    const sections = getVisibleSections()
    if (!sections.length)
      return false

    const firstSection = sections[0]
    const items = selectionStore.getItemsForSection(firstSection)
    if (!items.length)
      return false

    selectionStore.setSelectedItem(items[0], firstSection)
    return true
  }

  /**
   * Focuses the results container and initializes selection if needed
   * @returns {Promise<boolean>} True if focus was successful
   */
  async function focusResults() {
    const resultsContainer = document.querySelector('[tabindex="0"]')
    if (!resultsContainer)
      return false

    await nextTick()
    resultsContainer.focus()

    // Always clear and reinitialize selection when focusing results
    selectionStore.clearSelection()
    return initializeSelection()
  }

  /**
   * Scrolls the selected item into view within the virtual list
   * @param {any} item The item to scroll into view
   */
  function scrollToItem(item) {
    if (!item)
      return

    // Use setTimeout to ensure the DOM has updated
    setTimeout(() => {
      // Handle different identifier properties based on item type
      const itemId = item.path || item.char || (item.id ? `id-${item.id}` : null)
      if (!itemId) return
      
      const itemElement = document.getElementById(`result-item-${itemId}`)
      if (!itemElement)
        return

      const container = itemElement.closest('[data-virtual-list]')
      if (container) {
        itemElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
          scrollMode: 'if-needed',
        })
      }
    }, 0)
  }

  /**
   * Navigates selection in the specified direction
   * @param {string} direction Direction to navigate ('up', 'down', 'left', 'right')
   */
  function navigateSelection(direction) {
    const sections = getVisibleSections()
    if (!sections.length) return

    // Initialize selection if none exists
    if (!selectionStore.selectedSection || !selectionStore.selectedItem) {
      initializeSelection()
      return
    }

    // Skip if current section is not visible anymore
    if (!sections.includes(selectionStore.selectedSection)) {
      initializeSelection()
      return
    }

    const currentItems = selectionStore.getCurrentItems()
    const currentIndex = currentItems.findIndex(item => item === selectionStore.selectedItem)
    const currentGrid = selectionStore.getSectionConfig()

    const currentRow = Math.floor(currentIndex / currentGrid.cols)
    const currentCol = currentIndex % currentGrid.cols

    let newIndex = currentIndex
    let newSection = selectionStore.selectedSection

    switch (direction) {
      case 'right':
        if (currentCol < currentGrid.cols - 1 && currentIndex < currentItems.length - 1) {
          newIndex = currentIndex + 1
        }
        break

      case 'left':
        if (currentCol > 0) {
          newIndex = currentIndex - 1
        }
        break

      case 'down': {
        const nextRowIndex = currentIndex + currentGrid.cols
        if (nextRowIndex < currentItems.length) {
          newIndex = nextRowIndex
        }
        else {
          const currentSectionIndex = sections.indexOf(selectionStore.selectedSection)
          if (currentSectionIndex < sections.length - 1) {
            newSection = sections[currentSectionIndex + 1]
            newIndex = 0
          }
        }
        break
      }

      case 'up': {
        const prevRowIndex = currentIndex - currentGrid.cols
        if (prevRowIndex >= 0) {
          newIndex = prevRowIndex
        }
        else {
          const currentSectionIndex = sections.indexOf(selectionStore.selectedSection)
          if (currentSectionIndex > 0) {
            newSection = sections[currentSectionIndex - 1]
            const newItems = selectionStore.getItemsForSection(newSection)
            const newGrid = selectionStore.getSectionConfig(newSection)
            const lastRowStart = Math.floor((newItems.length - 1) / newGrid.cols) * newGrid.cols
            const targetCol = Math.min(currentCol, newGrid.cols - 1)
            newIndex = Math.min(lastRowStart + targetCol, newItems.length - 1)
          }
        }
        break
      }
    }

    if (newSection !== selectionStore.selectedSection) {
      const newItems = selectionStore.getItemsForSection(newSection)
      selectionStore.setSelectedItem(newItems[newIndex], newSection)
    }
    else if (newIndex !== currentIndex && newIndex >= 0 && newIndex < currentItems.length) {
      selectionStore.selectedItem = currentItems[newIndex]
    }

    // Scroll the selected item into view
    if (selectionStore.selectedItem) {
      scrollToItem(selectionStore.selectedItem)
    }
  }

  /**
   * Handles tab navigation between sections
   * @param {boolean} shiftKey Whether shift key is pressed
   */
  function navigateTab(shiftKey) {
    const sections = getVisibleSections()
    if (!sections.length)
      return

    if (!selectionStore.selectedSection || !selectionStore.selectedItem ||
        !sections.includes(selectionStore.selectedSection)) {
      initializeSelection()
      return
    }

    const currentItems = selectionStore.getCurrentItems()
    const currentIndex = currentItems.findIndex(item => item === selectionStore.selectedItem)

    // Try to move within the current section first
    if (shiftKey && currentIndex > 0) {
      // Move to previous item in current section
      selectionStore.setSelectedItem(currentItems[currentIndex - 1], selectionStore.selectedSection)
      return
    }
    else if (!shiftKey && currentIndex < currentItems.length - 1) {
      // Move to next item in current section
      selectionStore.setSelectedItem(currentItems[currentIndex + 1], selectionStore.selectedSection)
      return
    }

    // If we can't move within the section, try to move to another section
    const currentSectionIndex = sections.indexOf(selectionStore.selectedSection)
    const nextSectionIndex = shiftKey
      ? currentSectionIndex <= 0
        ? sections.length - 1
        : currentSectionIndex - 1
      : currentSectionIndex >= sections.length - 1
        ? 0
        : currentSectionIndex + 1

    const nextSection = sections[nextSectionIndex]
    const nextItems = selectionStore.getItemsForSection(nextSection)
    if (nextItems.length) {
      // When moving forward, select first item; when moving backward, select last item
      const nextItem = shiftKey ? nextItems[nextItems.length - 1] : nextItems[0]
      selectionStore.setSelectedItem(nextItem, nextSection)
    }

    // Scroll the selected item into view
    if (selectionStore.selectedItem) {
      scrollToItem(selectionStore.selectedItem)
    }
  }

  return {
    navigateSelection,
    navigateTab,
    focusResults,
    initializeSelection,
    getVisibleSections
  }
}
