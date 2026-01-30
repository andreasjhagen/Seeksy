<script setup>
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  confirmText: {
    type: String,
    default: '',
  },
  cancelText: {
    type: String,
    default: '',
  },
  /**
   * Variant for different visual styles:
   * - 'danger' - Red styling for destructive actions
   * - 'warning' - Amber/orange styling for cautionary actions
   * - 'default' - Accent color for normal confirmations
   */
  variant: {
    type: String,
    default: 'default',
    validator: value => ['default', 'danger', 'warning'].includes(value),
  },
  /**
   * Icon to display (Material Symbols name)
   */
  icon: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['confirm', 'cancel'])

const { t } = useI18n()

// Use translated defaults if props are empty
const resolvedConfirmText = computed(() => props.confirmText || t('common.confirm'))
const resolvedCancelText = computed(() => props.cancelText || t('common.cancel'))

function onConfirm() {
  emit('confirm')
}

function onCancel() {
  emit('cancel')
}

// Computed styles based on variant
const iconContainerClass = {
  danger: 'bg-red-100 dark:bg-red-900/30',
  warning: 'bg-amber-100 dark:bg-amber-900/30',
  default: 'bg-accent-100 dark:bg-accent-900/30',
}

const iconClass = {
  danger: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  default: 'text-accent-600 dark:text-accent-400',
}

const confirmButtonClass = {
  danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  default: 'bg-accent-600 hover:bg-accent-700 focus:ring-accent-500',
}

const defaultIcons = {
  danger: 'warning',
  warning: 'info',
  default: 'help',
}
</script>

<template>
  <TransitionRoot appear :show="isOpen" as="template">
    <Dialog as="div" class="relative z-50" @close="onCancel">
      <!-- Backdrop -->
      <TransitionChild
        as="template"
        enter="duration-300 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="duration-200 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black/40 dark:bg-black/60" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex items-center justify-center min-h-full p-4">
          <TransitionChild
            as="template"
            enter="duration-300 ease-out"
            enter-from="opacity-0 scale-95"
            enter-to="opacity-100 scale-100"
            leave="duration-200 ease-in"
            leave-from="opacity-100 scale-100"
            leave-to="opacity-0 scale-95"
          >
            <DialogPanel
              class="w-full max-w-md p-6 bg-white border border-gray-200 shadow-xl rounded-xl dark:bg-gray-800 dark:border-gray-700"
            >
              <div class="flex items-start gap-4">
                <!-- Icon -->
                <div
                  class="flex items-center justify-center shrink-0 w-10 h-10 rounded-full"
                  :class="iconContainerClass[variant]"
                >
                  <span
                    class="text-xl material-symbols-outlined"
                    :class="iconClass[variant]"
                  >
                    {{ icon || defaultIcons[variant] }}
                  </span>
                </div>

                <!-- Content -->
                <div class="flex-1">
                  <DialogTitle class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {{ title }}
                  </DialogTitle>
                  <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    {{ message }}
                  </p>

                  <!-- Optional slot for additional content -->
                  <slot />
                </div>
              </div>

              <!-- Actions -->
              <div class="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  class="px-4 py-2 text-sm font-medium text-gray-700 transition-colors bg-white border border-gray-300 rounded-lg dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  @click="onCancel"
                >
                  {{ resolvedCancelText }}
                </button>
                <button
                  type="button"
                  class="px-4 py-2 text-sm font-medium text-white transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
                  :class="confirmButtonClass[variant]"
                  @click="onConfirm"
                >
                  {{ resolvedConfirmText }}
                </button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
