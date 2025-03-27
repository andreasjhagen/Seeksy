<script setup>
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

defineEmits(['copy'])
</script>

<template>
  <button
    class="relative z-10 flex items-center justify-center p-2 text-2xl transition-all duration-300 border rounded-lg cursor-pointer group hover:z-20 hover:p-2 focus:outline-hidden" :class="[
      isSelected
        ? 'bg-accent-50 border-accent-300 ring-2 ring-accent-400 dark:bg-accent-700 dark:border-accent-800'
        : 'bg-white border-gray-200 hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600',
    ]"
    @click="$emit('copy', emoji.char)"
    @keydown.enter="$emit('copy', emoji.char)"
  >
    <span class="transition-all duration-300 group-hover:text-4xl" :title="emoji.name">{{ emoji.char }}</span>
  </button>
</template>
