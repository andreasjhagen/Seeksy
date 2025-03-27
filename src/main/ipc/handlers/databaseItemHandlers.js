import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'

export class DatabaseItemHandler extends BaseHandler {
  constructor(fileDB) {
    super()
    this.fileDB = fileDB
    this.registerHandlers({
      [IPC.BACKEND.INDEXER_QUICK_SEARCH]: this.handleQuickSearch.bind(this),
      [IPC.BACKEND.INDEXER_ADVANCED_SEARCH]: this.handleAdvancedSearch.bind(this),
      [IPC.FRONTEND.FAVORITES_ADD]: this.handleFavoriteAdd.bind(this),
      [IPC.FRONTEND.FAVORITES_REMOVE]: this.handleFavoriteRemove.bind(this),
      [IPC.FRONTEND.FAVORITES_CHECK]: this.handleFavoriteCheck.bind(this),
      [IPC.FRONTEND.FAVORITES_GET_ALL]: this.handleGetAllFavorites.bind(this),
      [IPC.FRONTEND.NOTES_SET]: this.handleSetNotes.bind(this),
      [IPC.FRONTEND.NOTES_GET]: this.handleGetNotes.bind(this),
      [IPC.FRONTEND.FIND_SIMILAR_IMAGES]: this.handleFindSimilarImages.bind(this),
    })
  }

  async handleQuickSearch(_, query) {
    return this.fileDB.quickSearch(query)
  }

  async handleAdvancedSearch(_, searchParams) {
    return this.fileDB.advancedSearch(searchParams)
  }

  async handleFavoriteAdd(_, itemPath, type) {
    return this.fileDB.addToFavorites(itemPath, type)
  }

  async handleFavoriteRemove(_, itemPath) {
    return this.fileDB.removeFromFavorites(itemPath)
  }

  async handleFavoriteCheck(_, itemPath) {
    return this.fileDB.isFavorite(itemPath)
  }

  async handleGetAllFavorites() {
    return this.fileDB.getAllFavorites()
  }

  async handleSetNotes(_, itemPath, notes) {
    return {
      success: this.fileDB.setNotes(itemPath, notes),
      notes,
    }
  }

  async handleGetNotes(_, itemPath) {
    return {
      success: true,
      notes: this.fileDB.getNotes(itemPath),
    }
  }

  async handleFindSimilarImages(_, itemPath) {
    const query = this.fileDB.findSimilarImages(itemPath, {
      threshold: 0.85,
      limit: 20,
    })
    return query.success ? query.results : []
  }
}

// Changed to match other handlers' export pattern
export default function setupDatabaseItemHandlers(fileDB) {
  return new DatabaseItemHandler(fileDB)
}
