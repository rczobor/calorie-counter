import { PagePlaceholder } from '@/components/page/page-placeholder'
import { lazy, Suspense, useEffect } from 'react'
import {
  HeadContent,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { ClerkLoaded, ClerkLoading, Show, SignInButton } from '@clerk/react'
import {
  buildClerkJsScriptAttributes,
  buildClerkUIScriptAttributes,
  clerkJsScriptUrl,
  clerkUIScriptUrl,
} from '@clerk/react/internal'
import { useConvexAuth } from 'convex/react'

import Header, { BottomNavigation } from '../components/Header'
import { InstallProvider } from '@/features/install/install-provider'
import { HouseholdProvider } from '@/features/households/household-context'

import ClerkProvider from '../integrations/clerk/provider'
import {
  clerkPublishableKey,
  isClerkConfigured,
  sharedClerkUiUrl,
} from '../integrations/clerk/config'

import ConvexProvider from '../integrations/convex/provider'
import { convexUrl, isConvexConfigured } from '../integrations/convex/config'
import { ThemeProvider } from '../components/theme-provider'
import { Button } from '../components/ui/button'
import { isE2eMockMode } from '../testing/e2e/config'
import { markStartup } from '@/lib/startup-timing'
import { AccountLocaleSync } from '@/features/language/language-setting'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { messages } from './__root.messages'
import {
  registerServiceWorker,
  unregisterServiceWorkers,
} from '@/service-worker/register'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'

import appCss from '../styles.css?url'
import interFont from '@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2?url'

const APP_DESCRIPTION =
  'Track meals, calories, people, goals, recipes, and cooking sessions.'
// The grouped page backgrounds (--background), so the status bar blends in.
const LIGHT_THEME_COLOR = '#f2f2f7'
const DARK_THEME_COLOR = '#000000'
const IS_MAINTENANCE_MODE =
  import.meta.env.VITE_MAINTENANCE_MODE?.toLowerCase() === 'true'
const Toaster = lazy(async () => ({
  default: (await import('../components/ui/sonner')).Toaster,
}))
const clerkScriptOptions =
  clerkPublishableKey && !isE2eMockMode && !IS_MAINTENANCE_MODE
    ? { publishableKey: clerkPublishableKey }
    : null

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        // iOS reports every env(safe-area-inset-*) as 0 without
        // viewport-fit=cover, which puts the home indicator over the bottom
        // navigation in the installed app.
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        name: 'description',
        content: APP_DESCRIPTION,
      },
      {
        title: 'Calorie Counter',
      },
    ],
    links: [
      // Fetch the shared UI early, but let Clerk execute it after React registers.
      ...(clerkScriptOptions && sharedClerkUiUrl
        ? [
            {
              rel: 'preload',
              as: 'script',
              href: sharedClerkUiUrl,
              crossOrigin: 'anonymous' as const,
            },
          ]
        : []),
      {
        rel: 'preload',
        href: interFont,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      ...(convexUrl && !IS_MAINTENANCE_MODE
        ? [
            {
              rel: 'preconnect',
              href: convexUrl,
              crossOrigin: 'anonymous' as const,
            },
          ]
        : []),
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
      {
        rel: 'icon',
        href: '/favicon.ico',
        sizes: '48x48',
      },
      {
        rel: 'icon',
        href: '/pwa-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon-180x180.png',
        sizes: '180x180',
      },
    ],
    scripts: clerkScriptOptions
      ? [
          {
            ...buildClerkJsScriptAttributes(clerkScriptOptions),
            'data-clerk-js-script': true,
            src: clerkJsScriptUrl(clerkScriptOptions),
            async: true,
            crossOrigin: 'anonymous',
          },
          ...(!sharedClerkUiUrl
            ? [
                {
                  ...buildClerkUIScriptAttributes(clerkScriptOptions),
                  'data-clerk-ui-script': true,
                  src: clerkUIScriptUrl(clerkScriptOptions),
                  async: true,
                  crossOrigin: 'anonymous' as const,
                },
              ]
            : []),
        ]
      : [],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const locale = useLocale()
  const accountPage = useRouterState({
    select: (state) =>
      ['/settings', '/settings/integrations', '/connect'].includes(
        state.location.pathname,
      ),
  })
  useEffect(() => {
    markStartup('app')
    if (IS_MAINTENANCE_MODE) unregisterServiceWorkers()
    else if (import.meta.env.PROD && !isE2eMockMode) registerServiceWorker()
  }, [])
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta
          name="theme-color"
          content={LIGHT_THEME_COLOR}
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content={DARK_THEME_COLOR}
          media="(prefers-color-scheme: dark)"
        />
        <HeadContent />
      </head>
      <body>
        <Analytics />
        <SpeedInsights />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {IS_MAINTENANCE_MODE ? (
            <MaintenanceScreen />
          ) : (
            <ClerkProvider>
              <ConvexProvider>
                <InstallProvider>
                  {/* Phones reserve room for the fixed bottom navigation and keep
                      landscape content clear of the notch. */}
                  <div className="flex min-h-dvh flex-col pr-[env(safe-area-inset-right)] pb-[calc(4rem+max(0.75rem,env(safe-area-inset-bottom)_-_0.5rem))] pl-[env(safe-area-inset-left)] md:pb-0">
                    <Header />
                    <AuthGate>
                      <AccountLocaleSync />
                      <HouseholdProvider accountPage={accountPage}>
                        {children}
                      </HouseholdProvider>
                    </AuthGate>
                    <BottomNavigation />
                  </div>
                </InstallProvider>
                <Suspense fallback={null}>
                  <Toaster
                    richColors
                    mobileOffset={{
                      bottom: 'calc(5rem + env(safe-area-inset-bottom))',
                    }}
                  />
                </Suspense>
                {import.meta.env.DEV ? (
                  <TanStackDevtools
                    config={{
                      // Clear of the phone bottom navigation and its Log meal button.
                      position: 'middle-left',
                    }}
                    plugins={[
                      {
                        name: 'Tanstack Router',
                        render: <TanStackRouterDevtoolsPanel />,
                      },
                    ]}
                  />
                ) : null}
              </ConvexProvider>
            </ClerkProvider>
          )}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

function MaintenanceScreen() {
  const t = useMessages(messages)
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <Card className="w-full max-w-xl">
        <CardHeader className="space-y-3">
          <CardTitle>{t.maintenanceTitle}</CardTitle>
          <CardDescription>{t.maintenanceDescription}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const t = useMessages(messages)
  if (isE2eMockMode) {
    return <ConvexAuthReady>{children}</ConvexAuthReady>
  }

  if (!isClerkConfigured) {
    return (
      <main className="flex-1 px-4 py-10 sm:px-6">
        <Card className="mx-auto max-w-xl">
          <CardHeader className="space-y-3">
            <CardTitle>{t.authSetupTitle}</CardTitle>
            <CardDescription>{t.authSetupDescription}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (!isConvexConfigured) {
    return (
      <AuthStatusCard
        title={t.dataSetupTitle}
        description={t.dataSetupDescription}
      />
    )
  }

  return (
    <>
      <ClerkLoading>
        <SessionLoading />
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in">
          <ConvexAuthReady>{children}</ConvexAuthReady>
        </Show>
        <Show when="signed-out">
          <AuthStatusCard
            title={t.signInTitle}
            description={t.signInDescription}
            action={
              <SignInButton mode="modal">
                <Button>{t.signIn}</Button>
              </SignInButton>
            }
          />
        </Show>
      </ClerkLoaded>
    </>
  )
}

function ConvexAuthReady({ children }: { children: React.ReactNode }) {
  const t = useMessages(messages)
  const { isLoading, isAuthenticated } = useConvexAuth()
  useEffect(() => {
    markStartup('clerk')
  }, [])
  useEffect(() => {
    if (!isLoading && isAuthenticated) markStartup('convex')
  }, [isLoading, isAuthenticated])

  if (isLoading) {
    return <SessionLoading />
  }

  if (!isAuthenticated) {
    return (
      <AuthStatusCard
        title={t.sessionFailedTitle}
        description={t.sessionFailedDescription}
      />
    )
  }

  return <>{children}</>
}

function SessionLoading() {
  const t = useMessages(messages)
  return <PagePlaceholder label={t.preparingSession} />
}

function AuthStatusCard({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <main className="flex-1 px-4 py-10 sm:px-6">
      <Card className="mx-auto max-w-xl">
        <CardHeader className="space-y-3">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          {action ? <div className="pt-2">{action}</div> : null}
        </CardHeader>
      </Card>
    </main>
  )
}
