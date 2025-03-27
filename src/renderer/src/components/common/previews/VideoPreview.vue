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
  <div class="flex flex-col items-center justify-center video-preview">
    <video
      v-if="fileContent?.content"
      controls
      class="max-w-[600px] max-h-[450px]"
    >
      <source :src="fileContent.content" :type="mimeType">
      Your browser does not support video playback.
    </video>
    <div v-else class="flex flex-col items-center justify-center py-4 loading-placeholder">
      <template v-if="isLoading">
        <span class="text-3xl text-gray-600 material-symbols-outlined animate-spin dark:text-gray-300">
          progress_activity
        </span>
        <span class="mt-2 text-sm text-gray-600 dark:text-gray-300">Loading video</span>
      </template>
      <span v-else>Failed to load video</span>
    </div>
    <h3 class="mt-1 text-sm font-semibold text-center truncate dark:text-white">
      {{ fileName }}
    </h3>
  </div>
</template>
