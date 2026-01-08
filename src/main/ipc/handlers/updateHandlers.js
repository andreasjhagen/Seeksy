import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'
import { autoUpdaterService } from '../../services/auto-updater/AutoUpdaterService.js'

/**
 * UpdateHandler: Handles update-related IPC operations
 *
 * Manages checking, downloading, and installing application updates
 */
export class UpdateHandler extends BaseHandler {
  constructor() {
    super()
    this.registerHandlers({
      [IPC.UPDATER.CHECK_FOR_UPDATES]: this.handleCheckForUpdates.bind(this),
      [IPC.UPDATER.DOWNLOAD_UPDATE]: this.handleDownloadUpdate.bind(this),
      [IPC.UPDATER.INSTALL_UPDATE]: this.handleInstallUpdate.bind(this),
      [IPC.UPDATER.GET_UPDATE_STATUS]: this.handleGetUpdateStatus.bind(this),
    })
  }

  async handleCheckForUpdates() {
    return await autoUpdaterService.checkForUpdates()
  }

  async handleDownloadUpdate() {
    return await autoUpdaterService.downloadUpdate()
  }

  handleInstallUpdate() {
    return autoUpdaterService.installUpdate()
  }

  handleGetUpdateStatus() {
    return autoUpdaterService.getUpdateStatus()
  }
}

export default function setupUpdateHandlers() {
  return new UpdateHandler()
}
