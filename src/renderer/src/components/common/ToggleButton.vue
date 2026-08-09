<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  value: {
    type: Boolean,
    required: true,
  },
})

defineEmits(['toggle'])
</script>

<template>
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-gray-900 dark:text-gray-100">
        {{ title }}
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ description }}
      </p>
    </div>
    <button
      type="button"
      role="switch"
      class="relative inline-flex items-center h-6 rounded-full cursor-pointer w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      :class="value ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-400'"
      :aria-checked="value"
      :aria-label="title"
      @click="$emit('toggle')"
    >
      <span
        class="inline-block w-4 h-4 transition transform bg-white rounded-full"
        :class="value ? 'translate-x-6' : 'translate-x-1'"
      />
    </button>
  </div>
</template>
