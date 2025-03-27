<script setup>
import { computed } from 'vue'
import { useSearchResultsStore } from '../../../stores/search-results-store'
import { useSelectionStore } from '../../../stores/selection-store'
import AppResultItem from '../items/AppResultItem.vue'
import ResultSection from '../ResultSection.vue'

const emit = defineEmits(['contextmenu', 'launch', 'item-focus'])
const resultsStore = useSearchResultsStore()
const appResults = computed(() => resultsStore.applicationResults)
const selectionStore = useSelectionStore()

function handleItemFocus(app) {
  emit('item-focus', app, 'apps')
}
</script>

<template>
  <ResultSection title="Applications" grid-cols="grid-cols-3">
    <AppResultItem
      v-for="(app, index) in appResults"
      :key="app.path"
      :app="app"
      :is-selected="selectionStore.selectedItem === app && selectionStore.selectedSection === 'apps'"
      :tabindex="index + 1"
      @focus="() => handleItemFocus(app)"
      @launch="$emit('launch', $event)"
      @contextmenu="(e) => $emit('contextmenu', e, app)"
    />
  </ResultSection>
</template>
