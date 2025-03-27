export const searchOperations = {
  quickSearch(query) {
    const normalizedQuery = `%${query.toLowerCase().trim()}%`

    // Create and prepare statement once
    const stmt = this.db.prepare(`
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
      LIMIT 100
    `)

    // Execute once with all parameters
    return stmt.all(
      query.toLowerCase(),
      `${query.toLowerCase()}%`,
      normalizedQuery,
      normalizedQuery
    )
  },

  advancedSearch({ query, filters }) {
    const conditions = ['1=1']
    const params = []

    if (query) {
      conditions.push(`(
        lower(name) LIKE ? 
        OR EXISTS (
          SELECT 1 FROM notes n 
          WHERE n.target_path = all_items.path 
          AND lower(n.content) LIKE ?
        )
      )`)
      const normalizedQuery = `%${query.toLowerCase()}%`
      params.push(normalizedQuery, normalizedQuery)
    }

    if (filters.type?.length) {
      if (!filters.type.includes('folder')) {
        conditions.push('type = \'file\'')
      }

      const typeConditions = filters.type.map((type) => {
        switch (type) {
          case 'folder':
            return 'type = \'folder\''
          case 'image':
            return 'category = \'image\''
          case 'document':
            return 'category = \'document\''
          case 'audio':
            return 'category = \'audio\''
          case 'video':
            return 'category = \'video\''
          default:
            return `category = ?`
        }
      })

      if (typeConditions.length) {
        conditions.push(`(${typeConditions.join(' OR ')})`)
        params.push(
          ...filters.type.filter(
            t => !['folder', 'image', 'document', 'audio', 'video'].includes(t),
          ),
        )
      }
    }

    // Add date range filter
    if (filters.dateRange?.from) {
      conditions.push('modifiedAt >= ?')
      params.push(filters.dateRange.from)
    }
    if (filters.dateRange?.to) {
      conditions.push('modifiedAt <= ?')
      params.push(filters.dateRange.to)
    }

    // Add size range filter
    if (filters.size?.min) {
      conditions.push('size >= ?')
      params.push(filters.size.min)
    }
    if (filters.size?.max) {
      conditions.push('size <= ?')
      params.push(filters.size.max)
    }

    // Add tag filter
    if (filters.tags?.length) {
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

    return this.db
      .prepare(`SELECT * FROM all_items WHERE ${conditions.join(' AND ')}`)
      .all(params)
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite)
          return b.isFavorite - a.isFavorite
        const typeOrder = { folder: 1, file: 2 }
        if (typeOrder[a.type] !== typeOrder[b.type])
          return typeOrder[a.type] - typeOrder[b.type]
        return b.modifiedAt - a.modifiedAt
      })
      .slice(0, 100)
  },

  searchApplications(query) {
    const normalizedQuery = `%${query.toLowerCase()}%`
    const exactQuery = query.toLowerCase()

    return this.db
      .prepare(
        `
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
        LIMIT 9
        `,
      )
      .all(
        normalizedQuery, // WHERE name LIKE
        normalizedQuery, // WHERE displayName LIKE
        exactQuery, // CASE exact name match
        exactQuery, // CASE exact displayName match
        `${exactQuery}%`, // CASE name starts with
        `${exactQuery}%`, // CASE displayName starts with
      )
  },
}
