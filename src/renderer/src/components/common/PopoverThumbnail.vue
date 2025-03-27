<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { IPC_CHANNELS } from '../../../../main/ipc/ipcChannels'
import { formatFileSize, getContentType } from '../../../../utils/mimeTypeUtils'
import AudioPreview from './previews/AudioPreview.vue'
import GenericFilePreview from './previews/GenericFilePreview.vue'
import ImagePreview from './previews/ImagePreview.vue'
import TextPreview from './previews/TextPreview.vue'
import VideoPreview from './previews/VideoPreview.vue'

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
  alt: {
    type: String,
    default: 'thumbnail',
  },
  className: {
    type: String,
    default: 'object-contain w-full h-full',
  },
  filePath: {
    type: String,
    default: '',
  },
  mimeType: {
    type: String,
    default: '',
  },
  fileType: {
    type: String,
    default: '',
  },
  fileName: {
    type: String,
    default: '',
  },
})

const showPopover = ref(false)
const hoverTimer = ref(null)
const isHoveringThumbnail = ref(false)
const isHoveringPopover = ref(false)
const popoverRef = ref(null)
const contentPreview = ref(null)
const fileContent = ref(null)
const isLoading = ref(false)

// Computed property to determine content type using the utility
const contentType = computed(() => {
  return getContentType(props.mimeType)
})

function handleThumbnailMouseEnter() {
  isHoveringThumbnail.value = true
  clearTimeout(hoverTimer.value)
  hoverTimer.value = setTimeout(() => {
    // Show popover immediately
    showPopover.value = true
    // Load content asynchronously
    loadFileContent()
  }, 500)
}

function handleThumbnailMouseLeave() {
  isHoveringThumbnail.value = false
  clearTimeout(hoverTimer.value)

  // Wait a bit before hiding to allow mouse to move to popover
  setTimeout(() => {
    if (!isHoveringPopover.value) {
      showPopover.value = false
    }
  }, 100)
}

function handlePopoverMouseEnter() {
  isHoveringPopover.value = true
}

function handlePopoverMouseLeave() {
  isHoveringPopover.value = false

  // Only hide if we're not hovering the thumbnail
  if (!isHoveringThumbnail.value) {
    showPopover.value = false
  }
}

async function loadFileContent() {
  if (!props.filePath)
    return

  isLoading.value = true

  try {
    const result = await window.api.invoke(IPC_CHANNELS.GET_FILE_CONTENT, props.filePath)

    if (result.error) {
      contentPreview.value = `Error: ${result.error}`
      return
    }

    fileContent.value = result

    if (result.type === 'text') {
      contentPreview.value = result.content
    }
  }
  catch (error) {
    console.error('Failed to load file content:', error)
    contentPreview.value = 'Error loading content preview'
  }
  finally {
    isLoading.value = false
  }
}

// Handler for opening documents
async function handleOpenDocument() {
  if (fileContent.value?.path) {
    try {
      await window.api.invoke(IPC_CHANNELS.OPEN_FILE, fileContent.value.path)
    }
    catch (error) {
      console.error('Failed to open document:', error)
    }
  }
}

onBeforeUnmount(() => {
  clearTimeout(hoverTimer.value)
})
</script>

<template>
  <div
    class="relative thumbnail-container"
    @mouseenter="handleThumbnailMouseEnter"
    @mouseleave="handleThumbnailMouseLeave"
  >
    <!-- Thumbnail image -->
    <img
      :src="src"
      :alt="alt"
      :class="[className, isHoveringThumbnail ? 'ring-2 ring-accent-400' : '']"
    >

    <!-- Use teleport to body for popover -->
    <teleport to="body">
      <div
        v-if="showPopover"
        ref="popoverRef"
        class="fixed z-40 p-3 bg-white border border-gray-200 rounded-lg shadow-xl popover-thumbnail dark:bg-gray-800 dark:border-gray-700"
        :style="{
          left: `${$el?.getBoundingClientRect().left + $el?.getBoundingClientRect().width + 12}px`,
          top: `${$el?.getBoundingClientRect().top + ($el?.getBoundingClientRect().height / 2)}px`,
          transform: 'translateY(-50%) translateX(-50%)',
          maxWidth: '95vw',
          maxHeight: '80vh',
        }"
        @mouseenter="handlePopoverMouseEnter"
        @mouseleave="handlePopoverMouseLeave"
        @click.stop
      >
        <!-- Preview content based on file type -->
        <div class="preview-container">
          <!-- Dynamically load the appropriate preview component based on content type -->
          <component
            :is="(() => {
              switch (fileContent?.type || contentType) {
              case 'image': return ImagePreview
              case 'text': return TextPreview
              case 'video': return VideoPreview
              case 'audio': return AudioPreview
              case 'document':
              case 'spreadsheet':
              case 'presentation':
              case 'unknown':
              default: return GenericFilePreview
              }
            })()"
            :file-name="fileName"
            :file-content="fileContent"
            :content-preview="contentPreview"
            :is-loading="isLoading"
            :mime-type="mimeType"
            :alt="alt"
            :file-icon="fileContent?.fileIcon"
            :file-type="fileContent?.fileType || contentType"
            :file-size="fileContent?.fileSize ? formatFileSize(fileContent.fileSize) : ''"
            :on-open-click="handleOpenDocument"
          />
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.thumbnail-container {
  position: relative;
  z-index: 1;
}

.loading-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  height: 100px;
  width: 200px;
  color: #666;
}

.dark .loading-placeholder {
  background-color: rgba(255, 255, 255, 0.1);
  color: #aaa;
}
</style>
