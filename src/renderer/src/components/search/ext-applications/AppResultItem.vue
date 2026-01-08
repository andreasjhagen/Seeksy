<script setup>
import { computed } from 'vue'
import { IPC_CHANNELS } from '../../../../../main/ipc/ipcChannels'
import { useFileIconHandler } from '../../../composables/useFileIconHandler'

const props = defineProps({
  app: {
    type: Object,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['launch', 'context-menu'])

// Use our file icon handler composable
const { hasIconError, handleIconError } = useFileIconHandler(props.app, { autoLoad: false })

async function handleClick() {
  emit('launch', props.app)
  await window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
}

function getInitial(name) {
  return (name || '').charAt(0).toUpperCase()
}

function getDisplayPath(app) {
  if (app.metadata?.applicationType === 'appid') {
    return 'Windows Store App'
  }
  return app.path
}

// Optimize display name with computed property
const displayName = computed(() => props.app.displayName || props.app.name)

function handleContextMenu(event) {
  event.preventDefault()
  emit('context-menu', {
    event: { x: event.clientX, y: event.clientY },
    file: {
      ...props.app,
      type: 'application', // Ensure type is set correctly for the favorites system
    },
  })
}
</script>

<template>
  <div
    class="relative z-10 flex items-center p-2 transition-all duration-300 transform border rounded-lg cursor-pointer group focus:outline-hidden origin-left hover:z-20 hover:scale-105 hover:bg-gray-100 hover:border-gray-200 dark:hover:bg-gray-700/50 dark:hover:border-gray-600"
    :class="[
      isSelected
        ? 'bg-accent-50 border-accent-300 ring-2 ring-accent-400 dark:bg-accent-700 dark:border-accent-800'
        : 'border-transparent',
    ]"
    :title="`${displayName}\n${getDisplayPath(app)}`"
    :tabindex="props.tabindex || '0'"
    :app="JSON.stringify(app)"
    :data-path="app.path"
    data-result-type="application"
    @click="handleClick"
    @keydown.enter="handleClick"
    @contextmenu="handleContextMenu"
  >
    <!-- Indicators -->
    <div class="absolute flex gap-1 right-1">
      <!-- Favorite indicator -->
      <span
        v-if="app.isFavorite"
        class="text-yellow-500 material-symbols-outlined"
        style="font-size: 14px;"
        title="Favorite"
      >
        star
      </span>
      <!-- Notes indicator -->
      <span
        v-if="app.notes"
        class="text-gray-400 material-symbols-outlined"
        style="font-size: 14px;"
        title="Has Notes"
      >
        sticky_note_2
      </span>
    </div>

    <div class="w-8 h-8 mr-3 shrink-0">
      <img
        v-if="app.icon && !hasIconError"
        :src="app.icon"
        class="object-contain w-full h-full transition-transform duration-300 origin-center group-hover:scale-125"
        :alt="displayName"
        @error="handleIconError"
      >
      <div
        v-else
        class="flex items-center justify-center w-full h-full transition-transform duration-300 bg-gray-300 rounded-sm origin-center group-hover:scale-125 dark:bg-gray-700"
      >
        <span class="text-sm text-gray-600 dark:text-gray-400">{{ getInitial(app.name) }}</span>
      </div>
    </div>
    <div class="flex flex-col min-w-0">
      <span class="text-sm font-medium text-gray-900 truncate dark:text-white">
        {{ displayName }}
      </span>
      <span class="text-xs text-gray-600 truncate dark:text-gray-400" :class="isSelected ? 'text-black dark:text-white' : ''">{{
        getDisplayPath(app)
      }}</span>
    </div>
  </div>
</template>
