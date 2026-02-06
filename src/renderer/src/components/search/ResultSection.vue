<script setup>
import { computed, inject, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()

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
  if (props.customTitle)
    return props.customTitle
  // Use translation key if available, otherwise fall back to result type name
  const displayNameKey = resultTypeConfig.value.displayNameKey
  if (displayNameKey)
    return t(displayNameKey)
  return resultTypeConfig.value.displayName || props.resultType
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
    class="transition-colors duration-200 result-section "
    :class="{
      'opacity-70 bg-blue-50 dark:bg-blue-900/20': isDragging && props.resultType === draggedSectionType.value,
      'bg-blue-100/50 dark:bg-blue-800/30 ring-2 ring-blue-300 dark:ring-blue-700 rounded-lg p-2': isDropTarget,
    }"
    :data-section-type="resultType"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Header row: fully clickable for collapse, fully draggable for reorder -->
    <div
      class="section-header"
      :class="{ 'opacity-60': isDragging }"
      :title="collapsed ? t('tooltips.expandSection') : t('tooltips.collapseSection')"
      draggable="true"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @click="toggleCollapse"
    >
      <div class="header-content">
        <span class="drag-handle material-symbols-outlined">drag_indicator</span>
        <h3 class="section-title">
          {{ title }}
        </h3>
      </div>
      <div class="collapse-indicator" :class="{ 'is-collapsed': collapsed }">
        <span v-if="collapsed" class="text-base leading-none material-symbols-outlined">expand_more</span>
        <span v-else class="text-base leading-none material-symbols-outlined">expand_less</span>
      </div>
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

/* Section header - fully clickable and draggable */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.5rem;
  margin-bottom: 0.5rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
  user-select: none;
}

.section-header:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

:root.dark .section-header:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(107 114 128);
}

:root.dark .section-title {
  color: rgb(156 163 175);
}

.drag-handle {
  flex-shrink: 0;
  font-size: 1rem;
  opacity: 0;
  transition: opacity 0.2s ease;
  cursor: grab;
  color: rgb(156 163 175);
}

:root.dark .drag-handle {
  color: rgb(107 114 128);
}

.collapse-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  opacity: 0;
  transition: opacity 0.2s ease;
  color: rgb(75 85 99);
}

:root.dark .collapse-indicator {
  color: rgb(156 163 175);
}

/* Show drag handle and collapse toggle on hover */
.section-header:hover .drag-handle,
.section-header:hover .collapse-indicator {
  opacity: 1;
}

/* Always show collapse indicator when section is collapsed */
.collapse-indicator.is-collapsed {
  opacity: 0.7;
}

/* Keep them visible during drag operations */
.result-section.dragging .drag-handle,
.result-section.dragging .collapse-indicator {
  opacity: 1;
}
</style>
