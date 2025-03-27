import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)

// PowerShell script to extract shortcut information including icon
const SHORTCUT_EXTRACTION_SCRIPT = `
function Get-ShortcutInfo {
  param (
    [string]$path
  )
  
  try {
    $result = @{
      Path = $path
    }
    
    # Try Shell.Application first (more extensive properties)
    try {
      $shell = New-Object -ComObject Shell.Application
      $folder = $shell.NameSpace([System.IO.Path]::GetDirectoryName($path))
      $item = $folder.ParseName([System.IO.Path]::GetFileName($path))
      
      # Extended properties that match what we need
      $result.Target = $item.ExtendedProperty("Link.TargetPath")
      $result.AppUserModelID = $item.ExtendedProperty("System.AppUserModel.ID")
      $result.Description = $item.ExtendedProperty("System.FileDescription") 
      $result.Arguments = $item.ExtendedProperty("Link.Arguments")
      $result.WorkingDirectory = $item.ExtendedProperty("Link.WorkingDirectory")
      $result.IconLocation = $item.ExtendedProperty("Link.IconPath")
      if ($result.IconLocation -and $item.ExtendedProperty("Link.IconIndex")) {
        $result.IconLocation += "," + $item.ExtendedProperty("Link.IconIndex")
      }
    } catch {
      # Shell.Application method failed or didn't provide complete information
    }
    
    # Fallback to WScript.Shell for any missing properties
    $useWscript = $false
    @("Target", "WorkingDirectory", "IconLocation", "Description", "Arguments") | ForEach-Object {
      if ([string]::IsNullOrEmpty($result[$_])) { $useWscript = $true }
    }
    
    if ($useWscript) {
      try {
        $wshell = New-Object -ComObject WScript.Shell
        $shortcut = $wshell.CreateShortcut($path)
        
        # Only fill in missing properties
        if ([string]::IsNullOrEmpty($result.Target)) { $result.Target = $shortcut.TargetPath }
        if ([string]::IsNullOrEmpty($result.WorkingDirectory)) { $result.WorkingDirectory = $shortcut.WorkingDirectory }
        if ([string]::IsNullOrEmpty($result.IconLocation)) { $result.IconLocation = $shortcut.IconLocation }
        if ([string]::IsNullOrEmpty($result.Description)) { $result.Description = $shortcut.Description }
        if ([string]::IsNullOrEmpty($result.Arguments)) { $result.Arguments = $shortcut.Arguments }
      } catch {
        # WScript fallback failed
      }
    }
    
    # Ensure we have a "RealTarget" property for backward compatibility
    if ($result.Target) {
      $result.RealTarget = $result.Target
    }
    
    return $result | ConvertTo-Json
  } catch {
    return "{}"
  }
}

Get-ShortcutInfo -path "$Env:SHORTCUT_PATH"
`

/**
 * Extract shortcut information using PowerShell in batches
 * @param {string[]} shortcutPaths - Array of paths to .lnk files
 * @returns {Promise<object[]>} - Array of shortcut information
 */
