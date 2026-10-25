<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import appIcon from '../../../../resources/icon.png'
import { IPC } from '../../../main/ipc/ipcChannels'
import ToggleButton from '../components/common/ToggleButton.vue'
import ShortcutInput from '../components/settings/tabs/preferences/ShortcutInput.vue'
import AddFolderDialog from '../components/settings/tabs/watched-folders/AddFolderDialog.vue'
import { useWatcherStatus } from '../composables/useWatcherStatus'
import { useSettingsStore } from '../stores/settings-store'

const { t } = useI18n()
const router = useRouter()
const settingsStore = useSettingsStore()
const { status, addWatchPath } = useWatcherStatus()
const selectedPaths = ref([])
const showFolderDialog = ref(false)
const addFolderDialog = ref(null)
const busy = ref(false)
const error = ref('')

const features = computed(() => [
  { icon: 'folder_open', label: t('onboarding.featureFiles') },
  { icon: 'apps', label: t('onboarding.featureApps') },
  { icon: 'mood', label: t('onboarding.featureEmoji') },
])

const folders = computed(() => status.value.folders.map(folder => ({
  path: folder.path,
  name: folder.path.split(/[\\/]/).filter(Boolean).pop() || folder.path,
})))
const hasFolders = computed(() => folders.value.length > 0)

async function updateShortcut(event) {
  const keys = []
  if (event.ctrlKey)
    keys.push('Control')
  if (event.metaKey)
    keys.push('Command')
  if (event.altKey)
    keys.push('Alt')
  if (event.shiftKey)
    keys.push('Shift')
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  keys.push(key)
  const shortcut = keys.join('+')
  const isValid = await window.api.invoke(IPC.BACKEND.VALIDATE_GLOBAL_SHORTCUT, shortcut)
  if (!isValid) {
    error.value = t('onboarding.shortcutUnavailable')
    return
  }
  const result = await settingsStore.updateSetting('searchShortcut', shortcut)
  error.value = result.success ? '' : result.error
}

async function toggleAutostart() {
  const result = await settingsStore.updateSetting('autostart', !settingsStore.settings.autostart)
  error.value = result.success ? '' : result.error
}

async function chooseFolder() {
  error.value = ''
  try {
    const path = await window.api.invoke(IPC.FRONTEND.OPEN_FOLDER_DIALOG)
    if (path) {
      selectedPaths.value = [path]
      showFolderDialog.value = true
    }
  }
  catch (err) {
    error.value = err.message
  }
}

async function addFolder({ paths, depth }) {
  if (busy.value)
    return
  busy.value = true
  try {
    const result = await addWatchPath(paths[0], { depth })
    if (!result.success) {
      addFolderDialog.value?.setError(result.error || t('onboarding.addFailed'))
      return
    }
    showFolderDialog.value = false
    selectedPaths.value = []
  }
  catch (err) {
    addFolderDialog.value?.setError(err.message || t('onboarding.addFailed'))
  }
  finally {
    busy.value = false
  }
}

