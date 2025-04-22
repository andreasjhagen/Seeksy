import { fileDB } from '../../services/database/database.js'
import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'

export class IndexHandler extends BaseHandler {
  constructor(indexer) {
    super()
    this.indexer = indexer

    this.registerHandlers({
      [IPC.BACKEND.INDEXER_INITIALIZE]: this.handleInitialize.bind(this),
      [IPC.BACKEND.INDEXER_GET_STATUS]: this.handleGetStatus.bind(this),
      [IPC.BACKEND.WATCHER_GET_STATUS]: this.handleGetWatcherStatus.bind(this),
      [IPC.BACKEND.WATCHER_PAUSE]: this.handleWatcherPause.bind(this),
      [IPC.BACKEND.WATCHER_RESUME]: this.handleWatcherResume.bind(this),
      [IPC.BACKEND.INDEXER_PAUSE_ALL]: this.handlePauseAll.bind(this),
      [IPC.BACKEND.INDEXER_RESUME_ALL]: this.handleResumeAll.bind(this),
      [IPC.BACKEND.INDEXER_ADD_PATH]: this.handleAddPath.bind(this),
      [IPC.BACKEND.INDEXER_REMOVE_PATH]: this.handleRemovePath.bind(this),
      [IPC.BACKEND.INDEXER_CLEANUP]: this.handleCleanup.bind(this),
      [IPC.BACKEND.INDEXER_RESET_DATABASE]: this.handleResetDatabase.bind(this),
      [IPC.BACKEND.INDEXER_SET_PROCESSING_DELAY]: this.handleSetProcessingDelay.bind(this),
      [IPC.BACKEND.INDEXER_SET_AUTO_PERFORMANCE]: this.handleSetAutoPerformance.bind(this),
      [IPC.BACKEND.INDEXER_GET_PERFORMANCE_SETTINGS]: this.handleGetPerformanceSettings.bind(this),
      [IPC.BACKEND.INDEXER_SET_BATCH_SIZE]: this.handleSetBatchSize.bind(this),
      [IPC.BACKEND.INDEXER_SET_ENABLE_BATCHING]: this.handleSetEnableBatching.bind(this),
    })
  }

  async handleInitialize() {
    return this.indexer.initialize()
  }

  async handleGetStatus() {
    return this.indexer.getStatus()
  }

  async handleGetWatcherStatus(_, path) {
    return this.indexer.getWatcherStatus(path)
  }

  async handleWatcherPause(_, path) {
    const success = await this.indexer.pauseWatcher(path)
    return {
      success,
      status: success ? await this.indexer.getWatcherStatus(path) : null,
    }
  }

  async handleWatcherResume(_, path) {
    const success = await this.indexer.resumeWatcher(path, true)
    return {
      success,
      status: success ? await this.indexer.getWatcherStatus(path) : null,
    }
  }

  async handlePauseAll() {
    return this.indexer.pauseAll()
  }

  async handleResumeAll() {
    return this.indexer.resumeAll()
  }

  async handleAddPath(_, path, options = { depth: Infinity }) {
    await fileDB.addWatchFolder(path, options.depth)
    await this.indexer.addWatchPath(path, options)
    return this.indexer.getWatcherStatus(path)
  }

  async handleRemovePath(_, path) {
    return this.indexer.removeWatchPath(path)
  }

  async handleCleanup() {
    return this.indexer.cleanup()
  }

  async handleResetDatabase() {
    try {
      await this.indexer.cleanup()
      fileDB.resetDatabase()
      return { success: true }
    }
    catch (error) {
      console.error('Failed to reset database:', error)
      return { success: false, error: error.message }
    }
  }

  async handleSetProcessingDelay(_, delay) {
    return this.indexer.setProcessingDelay(delay)
  }

  async handleSetAutoPerformance(_, enabled) {
    return this.indexer.setAutoPerformanceMode(enabled)
  }

  async handleGetPerformanceSettings() {
    return this.indexer.getPerformanceSettings()
  }

  async handleSetBatchSize(_, size) {
    return this.indexer.setBatchSize(size)
  }

  async handleSetEnableBatching(_, enabled) {
    return this.indexer.setEnableBatching(enabled)
  }
}

export default function setupFileIndexerHandlers(indexer) {
  return new IndexHandler(indexer)
}
