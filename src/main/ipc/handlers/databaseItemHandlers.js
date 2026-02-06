import { fileDB } from '../../services/database/database.js'
import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'

export class DatabaseItemHandler extends BaseHandler {
  constructor() {
    super()
    this.registerHandlers({
      [IPC.BACKEND.INDEXER_QUICK_SEARCH]: this.handleQuickSearch.bind(this),
      [IPC.BACKEND.INDEXER_FILTERED_SEARCH]: this.handleFilteredSearch.bind(this),
      [IPC.FRONTEND.FAVORITES_ADD]: this.handleFavoriteAdd.bind(this),
      [IPC.FRONTEND.FAVORITES_REMOVE]: this.handleFavoriteRemove.bind(this),
      [IPC.FRONTEND.FAVORITES_CHECK]: this.handleFavoriteCheck.bind(this),
      [IPC.FRONTEND.FAVORITES_BATCH_CHECK]: this.handleFavoriteBatchCheck.bind(this),
      [IPC.FRONTEND.FAVORITES_GET_ALL]: this.handleGetAllFavorites.bind(this),
      [IPC.FRONTEND.FAVORITES_REORDER]: this.handleReorderFavorites.bind(this),
      [IPC.FRONTEND.NOTES_SET]: this.handleSetNotes.bind(this),
      [IPC.FRONTEND.NOTES_GET]: this.handleGetNotes.bind(this),
      [IPC.FRONTEND.NOTES_BATCH_CHECK]: this.handleNotesBatchCheck.bind(this),
    })
  }

  /**
   * Handle quick search requests
   * @param {Event} _ - The IPC event (unused)
   * @param {string} query - The search query
   * @returns {Promise<object>} The search results
   */
  async handleQuickSearch(_, query) {
    try {
      return await fileDB.quickSearch(query)
    }
    catch (error) {
      console.error('Quick search failed:', error)
      return { error: 'Search failed', message: error.message }
    }
  }

  /**
   * Handle filtered search requests
   * @param {Event} _ - The IPC event (unused)
   * @param {object} searchParams - The search parameters including filters
   * @returns {Promise<object>} The filtered search results
   */
  async handleFilteredSearch(_, searchParams) {
    try {
      return await fileDB.filteredSearch(searchParams)
    }
    catch (error) {
      console.error('Filtered search failed:', error)
      return { error: 'Search failed', message: error.message }
    }
  }

  /**
   * Add an item to favorites
   * @param {Event} _ - The IPC event (unused)
   * @param {string} itemPath - Path to the item
   * @param {string} type - Type of item (file, folder, application, emoji)
   * @returns {Promise<object>} Result of the operation
   */
  async handleFavoriteAdd(_, itemPath, type) {
    try {
      return await fileDB.addToFavorites(itemPath, type)
    }
    catch (error) {
      console.error('Failed to add favorite:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Remove an item from favorites
   * @param {Event} _ - The IPC event (unused)
   * @param {string} itemPath - Path to the item
   * @returns {Promise<object>} Result of the operation
   */
  async handleFavoriteRemove(_, itemPath) {
    try {
      return await fileDB.removeFromFavorites(itemPath)
    }
    catch (error) {
      console.error('Failed to remove favorite:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Check if an item is in favorites
   * @param {Event} _ - The IPC event (unused)
   * @param {string} itemPath - Path to the item
   * @returns {Promise<boolean>} Whether the item is a favorite
   */
  async handleFavoriteCheck(_, itemPath) {
    try {
      return await fileDB.isFavorite(itemPath)
    }
    catch (error) {
      console.error('Failed to check favorite status:', error)
      return false
    }
  }

  /**
   * Get all favorite items
   * @returns {Promise<Array>} List of all favorite items
   */
  async handleGetAllFavorites() {
    try {
      return await fileDB.getAllFavorites()
    }
    catch (error) {
      console.error('Failed to get all favorites:', error)
      return []
    }
  }

  /**
   * Reorder favorites
   * @param {Event} _ - The IPC event (unused)
   * @param {Array<{path: string, type: string}>} orderedFavorites - Array of favorites in desired order
   * @returns {Promise<object>} Result of the operation
   */
  async handleReorderFavorites(_, orderedFavorites) {
    try {
      return await fileDB.reorderFavorites(orderedFavorites)
    }
    catch (error) {
      console.error('Failed to reorder favorites:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Set notes for an item
   * @param {Event} _ - The IPC event (unused)
   * @param {string} itemPath - Path to the item
   * @param {string} notes - Note content
   * @returns {Promise<object>} Result of the operation
   */
  async handleSetNotes(_, itemPath, notes) {
    try {
      const success = await fileDB.setNotes(itemPath, notes)
      return { success, notes }
    }
    catch (error) {
      console.error('Failed to set notes:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get notes for an item
   * @param {Event} _ - The IPC event (unused)
   * @param {string} itemPath - Path to the item
   * @returns {Promise<object>} The notes content
   */
  async handleGetNotes(_, itemPath) {
    try {
      const notes = await fileDB.getNotes(itemPath)
      return { success: true, notes }
    }
    catch (error) {
      console.error('Failed to get notes:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Batch check if multiple items are in favorites
   * @param {Event} _ - The IPC event (unused)
   * @param {string[]} itemPaths - Array of paths to check
   * @returns {Promise<Object<string, boolean>>} Map of path to favorite status
   */
  async handleFavoriteBatchCheck(_, itemPaths) {
    try {
      if (!Array.isArray(itemPaths)) {
        return { success: false, error: 'itemPaths must be an array' }
      }

      // Get all favorites once and build a Set for O(1) lookups
      const allFavorites = await fileDB.getAllFavorites()
      const favoritePathSet = new Set(
        (allFavorites.favorites || []).map(f => f.path),
      )

      // Build result map
      const result = {}
      for (const path of itemPaths) {
        result[path] = favoritePathSet.has(path)
      }

      return { success: true, favorites: result }
    }
    catch (error) {
      console.error('Failed to batch check favorites:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Batch check if multiple items have notes
   * @param {Event} _ - The IPC event (unused)
   * @param {string[]} itemPaths - Array of paths to check
   * @returns {Promise<Object<string, boolean>>} Map of path to notes status
   */
  async handleNotesBatchCheck(_, itemPaths) {
    try {
      if (!Array.isArray(itemPaths)) {
        return { success: false, error: 'itemPaths must be an array' }
      }

      // Check each path for notes (could be optimized with a batch DB query)
      const result = {}
      for (const path of itemPaths) {
        const notes = await fileDB.getNotes(path)
        result[path] = !!notes
      }

      return { success: true, notes: result }
    }
    catch (error) {
      console.error('Failed to batch check notes:', error)
      return { success: false, error: error.message }
    }
  }
}

// Changed to match other handlers' export pattern
export default function setupDatabaseItemHandlers() {
  return new DatabaseItemHandler()
}
