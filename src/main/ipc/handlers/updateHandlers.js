import { app, net } from 'electron'
import { autoUpdaterService } from '../../services/auto-updater/AutoUpdaterService.js'
import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'

// GitHub repo info - should match your publish config
const GITHUB_OWNER = 'andreasjhagen'
const GITHUB_REPO = 'Seeksy'

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
      [IPC.UPDATER.GET_RELEASE_NOTES]: this.handleGetReleaseNotes.bind(this),
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

  /**
   * Fetch release notes from GitHub API for a specific version
   * @param {Event} _ - IPC event (unused)
   * @param {string} [version] - Version to fetch notes for, defaults to current app version
   */
  async handleGetReleaseNotes(_, version) {
    const targetVersion = version || app.getVersion()

    try {
      // Fetch release info from GitHub API
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/v${targetVersion}`

      const response = await this._fetchJson(url)

      if (!response) {
        return { success: false, error: 'Release not found' }
      }

      return {
        success: true,
        version: response.tag_name?.replace(/^v/, '') || targetVersion,
        name: response.name,
        body: response.body || '',
        publishedAt: response.published_at,
        htmlUrl: response.html_url,
      }
    }
    catch (error) {
      console.error('Failed to fetch release notes:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Fetch JSON from a URL using Electron's net module
   * @private
   */
  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      const request = net.request({
        url,
        headers: {
          'User-Agent': `Seeksy/${app.getVersion()}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })

      let data = ''

      request.on('response', (response) => {
        if (response.statusCode === 404) {
          resolve(null)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }

        response.on('data', chunk => data += chunk)
        response.on('end', () => {
          try {
            resolve(JSON.parse(data))
          }
          catch (e) {
            reject(new Error('Invalid JSON response'))
          }
        })
      })

      request.on('error', reject)
      request.end()
    })
  }
}

export default function setupUpdateHandlers() {
  return new UpdateHandler()
}
