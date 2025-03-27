function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null
}

function adjustColor(color, amount) {
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r + amount))),
    g: Math.max(0, Math.min(255, Math.round(color.g + amount))),
    b: Math.max(0, Math.min(255, Math.round(color.b + amount))),
  }
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`
}

export function generateColorPalette(baseColor) {
  const base = hexToRgb(baseColor)
  if (!base)
    return null

  const shades = {
    50: { amount: 160 },
    100: { amount: 140 },
    200: { amount: 100 },
    300: { amount: 60 },
    400: { amount: 20 },
    500: { amount: 0 },
    600: { amount: -20 },
    700: { amount: -40 },
    800: { amount: -60 },
    900: { amount: -80 },
  }

  return Object.entries(shades).reduce((acc, [shade, { amount }]) => {
    acc[shade] = rgbToHex(adjustColor(base, amount))
    return acc
  }, {})
}
