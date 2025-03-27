<script setup>
defineProps({
  fileName: {
    type: String,
    required: true,
  },
  fileType: {
    type: String,
    required: true,
  },
  fileIcon: {
    type: String,
    default: '',
  },
  fileSize: {
    type: String,
    default: '',
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  onOpenClick: {
    type: Function,
    default: () => {},
  },
})
</script>

<template>
  <div class="document-preview p-4 max-w-[450px] max-h-[300px] overflow-auto dark:text-white">
    <div v-if="isLoading" class="flex items-center justify-center h-32">
      <div class="loading-spinner" />
    </div>
    <div v-else class="flex flex-col items-center text-center">
      <div class="mb-3 document-icon">
        <img v-if="fileIcon" :src="fileIcon" class="w-16 h-16" alt="Document icon">
        <div v-else class="flex items-center justify-center w-16 h-16 bg-gray-200 rounded dark:bg-gray-700">
          <span class="text-lg uppercase">{{ fileType }}</span>
        </div>
      </div>

      <h3 class="mb-1 font-semibold truncate text-md">
        {{ fileName }}
      </h3>

      <p class="mb-3 text-sm text-gray-600 dark:text-gray-300">
        {{ fileType.toUpperCase() }} Document {{ fileSize ? `(${fileSize})` : '' }}
      </p>

      <button
        class="px-4 py-2 mt-2 text-white transition-colors rounded cursor-pointer bg-accent hover:bg-accent-700"
        @click="onOpenClick"
      >
        Open Document
      </button>
    </div>
  </div>
</template>

<style scoped>
.document-preview {
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.03);
}

.dark .document-preview {
  background-color: rgba(255, 255, 255, 0.05);
}

.loading-spinner {
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-top: 3px solid #3498db;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
}

.dark .loading-spinner {
  border-color: rgba(255, 255, 255, 0.1);
  border-top-color: #3498db;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
