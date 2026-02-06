<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  emoji: {
    type: Object,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['copy', 'contextmenu'])

const { t } = useI18n()

// Use data from enriched emoji props (batch-fetched during search)
// This eliminates 2 IPC calls per emoji per render
const isFavorite = computed(() => props.emoji.isFavorite || false)
const hasNotes = computed(() => props.emoji.hasNotes || false)

// Create a unique path identifier for the emoji to use with favorite system
const emojiPath = computed(() => props.emoji.path || `emoji:/${props.emoji.char}`)

function handleContextMenu(event) {
  event.preventDefault()
  // Enhance emoji object with path for favorite/notes system
  const enhancedEmoji = {
    ...props.emoji,
    path: emojiPath.value,
    type: 'emoji',
  }
  emit('contextmenu', event, enhancedEmoji)
}
</script>

<template>
  <button
    class="relative z-10 flex items-center justify-center p-2 text-2xl transition-all duration-300 bg-white border border-gray-200 rounded-lg cursor-pointer group hover:z-20 hover:scale-105 dark:bg-gray-700 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
    :class="[
      isSelected
        ? 'bg-accent-50 border-accent-300 ring-2 ring-accent-400 dark:bg-accent-700 dark:border-accent-800'
        : '',
    ]"
    :tabindex="props.tabindex || '0'"
    :emoji="JSON.stringify(emoji)"
    :data-char="emoji.char"
    data-result-type="emoji"
    @click="$emit('copy', emoji.char)"
    @keydown.enter="$emit('copy', emoji.char)"
    @contextmenu="handleContextMenu"
  >
    <!-- Indicators -->
    <div class="absolute right-0.5 top-0.5 flex space-x-0.5">
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
        class="text-gray-400 material-symbols-outlined"
        style="font-size: 12px;"
        :title="t('tooltips.hasNotes')"
      >
        sticky_note_2
      </span>
    </div>
    <span class="text-2xl transition-transform duration-300 origin-center group-hover:scale-125" :title="emoji.name">{{ emoji.char }}</span>
  </button>
</template>
