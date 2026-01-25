<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IPC_CHANNELS } from '../../../../../../main/ipc/ipcChannels'

const props = defineProps({
  value: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['update'])

const { t } = useI18n()

// Store available displays
const displays = ref([])

// Fetch all displays on mount
onMounted(async () => {
  try {
    displays.value = await window.api.invoke(IPC_CHANNELS.GET_ALL_DISPLAYS)
  }
  catch (error) {
    console.error('Failed to get displays:', error)
    displays.value = []
  }
})

// Window display options with translation keys
const windowDisplayOptions = computed(() => {
  const options = [
    {
      value: 'cursor',
      label: t('settings.preferences.searchPositionOptions.cursor'),
      description: t('settings.preferences.searchPositionOptions.cursorDescription'),
      icon: 'mouse',
    },
  ]

  // Add individual display options
  displays.value.forEach((display, index) => {
    const displayNumber = index + 1
    const isPrimary = display.isPrimary
    const resolution = `${display.bounds.width}×${display.bounds.height}`

    options.push({
      value: String(display.id),
      label: isPrimary
        ? t('settings.preferences.searchPositionOptions.primaryDisplay', { number: displayNumber })
        : t('settings.preferences.searchPositionOptions.display', { number: displayNumber }),
      description: isPrimary
        ? t('settings.preferences.searchPositionOptions.primaryDisplayDescription', { resolution })
        : t('settings.preferences.searchPositionOptions.displayDescription', { resolution }),
      icon: isPrimary ? 'desktop_windows' : 'monitor',
      isPrimary,
    })
  })

  return options
})

function updateDisplaySetting(value) {
  emit('update', 'windowDisplay', value)
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-gray-500 dark:text-gray-400">
      {{ t('settings.preferences.searchPositionDescription') }}
    </p>

    <div class="pl-2 space-y-3">
      <div
        v-for="option in windowDisplayOptions"
        :key="option.value"
        class="flex items-start cursor-pointer group"
        @click="updateDisplaySetting(option.value)"
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
        <div class="flex items-center ml-3 text-sm">
          <span
            class="mr-2 text-gray-400 material-symbols-outlined dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"
            style="font-size: 20px;"
          >
            {{ option.icon }}
          </span>
          <div>
            <label
              :for="`window-display-${option.value}`"
              class="font-medium text-gray-700 cursor-pointer dark:text-gray-300"
            >
              {{ option.label }}
              <span
                v-if="option.isPrimary"
                class="ml-1 text-xs font-normal text-blue-500 dark:text-blue-400"
              >
                ({{ t('settings.preferences.searchPositionOptions.primary') }})
              </span>
            </label>
            <p class="text-gray-500 dark:text-gray-400">
              {{ option.description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
