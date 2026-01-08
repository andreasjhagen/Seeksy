<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { IPC_CHANNELS } from '../../../../../main/ipc/ipcChannels'

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
const isFavorite = ref(false)
const hasNotes = ref(false)

// Create a unique path identifier for the emoji to use with favorite system
const emojiPath = computed(() => `emoji:/${props.emoji.char}`)

// Check statuses when emoji changes
watch(() => props.emoji, async () => {
  await checkFavoriteStatus()
  await checkNotesStatus()
}, { immediate: true })

// Check favorite status on mount
onMounted(async () => {
  await checkFavoriteStatus()
  await checkNotesStatus()
})

async function checkFavoriteStatus() {
  try {
    const response = await window.api.invoke(
      IPC_CHANNELS.FAVORITES_CHECK,
      emojiPath.value,
    )
    isFavorite.value = response.isFavorite || false
  }
  catch (error) {
    console.error('Failed to check favorite status:', error)
  }
}

async function checkNotesStatus() {
  try {
    const response = await window.api.invoke(
      IPC_CHANNELS.NOTES_GET,
      emojiPath.value,
    )
    hasNotes.value = !!response?.notes
  }
  catch (error) {
    console.error('Failed to check notes status:', error)
  }
}

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
    class="relative z-10 flex items-center justify-center p-2 text-2xl transition-all duration-300 bg-white border border-gray-200 rounded-lg cursor-pointer group hover:z-20 hover:scale-110 dark:bg-gray-700 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
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
        title="Favorite"
      >
        star
      </span>
      <span
        v-if="hasNotes"
        class="text-gray-400 material-symbols-outlined"
        style="font-size: 12px;"
        title="Has Notes"
      >
        sticky_note_2
      </span>
    </div>
    <span class="text-2xl transition-transform duration-300 origin-center group-hover:scale-150" :title="emoji.name">{{ emoji.char }}</span>
  </button>
</template>
