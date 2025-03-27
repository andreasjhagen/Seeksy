<script setup>
defineProps({
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
})
</script>

<template>
  <div class="audio-preview w-[300px]">
    <audio v-if="fileContent?.content" controls class="w-full">
      <source :src="fileContent.content" :type="mimeType">
      Your browser does not support audio playback.
    </audio>
    <div v-else class="loading-placeholder">
      {{ isLoading ? 'Loading audio...' : 'Failed to load audio' }}
    </div>
    <h3 class="mt-1 text-sm font-semibold text-center truncate dark:text-white">
      {{ fileName }}
    </h3>
  </div>
</template>
