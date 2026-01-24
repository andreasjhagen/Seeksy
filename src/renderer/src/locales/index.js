import { createI18n } from 'vue-i18n'
import de from './de.json'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import it from './it.json'

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
]

// Default language fallback
export const DEFAULT_LANGUAGE = 'en'

/**
 * Detect the user's preferred language from the OS
 * @returns {string} Language code (e.g., 'en', 'de')
 */
export function detectLanguage() {
  // Try to get the language from navigator
  const browserLang = navigator.language || navigator.userLanguage || ''

  // Extract the primary language code (e.g., 'en-US' -> 'en')
  const primaryLang = browserLang.split('-')[0].toLowerCase()

  // Check if we support this language
  const supported = SUPPORTED_LANGUAGES.find(lang => lang.code === primaryLang)

  return supported ? primaryLang : DEFAULT_LANGUAGE
}

/**
 * Get the saved language from settings or detect from OS
 * @param {string|null} savedLanguage - Language saved in settings
 * @returns {string} Language code to use
 */
export function getInitialLanguage(savedLanguage) {
  // If a language is saved and supported, use it
  if (savedLanguage && SUPPORTED_LANGUAGES.some(lang => lang.code === savedLanguage)) {
    return savedLanguage
  }

  // Otherwise detect from OS
  return detectLanguage()
}

// Create i18n instance
const i18n = createI18n({
  legacy: false, // Use Composition API mode
  locale: DEFAULT_LANGUAGE, // Will be updated after settings load
  fallbackLocale: DEFAULT_LANGUAGE,
  messages: {
    en,
    de,
    fr,
    it,
    es,
  },
  // Silence missing translation warnings in production
  silentTranslationWarn: import.meta.env.PROD,
  silentFallbackWarn: import.meta.env.PROD,
})

/**
 * Set the active language
 * @param {string} lang - Language code
 */
export function setLanguage(lang) {
  if (SUPPORTED_LANGUAGES.some(l => l.code === lang)) {
    i18n.global.locale.value = lang
    // Update document language attribute for accessibility
    document.documentElement.lang = lang
  }
}

/**
 * Get the current language
 * @returns {string} Current language code
 */
export function getCurrentLanguage() {
  return i18n.global.locale.value
}

export default i18n
