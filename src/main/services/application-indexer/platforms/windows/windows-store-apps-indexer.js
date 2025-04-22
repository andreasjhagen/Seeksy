import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Simplified PowerShell script to get Windows Store apps
const WINDOWS_STORE_APPS_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-AppIcon {
  param (
    [string]$manifestPath,
    [string]$logoPath
  )
  
  try {
    if (-not $logoPath) { return $null }
    
    $packageDir = [System.IO.Path]::GetDirectoryName($manifestPath)
    $iconPath = [System.IO.Path]::Combine($packageDir, $logoPath)
    
    # Check for file existence with various scale/theme variants if the base path doesn't exist
    if (-not [System.IO.File]::Exists($iconPath)) {
      # Try common scale variations
      $scales = @('scale-100', 'scale-150', 'scale-200', 'scale-400')
      $themes = @('', 'light', 'dark')
      
      $extension = [System.IO.Path]::GetExtension($iconPath)
      $nameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($iconPath)
      $directory = [System.IO.Path]::GetDirectoryName($iconPath)
      
      # Try to find the best icon variant
      foreach ($scale in $scales) {
        foreach ($theme in $themes) {
          $themeStr = if ($theme) { ".$theme" } else { "" }
          $scaleVariant = [System.IO.Path]::Combine($directory, "$nameWithoutExt$themeStr.$scale$extension")
          
          if ([System.IO.File]::Exists($scaleVariant)) {
            $iconPath = $scaleVariant
            $found = $true
            break
          }
        }
        if ($found) { break }
      }
      
      # If no icon found, return null
      if (-not $found -and -not [System.IO.File]::Exists($iconPath)) { 
        return $null 
      }
    }
    
    # Process the icon
    $iconBytes = [System.IO.File]::ReadAllBytes($iconPath)
    $base64 = [Convert]::ToBase64String($iconBytes)
    
    # Determine image format from extension
    $extension = [System.IO.Path]::GetExtension($iconPath).ToLower()
    $format = switch ($extension) {
      ".png" { "png" }
      ".jpg" { "jpeg" }
      ".jpeg" { "jpeg" }
      default { "png" }
    }
    
    return @{
      data = $base64
      format = $format
    }
  }
  catch {
    return $null
  }
}

$results = @()

Get-AppxPackage | ForEach-Object {
  $package = $_
  $manifestPath = Join-Path $package.InstallLocation "AppxManifest.xml"
  
  if (Test-Path $manifestPath) {
    try {
      [xml]$manifest = Get-Content $manifestPath
      $applications = $manifest.Package.Applications.Application
      
      foreach ($app in $applications) {
        if ($app.VisualElements) {
          $appId = $app.Id
          
          # Skip entries without executable
          if (-not $app.Executable) { continue }
          
          $displayName = $app.VisualElements.DisplayName
          
          # Handle resource references with fallback to package name
          if ($displayName -match "^ms-resource:") {
            $displayName = $package.Name
          }
          
          # Get logo path, trying multiple options
          $logoPath = $null
          $logoPaths = @(
            $app.VisualElements.Square44x44Logo,
            $app.VisualElements.Square150x150Logo,
            $app.VisualElements.Logo
          )
          
          foreach ($path in $logoPaths) {
            if ($path) {
              $logoPath = $path
              break
            }
          }
          
          # Remove scale/theme variations from path
          if ($logoPath) {
            $logoPath = $logoPath -replace '\\.scale-.*$', '' -replace '\\.theme-.*$', ''
          }
          
          $icon = Get-AppIcon -manifestPath $manifestPath -logoPath $logoPath
          
          $results += @{
            name = $displayName
            packageName = $package.Name
            familyName = $package.PackageFamilyName
            appId = $appId
            icon = $icon
          }
        }
      }
    }
    catch {
      # Silently continue on errors
    }
  }
}

ConvertTo-Json -InputObject $results -Compress
`

/**
 * Format app name to be more human-friendly
 * @param {string} name - Original app name
 * @param {string} packageName - App package name
 * @returns {string} - Formatted app name
 */
function formatAppName(name, packageName) {
  // If the name is already human-friendly (no dots or special format), return as is
  if (!/^[A-Z0-9]+\.[A-Z0-9]+/i.test(name) && !name.includes('.')) {
    return name
  }

  // Handle special cases for common apps
  const specialCases = {
    'Microsoft.Paint': 'Paint',
    'Microsoft.ScreenSketch': 'Snipping Tool',
    'Microsoft.WindowsCalculator': 'Calculator',
    'Microsoft.WindowsStore': 'Microsoft Store',
    'Microsoft.WindowsNotepad': 'Notepad',
    'Microsoft.WindowsAlarms': 'Alarms & Clock',
    'Microsoft.WindowsFeedbackHub': 'Feedback Hub',
    'Microsoft.WindowsMaps': 'Maps',
    'Microsoft.MicrosoftEdge': 'Microsoft Edge',
    'Microsoft.BingWeather': 'Weather',
    'Microsoft.ZuneVideo': 'Movies & TV',
    'Microsoft.ZuneMusic': 'Groove Music',
    'Microsoft.XboxApp': 'Xbox',
    'Microsoft.WindowsTerminal': 'Windows Terminal',
    'Microsoft.MicrosoftStickyNotes': 'Sticky Notes',
    'Microsoft.GetHelp': 'Get Help',
    'Microsoft.MicrosoftSolitaireCollection': 'Microsoft Solitaire Collection',
  }

  if (specialCases[packageName]) {
    return specialCases[packageName]
  }

  // Remove Microsoft. prefix if present
  let formattedName = name.replace(/^Microsoft\./, '')

  // Extract app name from patterns like "CompanyName.AppName"
  if (/^[A-Z0-9]+\.[A-Z0-9]+/i.test(formattedName)) {
    formattedName = formattedName.split('.').pop()
  }

  // Replace remaining dots with spaces
  formattedName = formattedName.replace(/\./g, ' ')

  // Capitalize each word
  formattedName = formattedName.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substring(1)
  })

  return formattedName
}

/**
 * Indexes Windows Store (UWP) applications
 * @returns {Promise<Array>} - List of Windows Store applications
 */
export async function indexWindowsStoreApps() {
  const applications = []

  // Simplified filter for system apps
  const systemPackagePatterns = [
    /^Microsoft\.NET\./i,
    /^Microsoft\.UI\./i,
    /^Microsoft\.VCLibs\./i,
    /^Windows\..*?\.?Runtime$/i,
    /\.RuntimeBroker$/i,
  ]

  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      WINDOWS_STORE_APPS_SCRIPT,
    ])

    const storeApps = JSON.parse(stdout.trim())

    for (const app of storeApps) {
      // Skip system packages
      if (systemPackagePatterns.some(pattern => pattern.test(app.packageName))) {
        continue
      }

      // Format the app name to be more human-friendly
      const formattedName = formatAppName(app.name, app.packageName)

      applications.push({
        // Essential fields only
        name: formattedName,
        protocolUri: `shell:AppsFolder\\${app.familyName}!${app.appId}`,
        icon: app.icon?.data ? `data:image/${app.icon.format};base64,${app.icon.data}` : null,
        path: `shell:AppsFolder\\${app.familyName}!${app.appId}`,
        requiresProtocolLaunch: true,
        applicationType: 'uwp',
        lastUpdated: Date.now(),
      })
    }

    console.log(`Indexed ${applications.length} Windows Store apps`)
  }
  catch (error) {
    console.error('Error indexing Windows Store applications:', error)
  }

  return applications
}
