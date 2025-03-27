import { ref } from 'vue'

/**
 * Creates a debounced function that delays invoking the provided function
 * until after a specified wait time has elapsed since the last time it was invoked.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} wait - Milliseconds to wait before invoking the function
 * @param {object} options - Options object
 * @returns {Function} The debounced function
 */
export function useDebounce(fn, wait = 300, options = {}) {
  const timeoutRef = ref(null)

  const debounced = function (...args) {
    if (timeoutRef.value) {
      clearTimeout(timeoutRef.value)
    }

    timeoutRef.value = setTimeout(() => {
      timeoutRef.value = null
      fn.apply(this, args)
    }, wait)
  }

  return debounced
}

/**
 * Utility for formatting and normalizing search results
 */
export function useResultFormatter() {
  /**
   * Ensures a result is in the correct format
   * @param {object} result - The search result to format
   * @param {string} type - The type of result
   * @returns {object} Formatted result
   */
  const formatResult = (result, type) => {
    // Basic validation
    if (!result)
      return null

    // Common properties all results should have
    const formatted = {
      ...result,
      id: result.id || `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      resultType: type,
      timestamp: result.timestamp || Date.now(),
    }

    return formatted
  }

  /**
   * Format an array of results
   * @param {Array} results - The results array
   * @param {string} type - The type of results
   * @returns {Array} Formatted results
   */
  const formatResults = (results, type) => {
    if (!Array.isArray(results))
      return []
    return results.map(result => formatResult(result, type)).filter(Boolean)
  }

  return {
    formatResult,
    formatResults,
  }
}
