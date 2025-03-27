import emoji from 'emojilib'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'

export const SEARCH_MODES = {
  QUICK: 'quick',
  ADVANCED: 'advanced',
}

export const RESULT_TYPES = {
  DISK: 'disk',
  APPLICATION: 'application',
  EMOJI: 'emoji',
}

// Default state 
function getDefaultState() {
  return {
    query: '',
    results: {
      [RESULT_TYPES.DISK]: [],
      [RESULT_TYPES.APPLICATION]: [],
      [RESULT_TYPES.EMOJI]: [],
    },
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
  }
}

export const useSearchResultsStore = defineStore('searchResults', {
  state: () => getDefaultState(),

  getters: {
    hasActiveFilters: (state) => {
      return state.searchMode === SEARCH_MODES.ADVANCED || (
        state.filters.type.length > 0
        || state.filters.tags.length > 0
        || state.filters.dateRange.from
        || state.filters.dateRange.to
        || state.filters.size.min
        || state.filters.size.max
        || state.filters.includeContent
      )
    },


    diskResults: state => state.results[RESULT_TYPES.DISK],
    applicationResults: state => state.results[RESULT_TYPES.APPLICATION],
    emojiResults: state => state.results[RESULT_TYPES.EMOJI],
    isAdvancedMode: state => state.searchMode === SEARCH_MODES.ADVANCED,

    hasAnyResults(state) {
      return Object.values(state.results).some(results => results.length > 0)
    },

    getAllResults: state => ({
      disk: state.results[RESULT_TYPES.DISK],
      applications: state.results[RESULT_TYPES.APPLICATION],
      emojis: state.results[RESULT_TYPES.EMOJI],
      query: state.query,
    }),
  },

  actions: {
    // Search orchestrator
    async search() {
      if (!this.query.trim() && !this.hasActiveFilters) {
        this.clearResults()
        return
      }

      this.isLoading = true
      this.hasSearched = true

      try {
        if (this.searchMode === SEARCH_MODES.ADVANCED) {
          await this.advancedSearch()
        }
        else {
          await this.quickSearch()
        }
      }
      catch (error) {
        console.error('Search error:', error)
        this.clearResults()
      }
      finally {
        this.isLoading = false
      }
    },

    // Debounced search with function memoization
    debouncedSearch: (function () {
      let timeoutId
      return function () {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(async () => {
          await this.search()
        }, 300)
      }
    })(),

    // Quick search implementation
    async quickSearch() {
      if (!this.query.trim()) {
        this.clearResults()
        return
      }

      this.isLoading = true
      this.hasSearched = true

      try {
        const [diskResults, applicationResults] = await Promise.all([
          window.api.invoke(IPC_CHANNELS.INDEXER_QUICK_SEARCH, this.query),
          window.api.invoke(IPC_CHANNELS.APP_SEARCH, this.query),
        ])

        const emojiResults = this.searchEmojis(this.query)

        this.setResults({
          [RESULT_TYPES.DISK]: diskResults || [],
          [RESULT_TYPES.APPLICATION]: applicationResults || [],
          [RESULT_TYPES.EMOJI]: emojiResults || [],
        })
      }
      catch (error) {
        console.error('Quick search error:', error)
        this.clearResults()
      }
      finally {
        this.isLoading = false
      }
    },

    // Emoji search helper
    searchEmojis(query) {
      const searchTerms = query.toLowerCase().split(' ')
      return Object.entries(emoji)
        .filter(([char, keywords]) =>
          searchTerms.some(term =>
            keywords.some(keyword => keyword.toLowerCase().includes(term)),
          ),
        )
        .map(([char, keywords]) => ({
          char,
          name: keywords[0].replace(/_/g, ' '),
        }))
        .slice(0, 24)
    },

    // Advanced search implementation
    async advancedSearch() {
      if (!this.query.trim() && !this.hasActiveFilters) {
        this.clearResults()
        return
      }

      this.isLoading = true
      this.hasSearched = true

      try {
        const searchParams = this.prepareAdvancedSearchParams()

        const diskResults = await window.api.invoke(
          IPC_CHANNELS.INDEXER_ADVANCED_SEARCH,
          searchParams,
        )

        this.setResults({
          [RESULT_TYPES.DISK]: diskResults || [],
          [RESULT_TYPES.APPLICATION]: [],
          [RESULT_TYPES.EMOJI]: [],
        })
      }
      catch (error) {
        console.error('Advanced search error:', error)
        this.clearResults()
      }
      finally {
        this.isLoading = false
      }
    },

    // Helper to prepare search parameters
    prepareAdvancedSearchParams() {
      const searchParams = {
        query: this.query,
        filters: {
          ...this.filters,
          dateRange: {
            from: this.filters.dateRange.from
              ? new Date(this.filters.dateRange.from).getTime()
              : null,
            to: this.filters.dateRange.to
              ? new Date(this.filters.dateRange.to).getTime()
              : null,
          },
        },
      }

      return JSON.parse(JSON.stringify(searchParams))
    },

    // Helper to set results with validation
    setResults(resultsObject) {
      Object.keys(resultsObject).forEach((key) => {
        if (this.results[key] !== undefined) {
          this.results[key] = Array.isArray(resultsObject[key])
            ? resultsObject[key]
            : []
        }
      })
    },

    refreshSearch() {
      this.search()
    },

    setQuery(query) {
      this.query = query
      this.debouncedSearch()
    },

    clearResults() {
      Object.keys(this.results).forEach((key) => {
        this.results[key] = []
      })
      this.hasSearched = false
    },

    resetFilters() {
      const defaultState = getDefaultState()
      this.filters = { ...defaultState.filters }
    },

    resetState() {
      Object.assign(this, getDefaultState())
    },

    toggleFilter(filterType, value) {
      if (filterType === 'type') {
        const index = this.filters.type.indexOf(value)
        if (index === -1) {
          this.filters.type.push(value)
        }
        else {
          this.filters.type.splice(index, 1)
        }
      }
    },

    toggleSearchMode() {
      this.searchMode = this.searchMode === SEARCH_MODES.ADVANCED
        ? SEARCH_MODES.QUICK
        : SEARCH_MODES.ADVANCED

      // Execute a search when switching modes
      if (this.hasSearched)
        this.search()
    },

    setSearchMode(mode) {
      if (Object.values(SEARCH_MODES).includes(mode)) {
        this.searchMode = mode
      }
      else {
        // For backward compatibility
        this.searchMode = mode ? SEARCH_MODES.ADVANCED : SEARCH_MODES.QUICK
      }
    },
  },
})

// Enable Hot Module Replacement
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSearchResultsStore, import.meta.hot))
}
