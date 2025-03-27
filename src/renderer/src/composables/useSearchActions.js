import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'

export function useSearchActions() {
  const restoreFocus = () => {
    const container = document.querySelector('[tabindex="0"]')
    if (container) {
      container.focus()
    }
  }

  const handleLaunch = async (app) => {
    const serializedApp = JSON.parse(JSON.stringify(app))
    await window.api.invoke(IPC_CHANNELS.APP_LAUNCH, serializedApp)
    restoreFocus()
  }

  const handleOpenFile = async (file) => {
    await window.api.invoke(IPC_CHANNELS.OPEN_FILE, file.path)
    await window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
    restoreFocus()
  }

  const handleShowInDirectory = async (path) => {
    await window.api.invoke(IPC_CHANNELS.SHOW_IN_EXPLORER, path)
    await window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
  }

  const handleCopyEmoji = async (char) => {
    try {
      await navigator.clipboard.writeText(char)
      await new Promise(resolve => setTimeout(resolve, 100)) // 100ms delay before closing
      await window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
    }
    catch (err) {
      console.error('Failed to copy emoji:', err)
    }
  }

  return {
    handleLaunch,
    handleOpenFile,
    handleShowInDirectory,
    handleCopyEmoji,
    restoreFocus,
  }
}
