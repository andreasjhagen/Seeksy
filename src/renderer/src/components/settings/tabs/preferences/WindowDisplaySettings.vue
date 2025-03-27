<script setup>
const props = defineProps({
  value: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['update'])

// Window display options
const windowDisplayOptions = [
  { value: 'cursor', label: 'Where mouse cursor is', description: 'Show on the display where your mouse cursor is located' },
  { value: 'primary', label: 'Primary display', description: 'Always show on your main display' },
]

function updateDisplaySetting(value) {
  emit('update', 'windowDisplay', value)
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-gray-500 dark:text-gray-400">
      Choose where the search window appears when activated
    </p>

    <div class="pl-2 space-y-3">
      <div
        v-for="option in windowDisplayOptions"
        :key="option.value"
        class="flex items-start cursor-pointer"
      >
        <div class="flex items-center h-5">
          <input
            :id="`window-display-${option.value}`"
            name="window-display"
            type="radio"
            :checked="value === option.value"
            class="w-4 h-4 text-blue-600 border-gray-300 cursor-pointer focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            @change="updateDisplaySetting(option.value)"
          >
        </div>
        <div class="ml-3 text-sm">
          <label
            :for="`window-display-${option.value}`"
            class="font-medium text-gray-700 dark:text-gray-300"
          >
            {{ option.label }}
          </label>
          <p class="text-gray-500 dark:text-gray-400">
            {{ option.description }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
