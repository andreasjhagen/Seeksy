<script setup>
import { computed, inject, provide, ref } from 'vue'
import { useSearchResultsStore } from '../../stores/search-results-store'

const props = defineProps({
  resultType: {
    type: String,
    required: true,
  },
  customTitle: {
    type: String,
    default: null,
  },
  customGridCols: {
    type: String,
    default: null,
  },
  customGridRows: {
    type: String,
    default: null,
  },
  customGridGap: {
    type: String,
    default: null,
  },
  // Allow controlling collapsed state from parent
  isCollapsed: {
    type: Boolean,
    default: null,
  },
})

const emit = defineEmits(['toggleCollapse', 'sectionReorder'])

const searchStore = useSearchResultsStore()
const isDragging = ref(false)
const isDropTarget = ref(false)
const sectionRef = ref(null)

// Use Vue's provide/inject to share drag state across all instances
const draggedSectionType = inject('draggedSectionType', { value: ref(null) })

// Also provide it so child components can access if needed
provide('draggedSectionType', draggedSectionType)

// Internal collapsed state (if not controlled by parent)
const internalCollapsed = ref(false)

// Determine if section is collapsed based on props or internal state
const collapsed = computed({
  get: () => props.isCollapsed !== null ? props.isCollapsed : internalCollapsed.value,
  set: (value) => {
    if (props.isCollapsed !== null) {
      // If parent controls collapse state, emit event
      emit('toggleCollapse', props.resultType, value)
    }
    else {
      // Otherwise manage internally
      internalCollapsed.value = value
    }
  },
})

const resultTypeConfig = computed(() => {
  return searchStore.resultGroups.find(r => r.name === props.resultType) || {}
})

const title = computed(() => {
  return props.customTitle || resultTypeConfig.value.displayName || props.resultType
})

const gridCols = computed(() => {
  if (props.customGridCols)
    return props.customGridCols

  const cols = resultTypeConfig.value.gridCols || 1

  // Map numeric grid columns to tailwind classes
  if (typeof cols === 'number') {
    return `grid-cols-${cols}`
  }

  return cols
})

const gridRows = computed(() => {
  if (props.customGridRows)
    return props.customGridRows

  const rows = resultTypeConfig.value.gridRows || 'auto'

  // Map numeric grid rows to tailwind classes
  if (typeof rows === 'number') {
    return `grid-rows-${rows}`
  }

  return rows
})

const gridGap = computed(() => {
  if (props.customGridGap)
    return props.customGridGap

  const gap = resultTypeConfig.value.gridGap || '2'

  // Map numeric grid gap to tailwind classes
  if (typeof gap === 'number') {
    return `gap-${gap}`
  }

  return `gap-${gap}`
})

// Toggle collapsed state
function toggleCollapse() {
  // Simply invert the current state
  collapsed.value = !collapsed.value
}

// Drag and drop functionality - optimized with better performance considerations
function onDragStart(event) {
  isDragging.value = true
  draggedSectionType.value = props.resultType

  // Use modern drag and drop API with better performance
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', props.resultType)

  // Use requestAnimationFrame for smoother visual updates during drag
  requestAnimationFrame(() => {
    sectionRef.value?.classList.add('dragging')
  })
}

function onDragEnd() {
  isDragging.value = false
  isDropTarget.value = false
  draggedSectionType.value = null

  // Clean up any lingering classes
  sectionRef.value?.classList.remove('dragging')
}

function onDragOver(event) {
  // This is critical - without it, the drop event won't fire
  event.preventDefault()

  // Only process this event if we have something being dragged
  if (!draggedSectionType.value)
    return

  // Set the drop effect
  event.dataTransfer.dropEffect = 'move'

  // Only highlight as drop target if we're dragging a different section
  // Use throttling to improve performance during rapid mouse movements
  if (draggedSectionType.value !== props.resultType && !isDropTarget.value) {
    isDropTarget.value = true
  }
}

function onDragLeave() {
  isDropTarget.value = false
}

function onDrop(event) {
  event.preventDefault()
  isDropTarget.value = false

  // Get the dragged section type
  const fromSection = draggedSectionType.value

  // Reset the dragged section type
  draggedSectionType.value = null

  // Don't do anything if dropping onto the same section
  if (!fromSection || fromSection === props.resultType)
    return

  // Emit event to reorder sections
  emit('sectionReorder', {
    from: fromSection,
    to: props.resultType,
  })
}
</script>

<template>
  <div
    ref="sectionRef"
    class="space-y-2 transition-colors duration-200 result-section"
    :class="{
      'opacity-70 bg-blue-50 dark:bg-blue-900/20': isDragging && props.resultType === draggedSectionType.value,
      'bg-blue-100/50 dark:bg-blue-800/30 ring-2 ring-blue-300 dark:ring-blue-700 rounded-lg p-2': isDropTarget,
    }"
    :data-section-type="resultType"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="flex items-center justify-between section-header">
      <h3
        class="flex items-center gap-1 text-sm font-medium text-gray-500 cursor-move dark:text-gray-400"
        :class="{ 'opacity-60': isDragging }"
      >
        <span class="flex-shrink-0 text-base transition-opacity duration-200 opacity-0 drag-handle material-symbols-outlined">drag_indicator</span>
        {{ title }}
      </h3>
      <button
        class="flex items-center justify-center w-6 h-6 p-1 text-gray-600 transition-colors transition-opacity duration-200 opacity-0 cursor-pointer collapse-toggle hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
        :class="{ 'opacity-100': collapsed }"
        :title="collapsed ? 'Expand section' : 'Collapse section'"
        @click="toggleCollapse"
      >
        <span v-if="collapsed" class="text-base leading-none material-symbols-outlined">expand_more</span>
        <span v-else class="text-base leading-none material-symbols-outlined">expand_less</span>
      </button>
    </div>

    <div v-if="!collapsed" class="grid" :class="[gridCols, gridRows, gridGap]">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,
    'wght' 300,
    'GRAD' 0,
    'opsz' 24;
}

/* Smooth animations for drop target highlighting */
.ring-2 {
  transition: all 0.2s ease-in-out;
}

/* Show drag handle and collapse toggle only on section hover */
.result-section:hover .section-header .drag-handle,
.result-section:hover .section-header .collapse-toggle {
  opacity: 1;
}

/* Keep them visible during drag operations */
.result-section.dragging .drag-handle,
.result-section.dragging .collapse-toggle {
  opacity: 1;
}
</style>
