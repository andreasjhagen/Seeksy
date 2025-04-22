<script setup>
import { computed } from 'vue'
import { useResultItemRendering } from '../../composables/useResultItemRendering'
import { useSearchResultsStore } from '../../stores/search-results-store'
import ResultSection from './ResultSection.vue'

const props = defineProps({
  resultType: {
    type: String,
    required: true,
  },
  customGridGap: {
    type: String,
    default: null,
  },
  isCollapsed: {
    type: Boolean,
    default: false,
  },
  // Add properties for virtual scrolling support
  useVirtualScrolling: {
    type: Boolean,
    default: false,
  },
  virtualItemHeight: {
    type: Number,
    default: 64,
  },
  virtualOverscan: {
    type: Number,
    default: 10,
  }
})

const emit = defineEmits([
  'contextmenu', 
  'open-file', 
  'show-in-directory', 
  'launch', 
  'copy', 
  'item-focus', 
  'toggle-collapse', 
  'section-reorder'
])

const resultsStore = useSearchResultsStore()

// Standardized function to access results from the store
const results = computed(() => {
  const resultType = resultsStore.getResultTypeByName(props.resultType)
  return resultType?.content || []
})

// Use the standardized rendering helper
const {
  isItemSelected,
  handleItemFocus,
  getTabIndex,
} = useResultItemRendering(props.resultType)

// Standardized item focus handling
function handleItemFocusEvent(item) {
  handleItemFocus(item, emit)
}

// Standardized section collapse handling
function handleSectionCollapse(sectionName, isCollapsed) {
  // Pass both parameters correctly to parent
  emit('toggle-collapse', sectionName, isCollapsed)
}

// Standardized section reordering handling
function handleSectionReorder(data) {
  emit('section-reorder', data)
}

// Expose the results for use in parent component
defineExpose({
  results
})
</script>

<template>
  <ResultSection
    :result-type="resultType"
    :custom-grid-gap="customGridGap"
    :is-collapsed="isCollapsed"
    @toggle-collapse="handleSectionCollapse"
    @section-reorder="handleSectionReorder"
  >
    <!-- Default slot for result items -->
    <slot 
      :results="results" 
      :is-item-selected="isItemSelected" 
      :handle-item-focus="handleItemFocusEvent" 
      :get-tab-index="getTabIndex" 
    />
  </ResultSection>
</template>
