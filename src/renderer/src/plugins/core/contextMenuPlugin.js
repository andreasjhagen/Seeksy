// Global reference to the ContextMenu component instance
let contextMenuInstance = null

// Function to open the notes dialog
function openNotesDialog(item) {
  if (contextMenuInstance) {
    contextMenuInstance.selectedItem = item
    contextMenuInstance.showNotesDialog = true
    return { success: true }
  }
  return { success: false, error: 'Notes dialog not available' }
}

export { openNotesDialog }

export default {
  install: (app) => {
    // Provide a way to set the context menu instance
    app.config.globalProperties.$setContextMenuInstance = (instance) => {
      contextMenuInstance = instance
    }

    // Add helper to open notes dialog
    app.provide('openNotesDialog', openNotesDialog)
  },
}
