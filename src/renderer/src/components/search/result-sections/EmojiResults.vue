<script setup>
import { computed } from 'vue'
import { useSearchResultsStore } from '../../../stores/search-results-store'
import { useSelectionStore } from '../../../stores/selection-store'
import EmojiResultItem from '../items/EmojiResultItem.vue'
import ResultSection from '../ResultSection.vue'

const emit = defineEmits(['copy', 'item-focus'])
const resultsStore = useSearchResultsStore()
const emojiResults = computed(() => resultsStore.emojiResults)
const selectionStore = useSelectionStore()

function handleItemFocus(emoji) {
  emit('item-focus', emoji, 'emoji')
}
</script>

<template>
  <ResultSection title="Emojis" grid-cols="grid-cols-8">
    <EmojiResultItem
      v-for="(emoji, index) in emojiResults"
      :key="emoji.char"
      :emoji="emoji"
      :is-selected="selectionStore.selectedItem === emoji && selectionStore.selectedSection === 'emoji'"
      :tabindex="index + 1"
      @focus="() => handleItemFocus(emoji)"
      @copy="$emit('copy', $event)"
    />
  </ResultSection>
</template>
