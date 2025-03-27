module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx,vue}'],
  darkMode: 'class', // enable class-based dark mode
  theme: {
    extend: {
      colors: {
        accent: {
          50: 'var(--accent-color-50)',
          100: 'var(--accent-color-100)',
          200: 'var(--accent-color-200)',
          300: 'var(--accent-color-300)',
          400: 'var(--accent-color-400)',
          500: 'var(--accent-color-500)',
          600: 'var(--accent-color-600)',
          700: 'var(--accent-color-700)',
          800: 'var(--accent-color-800)',
          900: 'var(--accent-color-900)',
          DEFAULT: 'var(--accent-color-500)',
        },
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
