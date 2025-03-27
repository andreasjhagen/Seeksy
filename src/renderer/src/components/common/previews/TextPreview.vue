<script setup>
defineProps({
  fileName: {
    type: String,
    required: true,
  },
  contentPreview: {
    type: String,
    default: '',
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="text-preview p-2 max-w-[450px] max-h-[300px] overflow-auto font-mono text-sm dark:text-white ">
    <h3 class="mb-1 text-sm font-semibold truncate">
      {{ fileName }}
    </h3>
    <pre class="whitespace-pre-wrap ">{{ isLoading ? 'Loading preview...' : contentPreview }}</pre>
  </div>
</template>

<style scoped>
.text-preview {
  font-family: Consolas, Monaco, 'Andale Mono', monospace;
  background-color: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.dark .text-preview {
  background-color: rgba(255, 255, 255, 0.05);
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.text-preview::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.text-preview::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.dark .text-preview::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>
