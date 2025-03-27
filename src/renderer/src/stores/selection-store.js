import { acceptHMRUpdate, defineStore } from 'pinia'
import { useSearchResultsStore } from './search-results-store'

//This store is used to manage the selected item in the search results (contextmenu, keyboard navigation, etc.)
export const useSelectionStore = defineStore('selection', {
  state: () => ({
    selectedItem: null,
    selectedSection: null,
    sectionConfig: {
      files: {
        cols: 1,
        priority: 3,
        resultKey: 'disk',
      },
      apps: {
        cols: 3,
        priority: 1,
        resultKey: 'applications',
      },
      emoji: {
        cols: 8,
        priority: 2,
        resultKey: 'emojis',
      },
    },
  }),

  getters: {
    getSelectedItem: state => state.selectedItem,
    getSelectedSection: state => state.selectedSection,
  },
  actions: {
    setSelectedItem(item, section) {
      this.selectedItem = item
      this.selectedSection = section

      // Focus the DOM element if it exists
      const elements = document.querySelectorAll(`[tabindex]`)
      const element = Array.from(elements).find((el) => {
        const props = ['app', 'emoji', 'file']
        return props.some(prop => el.__vnode?.props?.[prop] === item)
      })
      if (element && document.activeElement !== element) {
        element.focus()
      }
    },

    clearSelection() {
      this.selectedItem = null
      this.selectedSection = null
    },

    getValidSections() {
      const searchStore = useSearchResultsStore()
      const results = searchStore.getAllResults

      // Get valid sections and sort by priority
      return Object.entries(this.sectionConfig)
        .filter(([section, config]) => {
          const items = results[config.resultKey]
          return items && items.length > 0
        })
        .sort((a, b) => a[1].priority - b[1].priority)
        .map(([section]) => section)
    },

    getItemsForSection(section) {
      const searchStore = useSearchResultsStore()
      const config = this.sectionConfig[section]
      return searchStore.getAllResults[config.resultKey]
    },

    getCurrentItems() {
      if (!this.selectedSection)
        return []
      return this.getItemsForSection(this.selectedSection)
    },

    getSectionConfig(section) {
      const sectionName = section || this.selectedSection
      return { cols: this.sectionConfig[sectionName]?.cols || 1 }
    },
  },
})

// Enable Hot Module Replacement
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSelectionStore, import.meta.hot))
}
