<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  value: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['update', 'reset'])

const { t } = useI18n()
const isRecording = ref(false)
const inputRef = ref(null)

const KEY_DISPLAY = {
  ' ': 'Space',
  'Space': 'Space',
  'Control': 'Ctrl',
  'CommandOrControl': navigator.platform.includes('Mac') ? '⌘' : 'Ctrl',
  'Command': '⌘',
  'Meta': '⌘',
  'Alt': navigator.platform.includes('Mac') ? '⌥' : 'Alt',
  'Shift': navigator.platform.includes('Mac') ? '⇧' : 'Shift',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  'Escape': 'Esc',
  'Backspace': '⌫',
  'Delete': 'Del',
  'Enter': '↵',
  'Tab': '⇥',
}

const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift', 'Command']

const parsedKeys = computed(() => {
  if (!props.value)
    return []
  return props.value.split('+').map(key => ({
    raw: key,
    display: KEY_DISPLAY[key] || key,
    isModifier: MODIFIER_KEYS.includes(key) || key === 'CommandOrControl',
  }))
})

function handleKeyDown(e) {
  e.preventDefault()

  // Allow Escape to cancel recording
  if (e.key === 'Escape') {
    stopRecording()
    inputRef.value?.blur()
    return
  }

  const modifiers = []
  if (e.ctrlKey)
    modifiers.push('Control')
  if (e.metaKey)
    modifiers.push('Command')
  if (e.altKey)
    modifiers.push('Alt')
  if (e.shiftKey)
    modifiers.push('Shift')

  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key

  // Only accept shortcuts with at least one modifier + one non-modifier key
  const hasNonModifierKey = !MODIFIER_KEYS.includes(key)
  const hasModifier = modifiers.length > 0

  if (hasModifier && hasNonModifierKey) {
    emit('update', e)
    // Stop recording and blur after successful capture
    stopRecording()
    inputRef.value?.blur()
  }
}

function startRecording() {
  isRecording.value = true
  inputRef.value?.focus()
}

function stopRecording() {
  isRecording.value = false
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Visual Key Display -->
    <div
      ref="inputRef"
      tabindex="0"
      class="shortcut-recorder"
      :class="{ recording: isRecording }"
      @click="startRecording"
      @focus="startRecording"
      @blur="stopRecording"
      @keydown="handleKeyDown"
    >
      <template v-if="parsedKeys.length && !isRecording">
        <span
          v-for="(key, index) in parsedKeys"
          :key="key.raw"
          class="flex items-center"
        >
          <kbd
            class="key-badge"
            :class="{ 'key-modifier': key.isModifier }"
          >
            {{ key.display }}
          </kbd>
          <span v-if="index < parsedKeys.length - 1" class="key-separator">+</span>
        </span>
      </template>
      <span v-else-if="isRecording" class="recording-hint">
        <span class="recording-dot" />
        {{ t('settings.preferences.pressKeys') }}
      </span>
      <span v-else class="placeholder-text">
        {{ t('settings.preferences.searchShortcutPlaceholder') }}
      </span>
    </div>

    <!-- Reset Button -->
    <button
      class="reset-btn"
      :title="t('common.reset')"
      @click="$emit('reset')"
    >
      <span class="reset-icon material-symbols-outlined">restart_alt</span>
    </button>
  </div>
</template>

<style scoped>
.shortcut-recorder {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  min-width: 160px;
  min-height: 42px;
  background-color: rgb(249 250 251);
  border: 1px solid rgb(229 231 235);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

:root.dark .shortcut-recorder {
  background-color: rgba(31, 41, 55, 0.5);
  border-color: rgb(75 85 99);
}

.shortcut-recorder:hover:not(.recording) {
  border-color: rgb(209 213 219);
  background-color: rgb(243 244 246);
}

:root.dark .shortcut-recorder:hover:not(.recording) {
  border-color: rgb(107 114 128);
  background-color: rgba(55, 65, 81, 0.5);
}

.shortcut-recorder:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--accent-color-rgb, 59 130 246), 0.5);
  border-color: var(--accent-color-500, rgb(59 130 246));
}

.shortcut-recorder.recording {
  border-color: var(--accent-color-500, rgb(59 130 246));
  background-color: var(--accent-color-50, rgb(239 246 255));
  box-shadow: 0 0 0 2px rgba(var(--accent-color-rgb, 59 130 246), 0.3);
}

:root.dark .shortcut-recorder.recording {
  background-color: rgba(var(--accent-color-rgb, 59 130 246), 0.2);
}

.key-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.5rem;
  min-width: 28px;
  font-size: 0.75rem;
  font-weight: 500;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  background-color: white;
  color: rgb(55 65 81);
  border: 1px solid rgb(209 213 219);
  border-radius: 0.375rem;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

:root.dark .key-badge {
  background-color: rgb(55 65 81);
  color: rgb(229 231 235);
  border-color: rgb(107 114 128);
}

.key-modifier {
  background-color: rgb(243 244 246);
  color: rgb(75 85 99);
}

:root.dark .key-modifier {
  background-color: rgb(75 85 99);
  color: rgb(209 213 219);
}

.recording-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--accent-color-600, rgb(37 99 235));
}

:root.dark .recording-hint {
  color: var(--accent-color-400, rgb(96 165 250));
}

.recording-dot {
  width: 0.5rem;
  height: 0.5rem;
  background-color: rgb(239 68 68);
  border-radius: 9999px;
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.placeholder-text {
  color: rgb(156 163 175);
}

:root.dark .placeholder-text {
  color: rgb(107 114 128);
}

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0.5rem;
  color: rgb(107 114 128);
  background-color: rgb(249 250 251);
  border: 1px solid rgb(229 231 235);
  border-radius: 0.5rem;
  transition: all 0.2s;
  cursor: pointer;
}

:root.dark .reset-btn {
  color: rgb(156 163 175);
  background-color: rgba(31, 41, 55, 0.5);
  border-color: rgb(75 85 99);
}

.reset-btn:hover {
  background-color: rgb(243 244 246);
  color: rgb(55 65 81);
  border-color: rgb(209 213 219);
}

:root.dark .reset-btn:hover {
  background-color: rgb(55 65 81);
  color: rgb(229 231 235);
  border-color: rgb(107 114 128);
}

.reset-btn:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--accent-color-rgb, 59 130 246), 0.5);
}

.reset-icon {
  font-size: 1rem;
}
</style>
