import { computed, nextTick } from 'vue'
import { useSearchResultsStore } from '../stores/search-results-store'
import { useSelectionStore } from '../stores/selection-store'
import { useSettingsStore } from '../stores/settings-store'

// Maximum cache size to prevent memory leaks
const MAX_SELECTOR_CACHE_SIZE = 100

export function useKeyboardNavigation() {
  const selectionStore = useSelectionStore()
  const searchStore = useSearchResultsStore()
  const settingsStore = useSettingsStore()

  // Cache for DOM element selectors with size limit
  const selectorCache = new Map()

  /**
   * Clear selector cache when it exceeds the maximum size
   * This prevents memory leaks during extended application use
   */
  function trimSelectorCache() {
    if (selectorCache.size > MAX_SELECTOR_CACHE_SIZE) {
      selectorCache.clear()
    }
  }

  // Memoized computed property for visible sections to improve performance
  const visibleSections = computed(() => {
    // Get sections that have content
    const sectionsWithContent = searchStore.resultGroups
      .filter(resultType => resultType.content.length > 0)
      .map(resultType => resultType.name)

    // Apply custom ordering if available
    const contentMap = new Set(sectionsWithContent)

    // Apply custom ordering if available, otherwise sort by priority
    const validOrderedSections = (settingsStore.settings.sectionOrder || [])
      .filter(sectionName => contentMap.has(sectionName))

    const unorderedSections = sectionsWithContent
      .filter(sectionName => !validOrderedSections.includes(sectionName))

    const orderedSections = validOrderedSections.length > 0
      ? [...validOrderedSections, ...unorderedSections]
      : searchStore.resultGroups
          .filter(resultType => resultType.content.length > 0)
          .sort((a, b) => a.priority - b.priority)
          .map(resultType => resultType.name)

    // Filter by enabled search types in settings and not collapsed
    return orderedSections.filter((section) => {
      const searchType = settingsStore.settings.includedSearchTypes?.find(
        type => type.name === section,
      )
      const isEnabled = searchType?.enabled !== false // default to true if not specified
      const isCollapsed = (settingsStore.settings.collapsedSections || []).includes(section)

      return isEnabled && !isCollapsed
    })
  })

  /**
   * Get all currently visible sections based on results, settings, and collapsed state
   */
  function getVisibleSections() {
    return visibleSections.value
  }

  /**
   * Select the first item in the first visible section
   */
  function initializeSelection() {
    const sections = visibleSections.value
    if (!sections.length)
      return false

    const firstSection = sections[0]
    const items = selectionStore.getItemsForSection(firstSection)

    if (items.length > 0) {
      selectionStore.setSelectedItem(items[0], firstSection)
      scrollItemIntoView(items[0])
      return true
    }

    return false
  }

  /**
   * Set focus to the results container
   */
  async function focusResults() {
    const resultsContainer = document.querySelector('[tabindex="0"]')
    if (!resultsContainer)
      return false

    await nextTick()
    resultsContainer.focus()

    if (!selectionStore.selectedItem) {
      return initializeSelection()
    }

    return true
  }

  /**
   * Create a DOM selector for a result item
   * @param {object} item - The result item
   * @returns {string} - The DOM selector
   */
  function createItemSelector(item) {
    // Use cached selector if available
    const cacheKey = JSON.stringify(item)
    if (selectorCache.has(cacheKey)) {
      return selectorCache.get(cacheKey)
    }

    let selector

    if (item.path) {
      // For disk items and applications (both have path)
      selector = `[data-item-id="${CSS.escape(item.path)}"], [data-path="${CSS.escape(item.path)}"]`

      // Don't use JSON.stringify in selectors as it's unreliable
      if (item.isApp || item.type === 'application') {
        selector += `, [data-app-path="${CSS.escape(item.path)}"]`
      }
    }
    else if (item.char) {
      // For emojis
      selector = `[data-char="${CSS.escape(item.char)}"]`
    }
    else if (item.id) {
      selector = `[data-item-id="id-${CSS.escape(item.id)}"]`
    }
    else {
      // Fallback to find by any available property in the item
      const possibleAttributes = ['id', 'name', 'char', 'path']
      for (const attr of possibleAttributes) {
        if (item[attr]) {
          selector = `[data-${attr}="${CSS.escape(item[attr])}"]`
          break
        }
      }
    }

    // Cache the selector (with size limit to prevent memory leaks)
    if (selector) {
      trimSelectorCache()
      selectorCache.set(cacheKey, selector)
    }

    return selector
  }

  /**
   * Scroll the selected item into view (without stealing focus)
   * @param {object} item - The item to scroll into view
   * @param {boolean} shouldFocus - Whether to focus the item (default: false)
   */
  function scrollItemIntoView(item, shouldFocus = false) {
    if (!item)
      return

    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      const selector = createItemSelector(item)
      if (!selector)
        return

      // Query all possibilities at once
      let itemElement = document.querySelector(selector)

      // If we couldn't find by selector, try by result type + index
      if (!itemElement && selectionStore.selectedSection) {
        const resultType = selectionStore.selectedSection
        const items = selectionStore.getItemsForSection(resultType)
        const index = items.indexOf(item)

        if (index !== -1) {
          const allItems = document.querySelectorAll(`[data-result-type="${resultType}"] *[tabindex]`)
          if (allItems && index < allItems.length) {
            itemElement = allItems[index]
          }
        }
      }

      if (itemElement) {
        // Only focus if explicitly requested (e.g., keyboard navigation)
        if (shouldFocus) {
          itemElement.focus({ preventScroll: true })
        }
        itemElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        })
      }
    })
  }

  /**
   * Compare items by their unique identifiers (path, id, or char)
   * @param {object} item1 - First item to compare
   * @param {object} item2 - Second item to compare
   * @returns {boolean} - True if items match
   */
  function compareItems(item1, item2) {
    if (item1 === item2) return true
    if (!item1 || !item2) return false
    
    // Compare by path (for disk items and applications)
    if (item1.path && item2.path) {
      return item1.path === item2.path
    }
    
    // Compare by char (for emojis)
    if (item1.char && item2.char) {
      return item1.char === item2.char
    }
    
    // Compare by id (for other items)
    if (item1.id && item2.id) {
      return item1.id === item2.id
    }
    
    return false
  }

  /**
   * Move selection up or down within the current section or to adjacent sections
   */
  function navigateVertical(direction) {
    if (!selectionStore.selectedSection) {
      return initializeSelection()
    }

    const sections = visibleSections.value
    if (!sections.length)
      return false

    const items = selectionStore.getItemsForSection(selectionStore.selectedSection)
    if (!items.length)
      return false

    const currentIndex = items.findIndex(item => compareItems(item, selectionStore.selectedItem))
    if (currentIndex === -1)
      return initializeSelection()

    // Get the grid columns count for the current section
    const resultType = searchStore.getResultTypeByName(selectionStore.selectedSection)
    const gridCols = resultType?.gridCols || 1

    let newIndex

    if (direction === 'up') {
      // Move up one row (subtract the number of columns)
      newIndex = currentIndex - gridCols

      // If we can't move up a full row, move to the previous section
      if (newIndex < 0) {
        const currentSectionIndex = sections.indexOf(selectionStore.selectedSection)

        // Move to the previous section or wrap to the last section
        if (currentSectionIndex > 0) {
          const prevSection = sections[currentSectionIndex - 1]
          const prevSectionItems = selectionStore.getItemsForSection(prevSection)

          if (prevSectionItems.length > 0) {
            // Select the last item in the previous section
            selectionStore.setSelectedItem(
              prevSectionItems[prevSectionItems.length - 1],
              prevSection,
            )
            scrollItemIntoView(prevSectionItems[prevSectionItems.length - 1], false)
            return true
          }
        }
        else if (sections.length > 1) {
          // Wrap to the last section if we're at the first
          const lastSection = sections[sections.length - 1]
          const lastSectionItems = selectionStore.getItemsForSection(lastSection)

          if (lastSectionItems.length > 0) {
            // Select the last item in the last section
            selectionStore.setSelectedItem(
              lastSectionItems[lastSectionItems.length - 1],
              lastSection,
            )
            scrollItemIntoView(lastSectionItems[lastSectionItems.length - 1], false)
            return true
          }
        }

        // If we can't move to another section, stay at the first item in the current section
        const currentCol = currentIndex % gridCols
        newIndex = currentCol < items.length ? currentCol : 0
      }
    }
    else { // down
      // Move down one row (add the number of columns)
      newIndex = currentIndex + gridCols

      // If we can't move down a full row, move to the next section
      if (newIndex >= items.length) {
        const currentSectionIndex = sections.indexOf(selectionStore.selectedSection)

        // Move to the next section or wrap to the first section
        if (currentSectionIndex < sections.length - 1) {
          const nextSection = sections[currentSectionIndex + 1]
          const nextSectionItems = selectionStore.getItemsForSection(nextSection)

          if (nextSectionItems.length > 0) {
            // Select the first item in the next section
            selectionStore.setSelectedItem(nextSectionItems[0], nextSection)
            scrollItemIntoView(nextSectionItems[0], false)
            return true
          }
        }
        else if (sections.length > 1) {
          // Wrap to the first section if we're at the last
          const firstSection = sections[0]
          const firstSectionItems = selectionStore.getItemsForSection(firstSection)

          if (firstSectionItems.length > 0) {
            // Select the first item in the first section
            selectionStore.setSelectedItem(firstSectionItems[0], firstSection)
            scrollItemIntoView(firstSectionItems[0], false)
            return true
          }
        }

        // Calculate position in last row that corresponds to current column position
        const currentCol = currentIndex % gridCols
        const lastRowStartIndex = Math.floor((items.length - 1) / gridCols) * gridCols
        newIndex = lastRowStartIndex + currentCol

        // Ensure we don't go beyond the array bounds
        if (newIndex >= items.length) {
          newIndex = items.length - 1
        }
      }
    }

    // Only update if changed
    if (newIndex !== currentIndex) {
      selectionStore.setSelectedItem(items[newIndex], selectionStore.selectedSection)
      scrollItemIntoView(items[0], false)
      return true
    }

    return false
  }

  /**
   * Move selection left or right within the current section or to adjacent sections
   */
  function navigateHorizontal(direction) {
    if (!selectionStore.selectedSection) {
      return initializeSelection()
    }

    const sections = visibleSections.value
    if (!sections.length)
      return false

    const items = selectionStore.getItemsForSection(selectionStore.selectedSection)
    if (!items.length)
      return false

    const currentIndex = items.findIndex(item => compareItems(item, selectionStore.selectedItem))
    if (currentIndex === -1)
      return initializeSelection()

    let newIndex

    if (direction === 'left') {
      // Move left one item
      newIndex = currentIndex - 1

      // If we're at the first item, move to the previous section
      if (newIndex < 0) {
        const currentSectionIndex = sections.indexOf(selectionStore.selectedSection)

        // Move to the previous section or wrap to the last section
        if (currentSectionIndex > 0) {
          const prevSection = sections[currentSectionIndex - 1]
          const prevSectionItems = selectionStore.getItemsForSection(prevSection)

          if (prevSectionItems.length > 0) {
            // Select the last item in the previous section
            selectionStore.setSelectedItem(
              prevSectionItems[prevSectionItems.length - 1],
              prevSection,
            )
            scrollItemIntoView(prevSectionItems[prevSectionItems.length - 1], false)
            return true
          }
        }
        else if (sections.length > 1) {
          // Wrap to the last section if we're at the first
          const lastSection = sections[sections.length - 1]
          const lastSectionItems = selectionStore.getItemsForSection(lastSection)

          if (lastSectionItems.length > 0) {
            // Select the last item in the last section
            selectionStore.setSelectedItem(
              lastSectionItems[lastSectionItems.length - 1],
              lastSection,
            )
            scrollItemIntoView(lastSectionItems[lastSectionItems.length - 1], false)
            return true
          }
        }

        // If we can't move to another section, wrap to the end of the current section
        newIndex = items.length - 1
      }
    }
    else { // right
      // Move right one item
      newIndex = currentIndex + 1

      // If we're at the last item, move to the next section
      if (newIndex >= items.length) {
        const currentSectionIndex = sections.indexOf(selectionStore.selectedSection)

        // Move to the next section or wrap to the first section
        if (currentSectionIndex < sections.length - 1) {
          const nextSection = sections[currentSectionIndex + 1]
          const nextSectionItems = selectionStore.getItemsForSection(nextSection)

          if (nextSectionItems.length > 0) {
            // Select the first item in the next section
            selectionStore.setSelectedItem(nextSectionItems[0], nextSection)
            scrollItemIntoView(nextSectionItems[0], false)
            return true
          }
        }
        else if (sections.length > 1) {
          // Wrap to the first section if we're at the last
          const firstSection = sections[0]
          const firstSectionItems = selectionStore.getItemsForSection(firstSection)

          if (firstSectionItems.length > 0) {
            // Select the first item in the first section
            selectionStore.setSelectedItem(firstSectionItems[0], firstSection)
            scrollItemIntoView(firstSectionItems[0], false)
            return true
          }
        }

        // If we can't move to another section, wrap to the beginning of the current section
        newIndex = 0
      }
    }

    // Only update if changed
    if (newIndex !== currentIndex) {
      selectionStore.setSelectedItem(items[newIndex], selectionStore.selectedSection)
      scrollItemIntoView(items[newIndex], false)
      return true
    }

    return false
  }

  /**
   * Move selection between different sections
   */
  function navigateSection(goBack = false) {
    const sections = visibleSections.value
    if (!sections.length)
      return false

    let currentSectionIndex = sections.indexOf(selectionStore.selectedSection)
    if (currentSectionIndex === -1)
      currentSectionIndex = 0

    let newSectionIndex
    if (goBack) {
      // Move to previous section or wrap to end
      newSectionIndex = currentSectionIndex > 0 ? currentSectionIndex - 1 : sections.length - 1
    }
    else {
      // Move to next section or wrap to beginning
      newSectionIndex = currentSectionIndex < sections.length - 1 ? currentSectionIndex + 1 : 0
    }

    const newSection = sections[newSectionIndex]
    const items = selectionStore.getItemsForSection(newSection)

    if (items.length > 0) {
      selectionStore.setSelectedItem(items[0], newSection)
      scrollItemIntoView(items[0], false)
      return true
    }

    return false
  }

  /**
   * Execute the action for the selected item
   */
  function activateSelectedItem() {
    return selectionStore.selectedItem
  }

  return {
    getVisibleSections,
    initializeSelection,
    focusResults,
    scrollItemIntoView,
    navigateVertical,
    navigateHorizontal,
    navigateSection,
    activateSelectedItem,
  }
}
