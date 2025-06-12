const { defineConfig } = require('eslint/config')
const globals = require('globals')

module.exports = defineConfig([
  ...require('@jcoreio/toolchain/eslintConfig.cjs'),
  {
    files: ['test/**'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': 0,
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 0,
    },
  },
])
