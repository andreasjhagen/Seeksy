import { acceptHMRUpdate, defineStore } from 'pinia'
import { useSearchResultsStore } from './search-results-store'

// This store is used to manage the selected item in the search results (contextmenu, keyboard navigation, etc.)
export const useSelectionStore = defineStore('selection', {
  state: () => ({
    selectedItem: null,
    selectedSection: null,
  }),

  getters: {
    getSelectedItem: state => state.selectedItem,
    getSelectedSection: state => state.selectedSection,

    getSectionConfig: state => (section) => {
      if (!section && !state.selectedSection)
        return { cols: 1 }

      const sectionName = section || state.selectedSection
      const searchStore = useSearchResultsStore()
      const resultType = searchStore.resultGroups.find(r => r.name === sectionName)
      return {
        cols: resultType?.gridCols || 1,
        priority: resultType?.priority || 999,
      }
    },
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

      // Get valid sections with content and sort by priority
      return searchStore.resultGroups
        .filter(resultType => resultType.content.length > 0)
        .sort((a, b) => a.priority - b.priority)
        .map(resultType => resultType.name)
    },

    getItemsForSection(section) {
      if (!section)
        return []

      const searchStore = useSearchResultsStore()
      const resultType = searchStore.resultGroups.find(r => r.name === section)
      return resultType?.content || []
    },

    getCurrentItems() {
      if (!this.selectedSection)
        return []
      return this.getItemsForSection(this.selectedSection)
    },
  },
})

// Enable Hot Module Replacement
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSelectionStore, import.meta.hot))
}
