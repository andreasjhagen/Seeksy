/**
 * Main process translations for system tray and other native UI elements.
 * This is a simple translation module that doesn't require vue-i18n.
 */

const translations = {
  en: {
    window: {
      search: 'Seeksy',
      settings: 'Seeksy Settings',
    },
    tray: {
      openSearch: 'Open Search',
      settings: 'Settings',
      pauseIndexing: 'Pause Indexing',
      resumeIndexing: 'Resume Indexing',
      quit: 'Quit',
      updateAvailable: 'Update Available (v{version})',
      installUpdate: 'Install Update (v{version})',
    },
    tooltip: {
      default: 'Seeksy',
      paused: 'Seeksy - Indexing Paused',
      updateAvailable: 'Seeksy - Update available (v{version})',
      updateReady: 'Seeksy - Update ready to install (v{version})',
    },
  },
  de: {
    window: {
      search: 'Seeksy',
      settings: 'Seeksy Einstellungen',
    },
    tray: {
      openSearch: 'Suche öffnen',
      settings: 'Einstellungen',
      pauseIndexing: 'Indexierung pausieren',
      resumeIndexing: 'Indexierung fortsetzen',
      quit: 'Beenden',
      updateAvailable: 'Update verfügbar (v{version})',
      installUpdate: 'Update installieren (v{version})',
    },
    tooltip: {
      default: 'Seeksy',
      paused: 'Seeksy - Indexierung pausiert',
      updateAvailable: 'Seeksy - Update verfügbar (v{version})',
      updateReady: 'Seeksy - Update bereit zur Installation (v{version})',
    },
  },
  fr: {
    window: {
      search: 'Seeksy',
      settings: 'Seeksy Paramètres',
    },
    tray: {
      openSearch: 'Ouvrir la recherche',
      settings: 'Paramètres',
      pauseIndexing: 'Suspendre l\'indexation',
      resumeIndexing: 'Reprendre l\'indexation',
      quit: 'Quitter',
      updateAvailable: 'Mise à jour disponible (v{version})',
      installUpdate: 'Installer la mise à jour (v{version})',
    },
    tooltip: {
      default: 'Seeksy',
      paused: 'Seeksy - Indexation suspendue',
      updateAvailable: 'Seeksy - Mise à jour disponible (v{version})',
      updateReady: 'Seeksy - Mise à jour prête à installer (v{version})',
    },
  },
  it: {
    window: {
      search: 'Seeksy',
      settings: 'Seeksy Impostazioni',
    },
    tray: {
      openSearch: 'Apri ricerca',
      settings: 'Impostazioni',
      pauseIndexing: 'Sospendi indicizzazione',
      resumeIndexing: 'Riprendi indicizzazione',
      quit: 'Esci',
      updateAvailable: 'Aggiornamento disponibile (v{version})',
      installUpdate: 'Installa aggiornamento (v{version})',
    },
    tooltip: {
      default: 'Seeksy',
      paused: 'Seeksy - Indicizzazione sospesa',
      updateAvailable: 'Seeksy - Aggiornamento disponibile (v{version})',
      updateReady: 'Seeksy - Aggiornamento pronto per l\'installazione (v{version})',
    },
  },
  es: {
    window: {
      search: 'Seeksy',
      settings: 'Seeksy Configuración',
    },
    tray: {
      openSearch: 'Abrir búsqueda',
      settings: 'Configuración',
      pauseIndexing: 'Pausar indexación',
      resumeIndexing: 'Reanudar indexación',
      quit: 'Salir',
      updateAvailable: 'Actualización disponible (v{version})',
      installUpdate: 'Instalar actualización (v{version})',
    },
    tooltip: {
      default: 'Seeksy',
      paused: 'Seeksy - Indexación pausada',
      updateAvailable: 'Seeksy - Actualización disponible (v{version})',
      updateReady: 'Seeksy - Actualización lista para instalar (v{version})',
    },
  },
}

let currentLanguage = 'en'

/**
 * Set the current language for translations
 * @param {string} lang - Language code (e.g., 'en', 'de')
 */
export function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang
  }
  else {
    console.warn(`Language '${lang}' not supported, falling back to 'en'`)
    currentLanguage = 'en'
  }
}

/**
 * Get the current language
 * @returns {string} Current language code
 */
export function getLanguage() {
  return currentLanguage
}

/**
 * Get a translation by key path
 * @param {string} keyPath - Dot-separated key path (e.g., 'tray.openSearch')
 * @param {object} params - Optional parameters for interpolation
 * @returns {string} Translated string
 */
export function t(keyPath, params = {}) {
  const keys = keyPath.split('.')
  let value = translations[currentLanguage]

  for (const key of keys) {
    if (value && typeof value === 'object') {
      value = value[key]
    }
    else {
      // Fallback to English if key not found in current language
      value = translations.en
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k]
        }
        else {
          return keyPath // Return key path if translation not found
        }
      }
      break
    }
  }

  // If value is still an object, return the key path
  if (typeof value !== 'string') {
    return keyPath
  }

  // Interpolate parameters
  return value.replace(/\{(\w+)\}/g, (match, paramName) => {
    return params[paramName] !== undefined ? params[paramName] : match
  })
}

/**
 * Get all supported languages
 * @returns {string[]} Array of supported language codes
 */
export function getSupportedLanguages() {
  return Object.keys(translations)
}
