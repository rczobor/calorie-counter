import { defineConfig, mergeConfig } from 'vitest/config'

import baseConfig from './vitest.config.ts'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        thresholds: {
          perFile: true,
          statements: 20,
          branches: 10,
          functions: 20,
          lines: 20,
        },
      },
    },
  }),
)
