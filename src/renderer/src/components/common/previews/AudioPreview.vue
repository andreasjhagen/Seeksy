<script setup>
import { computed } from 'vue'

const props = defineProps({
  fileName: {
    type: String,
    required: true,
  },
  fileContent: {
    type: Object,
    default: () => ({}),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  mimeType: {
    type: String,
    default: '',
  },
  coverArt: {
    type: String,
    default: '',
  },
})

// Check if cover art is available (either from props or fileContent)
const hasCoverArt = computed(() => {
  return props.coverArt || props.fileContent?.coverArt
})

const coverArtSrc = computed(() => {
  return props.coverArt || props.fileContent?.coverArt || ''
})
</script>

<template>
  <div class="audio-preview w-[300px] flex flex-col items-center">
    <!-- Cover Art or Fallback Icon -->
    <div class="flex items-center justify-center w-48 h-48 mb-4 overflow-hidden bg-gray-200 rounded-lg dark:bg-gray-700">
      <img
        v-if="hasCoverArt"
        :src="coverArtSrc"
        alt="Album cover"
        class="object-contain w-full h-full"
      >
      <span
        v-else
        class="text-6xl text-gray-400 material-symbols-outlined dark:text-gray-500"
      >
        music_note
      </span>
    </div>

    <!-- Audio Player -->
    <audio v-if="fileContent?.content" controls class="w-full">
      <source :src="fileContent.content" :type="mimeType">
      Your browser does not support audio playback.
    </audio>
    <div v-else class="loading-placeholder">
      {{ isLoading ? 'Loading audio...' : 'Failed to load audio' }}
    </div>
    <h3 class="mt-2 text-sm font-semibold text-center truncate dark:text-white">
      {{ fileName }}
    </h3>
  </div>
</template>
