import { applicationLauncher } from '../../services/application-indexer/ApplicationLauncher.js'
import { BaseHandler } from '../BaseHandler.js'
import { IPC } from '../ipcChannels.js'

export class InstalledAppsHandler extends BaseHandler {
  constructor(indexer, fileDB) {
    super()
    this.indexer = indexer
    this.fileDB = fileDB
    this.registerHandlers({
      [IPC.BACKEND.APP_SEARCH]: this.handleAppSearch.bind(this),
      [IPC.BACKEND.APP_LAUNCH]: this.handleAppLaunch.bind(this),
      [IPC.BACKEND.APP_INDEX_REFRESH]: this.handleAppIndexRefresh.bind(this),
    })
  }

  async handleAppSearch(_, term) {
    const results = await applicationLauncher.searchApps(term)
    return results || []
  }

  async handleAppLaunch(_, appPath) {
    return applicationLauncher.launchApp(appPath)
  }

  async handleAppIndexRefresh() {
    try {
      return await applicationLauncher.indexApplications()
    }
    catch (error) {
      console.error('Application indexing failed:', error)
      throw error
    }
  }
}

export default function setupAppIndexerHandlers(indexer, fileDB) {
  return new InstalledAppsHandler(indexer, fileDB)
}
