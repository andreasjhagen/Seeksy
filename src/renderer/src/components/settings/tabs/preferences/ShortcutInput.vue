<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  value: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['update', 'reset'])

const { t } = useI18n()

const KEY_MAPPINGS = {
  ' ': 'Space',
  'Control': 'Ctrl',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'ArrowLeft': '←',
  'ArrowRight': '→',
}

const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift', 'Command']

const formattedValue = computed(() => {
  if (!props.value)
    return ''
  return props.value
    .split('+')
    .map(key => KEY_MAPPINGS[key] || key)
    .join(' + ')
})

function handleKeyDown(e) {
  const keys = []
  if (e.ctrlKey)
    keys.push('Control')
  if (e.metaKey)
    keys.push('Command')
  if (e.altKey)
    keys.push('Alt')
  if (e.shiftKey)
    keys.push('Shift')

  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
  if (!MODIFIER_KEYS.includes(key))
    keys.push(key)

  if (keys.length > 0) {
    emit('update', e)
  }
}
</script>

<template>
  <div class="flex items-center space-x-2">
    <input
      type="text"
      :value="formattedValue"
      class="px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
      :placeholder="t('settings.preferences.searchShortcutPlaceholder')"
      @keydown.prevent="handleKeyDown"
    >
    <button
      class="px-3 py-2 text-sm text-gray-600 border rounded-md hover:bg-gray-100 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
      @click="$emit('reset')"
    >
      {{ t('common.reset') }}
    </button>
  </div>
</template>
