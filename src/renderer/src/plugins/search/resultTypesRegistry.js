// Result Types Registry
// This module serves as the central registry for all result types in the application

import emoji from 'emojilib'
import { IPC_CHANNELS } from '../../../../main/ipc/ipcChannels'
import { getFileType } from '../../../../utils/mimeTypeUtils'
import { openNotesDialog } from '../core/contextMenuPlugin'

// Standard result type keys
export const RESULT_TYPES = {
  DISK: 'disk',
  APPLICATION: 'application',
  EMOJI: 'emoji',
}

/**
 * Create a standard context menu action object
 * @param {object} options - Action options
 * @returns {object} - Formatted context menu action
 */
export function createContextMenuAction({ name, group, order, actionCall, keepMenuOpen = false }) {
  return {
    name,
    group,
    order,
    keepMenuOpen,
    actionCall,
  }
}

/**
 * Create a standard favorite toggle action
 * @param {string} type - The item type (file, folder, application, emoji)
 * @returns {object} - Context menu action for toggling favorites
 */
export function createFavoriteToggleAction(type) {
  return createContextMenuAction({
    name: 'contextMenu.toggleFavorite',
    group: 'favorite',
    order: 10, // Favorites come after core actions
    actionCall: (item) => {
      const path = item.path
      return item.isFavorite
        ? window.api.invoke(IPC_CHANNELS.FAVORITES_REMOVE, path)
        : window.api.invoke(IPC_CHANNELS.FAVORITES_ADD, path, type)
    },
  })
}

/**
 * Create a standard edit note action
 * @returns {object} - Context menu action for editing notes
 */
export function createEditNoteAction() {
  return createContextMenuAction({
    name: 'contextMenu.editNote',
    group: 'edit',
    order: 20, // Edit note comes last
    keepMenuOpen: true,
    actionCall: item => openNotesDialog(item),
  })
}

// Default result type definitions
const defaultResultTypes = [
  {
    name: RESULT_TYPES.DISK,
    displayNameKey: 'search.sections.files',
    searchCall: async (query, filters, isFiltered) => {
      if (!query.trim() && !isFiltered)
        return []
      return isFiltered
        ? window.api.invoke(IPC_CHANNELS.INDEXER_FILTERED_SEARCH, { query, filters })
        : window.api.invoke(IPC_CHANNELS.INDEXER_QUICK_SEARCH, query)
    },
    content: [],
    gridCols: 1,
    priority: 3,
    supportedActions: ['open-file', 'show-in-directory', 'edit-note', 'favorite'],
    contextMenuActions: [
      createContextMenuAction({
        name: 'contextMenu.open',
        group: 'actions',
        order: 1, // Core action - first
        actionCall: item => window.api.invoke(IPC_CHANNELS.OPEN_FILE, item.path),
      }),
      createContextMenuAction({
        name: 'contextMenu.showInFolder',
        group: 'actions',
        order: 2, // Core action - second
        actionCall: item => window.api.invoke(IPC_CHANNELS.SHOW_IN_EXPLORER, item.path),
      }),
      // Use dynamic type detection for file/folder
      createContextMenuAction({
        name: 'contextMenu.toggleFavorite',
        group: 'favorite',
        order: 10, // Favorites come after core actions
        actionCall: (item) => {
          const path = item.path
          // Determine if this is a folder or file
          const type = item.type === 'directory' || getFileType(item) === 'directory' ? 'folder' : 'file'
          return item.isFavorite
            ? window.api.invoke(IPC_CHANNELS.FAVORITES_REMOVE, path)
            : window.api.invoke(IPC_CHANNELS.FAVORITES_ADD, path, type)
        },
      }),
      createEditNoteAction(),
    ],
  },
  {
    name: RESULT_TYPES.APPLICATION,
    displayNameKey: 'search.sections.apps',
    searchCall: async (query, _filters, _isFiltered) => {
      if (!query.trim())
        return []
      return window.api.invoke(IPC_CHANNELS.APP_SEARCH, query)
    },
    content: [],
    gridCols: 3,
    priority: 1,
    supportedActions: ['launch', 'edit-note', 'favorite'],
    contextMenuActions: [
      createContextMenuAction({
        name: 'contextMenu.launch',
        group: 'actions',
        order: 1, // Core action - first
        actionCall: item => window.api.invoke(IPC_CHANNELS.OPEN_FILE, item.path),
      }),
      createFavoriteToggleAction('application'),
      createEditNoteAction(),
    ],
  },
  {
    name: RESULT_TYPES.EMOJI,
    displayNameKey: 'search.sections.emoji',
    searchCall: async (query, _filters, _isFiltered) => {
      if (!query.trim())
        return []

      const searchTerms = query.toLowerCase().split(' ')
      const baseResults = Object.entries(emoji)
        .filter(([_char, keywords]) =>
          searchTerms.some(term =>
            keywords.some(keyword => keyword.toLowerCase().includes(term)),
          ),
        )
        .map(([char, keywords]) => {
          // Create a complete emoji object with all required properties
          return {
            char,
            name: keywords[0].replace(/_/g, ' '),
            path: `emoji:/${char}`,
            type: 'emoji',
            isFavorite: false, // Will be enriched below
            hasNotes: false, // Will be enriched below
          }
        })
        .slice(0, 24)

      // No results, skip enrichment
      if (baseResults.length === 0) {
        return []
      }

      // Batch check favorites and notes status (single IPC call each instead of 2 per emoji)
      try {
        const paths = baseResults.map(e => e.path)
        const [favResponse, notesResponse] = await Promise.all([
          window.api.invoke(IPC_CHANNELS.FAVORITES_BATCH_CHECK, paths),
          window.api.invoke(IPC_CHANNELS.NOTES_BATCH_CHECK, paths),
        ])

        // Enrich results with status
        if (favResponse?.success) {
          baseResults.forEach((e) => {
            e.isFavorite = favResponse.favorites[e.path] || false
          })
        }
        if (notesResponse?.success) {
          baseResults.forEach((e) => {
            e.hasNotes = notesResponse.notes[e.path] || false
          })
        }
      }
      catch (error) {
        console.warn('Failed to enrich emoji with favorite/notes status:', error)
      }

      return baseResults
    },
    content: [],
    gridCols: 8,
    priority: 2,
    supportedActions: ['copy', 'edit-note', 'favorite'],
    contextMenuActions: [
      createContextMenuAction({
        name: 'contextMenu.copy',
        group: 'actions',
        order: 1, // Core action - first
        actionCall: item => navigator.clipboard.writeText(item.char),
      }),
      createFavoriteToggleAction('emoji'),
      createEditNoteAction(),
    ],
  },
]

