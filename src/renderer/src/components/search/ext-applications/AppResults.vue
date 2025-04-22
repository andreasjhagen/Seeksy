<script setup>
import BaseResultComponent from '../BaseResultComponent.vue'
import AppResultItem from './AppResultItem.vue'

const props = defineProps({
  resultType: {
    type: String,
    required: true,
  },
  isCollapsed: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['contextmenu', 'launch', 'item-focus', 'toggle-collapse', 'section-reorder'])

function handleContextMenu(event, app) {
  emit('contextmenu', event, { ...app, type: 'application' })
}
</script>

<template>
  <BaseResultComponent
    :result-type="resultType"
    :is-collapsed="isCollapsed"
    @toggle-collapse="(sectionName, isCollapsed) => $emit('toggle-collapse', sectionName, isCollapsed)"
    @section-reorder="$emit('section-reorder', $event)"
    @item-focus="$emit('item-focus', $event)"
  >
    <template #default="{ results, isItemSelected, handleItemFocus, getTabIndex }">
      <AppResultItem
        v-for="(app, index) in results"
        :key="app.path"
        :app="app"
        :is-selected="isItemSelected(app)"
        :tabindex="getTabIndex(index)"
        @focus="() => handleItemFocus(app)"
        @launch="$emit('launch', $event)"
        @contextmenu="(e) => handleContextMenu(e, app)"
      />
    </template>
  </BaseResultComponent>
</template>
