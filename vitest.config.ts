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
      'scripts/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'convex/_generated/**',
        // Deployment/auth configuration is validated by Convex deploy and the
        // authenticated browser smoke rather than unit coverage.
        'convex/auth.config.ts',
        'src/routeTree.gen.ts',
        // Route modules are composition-heavy integration boundaries. Their
        // behavior is covered by route smoke tests rather than unit coverage.
        'src/routes/**',
        // Application-shell and auth adapters are composition boundaries; their
        // behavior is exercised through route and browser smoke tests.
        'src/components/Header.tsx',
        'src/components/theme-provider.tsx',
        'src/components/theme-selector.tsx',
        'src/features/manage/food-groups.tsx',
        'src/integrations/clerk/header-user.tsx',
        'src/router.tsx',
        'src/integrations/clerk/config.ts',
        'src/integrations/clerk/provider.tsx',
        'src/integrations/convex/config.ts',
        'src/integrations/convex/provider.tsx',
        // This adapter is test-only infrastructure exercised by Playwright.
        'src/testing/e2e/**',
        // Generated shadcn primitives are exercised through their consumers.
        // Bespoke primitives (data-table and searchable-picker) stay in scope.
        'src/components/ui/alert-dialog.tsx',
        'src/components/ui/button.tsx',
        'src/components/ui/calendar.tsx',
        'src/components/ui/card.tsx',
        'src/components/ui/date-picker.tsx',
        'src/components/ui/input.tsx',
        'src/components/ui/label.tsx',
        'src/components/ui/popover.tsx',
        'src/components/ui/select.tsx',
        'src/components/ui/skeleton.tsx',
        'src/components/ui/sonner.tsx',
        'src/components/ui/spinner.tsx',
        'src/components/ui/switch.tsx',
        'src/components/ui/table.tsx',
        'src/components/ui/tabs.tsx',
        'src/components/ui/textarea.tsx',
        'src/components/ui/toggle.tsx',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 75,
        lines: 80,
      },
    },
  },
})