/**
 * Result Types Registry - Manages all search result types
 */
class ResultTypesRegistry {
  constructor() {
    this._resultTypes = new Map()

    // Initialize with default result types
    defaultResultTypes.forEach((resultType) => {
      this.registerResultType(resultType)
    })
  }

  /**
   * Register a new result type
   * @param {object} resultType - The result type configuration
   * @returns {boolean} - Success status
   */
  registerResultType(resultType) {
    if (!resultType || !resultType.name) {
      console.error('Invalid result type - must have a name property')
      return false
    }

    // Create a fresh copy to avoid reference issues
    const resultTypeCopy = { ...resultType, content: [] }

    this._resultTypes.set(resultType.name, resultTypeCopy)
    return true
  }

  /**
   * Unregister a result type
   * @param {string} typeName - The name of the result type to remove
   * @returns {boolean} - Success status
   */
  unregisterResultType(typeName) {
    if (!this._resultTypes.has(typeName)) {
      console.warn(`Result type '${typeName}' does not exist`)
      return false
    }

    this._resultTypes.delete(typeName)
    return true
  }

  /**
   * Get a result type by name
   * @param {string} typeName - The name of the result type
   * @returns {object | null} - The result type or null if not found
   */
  getResultType(typeName) {
    return this._resultTypes.get(typeName) || null
  }

  /**
   * Get all registered result types
   * @returns {Array} - Array of result type objects
   */
  getAllResultTypes() {
    return Array.from(this._resultTypes.values())
  }

  /**
   * Check if a result type is registered
   * @param {string} typeName - The name of the result type
   * @returns {boolean} - Whether the result type exists
   */
  hasResultType(typeName) {
    return this._resultTypes.has(typeName)
  }
}

// Create and export a singleton instance
export const resultTypesRegistry = new ResultTypesRegistry()

// Export a Vue plugin for registering the registry
export default {
  install: (app) => {
    // Make registry available through app.config
    app.config.globalProperties.$resultTypesRegistry = resultTypesRegistry

    // Also provide it for composition API
    app.provide('resultTypesRegistry', resultTypesRegistry)
  },
}
