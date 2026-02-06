/**
 * Emoji database operations
 *
 * This module provides operations specific to emojis:
 * - Adding emojis to database
 * - Checking if emojis exist
 * - Managing emoji favorites
 */

export const emojisOperations = {
  // Cache prepared statements for better performance
  _emojiStatements: {
    getEmoji: null,
    upsertEmoji: null,
    getAllEmojis: null,
  },

  // Initialize statements when first needed
  _initEmojiStatements() {
    if (!this._emojiStatements.getEmoji) {
      this._emojiStatements.getEmoji = this.db.prepare(
        'SELECT * FROM emojis WHERE path = ?',
      )

      this._emojiStatements.upsertEmoji = this.db.prepare(
        `INSERT INTO emojis (path, char, name, isFavorite, favoriteAddedAt, favoriteSortOrder)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
         char = excluded.char,
         name = excluded.name`,
      )

      this._emojiStatements.getAllEmojis = this.db.prepare(
        'SELECT * FROM emojis ORDER BY name',
      )
    }
  },

  // Get an emoji by path
  getEmoji(path) {
    this._initEmojiStatements()
    return this._emojiStatements.getEmoji.get(path)
  },

  // Add or update an emoji in the database
  upsertEmoji(emoji) {
    try {
      this._initEmojiStatements()

      if (!emoji || !emoji.path || !emoji.char) {
        throw new Error('Invalid emoji data')
      }

      // Create default emoji data structure
      const emojiData = {
        path: emoji.path,
        char: emoji.char,
        name: emoji.name || emoji.char,
        isFavorite: emoji.isFavorite || 0,
        favoriteAddedAt: emoji.isFavorite ? (emoji.favoriteAddedAt || Date.now()) : null,
        favoriteSortOrder: emoji.favoriteSortOrder ?? null,
      }

      this._emojiStatements.upsertEmoji.run(
        emojiData.path,
        emojiData.char,
        emojiData.name,
        emojiData.isFavorite,
        emojiData.favoriteAddedAt,
        emojiData.favoriteSortOrder,
      )

      return {
        success: true,
        emoji: this.getEmoji(emoji.path),
      }
    }
    catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  },

  // Get all emojis
  getAllEmojis() {
    this._initEmojiStatements()
    return this._emojiStatements.getAllEmojis.all()
  },
}
