import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import VDF from 'vdf-parser'

const readFileAsync = promisify(fs.readFile)
const accessAsync = promisify(fs.access)
const readdirAsync = promisify(fs.readdir)

/**
 * Find Steam installation path from registry or default location
 * @returns {Promise<string|null>} Steam installation path or null if not found
 */
async function findSteamPath() {
  const defaultPaths = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
  ]

  // Try default paths
  for (const steamPath of defaultPaths) {
    try {
      await accessAsync(steamPath, fs.constants.F_OK)
      return steamPath
    }
    catch (error) {
      // Path doesn't exist, continue to next
    }
  }

  return null
}

/**
 * Parse Steam library folders from libraryfolders.vdf
 * @param {string} steamPath - Path to Steam installation
 * @returns {Promise<Array<string>>} Array of Steam library paths
 */
async function getSteamLibraryFolders(steamPath) {
  const libraryFolders = []

  // Add the default Steam library
  libraryFolders.push(path.join(steamPath, 'steamapps'))

  // Try to read additional library folders from VDF file
  try {
    const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
    const data = await readFileAsync(libraryFoldersPath, 'utf8')
    const parsed = VDF.parse(data)

    if (parsed?.libraryfolders) {
      for (const key in parsed.libraryfolders) {
        if (parsed.libraryfolders[key].path) {
          const libPath = parsed.libraryfolders[key].path
          libraryFolders.push(path.join(libPath, 'steamapps'))
        }
      }
    }
  }
  catch (error) {
    console.error('Error reading Steam library folders:', error.message)
  }

  return libraryFolders
}

/**
 * Parse Steam game details from manifest files
 * @param {string} manifestPath - Path to the Steam app manifest
 * @returns {Promise<object | null>} Game details or null if parsing failed
 */
async function parseAppManifest(manifestPath) {
  try {
    const data = await readFileAsync(manifestPath, 'utf8')
    const parsed = VDF.parse(data)

    if (!parsed?.AppState?.name || !parsed?.AppState?.appid) {
      return null
    }

    const appId = parsed.AppState.appid
    const name = parsed.AppState.name
    const installDir = parsed.AppState.installdir

    // Get the folder containing the manifest
    const folderPath = path.dirname(manifestPath)
    const executablePath = path.join(folderPath, 'common', installDir)

    return {
      id: `steam-${appId}`,
      name,
      path: `steam://rungameid/${appId}`,
      exePath: executablePath,
      applicationType: 'steam',
      lastUpdated: Date.now(),
      appId,
    }
  }
  catch (error) {
    console.error(`Failed to parse Steam manifest ${manifestPath}:`, error.message)
    return null
  }
}

/**
 * Find potential executable for a Steam game
 * @param {string} gamePath - Path to the game installation directory
 * @returns {Promise<string|null>} Path to the main executable or null if not found
 */
async function findGameExecutable(gamePath) {
  try {
    if (!(await accessAsync(gamePath, fs.constants.F_OK).then(() => true).catch(() => false))) {
      return null
    }

    const files = await readdirAsync(gamePath)

    // Look for .exe files
    const exeFiles = files.filter(file => file.endsWith('.exe'))

    if (exeFiles.length === 0) {
      return null
    }

    // Heuristic: prefer exes with the same name as the containing folder
    const folderName = path.basename(gamePath).toLowerCase()
    const priorityExe = exeFiles.find(exe =>
      path.basename(exe, '.exe').toLowerCase() === folderName,
    )

    return priorityExe
      ? path.join(gamePath, priorityExe)
      : path.join(gamePath, exeFiles[0])
  }
  catch (error) {
    console.error(`Failed to find executable for ${gamePath}:`, error.message)
    return null
  }
}

/**
 * Index all installed Steam games
 * @returns {Promise<Array<object>>} List of indexed Steam applications
 */
export async function indexSteamGames() {
  const steamGames = []
  const steamPath = await findSteamPath()

  if (!steamPath) {
    console.log('Steam installation not found')
    return steamGames
  }

  const libraryFolders = await getSteamLibraryFolders(steamPath)

  for (const libraryFolder of libraryFolders) {
    try {
      // Check if the directory exists before proceeding
      await accessAsync(libraryFolder, fs.constants.F_OK)

      // Get all manifest files
      const files = await readdirAsync(libraryFolder)
      const manifestFiles = files.filter(file => file.startsWith('appmanifest_') && file.endsWith('.acf'))

      // Process each manifest
      for (const manifestFile of manifestFiles) {
        const manifestPath = path.join(libraryFolder, manifestFile)
        const game = await parseAppManifest(manifestPath)

        if (game) {
          // Try to find an executable to extract an icon from
          const exePath = await findGameExecutable(game.exePath)
          if (exePath) {
            game.iconSource = exePath
          }
          steamGames.push(game)
        }
      }
    }
    catch (error) {
      console.error(`Error processing Steam library folder ${libraryFolder}:`, error.message)
    }
  }

  return steamGames
}
