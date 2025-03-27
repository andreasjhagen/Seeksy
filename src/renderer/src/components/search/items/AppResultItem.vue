<script setup>
import { ref } from 'vue'
import { IPC_CHANNELS } from '../../../../../main/ipc/ipcChannels'

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

const hasIconError = ref(false)

async function handleClick() {
  emit('launch', props.app)
  await window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
}

function handleIconError(event) {
  // Remove the broken icon
  event.target.src = ''
  hasIconError.value = true
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

function handleContextMenu(event) {
  event.preventDefault()
  emit('context-menu', {
    event: { x: event.clientX, y: event.clientY },
    file: props.app,
  })
}
</script>

<template>
  <div
    class="relative z-10 flex items-center p-1 transition-all duration-300 transform border rounded-lg cursor-pointer group focus:outline-hidden hover:p-2 hover:z-20" :class="[
      isSelected
        ? 'bg-accent-50 border-accent-300 ring-2 ring-accent-400 dark:bg-accent-700 dark:border-accent-800 '
        : 'border-transparent hover:bg-gray-100 hover:border-gray-200 dark:hover:bg-gray-700/50 dark:hover:border-gray-600',
    ]"
    :title="`${app.metadata?.displayName || app.name}\n${getDisplayPath(app)}`"
    @click="handleClick"
    @keydown.enter="handleClick"
    @contextmenu="handleContextMenu"
  >
    <!-- Favorite indicator -->
    <span
      v-if="app.isFavorite"
      class="absolute text-yellow-500 top-1 right-1 material-symbols-outlined"
      style="font-size: 14px;"
    >
      star
    </span>
    <div class="w-6 h-6 mr-3 transition-all duration-300 shrink-0 group-hover:w-8 group-hover:h-8">
      <img
        v-if="app.icon && !hasIconError"
        :src="app.icon"
        class="object-contain w-full h-full transition-transform duration-300"
        :alt="app.displayName || app.name"
        @error="handleIconError"
      >
      <div
        v-else
        class="flex items-center justify-center w-full h-full transition-all duration-300 bg-gray-300 rounded-sm dark:bg-gray-700 group-hover:text-lg"
      >
        <span class="text-xs text-gray-600 transition-all duration-300 dark:text-gray-400 group-hover:text-sm">{{ getInitial(app.name) }}</span>
      </div>
    </div>
    <div class="flex flex-col min-w-0">
      <span class="text-sm font-medium text-gray-900 truncate transition-all duration-300 dark:text-white group-hover:text-base">
        {{ app.displayName || app.name }}
      </span>
      <span class="text-xs text-gray-600 truncate dark:text-gray-400" :class="isSelected ? 'text-black dark:text-white' : ''">{{
        getDisplayPath(app)
      }}</span>
    </div>
  </div>
</template>
