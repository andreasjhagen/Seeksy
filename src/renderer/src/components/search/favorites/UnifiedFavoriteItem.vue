<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IPC_CHANNELS } from '../../../../../main/ipc/ipcChannels'
import { getFileType } from '../../../../../utils/mimeTypeUtils'
import { useFileIconHandler } from '../../../composables/useFileIconHandler'
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

const emit = defineEmits(['refresh', 'contextmenu', 'copy', 'open-file', 'show-in-directory', 'launch-app'])

const { t } = useI18n()

// Track favorite and notes status
const isFavorite = ref(props.item.isFavorite || false)
const hasNotes = ref(!!props.item.notes)

// Check if this is an emoji item
const isEmoji = computed(() => props.item.type === 'emoji')

// Determine if this is a file/folder or app (anything that's not an emoji)
const isFileOrFolder = computed(() =>
  !isEmoji.value && (props.item.type === 'file' || props.item.type === 'folder'),
)

// For emoji items, get the character and name
const emoji = computed(() => isEmoji.value
  ? {
      char: props.item.char,
      name: props.item.name || props.item.char,
    }
  : null)

// Use our reusable composables for non-emoji items
const {
  thumbnail,
  fileIcon,
  hasIconError,
  handleIconError,
  supportsThumbnail,
} = useFileIconHandler(props.item, { autoLoad: !isEmoji.value })

const { getMimeIcon } = useMimeTypeIcons(isFileOrFolder.value ? props.item.mimeType : '')

// Computed properties for optimized rendering
const iconSource = computed(() => {
  if (isEmoji.value)
    return null

  if (!isFileOrFolder.value && props.item.icon && !hasIconError.value) {
    return props.item.icon
  }

  if (isFileOrFolder.value) {
    if (getFileType(props.item) === 'directory') {
      return null // Fallback folder icon
    }
    if (supportsThumbnail(props.item.name)) {
      return thumbnail.value
    }
    return fileIcon.value || props.item.icon || null
  }

  return null
})

const displayName = computed(() => {
  if (isEmoji.value) {
    return emoji.value.name
  }

  if (!isFileOrFolder.value) {
    return props.item.displayName || props.item.name
  }
  return props.item.name
})

const itemTitle = computed(() => {
  if (isEmoji.value) {
    return emoji.value.name
  }

  const mimeType = isFileOrFolder.value ? `\n${getMimeTypeDisplay(props.item)}` : ''
  return `${displayName.value}\n${getDisplayPath(props.item)}${mimeType}`
})

// Helpers for display and formatting
function getMimeTypeDisplay(item) {
  if (!item || isEmoji.value)
    return ''

  if (item.type === 'folder')
    return t('common.folder')

  // If we have a mime type stored on the item, use it
  if (item.mimeType) {
    const [category] = item.mimeType.split('/')
    return capitalizeFirstLetter(category)
  }

  // Get mime type from file type
  const fileType = getFileType(item)
  return fileType !== 'unknown' ? capitalizeFirstLetter(fileType) : t('common.file')
}

function getDisplayPath(item) {
  if (isEmoji.value)
    return ''

  if (!isFileOrFolder.value && item.metadata?.applicationType === 'appid') {
    return t('common.windowsStoreApp')
  }
  return item.path
}

function getInitial(name) {
  return (name || '').charAt(0).toUpperCase()
}

function capitalizeFirstLetter(string) {
  if (!string)
    return ''
  return string.charAt(0).toUpperCase() + string.slice(1)
}

// Event handlers
function handleClick() {
  if (isEmoji.value) {
    emit('copy', props.item.char)
  }
  else if (isFileOrFolder.value) {
    emit('open-file', props.item)
  }
  else {
    // This is an application - use launch-app event
    window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
    emit('launch-app', props.item)
  }
}

function handleContextMenu(event) {
  event.preventDefault()
  emit('contextmenu', event, props.item)
}

