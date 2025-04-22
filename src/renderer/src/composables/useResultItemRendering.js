import { computed } from 'vue'
import { useSelectionStore } from '../stores/selection-store'

/**
 * A composable for handling common result item rendering functionality
 * @param {string} resultType - The type of result (e.g., 'application', 'disk', 'emoji')
 * @returns {Object} - Functions and computed properties for result item rendering
 */
export function useResultItemRendering(resultType) {
  const selectionStore = useSelectionStore()

  /**
   * Check if an item is currently selected
   * @param {Object} item - The result item to check
   * @returns {boolean} - Whether the item is currently selected
   */
  const isItemSelected = (item) => {
    if (!selectionStore.selectedItem || !item) return false
    
    // Handle different result types
    if (resultType === 'application' || resultType === 'apps') {
      return selectionStore.selectedSection === resultType && 
             selectionStore.selectedItem.path === item.path
    }
    
    if (resultType === 'emoji') {
      return selectionStore.selectedSection === resultType && 
             selectionStore.selectedItem.char === item.char
    }
    
    if (resultType === 'disk' || resultType === 'files') {
      return selectionStore.selectedSection === resultType && 
             selectionStore.selectedItem.path === item.path
    }
    
    // Default case - compare the entire object
    return selectionStore.selectedSection === resultType && 
           selectionStore.selectedItem === item
  }

  /**
   * Get the tabindex attribute for a result item based on its position
   * @param {number} index - The index of the item in the result list
   * @returns {string} - The tabindex attribute value
   */
  const getTabIndex = (index) => {
    // If it's the first item, make it focusable by keyboard
    return index === 0 ? '0' : '-1'
  }

  /**
   * Handle item focus event
   * @param {Object} item - The item that was focused
   * @param {Function} emit - The emit function from the component
   */
  const handleItemFocus = (item, emit) => {
    // Update selection
    selectionStore.setSelectedItem(item, resultType)
    
    // Emit event if an emit function was provided
    if (emit) {
      emit('item-focus', item, resultType)
    }
  }

  return {
    isItemSelected,
    getTabIndex,
    handleItemFocus,
  }
}
