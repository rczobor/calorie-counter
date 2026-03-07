import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [viteTsConfigPaths({ projects: ['./tsconfig.json'] }), react()],
  test: {
    environment: 'jsdom',
    watch: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
