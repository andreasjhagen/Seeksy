<script setup>
/**
 * BaseResultItem - Shared base component for all result item types
 *
 * Provides consistent:
 * - Selection ring styling
 * - Favorite/notes indicator badges
 * - Context menu event handling
 * - Hover animations (standardized to scale-105)
 * - Keyboard accessibility
 *
 * Usage:
 * <BaseResultItem
 *   :is-selected="isSelected"
 *   :is-favorite="item.isFavorite"
 *   :has-notes="item.hasNotes"
 *   @action="handleAction"
 *   @contextmenu="handleContextMenu"
 * >
 *   <template #icon>...</template>
 *   <template #content>...</template>
 * </BaseResultItem>
 */
import { useI18n } from 'vue-i18n'

const {
  isSelected,
  isFavorite,
  hasNotes,
  title,
  dataItemId,
  dataResultType,
  variant,
  tabindex,
} = defineProps({
  // Selection state
  isSelected: {
    type: Boolean,
    default: false,
  },
  // Metadata indicators
  isFavorite: {
    type: Boolean,
    default: false,
  },
  hasNotes: {
    type: Boolean,
    default: false,
  },
  // Title/tooltip text
  title: {
    type: String,
    default: '',
  },
  // Data attributes for keyboard navigation
  dataItemId: {
    type: String,
    default: '',
  },
  dataResultType: {
    type: String,
    default: '',
  },
  // Variant for different layouts
  variant: {
    type: String,
    default: 'default', // 'default' | 'compact' | 'grid'
    validator: v => ['default', 'compact', 'grid'].includes(v),
  },
  // Tab index for keyboard navigation
  tabindex: {
    type: [String, Number],
    default: '0',
  },
})

const emit = defineEmits(['action', 'contextmenu', 'focus'])

const { t } = useI18n()

function handleClick(event) {
  emit('action', event)
}

function handleContextMenu(event) {
  event.preventDefault()
  emit('contextmenu', event)
}

function handleKeydown(event) {
  if (event.key === 'Enter') {
    emit('action', event)
  }
}

function handleFocus() {
  emit('focus')
}

// Variant-specific classes
const variantClasses = {
  default: 'p-2 flex items-center gap-3',
  compact: 'p-1.5 flex flex-col items-center justify-center',
  grid: 'p-2 flex flex-col items-center justify-center text-center',
}
</script>

<template>
  <div
    :title="title"
    class="relative z-10 transition-all duration-300 border rounded-lg cursor-pointer group origin-left focus:outline-hidden
           hover:z-20 hover:scale-105 hover:shadow-md
           bg-gray-50 dark:bg-gray-700 border-transparent
           hover:bg-gray-100 dark:hover:bg-gray-700/80"
    :class="[
      variantClasses[variant],
      isSelected
        ? 'bg-accent-50 border-accent-300 ring-2 ring-accent-400 dark:bg-accent-700 dark:border-accent-800'
        : 'border-transparent',
    ]"
    :tabindex="tabindex"
    :data-item-id="dataItemId"
    :data-result-type="dataResultType"
    @click="handleClick"
    @keydown="handleKeydown"
    @contextmenu="handleContextMenu"
    @focus="handleFocus"
  >
    <!-- Metadata indicators (favorite/notes badges) -->
    <div
      v-if="isFavorite || hasNotes"
      class="absolute right-1 top-1 flex gap-0.5 z-10"
    >
      <span
        v-if="isFavorite"
        class="text-yellow-500 material-symbols-outlined"
        style="font-size: 12px;"
        :title="t('tooltips.favorite')"
      >
        star
      </span>
      <span
        v-if="hasNotes"
        class="text-gray-400 dark:text-gray-500 material-symbols-outlined"
        style="font-size: 12px;"
        :title="t('tooltips.hasNotes')"
      >
        sticky_note_2
      </span>
    </div>

    <!-- Icon slot -->
    <div class="shrink-0">
      <slot name="icon" />
    </div>

    <!-- Content slot -->
    <div class="flex-1 min-w-0">
      <slot name="content" />
    </div>

    <!-- Actions slot (optional hover actions) -->
    <div
      v-if="$slots.actions"
      class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
