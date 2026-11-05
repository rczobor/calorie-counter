import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

const e2eConvexReactAdapter = fileURLToPath(
  new URL('./src/testing/e2e/convex-react-adapter.tsx', import.meta.url),
)

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useE2eMocks =
    mode === 'e2e' && env.VITE_E2E_MOCKS?.toLowerCase() === 'true'

  if (useE2eMocks && command === 'build') {
    throw new Error(
      'VITE_E2E_MOCKS is a dev-server-only test adapter and cannot be used for a production build.',
    )
  }

  return {
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              // Keep startup dependencies together instead of requiring dozens
              // of tiny shared chunks before authentication can begin.
              codeSplitting: {
                groups: [
                  { name: 'startup', tags: ['$initial'] },
                  {
                    name: 'dashboard',
                    test: /[\\/]src[\\/]features[\\/]meals[\\/]day-dashboard\.tsx$/,
                  },
                ],
              },
            },
          },
        },
      },
    },
    resolve: {
      tsconfigPaths: true,
      alias: useE2eMocks
        ? [
            {
              find: /^convex\/react$/,
              replacement: e2eConvexReactAdapter,
            },
            {
              find: /^convex\/react-clerk$/,
              replacement: e2eConvexReactAdapter,
            },
          ]
        : [],
    },
    plugins: [
      devtools(),
      tailwindcss(),
      tanstackStart({
        router: {
          routeFileIgnorePattern: '\\.(test|spec)\\.[jt]sx?$',
        },
        // The shell contains no account data. Serve it without a server cold start;
        // protected routes still authenticate and subscribe in the browser.
        prerender: { enabled: true, crawlLinks: false },
      }),
      nitro(),
      viteReact(),
      babel({
        presets: [reactCompilerPreset()],
      }),
    ],
  }
})
