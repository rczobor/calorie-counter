import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    watch: false,
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'convex/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'convex/_generated/**',
        'src/routeTree.gen.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
    },
  },
})
