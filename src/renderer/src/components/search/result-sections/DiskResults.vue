<script setup>
import { useVirtualList } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useSearchResultsStore } from '../../../stores/search-results-store'
import { useSelectionStore } from '../../../stores/selection-store'
import DiskResultItem from '../items/DiskResultItem.vue'
import ResultSection from '../ResultSection.vue'

const emit = defineEmits(['contextmenu', 'open-file', 'show-in-directory', 'item-focus'])
const resultsStore = useSearchResultsStore()
const diskResults = computed(() => resultsStore.diskResults)
const selectionStore = useSelectionStore()
const virtualListRef = ref(null)

const { list, containerProps, wrapperProps } = useVirtualList(diskResults, {
  itemHeight: 64,
  overscan: 10,
})

function handleItemFocus(item) {
  emit('item-focus', item, 'files')
}

defineExpose({ virtualListRef })
</script>

<template>
  <ResultSection title="Files & Folders">
    <div
      ref="virtualListRef"
      v-bind="containerProps"
      data-virtual-list
      class="max-h-[40vh] scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-500 dark:hover:scrollbar-thumb-gray-500"
    >
      <div v-bind="wrapperProps" class="flex flex-col gap-2 hover:mb-4">
        <DiskResultItem
          v-for="{ index, data: item } in list"
          :id="`result-item-${item.path}`"
          :key="`${index}-${item.path}`"
          :file="item"
          :is-selected="selectionStore.selectedItem === item && selectionStore.selectedSection === 'files'"
          :tabindex="index + 1"
          @focus="() => handleItemFocus(item)"
          @open-file="$emit('open-file', $event)"
          @show-in-directory="$emit('show-in-directory', $event)"
          @contextmenu="(e) => $emit('contextmenu', e, item)"
        />
      </div>
    </div>
  </ResultSection>
</template>
