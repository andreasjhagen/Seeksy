<script setup>
import { useContextMenu } from '../../../composables/useContextMenu'
import BaseResultComponent from '../BaseResultComponent.vue'
import EmojiResultItem from './EmojiResultItem.vue'

const props = defineProps({
  resultType: {
    type: String,
    required: true,
  },
  customGridGap: {
    type: String,
    default: null,
  },
  isCollapsed: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['copy', 'item-focus', 'contextmenu', 'toggle-collapse', 'section-reorder'])
const contextMenu = useContextMenu()

function handleContextMenu(event, emoji) {
  emit('contextmenu', event, emoji)
}
</script>

<template>
  <BaseResultComponent
    :result-type="resultType"
    :custom-grid-gap="customGridGap"
    :is-collapsed="isCollapsed"
    @toggle-collapse="(sectionName, isCollapsed) => $emit('toggle-collapse', sectionName, isCollapsed)"
    @section-reorder="$emit('section-reorder', $event)"
    @item-focus="$emit('item-focus', $event)"
  >
    <template #default="{ results, isItemSelected, handleItemFocus, getTabIndex }">
      <EmojiResultItem
        v-for="(emoji, index) in results"
        :key="emoji.char"
        :emoji="emoji"
        :is-selected="isItemSelected(emoji)"
        :tabindex="getTabIndex(index)"
        @focus="() => handleItemFocus(emoji)"
        @copy="$emit('copy', $event)"
        @contextmenu="(e) => handleContextMenu(e, emoji)"
      />
    </template>
  </BaseResultComponent>
</template>