async function extractShortcutInfoBatch(shortcutPaths, batchSize = 10) {
  const results = []

  // Process in batches for better performance
  for (let i = 0; i < shortcutPaths.length; i += batchSize) {
    const batch = shortcutPaths.slice(i, i + batchSize)
    const batchScript = `
      $shortcuts = @(
        ${batch.map(path => `"${path.replace(/"/g, '`"')}"`).join(',\n        ')}
      )
      
      $results = @{}
      
      foreach ($path in $shortcuts) {
        ${SHORTCUT_EXTRACTION_SCRIPT.replace('function Get-ShortcutInfo {', 'function Extract-SingleShortcut {').replace('Get-ShortcutInfo -path "$Env:SHORTCUT_PATH"', '')}
        
        $results[$path] = Extract-SingleShortcut -path $path
      }
      
      ConvertTo-Json -Depth 5 -Compress $results
    `

    try {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        batchScript,
      ])

      const batchResults = JSON.parse(stdout.trim())

      for (const path of batch) {
        if (batchResults[path]) {
          results.push(JSON.parse(batchResults[path]))
        }
        else {
          results.push({})
        }
      }
    }
    catch (error) {
      console.error(`Error processing batch of shortcuts:`, error)
      // Add empty results for this batch to maintain index alignment
      batch.forEach(() => results.push({}))
    }
  }

  return results
}

/**
 * Extract icons in batches
 * @param {Array} shortcuts - Array of shortcut objects with iconLocation
 * @returns {Promise<string[]>} - Array of base64 encoded icons
 */
async function extractIconsAsPngBatch(shortcuts) {
  const iconData = []
  const batchSize = 5 // Process 5 icons at a time

  for (let i = 0; i < shortcuts.length; i += batchSize) {
    const batch = shortcuts.slice(i, i + batchSize)
    const iconScript = `
    Add-Type -AssemblyName System.Drawing
    
    function Convert-IconToPng {
      param(
        [string]$iconPath,
        [int]$iconIndex,
        [string]$shortcutPath
      )
      
      try {
        # First try using the original icon path if available
        if (-not [string]::IsNullOrEmpty($iconPath)) {
          try {
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($iconPath)
            if ($icon -ne $null) {
              $bitmap = [System.Drawing.Bitmap]::new($icon.Width, $icon.Height)
              $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
              $graphics.DrawIcon($icon, 0, 0)
              $graphics.Dispose()
              
              $memoryStream = New-Object System.IO.MemoryStream
              $bitmap.Save($memoryStream, [System.Drawing.Imaging.ImageFormat]::Png)
              $bitmap.Dispose()
              $icon.Dispose()
              
              $base64 = [Convert]::ToBase64String($memoryStream.ToArray())
              $memoryStream.Dispose()
              
              return $base64
            }
          } catch {
            # Silently fail and try the next method
          }
        }
        
        # Fall back to extracting directly from the .lnk file if provided
        if (-not [string]::IsNullOrEmpty($shortcutPath) -and $shortcutPath.EndsWith(".lnk")) {
          try {
            $shell = New-Object -ComObject Shell.Application
            $folder = $shell.NameSpace([System.IO.Path]::GetDirectoryName($shortcutPath))
            $item = $folder.ParseName([System.IO.Path]::GetFileName($shortcutPath))
            
            # Get the icon from the shortcut item
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($shortcutPath)
            if ($icon -ne $null) {
              $bitmap = [System.Drawing.Bitmap]::new($icon.Width, $icon.Height)
              $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
              $graphics.DrawIcon($icon, 0, 0)
              $graphics.Dispose()
              
              $memoryStream = New-Object System.IO.MemoryStream
              $bitmap.Save($memoryStream, [System.Drawing.Imaging.ImageFormat]::Png)
              $bitmap.Dispose()
              $icon.Dispose()
              
              $base64 = [Convert]::ToBase64String($memoryStream.ToArray())
              $memoryStream.Dispose()
              
              return $base64
            }
          } catch {
            # Silently fail
          }
        }
        
        return $null
      } catch {
        return $null
      }
    }
    
    $results = @{}
    
    ${batch.map((shortcut, idx) => `
    # Process icon ${idx}
    try {
      $iconPath = "${shortcut.iconLocation ? shortcut.iconLocation.split(',')[0].replace(/"/g, '`"') : ''}"
      $iconIndex = ${shortcut.iconLocation?.includes(',') ? shortcut.iconLocation.split(',')[1] : 0}
      $shortcutPath = "${shortcut.path ? shortcut.path.replace(/"/g, '`"') : ''}"
      $results["icon${idx}"] = Convert-IconToPng -iconPath $iconPath -iconIndex $iconIndex -shortcutPath $shortcutPath
    } catch {
      $results["icon${idx}"] = $null
    }
    `).join('\n')}
    
    ConvertTo-Json -Compress $results
    `

    try {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        iconScript,
      ])

      const batchResults = JSON.parse(stdout.trim())

      for (let j = 0; j < batch.length; j++) {
        const base64Data = batchResults[`icon${j}`]
        iconData.push(base64Data ? `data:image/png;base64,${base64Data}` : null)
      }
    }
    catch (error) {
      console.error('Error extracting icons:', error)
      batch.forEach(() => iconData.push(null))
    }
  }

  return iconData
}

