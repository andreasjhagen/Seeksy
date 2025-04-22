/**
 * Search Operations Module
 *
 * Handles all database search functionality including quick search, search with filters,
 * and application search capabilities.
 */

import { FILE_CATEGORIES, QUERY_LIMITS } from '../constants.js'

export const searchOperations = {
  // Cache prepared statements for better performance
  _searchStatements: {
    quickSearch: null,
    searchApplications: null,
  },

  /**
   * Initialize prepared statements for search operations
   * @private
   */
  _initSearchStatements() {
    if (!this._searchStatements.quickSearch) {
      this._searchStatements.quickSearch = this.db.prepare(`
        WITH RankedResults AS (
          SELECT *,
            CASE 
              WHEN lower(name) = lower(?) THEN 1
              WHEN lower(name) LIKE ? THEN 2
              WHEN lower(name) LIKE ? THEN 3
              ELSE 4
            END as rank
          FROM all_items 
          WHERE lower(name) LIKE ?
        )
        SELECT * FROM RankedResults
        ORDER BY 
          isFavorite DESC,
          rank,
          modifiedAt DESC
        LIMIT ${QUERY_LIMITS.QUICK_SEARCH}
      `)

      this._searchStatements.searchApplications = this.db.prepare(`
        SELECT 
          *,
          isFavorite,
          favoriteAddedAt 
        FROM applications 
        WHERE lower(name) LIKE ? OR lower(displayName) LIKE ?
        ORDER BY 
          isFavorite DESC,
          CASE 
            WHEN lower(name) = ? THEN 1        -- Exact name match
            WHEN lower(displayName) = ? THEN 2  -- Exact displayName match
            WHEN lower(name) LIKE ? THEN 3      -- Name starts with
            WHEN lower(displayName) LIKE ? THEN 4 -- DisplayName starts with
            ELSE 5                              -- Contains match
          END,
          lastUpdated DESC
        LIMIT ${QUERY_LIMITS.APPLICATION_SEARCH}
      `)
    }
  },

  /**
   * Performs a quick search across files and folders
   *
   * @param {string} query - The search query string
   * @returns {Array} Array of matching items sorted by relevance
   */
  quickSearch(query) {
    this._initSearchStatements()
    const normalizedQuery = `%${query.toLowerCase().trim()}%`
    const exactQuery = query.toLowerCase()
    const startsWithQuery = `${exactQuery}%`

    // Execute with all parameters
    return this._searchStatements.quickSearch.all(
      exactQuery,
      startsWithQuery,
      normalizedQuery,
      normalizedQuery,
    )
  },

  /**
   * Performs a filtered search with filters
   *
   * @param {object} options - Search options
   * @param {string} options.query - The search query string
   * @param {object} options.filters - Filter criteria
   * @param {Array<string>} [options.filters.type] - File types to include
   * @param {object} [options.filters.dateRange] - Date range filter
   * @param {number} [options.filters.dateRange.from] - Start timestamp
   * @param {number} [options.filters.dateRange.to] - End timestamp
   * @param {object} [options.filters.size] - Size range filter
   * @param {number} [options.filters.size.min] - Minimum size in bytes
   * @param {number} [options.filters.size.max] - Maximum size in bytes
   * @param {Array<string>} [options.filters.tags] - Tags to filter by
   * @returns {Array} Array of matching items sorted by relevance
   */
  filteredSearch({ query, filters }) {
    // Build query dynamically based on filters
    const conditions = []
    const params = []

    // Always include valid items
    conditions.push('1=1')

    // Handle query - if query is present, search in name and notes
    if (query && query.trim()) {
      conditions.push(`(
        lower(name) LIKE ? 
        OR EXISTS (
          SELECT 1 FROM notes n 
          WHERE n.target_path = all_items.path 
          AND lower(n.content) LIKE ?
        )
      )`)
      const normalizedQuery = `%${query.toLowerCase().trim()}%`
      params.push(normalizedQuery, normalizedQuery)
    }

    // Type filter
    if (filters.type && filters.type.length > 0) {
      const typeConditions = []

      // Special handling for folders
      if (filters.type.includes(FILE_CATEGORIES.FOLDER)) {
        typeConditions.push('type = \'folder\'')

        // If only folders are selected, we need to exclude files
        if (filters.type.length === 1) {
          conditions.push('type = \'folder\'')
        }
      }
      else {
        // If folders are not included, explicitly exclude them
        conditions.push('type = \'file\'')
      }

      // Handle file type filters
      const fileTypeFilters = filters.type.filter(type => type !== FILE_CATEGORIES.FOLDER)
      if (fileTypeFilters.length > 0) {
        const fileTypeConditions = fileTypeFilters.map((type) => {
          switch (type) {
            case FILE_CATEGORIES.IMAGE:
              return `category = '${FILE_CATEGORIES.IMAGE}'`
            case FILE_CATEGORIES.DOCUMENT:
              return `category = '${FILE_CATEGORIES.DOCUMENT}'`
            case FILE_CATEGORIES.AUDIO:
              return `category = '${FILE_CATEGORIES.AUDIO}'`
            case FILE_CATEGORIES.VIDEO:
              return `category = '${FILE_CATEGORIES.VIDEO}'`
            default:
              return `category = ?`
          }
        })

        if (fileTypeConditions.length > 0) {
          typeConditions.push(...fileTypeConditions)
        }
      }

      // Add type conditions to the main conditions
      if (typeConditions.length > 0) {
        conditions.push(`(${typeConditions.join(' OR ')})`)

        // Add parameters for custom categories
        const customTypes = fileTypeFilters.filter(
          t => !Object.values(FILE_CATEGORIES).includes(t),
        )
        if (customTypes.length > 0) {
          params.push(...customTypes)
        }
      }
    }

    // Date range filter
    if (filters.dateRange) {
      if (filters.dateRange.from) {
        conditions.push('modifiedAt >= ?')
        params.push(filters.dateRange.from)
      }
      if (filters.dateRange.to) {
        conditions.push('modifiedAt <= ?')
        params.push(filters.dateRange.to)
      }
    }

    // Size range filter
    if (filters.size) {
      if (filters.size.min) {
        conditions.push('size >= ?')
        params.push(filters.size.min)
      }
      if (filters.size.max) {
        conditions.push('size <= ?')
        params.push(filters.size.max)
      }
    }

    // Tag filter
    if (filters.tags && filters.tags.length > 0) {
      const tagPlaceholders = filters.tags.map(() => '?').join(',')
      conditions.push(`
        path IN (
          SELECT file_path 
          FROM file_tags ft 
          JOIN tags t ON t.id = ft.tag_id 
          WHERE t.name IN (${tagPlaceholders})
        )
      `)
      params.push(...filters.tags)
    }

    // Prepare and execute the query
    console.log('Filtered search conditions:', conditions.join(' AND '))
    const stmt = this.db.prepare(`SELECT * FROM all_items WHERE ${conditions.join(' AND ')}`)
    const results = stmt.all(params)

    // Sort results - done in JS for complex sorting logic
    return results
      .sort((a, b) => {
        // Sort by favorite status first
        if (a.isFavorite !== b.isFavorite)
          return b.isFavorite - a.isFavorite

        // Then by type (folders first)
        const typeOrder = { folder: 1, file: 2 }
        if (typeOrder[a.type] !== typeOrder[b.type])
          return typeOrder[a.type] - typeOrder[b.type]

        // Finally by modification date (newest first)
        if (a.modifiedAt && b.modifiedAt)
          return b.modifiedAt - a.modifiedAt

        return 0
      })
      .slice(0, QUERY_LIMITS.FILTERED_SEARCH) // Limit to configured results
  },

  /**
   * Searches for applications by name
   *
   * @param {string} query - The search query string
   * @returns {Array} Array of matching applications
   */
  searchApplications(query) {
    this._initSearchStatements()
    const normalizedQuery = `%${query.toLowerCase()}%`
    const exactQuery = query.toLowerCase()
    const startsWithQuery = `${exactQuery}%`

    return this._searchStatements.searchApplications.all(
      normalizedQuery, // WHERE name LIKE
      normalizedQuery, // WHERE displayName LIKE
      exactQuery, // CASE exact name match
      exactQuery, // CASE exact displayName match
      startsWithQuery, // CASE name starts with
      startsWithQuery, // CASE displayName starts with
    )
  },
}
