<script setup>
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/vue'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import InfoTab from '../components/settings/tabs/info/InfoTab.vue'
import PreferencesTab from '../components/settings/tabs/preferences/PreferencesTab.vue'
import WatchedFoldersTab from '../components/settings/tabs/watched-folders/WatchedFoldersTab.vue'

const route = useRoute()
const selectedTab = ref(0)

// Parse tab index from query parameter
function parseTabIndex(query) {
  const tab = Number.parseInt(query, 10)
  return Number.isNaN(tab) ? 0 : Math.max(0, Math.min(tab, 2)) // Clamp to valid tab range 0-2
}

// Initialize from query param on mount
selectedTab.value = parseTabIndex(route.query.tab)

// Watch for query param changes (e.g., clicking tray "Update Available" while already on settings page)
watch(
  () => route.query.tab,
  (newTab) => {
    selectedTab.value = parseTabIndex(newTab)
  },
)
</script>

<template>
  <div
    class="relative w-full h-full p-8 mx-auto space-y-6 overflow-y-auto bg-gray-200 shadow-lg dark:bg-gray-900 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-500 dark:hover:scrollbar-thumb-gray-500"
  >
    <div class="max-w-4xl mx-auto">
      <h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Settings
      </h1>

      <TabGroup :selected-index="selectedTab" @change="selectedTab = $event">
        <TabList class="flex p-1 space-x-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          <Tab v-slot="{ selected }" as="template">
            <button
              class="w-full cursor-pointer py-2.5 text-sm font-medium rounded-lg focus:outline-none" :class="[
                selected
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-accent-600 dark:text-accent-200'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-white/[0.12] hover:text-accent-600',
              ]"
            >
              Watched Folders
            </button>
          </Tab>
          <Tab v-slot="{ selected }" as="template">
            <button
              class="w-full cursor-pointer py-2.5 text-sm font-medium rounded-lg focus:outline-none" :class="[
                selected
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-accent-600 dark:text-accent-200'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-white/[0.12] hover:text-accent-600',
              ]"
            >
              Preferences
            </button>
          </Tab>
          <Tab v-slot="{ selected }" as="template">
            <button
              class="w-full cursor-pointer py-2.5 text-sm font-medium rounded-lg focus:outline-none" :class="[
                selected
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-accent-600 dark:text-accent-200'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-white/[0.12] hover:text-accent-600',
              ]"
            >
              Info
            </button>
          </Tab>
        </TabList>

        <TabPanels class="mt-6">
          <TabPanel>
            <WatchedFoldersTab />
          </TabPanel>
          <TabPanel>
            <PreferencesTab />
          </TabPanel>
          <TabPanel>
            <InfoTab />
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  </div>
</template>

<style>
/* Custom scrollbar styles using webkit */
.scrollbar-thin::-webkit-scrollbar {
  width: 8px;
}

.scrollbar-thumb-gray-400::-webkit-scrollbar-thumb {
  background-color: #9ca3af;
  border-radius: 4px;
}

.scrollbar-thumb-gray-600::-webkit-scrollbar-thumb {
  background-color: #4b5563;
  border-radius: 4px;
}

.scrollbar-track-transparent::-webkit-scrollbar-track {
  background: transparent;
}

.hover\:scrollbar-thumb-gray-500:hover::-webkit-scrollbar-thumb {
  background-color: #6b7280;
}
</style>