// Watch for updates to the item prop
watch(() => props.item, async () => {
  isFavorite.value = props.item.isFavorite || false
  hasNotes.value = !!props.item.notes
  await checkNotesStatus()
}, { immediate: true })

// Check notes status on mount and when item changes
async function checkNotesStatus() {
  if (!props.item || !props.item.path)
    return

  try {
    const response = await window.api.invoke(
      IPC_CHANNELS.NOTES_GET,
      props.item.path,
    )
    hasNotes.value = !!response?.notes
  }
  catch (error) {
    console.error('Failed to check notes status:', error)
  }
}

// Check favorite and notes on mount
onMounted(async () => {
  await checkNotesStatus()
})
</script>

<template>
  <div
    class="relative z-10 transition-all duration-300 transform rounded-lg cursor-pointer favorite-item group origin-center hover:z-20 hover:scale-105"
    :class="[isSelected ? 'ring-2 ring-accent-400' : 'hover:ring-1 hover:ring-accent-300']"
    :title="itemTitle"
    @click="handleClick"
    @contextmenu="handleContextMenu"
  >
    <!-- Indicators -->
    <div class="absolute right-0.5 top-0.5 flex space-x-0.5 z-10">
      <!-- Favorite indicator -->
      <span
        v-if="isFavorite"
        class="text-yellow-500 material-symbols-outlined"
        style="font-size: 12px;"
        :title="t('tooltips.favorite')"
      >
        star
      </span>
      <!-- Notes indicator -->
      <span
        v-if="hasNotes"
        class="text-gray-400 material-symbols-outlined"
        style="font-size: 12px;"
        :title="t('tooltips.hasNotes')"
      >
        sticky_note_2
      </span>
    </div>

    <!-- Emoji Display - Only show for emoji type -->
    <div
      v-if="isEmoji"
      class="flex items-center justify-center w-full overflow-hidden text-4xl rounded-t-lg bg-gray-50 h-14 dark:bg-gray-700"
    >
      <span class="transition-transform duration-300 origin-center group-hover:scale-125">{{ emoji.char }}</span>
    </div>

    <!-- Icon/Thumbnail - Show for all non-emoji types -->
    <div
      v-else
      class="flex items-center justify-center w-full overflow-hidden rounded-t-lg shadow bg-gray-50 h-14 dark:bg-gray-700"
    >
      <!-- App icon -->
      <template v-if="!isFileOrFolder">
        <img
          v-if="item.icon && !hasIconError"
          :src="item.icon"
          class="object-contain w-full h-full p-2 transition-transform duration-300 origin-center group-hover:scale-125"
          :alt="displayName"
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
          class="flex flex-col items-center justify-center w-full h-full transition-transform duration-300 origin-center group-hover:scale-110 bg-amber-100/50 dark:bg-amber-800/30"
        >
          <span class="material-symbols-outlined text-amber-600 dark:text-amber-300/80" style="font-size: 36px;">
            folder
          </span>
          <span class="text-xs font-semibold text-amber-700 dark:text-amber-200">
            {{ t('common.folder') }}
          </span>
        </div>

        <!-- File with thumbnail/icon -->
        <img
          v-else-if="iconSource"
          :src="iconSource"
          class="object-contain max-w-full max-h-12 transition-transform duration-300 origin-center group-hover:scale-125"
          alt="file icon"
        >

        <!-- Fallback icon for files -->
        <div
          v-else
          class="flex flex-col items-center justify-center w-full h-full transition-transform duration-300 origin-center group-hover:scale-125"
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

    <!-- Name and basic info - Different layout for emoji vs other items -->
    <div class="p-1.5 bg-white rounded-b-lg dark:bg-gray-800">
      <div v-if="isEmoji" class="flex items-center justify-between ">
        <p class="text-xs font-medium truncate dark:text-white">
          {{ displayName }}
        </p>
      </div>
      <p v-else class="text-xs font-medium text-center truncate dark:text-white">
        {{ displayName }}
      </p>
    </div>
  </div>
</template>
