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
  alt: {
    type: String,
    default: 'image preview',
  },
})
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full h-full p-4">
    <div v-if="isLoading" class="loading-placeholder">
      <span class="text-3xl text-gray-600 material-symbols-outlined animate-spin dark:text-gray-300">
        progress_activity
      </span>
      <span class="mt-2 text-sm text-gray-600 dark:text-gray-300">Loading image</span>
    </div>
    <img
      v-else-if="fileContent?.content"
      :src="fileContent.content"
      :alt="alt"
      class="max-w-[500px] max-h-[500px] object-contain"
    >
    <h3 class="mt-1 text-sm font-semibold text-center truncate dark:text-white">
      {{ fileName }}
    </h3>
  </div>
</template>
