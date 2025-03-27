<script setup>
import { computed, onMounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../../../main/ipc/ipcChannels'
import { getFileType as getFileTypeUtil, isFileOfType } from '../../../../../utils/mimeTypeUtils'
import { useMimeTypeIcons } from '../../../composables/useMimeTypeIcons'
import PopoverThumbnail from '../../common/PopoverThumbnail.vue'

const props = defineProps({
  file: {
    type: Object,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['open-file', 'show-in-directory'])
const thumbnail = ref(null)
const fileIcon = ref(null)

function isImageFile(filename) {
  return isFileOfType(filename, 'image')
}

function openFile(file) {
  emit('open-file', file)
}

function showInDirectory(path) {
  emit('show-in-directory', path)
}

async function loadThumbnail() {
  if (!isImageFile(props.file.name))
    return

  try {
    const pathToUse = props.file.path
    const data = await window.api.invoke(IPC_CHANNELS.GET_THUMBNAIL, pathToUse)
    thumbnail.value = data
  }
  catch (error) {
    console.error('Failed to load thumbnail:', error)
  }
}

const { getMimeIcon } = useMimeTypeIcons(props.file.mimeType)

const iconSource = computed(() => {
  if (props.file.type === 'application' && props.file.metadata?.icon) {
    return props.file.metadata.icon
  }
  if (getFileType(props.file) === 'directory') {
    return null // Will use the fallback folder icon
  }
  if (isImageFile(props.file.name)) {
    return thumbnail.value
  }
  return fileIcon.value || props.file.icon || null // Return null to trigger fallback icon
})

async function loadFileIcon() {
  if (
    !props.file.path
    || props.file.type === 'application'
    || getFileType(props.file) === 'directory'
  ) {
    return
  }

  try {
    const icon = await window.api.invoke(IPC_CHANNELS.GET_FILE_ICON, props.file.path)
    fileIcon.value = icon
  }
  catch (error) {
    console.error('Failed to load file icon:', error)
  }
}

// Use the utility function from mimeTypeUtils.js
function getFileType(file) {
  return getFileTypeUtil(file)
}

function getDisplayName(file) {
  if (file.type === 'application') {
    return file.metadata?.displayName || file.name
  }
  return file.name
}

function getItemTitle(file) {
  return `${getDisplayName(file)}\n${file.path}`
}

// Add helper function for capitalization
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

onMounted(() => {
  loadThumbnail()
  loadFileIcon()
})
</script>

<template>
  <div
    :title="getItemTitle(file)"
    class="group h-16 p-1.5 transition-all duration-300 border-2 cursor-pointer rounded-xl focus:outline-hidden hover:h-20 relative z-10 hover:z-20" :class="[
      isSelected
        ? 'bg-accent-200 border-accent-400 dark:bg-accent-700 dark:border-accent-400'
        : 'bg-gray-50 dark:bg-gray-700 hover:shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent',
    ]"
    @click.stop="showInDirectory(file.path)"
    @keydown.enter="openFile(file)"
  >
    <div class="flex items-start space-x-3">
      <!-- Left: Thumbnail/Icon -->
      <div
        class="w-12 h-12 overflow-hidden transition-all duration-300 origin-top-left transform rounded-lg shadow shrink-0 group-hover:w-16 group-hover:h-16"
        :class="{ 'bg-amber-200 dark:bg-amber-800/30': getFileType(file) === 'directory' }"
      >
        <PopoverThumbnail
          v-if="iconSource"
          :src="iconSource"
          alt="file icon"
          class-name="object-contain w-full h-full transition-all duration-300"
          :file-path="file.path"
          :mime-type="file.mimeType"
          :file-type="getFileType(file)"
          :file-name="file.name"
        />
        <div
          v-else
          class="relative flex items-center justify-center w-full h-full transition-all duration-300"
          :class="[
            getFileType(file) === 'directory'
              ? 'bg-amber-100/50 dark:bg-amber-800/30'
              : 'bg-gray-200 dark:bg-gray-600',
          ]"
        >
          <template v-if="getFileType(file) === 'directory'">
            <span class="absolute material-symbols-outlined text-amber-600 dark:text-amber-300/80 transition-all duration-300 group-hover:text-[40px]" style="font-size: 32px;">
              folder
            </span>
            <span class="relative z-10 text-xs font-semibold transition-all duration-300 text-amber-700 dark:text-amber-200 group-hover:text-sm" style="margin-top: 2px;">
              {{ capitalizeFirstLetter(file.name.charAt(0)) }}
            </span>
          </template>
          <span
            v-else
            class="text-gray-400 material-symbols-outlined transition-all duration-300 group-hover:text-[32px]"
          >
            {{ getMimeIcon() }}
          </span>
        </div>
      </div>

      <!-- Middle: File info -->
      <div class="flex-1 min-w-0 pt-0.5">
        <div class="flex items-center space-x-2">
          <span class="text-base font-semibold truncate cursor-pointer">
            {{ getDisplayName(file) }}
          </span>
          <!-- Updated to use boolean isFavorite -->
          <span
            v-if="file.isFavorite"
            class="text-sm material-symbols-outlined text-amber-500"
            title="Favorite"
          >
            star
          </span>
          <span
            v-if="file.notes"
            class="text-sm text-gray-400 dark:text-gray-500 material-symbols-outlined"
            title="Has Note"
          >
            sticky_note_2
          </span>
        </div>
        <p class="mt-0.5 text-xs truncate">
          {{ file.path }}
        </p>
      </div>

      <!-- Right: Action buttons -->
      <!-- Notice that folders do also get opened with OpenFile to jump directly into it -->
      <div class="flex space-x-1 transition-opacity duration-200 opacity-0 shrink-0 group-hover:opacity-100">
        <button
          v-if="getFileType(file) !== 'directory'"
          class="p-1.5 cursor-pointer text-gray-900 flex items-center justify-center transition-colors rounded-lg bg-gray-200 hover:bg-gray-600 hover:text-white dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-accent shadow-xs"
          title="Show in folder"
          @click.stop="showInDirectory(file.path)"
        >
          <span class="material-symbols-outlined">folder</span>
        </button>
        <button
          class="p-1.5 cursor-pointer text-gray-900 flex items-center justify-center transition-colors rounded-lg bg-gray-200 hover:bg-gray-600 hover:text-white dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-accent shadow-xs"
          :title="getFileType(file) === 'directory' ? 'Open folder' : 'Open file'"
          @click.stop="openFile(file)"
        >
          <span class="material-symbols-outlined">
            {{ getFileType(file) === 'directory' ? 'folder_open' : 'open_in_new' }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
