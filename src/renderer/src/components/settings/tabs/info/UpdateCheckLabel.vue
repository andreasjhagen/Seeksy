<script setup>
import { onMounted, ref } from 'vue'

const props = defineProps({
  currentVersion: {
    type: String,
    required: true
  }
})

const updateStatus = ref('checking') // 'checking', 'up-to-date', 'available', 'error'
const latestVersion = ref(null)

async function checkForUpdates() {
  try {
    updateStatus.value = 'checking'
    
    // Fetch the latest release from GitHub
    const response = await fetch('https://api.github.com/repos/andreasjhagen/seeksy/releases/latest')
    
    if (!response.ok) {
      throw new Error('Failed to fetch releases')
    }
    
    const release = await response.json()
    latestVersion.value = release.tag_name
    
    // Compare versions (remove 'v' prefix if present for comparison)
    const currentVersion = props.currentVersion?.replace(/^v/, '') || '0.0.0'
    const latestVersionClean = release.tag_name.replace(/^v/, '')
    
    // Simple version comparison (could be enhanced for more complex versioning)
    if (latestVersionClean > currentVersion) {
      updateStatus.value = 'available'
    } else {
      updateStatus.value = 'up-to-date'
    }
  } catch (error) {
    console.error('Error checking for updates:', error)
    updateStatus.value = 'error'
  }
}

function openLatestRelease() {
  window.open('https://github.com/andreasjhagen/seeksy/releases/latest')
}

onMounted(async () => {
  // Check for updates when component mounts
  await checkForUpdates()
})
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Update status indicator -->
    <span v-if="updateStatus === 'checking'" class="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded-full dark:bg-gray-700 dark:text-gray-300">
      Checking for updates...
    </span>
    
    <span v-else-if="updateStatus === 'up-to-date'" class="px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-full dark:bg-green-900/20 dark:text-green-400">
      Up to date
    </span>
    
    <span 
      v-else-if="updateStatus === 'available'" 
      class="px-2 py-1 text-xs font-medium text-white rounded-full cursor-pointer bg-accent hover:bg-accent-700"
      @click="openLatestRelease"
    >
      Update available ({{ latestVersion }})
    </span>
    
    <span 
      v-else 
      class="px-2 py-1 text-xs font-medium text-orange-600 bg-orange-100 rounded-full cursor-pointer dark:bg-orange-900/20 dark:text-orange-400"
      @click="checkForUpdates"
    >
      Retry check
    </span>
    
    <button 
      class="ml-1 text-xs text-gray-500 cursor-pointer dark:text-gray-400 hover:text-accent dark:hover:text-accent-300"
      @click="checkForUpdates"
      title="Check for updates again"
    >
      ↻
    </button>
  </div>
</template>
