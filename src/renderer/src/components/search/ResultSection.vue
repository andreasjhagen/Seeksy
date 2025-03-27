<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  gridCols: {
    type: String,
    default: 'grid-cols-1',
  },
})
</script>

<template>
  <div class="space-y-2">
    <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">
      {{ title }}
    </h3>
    <div class="grid gap-2 pb-3" :class="[gridCols]">
      <slot />
    </div>
  </div>
</template>
