import { acceptHMRUpdate, defineStore } from 'pinia'
import { RESULT_TYPES, resultTypesRegistry } from '../plugins/search/resultTypesRegistry'
import { iconService } from '../services/IconService'

export { RESULT_TYPES } // Re-export for backward compatibility

export const SEARCH_MODES = {
  QUICK: 'quick',
  FILTERED: 'filtered',
}

// Search request tracking for cancellation
let currentSearchId = 0
let debounceTimeoutId = null

// Default state
function getDefaultState() {
  return {
    query: '',
    resultGroups: resultTypesRegistry.getAllResultTypes(), // Get result types from registry
    filters: {
      type: [],
      tags: [],
      dateRange: {
        from: null,
        to: null,
      },
      size: {
        min: null,
        max: null,
      },
      includeContent: false,
    },
    isLoading: false,
    searchMode: SEARCH_MODES.QUICK,
    hasSearched: false,
    resultsUpdateCounter: 0, // Counter to trigger component updates
  }
}

export const useSearchResultsStore = defineStore('searchResults', {
  state: () => getDefaultState(),

  getters: {
    hasActiveFilters: (state) => {
      return state.searchMode === SEARCH_MODES.FILTERED || (
        state.filters.type.length > 0
        || state.filters.tags.length > 0
        || state.filters.dateRange.from
        || state.filters.dateRange.to
        || state.filters.size.min
        || state.filters.size.max
        || state.filters.includeContent
      )
    },

    // Shorthand getters for individual result types
    diskResults: state => state.resultGroups.find(r => r.name === RESULT_TYPES.DISK)?.content || [],
    applicationResults: state => state.resultGroups.find(r => r.name === RESULT_TYPES.APPLICATION)?.content || [],
    emojiResults: state => state.resultGroups.find(r => r.name === RESULT_TYPES.EMOJI)?.content || [],
    isFilteredMode: state => state.searchMode === SEARCH_MODES.FILTERED,

    hasAnyResults(state) {
      return state.resultGroups.some(resultType => resultType.content.length > 0)
    },

    getAllResults: (state) => {
      // Maintain backward compatibility with the old format
      return {
        disk: state.resultGroups.find(r => r.name === RESULT_TYPES.DISK)?.content || [],
        applications: state.resultGroups.find(r => r.name === RESULT_TYPES.APPLICATION)?.content || [],
        emojis: state.resultGroups.find(r => r.name === RESULT_TYPES.EMOJI)?.content || [],
        query: state.query,
      }
    },

    // Get a result type by name
    getResultTypeByName: state => (name) => {
      return state.resultGroups.find(r => r.name === name)
    },
  },

  actions: {
    // Helper function to ensure objects are serializable for IPC
    makeSerializable(obj) {
      // If it's not an object or is null, return as is
      if (typeof obj !== 'object' || obj === null) {
        return obj
      }

      // Handle Date objects
      if (obj instanceof Date) {
        return obj.getTime()
      }

      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => this.makeSerializable(item))
      }

      // Handle regular objects
      const result = {}
      for (const [key, value] of Object.entries(obj)) {
        // Skip functions or other non-serializable types
        if (typeof value !== 'function' && typeof value !== 'symbol') {
          result[key] = this.makeSerializable(value)
        }
      }
      return result
    },

    // Search orchestrator with cancellation support
    async search() {
      // Only clear results if there's no query AND no active filters
      if (!this.query.trim() && !this.hasActiveFilters) {
        this.clearResults()
        return
      }

      // Generate a unique ID for this search request
      const searchId = ++currentSearchId

      this.isLoading = true
      this.hasSearched = true

      try {
        const isFiltered = this.searchMode === SEARCH_MODES.FILTERED

        // Create a serializable copy of the filters
        const serializableFilters = this.makeSerializable(this.filters)

        // Execute all search calls in parallel
        const searchPromises = this.resultGroups.map(async (resultType) => {
          try {
            // Skip search for some result types based on conditions
            if (resultType.name === RESULT_TYPES.DISK && !isFiltered && !this.query.trim()) {
              return {
                resultType: resultType.name,
                results: [],
              }
            }

            // For other result types, proceed with search
            const results = await resultType.searchCall(this.query, serializableFilters, isFiltered)
            return {
              resultType: resultType.name,
              results: Array.isArray(results) ? results : [],
            }
          }
          catch (error) {
            console.error(`Error searching ${resultType.name}:`, error)
            return {
              resultType: resultType.name,
              results: [],
            }
          }
        })

        const searchResults = await Promise.all(searchPromises)

        // Check if this search is still the current one (cancellation check)
        // If a newer search was started, discard these results
        if (searchId !== currentSearchId) {
          return // Stale results, discard
        }

        // Update content for each result type
        searchResults.forEach(({ resultType, results }) => {
          const targetType = this.resultGroups.find(r => r.name === resultType)
          if (targetType) {
            targetType.content = results
          }
        })

        // Increment counter to help components react to result changes
        this.resultsUpdateCounter++

        // Preload thumbnails and icons for disk results to improve perceived performance
        const diskResults = searchResults.find(r => r.resultType === RESULT_TYPES.DISK)
        if (diskResults?.results?.length > 0) {
          // Only preload first batch to avoid overwhelming the system
          const firstBatch = diskResults.results.slice(0, 20)
          iconService.preloadThumbnails(firstBatch)
          iconService.preloadFileIcons(firstBatch)
        }
      }
      catch (error) {
        console.error('Search error:', error)
        // Only clear if this is still the current search
        if (searchId === currentSearchId) {
          this.clearResults()
        }
      }
      finally {
        // Only update loading state if this is still the current search
        if (searchId === currentSearchId) {
          this.isLoading = false
        }
      }
    },

    // Debounced search with proper cancellation
    debouncedSearch() {
      // Clear any pending debounce
      if (debounceTimeoutId) {
        clearTimeout(debounceTimeoutId)
      }

      debounceTimeoutId = setTimeout(async () => {
        debounceTimeoutId = null
        await this.search()
      }, 300)
    },

    // Cancel any pending search operations
    // Call this when the search window is hidden to prevent stale updates
    cancelPendingSearch() {
      // Clear debounce timer
      if (debounceTimeoutId) {
        clearTimeout(debounceTimeoutId)
        debounceTimeoutId = null
      }
      // Increment search ID to invalidate any in-flight searches
      currentSearchId++
      this.isLoading = false
    },

    // Helper to set results for a specific type
    setResultsForType(typeName, results) {
      const resultType = this.resultGroups.find(r => r.name === typeName)
      if (resultType) {
        resultType.content = Array.isArray(results) ? results : []
        this.resultsUpdateCounter++
      }
    },

    refreshSearch() {
      this.search()
    },

    setQuery(query) {
      this.query = query
      this.debouncedSearch()
    },

    clearResults() {
      this.resultGroups.forEach((resultType) => {
        resultType.content = []
      })
      this.hasSearched = false
      this.resultsUpdateCounter++
    },

    resetFilters() {
      const defaultState = getDefaultState()
      this.filters = { ...defaultState.filters }
    },

    resetState() {
      // Update the state but keep results synchronized with registry
      const newState = getDefaultState()
      Object.assign(this, newState)
    },

    // Generic filter toggle function that can handle any filter type
    toggleFilter(filterType, value) {
      if (!this.filters[filterType]) {
        console.warn(`Filter type '${filterType}' does not exist`)
        return
      }

      if (Array.isArray(this.filters[filterType])) {
        const index = this.filters[filterType].indexOf(value)
        if (index === -1) {
          this.filters[filterType].push(value)
        }
        else {
          this.filters[filterType].splice(index, 1)
        }
      }
      else if (typeof this.filters[filterType] === 'boolean') {
        this.filters[filterType] = !this.filters[filterType]
      }
      else {
        console.warn(`Filter type '${filterType}' is not supported for toggling`)
      }
    },

    toggleSearchMode() {
      this.searchMode = this.searchMode === SEARCH_MODES.FILTERED
        ? SEARCH_MODES.QUICK
        : SEARCH_MODES.FILTERED

      // Execute a search when switching modes
      if (this.hasSearched) {
        this.search()
      }
    },

    setSearchMode(mode) {
      if (Object.values(SEARCH_MODES).includes(mode)) {
        this.searchMode = mode
      }
      else {
        // For backward compatibility
        this.searchMode = mode ? SEARCH_MODES.FILTERED : SEARCH_MODES.QUICK
      }
    },

    // Add a new result type
    addResultType(resultType) {
      if (!resultType || !resultType.name) {
        console.error('Invalid result type - must have a name property')
        return
      }

      // Register with registry first
      const registered = resultTypesRegistry.registerResultType(resultType)
      if (!registered)
        return

      // Then update local state
      const existingTypeIndex = this.resultGroups.findIndex(r => r.name === resultType.name)
      if (existingTypeIndex !== -1) {
        // Replace existing type with the new one
        this.resultGroups.splice(existingTypeIndex, 1, resultType)
      }
      else {
        // Add new type
        this.resultGroups.push(resultType)
      }

      this.resultsUpdateCounter++
    },

    // Remove a result type
    removeResultType(typeName) {
      // Remove from registry first
      resultTypesRegistry.unregisterResultType(typeName)

      // Then update local state
      const typeIndex = this.resultGroups.findIndex(r => r.name === typeName)
      if (typeIndex !== -1) {
        this.resultGroups.splice(typeIndex, 1)
        this.resultsUpdateCounter++
      }
    },

    // Sync with registry to ensure store and registry are aligned
    syncWithRegistry() {
      this.resultGroups = resultTypesRegistry.getAllResultTypes()
      this.resultsUpdateCounter++
    },
  },
})

// Enable Hot Module Replacement
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSearchResultsStore, import.meta.hot))
}
