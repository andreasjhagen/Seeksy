function toLocalDayTimestamp(date, endOfDay = false) {
  if (!date)
    return null

  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day)
    return null

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    : new Date(year, month - 1, day).getTime()
}

export function normalizeSearchFilters(filters) {
  return {
    ...filters,
    dateRange: {
      from: toLocalDayTimestamp(filters.dateRange?.from),
      to: toLocalDayTimestamp(filters.dateRange?.to, true),
    },
  }
}
