<script setup>
import { useVirtualizer } from '@tanstack/vue-virtual'
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
const scrollElementRef = ref(null)

// Get disk results from the base component
const diskResults = computed(() => {
  return baseComponentRef.value?.results || []
})

// Configure TanStack Virtual for better performance with large result sets
const virtualizer = useVirtualizer({
  get count() {
    return diskResults.value.length
  },
  getScrollElement: () => scrollElementRef.value,
  estimateSize: () => 68, // Height of item (64) + gap (4)
  overscan: 10,
})

function handleItemFocusEvent(item) {
  emit('item-focus', item, props.resultType)
}

function handleContextMenu(event, item) {
  emit('contextmenu', event, item)
}

defineExpose({ scrollElementRef })
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
        ref="scrollElementRef"
        data-virtual-list
        class="max-h-[40vh] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-500 dark:hover:scrollbar-thumb-gray-500"
      >
        <div
          class="relative px-2"
          :style="{
            height: `${virtualizer.getTotalSize()}px`,
          }"
        >
          <div
            v-for="virtualRow in virtualizer.getVirtualItems()"
            :key="virtualRow.key"
            class="absolute top-0 left-0 w-full px-1"
            :style="{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }"
          >
            <DiskResultItem
              :id="`result-item-${diskResults[virtualRow.index].path}`"
              :file="diskResults[virtualRow.index]"
              :is-selected="isItemSelected(diskResults[virtualRow.index])"
              :tabindex="getTabIndex(virtualRow.index)"
              @focus="() => handleItemFocusEvent(diskResults[virtualRow.index])"
              @open-file="$emit('open-file', $event)"
              @show-in-directory="$emit('show-in-directory', $event)"
              @contextmenu="(e) => handleContextMenu(e, diskResults[virtualRow.index])"
            />
          </div>
        </div>
      </div>
    </template>
  </BaseResultComponent>
</template>
