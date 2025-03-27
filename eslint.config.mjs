import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['node_modules', '**/node_modules/**', 'dist', '**/dist/**', 'out', '**/out/**', '.gitignore', '**/.gitignore/**'],
  formatters: true,
  vue: true,
  rules: {
    'no-console': 'off',
    'node/prefer-global/process': 'off',
  },
})
