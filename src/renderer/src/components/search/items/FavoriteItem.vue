<script setup>
import { computed, onMounted, ref } from 'vue'
import MIME_TYPES from '../../../../../constants/mimeTypes'
import { IPC_CHANNELS } from '../../../../../main/ipc/ipcChannels'
import { useMimeTypeIcons } from '../../../composables/useMimeTypeIcons'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['refresh', 'contextmenu', 'open-file', 'show-in-directory'])

const thumbnail = ref(null)
const fileIcon = ref(null)
const hasIconError = ref(false)

// Determine if this is a file/folder or app
const isFileOrFolder = computed(() =>
  props.item.type === 'file' || props.item.type === 'folder',
)

function getFileType(file) {
  if (!file)
    return 'unknown'
  if (file.type === 'application')
    return 'application'
  if (file.type === 'folder')
    return 'directory'

  if (file.mimeType) {
    const [category] = file.mimeType.split('/')
    return category
  }

  // Get mime type from extension
  const ext = `.${file.name.split('.').pop()?.toLowerCase() || ''}`
  const mimeType = MIME_TYPES[ext]

  if (mimeType) {
    const [category] = mimeType.split('/')
    return category
  }

  return 'unknown'
}

function isImageFile(filename) {
  const ext = `.${filename.split('.').pop()?.toLowerCase() || ''}`
  const mimeType = MIME_TYPES[ext]
  return mimeType?.startsWith('image/') || false
}

// App-specific functions
function getInitial(name) {
  return (name || '').charAt(0).toUpperCase()
}

function getMimeTypeDisplay(item) {
  if (item.type === 'folder')
    return 'Folder'

  // If we have a mime type stored on the item, use it
  if (item.mimeType) {
    const [category] = item.mimeType.split('/')
    return capitalizeFirstLetter(category)
  }

  // Otherwise try to determine from extension using MIME_TYPES
  const ext = `.${item.name.split('.').pop()?.toLowerCase() || ''}`
  const mimeType = MIME_TYPES[ext]

  if (mimeType) {
    const [category] = mimeType.split('/')
    return capitalizeFirstLetter(category)
  }

  return 'File'
}

function getDisplayPath(item) {
  if (!isFileOrFolder.value && item.metadata?.applicationType === 'appid') {
    return 'Windows Store App'
  }
  return item.path
}

function handleIconError(event) {
  event.target.src = ''
  hasIconError.value = true
}

// File-specific functions
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

const { getMimeIcon } = useMimeTypeIcons(isFileOrFolder.value ? props.item.mimeType : '')

const iconSource = computed(() => {
  if (!isFileOrFolder.value && props.item.icon && !hasIconError.value) {
    return props.item.icon
  }

  if (isFileOrFolder.value) {
    if (getFileType(props.item) === 'directory') {
      return null // Fallback folder icon
    }
    if (isImageFile(props.item.name)) {
      return thumbnail.value
    }
    return fileIcon.value || props.item.icon || null
  }

  return null
})

function getDisplayName(item) {
  if (!isFileOrFolder.value) {
    return item.displayName || item.name
  }
  return item.name
}

function getItemTitle(item) {
  const mimeType = isFileOrFolder.value ? `\n${getMimeTypeDisplay(item)}` : ''
  return `${getDisplayName(item)}\n${getDisplayPath(item)}${mimeType}`
}

// Event handlers
function handleClick() {
  if (isFileOrFolder.value) {
    emit('open-file', props.item)
  }
  else {
    window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
    emit('open-file', props.item)
  }
}

function handleContextMenu(event) {
  event.preventDefault()
  emit('contextmenu', event, props.item)
}

async function loadThumbnail() {
  if (!isFileOrFolder.value || !isImageFile(props.item.name))
    return

  try {
    const data = await window.api.invoke(IPC_CHANNELS.GET_THUMBNAIL, props.item.path)
    thumbnail.value = data
  }
  catch (error) {
    console.error('Failed to load thumbnail:', error)
  }
}

async function loadFileIcon() {
  if (
    !isFileOrFolder.value
    || !props.item.path
    || getFileType(props.item) === 'directory'
  ) {
    return
  }

  try {
    const icon = await window.api.invoke(IPC_CHANNELS.GET_FILE_ICON, props.item.path)
    fileIcon.value = icon
  }
  catch (error) {
    console.error('Failed to load file icon:', error)
  }
}

onMounted(() => {
  if (isFileOrFolder.value) {
    loadThumbnail()
    loadFileIcon()
  }
})
</script>

<template>
  <div
    class="relative transition-all duration-200 rounded-lg cursor-pointer favorite-item group"
    :class="[isSelected ? 'ring-2 ring-accent-400' : 'hover:ring-1 hover:ring-accent-300']"
    :title="getItemTitle(item)"
    @click="handleClick"
    @contextmenu="handleContextMenu"
  >
    <!-- Icon/Thumbnail -->
    <div class="flex items-center justify-center w-full overflow-hidden bg-gray-200 rounded-t-lg h-14 dark:bg-gray-700">
      <!-- App icon -->
      <template v-if="!isFileOrFolder">
        <img
          v-if="item.icon && !hasIconError"
          :src="item.icon"
          class="object-contain w-full h-full p-2"
          :alt="getDisplayName(item)"
          @error="handleIconError"
        >
        <div
          v-else
          class="flex items-center justify-center w-10 h-10 bg-gray-300 rounded-full dark:bg-gray-600"
        >
          <span class="text-lg font-medium text-gray-600 dark:text-gray-400">{{ getInitial(item.name) }}</span>
        </div>
      </template>

      <!-- File/folder icon -->
      <template v-else>
        <!-- Folder specific styling -->
        <div
          v-if="getFileType(item) === 'directory'"
          class="flex flex-col items-center justify-center w-full h-full bg-amber-100/50 dark:bg-amber-800/30"
        >
          <span class="material-symbols-outlined text-amber-600 dark:text-amber-300/80" style="font-size: 36px;">
            folder
          </span>
          <span class="text-xs font-semibold text-amber-700 dark:text-amber-200">
            Folder
          </span>
        </div>

        <!-- File with thumbnail/icon -->
        <img
          v-else-if="iconSource"
          :src="iconSource"
          class="object-contain max-w-full max-h-12"
          alt="file icon"
        >

        <!-- Fallback icon for files -->
        <div
          v-else
          class="flex flex-col items-center justify-center w-full h-full"
        >
          <span
            class="text-gray-400 material-symbols-outlined"
            style="font-size: 32px;"
          >
            {{ getMimeIcon() }}
          </span>
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
            {{ capitalizeFirstLetter(getFileType(item)) }}
          </span>
        </div>
      </template>
    </div>

    <!-- Name and basic info -->
    <div class="p-1.5 bg-white rounded-b-lg dark:bg-gray-800">
      <p class="text-xs font-medium text-center truncate dark:text-white">
        {{ getDisplayName(item) }}
      </p>
    </div>
  </div>
</template>
