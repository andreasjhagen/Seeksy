<script setup>
import { useVirtualList } from '@vueuse/core'
import { computed, ref } from 'vue'
import BaseResultComponent from '../BaseResultComponent.vue'
import DiskResultItem from './DiskResultItem.vue'

const props = defineProps({
  resultType: {
    type: String,
    required: true,
  },
  isCollapsed: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['contextmenu', 'open-file', 'show-in-directory', 'item-focus', 'toggle-collapse', 'section-reorder'])
const baseComponentRef = ref(null)
const virtualListRef = ref(null)

// Get disk results from the base component
const diskResults = computed(() => {
  return baseComponentRef.value?.results || []
})

// Configure virtual list for better performance with large result sets
const { list, containerProps, wrapperProps } = useVirtualList(diskResults, {
  itemHeight: 64, // Base height of item
  overscan: 10, // Number of items to render outside of viewport
})

function handleItemFocusEvent(item) {
  emit('item-focus', item, props.resultType)
}

function handleContextMenu(event, item) {
  emit('contextmenu', event, item)
}

defineExpose({ virtualListRef })
</script>

<template>
  <BaseResultComponent
    ref="baseComponentRef"
    :result-type="resultType"
    :is-collapsed="isCollapsed"
    @toggle-collapse="(sectionName, isCollapsed) => $emit('toggle-collapse', sectionName, isCollapsed)"
    @section-reorder="$emit('section-reorder', $event)"
  >
    <template #default="{ isItemSelected, getTabIndex }">
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
            :is-selected="isItemSelected(item)"
            :tabindex="getTabIndex(index)"
            @focus="() => handleItemFocusEvent(item)"
            @open-file="$emit('open-file', $event)"
            @show-in-directory="$emit('show-in-directory', $event)"
            @contextmenu="(e) => handleContextMenu(e, item)"
          />
        </div>
      </div>
    </template>
  </BaseResultComponent>
</template>