/**
 * Recursively scan a directory for .lnk files
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} - List of .lnk file paths
 */
async function findShortcutsRecursively(dir) {
  let results = []

  try {
    const entries = await readdir(dir)

    for (const entry of entries) {
      const entryPath = path.join(dir, entry)
      const stats = await stat(entryPath)

      if (stats.isDirectory()) {
        results = results.concat(await findShortcutsRecursively(entryPath))
      }
      else if (entry.toLowerCase().endsWith('.lnk')) {
        results.push(entryPath)
      }
    }
  }
  catch (error) {
    console.error(`Error scanning directory ${dir}:`, error)
  }

  return results
}

/**
 * Index all Start Menu shortcuts
 * @returns {Promise<Array>} - List of application objects
 */
export async function indexStartMenuApps() {
  const applications = []

  try {
    // Get all users and current user Start Menu paths
    const allUsersStartMenu = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    const userStartMenu = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')

    // Find all shortcuts in both locations
    const startMenuShortcuts = [
      ...await findShortcutsRecursively(allUsersStartMenu),
      ...await findShortcutsRecursively(userStartMenu),
    ]

    console.log(`Found ${startMenuShortcuts.length} shortcuts in Start Menu folders`)

    if (startMenuShortcuts.length > 0) {
      // Process shortcuts in batches
      const shortcutInfoBatch = await extractShortcutInfoBatch(startMenuShortcuts)

      // Extract icons in parallel batches
      const shortcutsWithIcons = shortcutInfoBatch.map((info, index) => ({
        info,
        path: startMenuShortcuts[index],
        iconLocation: info.IconLocation || (info.Target ? info.Target : null),
      }))

      const iconsBatch = await extractIconsAsPngBatch(shortcutsWithIcons)

      // Process the results
      for (let i = 0; i < shortcutInfoBatch.length; i++) {
        const shortcutPath = startMenuShortcuts[i]
        const shortcutInfo = shortcutInfoBatch[i]
        const icon = iconsBatch[i]

        if (!shortcutInfo.Target && !shortcutInfo.RealTarget)
          continue

        // Get the shortcut name from filename without extension
        const name = path.basename(shortcutPath, '.lnk')

        // Use RealTarget from Shell.Application if available, otherwise default to Target
        const targetPath = shortcutInfo.RealTarget || shortcutInfo.Target

        // Check if the target appears to be a Windows Installer stub
        const isMsiStub = (targetPath && (
          targetPath.includes('\\Microsoft\\Installer\\{')
          || /\{[0-9A-F-]{36}\}/i.test(targetPath)
        ))

        // For MSI stubs, use the shortcut itself as the executable path
        const executablePath = isMsiStub ? shortcutPath : targetPath

        applications.push({
          name,
          path: executablePath,
          targetPath,
          shortcutPath: isMsiStub ? shortcutPath : null,
          appUserModelID: shortcutInfo.AppUserModelID || null,
          icon,
          applicationType: isMsiStub ? 'lnk' : 'exe',
          description: shortcutInfo.Description || '',
          arguments: shortcutInfo.Arguments || '',
          workingDirectory: shortcutInfo.WorkingDirectory || (targetPath ? path.dirname(targetPath) : ''),
          iconSource: shortcutInfo.IconLocation || targetPath,
          lastUpdated: Date.now(),
        })
      }
    }
  }
  catch (error) {
    console.error('Error indexing Start Menu applications:', error)
  }

  return applications
}
