//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  {
    ignores: [
      '.output/**',
      '.source/**',
      '.tanstack/**',
      '.nitro/**',
      '.vinxi/**',
      'node_modules/**',
      '*.config.js',
    ],
  },
  ...tanstackConfig,
]