async function finish() {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  try {
    const result = await settingsStore.updateSetting('onboardingCompleted', true)
    if (!result.success)
      throw new Error(result.error || t('onboarding.saveFailed'))
    // The settings window is only hidden, not destroyed, so leave the onboarding route
    // before hiding it - otherwise reopening settings shows onboarding again.
    await router.replace({ name: 'settings' })
    await window.api.invoke(IPC.WINDOW.SHOW_SEARCH_PAGE)
  }
  catch (err) {
    error.value = err.message || t('onboarding.saveFailed')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="flex w-full h-full overflow-hidden bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
    <!-- Brand panel -->
    <aside class="relative hidden w-64 shrink-0 flex-col overflow-hidden bg-linear-to-br from-accent-600 to-accent-800 p-7 text-accentForeground sm:flex">
      <div class="relative">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 shadow-sm ring-1 ring-white/20">
          <img :src="appIcon" alt="" class="h-10 w-10">
        </div>
        <h1 class="mt-6 text-2xl font-bold leading-tight">
          {{ t('onboarding.welcome') }}
        </h1>
        <p class="mt-2 text-sm leading-relaxed opacity-85">
          {{ t('onboarding.tagline') }}
        </p>
      </div>

      <ul class="relative mt-8 space-y-3">
        <li v-for="feature in features" :key="feature.icon" class="flex items-center gap-3 text-sm">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <span class="material-symbols-outlined text-lg">{{ feature.icon }}</span>
          </span>
          {{ feature.label }}
        </li>
      </ul>

      <p class="relative mt-auto flex items-start gap-2 text-xs leading-relaxed opacity-75">
        <span class="material-symbols-outlined text-base">info</span>
        {{ t('onboarding.trayHint') }}
      </p>
    </aside>

    <!-- Setup steps -->
    <section class="flex min-w-0 flex-1 flex-col">
      <div class="flex-1 overflow-y-auto px-8 py-7">
        <header>
          <h2 class="text-xl font-semibold">
            {{ t('onboarding.setupTitle') }}
          </h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ t('onboarding.setupDescription') }}
          </p>
        </header>

        <ol class="mt-6 divide-y divide-gray-200 dark:divide-gray-700/70">
          <li class="flex gap-4 pb-5">
            <span
              class="step-badge"
              :class="hasFolders ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'"
            >
              <span v-if="hasFolders" class="material-symbols-outlined text-base">check</span>
              <template v-else>1</template>
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="font-medium">
                {{ t('onboarding.foldersTitle') }}
              </h3>
              <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {{ t('onboarding.foldersDescription') }}
              </p>

              <ul v-if="hasFolders" class="mt-3 max-h-24 space-y-1.5 overflow-y-auto">
                <li
                  v-for="folder in folders"
                  :key="folder.path"
                  class="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2 text-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
                  :title="folder.path"
                >
                  <span class="material-symbols-outlined text-lg text-accent-500">folder</span>
                  <span class="shrink-0 font-medium">{{ folder.name }}</span>
                  <span class="truncate text-xs text-gray-400 dark:text-gray-500">{{ folder.path }}</span>
                </li>
              </ul>

              <button
                v-if="hasFolders"
                type="button"
                class="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent-600 hover:bg-accent-50 disabled:opacity-50 dark:text-accent-300 dark:hover:bg-gray-800"
                :disabled="busy"
                @click="chooseFolder"
              >
                <span class="material-symbols-outlined text-lg">add</span>
                {{ t('onboarding.addAnother') }}
              </button>
              <button
                v-else
                type="button"
                class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-accent-500 hover:bg-accent-50 hover:text-accent-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-accent-300"
                :disabled="busy"
                @click="chooseFolder"
              >
                <span class="material-symbols-outlined text-xl">create_new_folder</span>
                {{ t('onboarding.chooseFolder') }}
              </button>
            </div>
          </li>

          <li class="flex gap-4 py-5">
            <span class="step-badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">2</span>
            <div class="min-w-0 flex-1">
              <h3 class="font-medium">
                {{ t('onboarding.shortcutTitle') }}
              </h3>
              <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {{ t('onboarding.shortcutDescription') }}
              </p>
              <div class="mt-3">
                <ShortcutInput
                  :value="settingsStore.settings.searchShortcut"
                  @update="updateShortcut"
                  @reset="settingsStore.updateSetting('searchShortcut', 'CommandOrControl+Space')"
                />
              </div>
            </div>
          </li>

          <li class="flex gap-4 pt-5">
            <span class="step-badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">3</span>
            <div class="min-w-0 flex-1">
              <ToggleButton
                :title="t('onboarding.startupTitle')"
                :description="t('settings.preferences.autostartDescription')"
                :value="settingsStore.settings.autostart"
                @toggle="toggleAutostart"
              />
            </div>
          </li>
        </ol>

        <p v-if="error" role="alert" class="mt-5 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-200 dark:ring-red-800">
          <span class="material-symbols-outlined text-lg">error</span>
          {{ error }}
        </p>
      </div>

      <footer class="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-8 py-4 dark:border-gray-700/70 dark:bg-gray-900">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          <template v-if="!hasFolders">
            {{ t('onboarding.skipHint') }}
          </template>
        </p>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-semibold text-accentForeground shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50"
          :disabled="busy"
          @click="finish"
        >
          {{ hasFolders ? t('onboarding.finish') : t('onboarding.skip') }}
          <span class="material-symbols-outlined text-lg">arrow_forward</span>
        </button>
      </footer>
    </section>

    <AddFolderDialog
      ref="addFolderDialog"
      :is-open="showFolderDialog"
      :selected-paths="selectedPaths"
      @close="showFolderDialog = false"
      @confirm="addFolder"
    />
  </main>
</template>

<style scoped>
.step-badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  transition: background-color 0.2s;
}
</style>
