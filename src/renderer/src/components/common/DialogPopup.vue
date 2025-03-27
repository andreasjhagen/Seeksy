<script setup>
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'
import { ref } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: false,
  },
  isOpen: {
    type: Boolean,
    required: true,
  },
  confirmButtonText: {
    type: String,
    default: 'Save',
  },
})

const emit = defineEmits(['close', 'confirm', 'error'])

const error = ref('')

function onClose() {
  error.value = ''
  emit('close')
}

function onConfirm() {
  error.value = ''
  emit('confirm')
}

// New method to handle errors
function setError(message) {
  error.value = message
}

// Expose setError method to parent
defineExpose({ setError })
</script>

<template>
  <Dialog as="div" class="relative z-20 dialog-modal" :open="isOpen" @close="onClose">
    <div class="fixed inset-0 bg-slate-700/50 dark:bg-slate-900/70" />

    <div class="fixed inset-0 z-30 overflow-y-auto">
      <div class="flex items-center justify-center min-h-full p-4">
        <DialogPanel
          class="w-full max-w-md p-6 border rounded-lg bg-slate-100 dark:bg-gray-800 dark:text-gray-100 dark:border-slate-500"
        >
          <DialogTitle class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {{
              title
            }}
          </DialogTitle>

          <!-- Error Message -->
          <div
            v-if="error"
            class="p-3 mb-4 text-sm text-red-600 bg-red-100 rounded-lg dark:bg-red-900/50 dark:text-red-400"
          >
            {{ error }}
          </div>

          <div class="mb-4">
            <slot />
          </div>
          <div class="flex justify-end space-x-2">
            <button
              class="px-4 py-2 text-gray-600 border rounded-sm dark:text-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="onClose"
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 text-white rounded-sm bg-accent-500 disabled:opacity-50 hover:bg-accent dark:bg-accent dark:hover:bg-accent-700"
              @click="onConfirm"
            >
              {{ confirmButtonText }}
            </button>
          </div>
        </DialogPanel>
      </div>
    </div>
  </Dialog>
</template>
