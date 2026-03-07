import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import {
  ClerkLoaded,
  ClerkLoading,
  SignInButton,
  SignedIn,
  SignedOut,
} from '@clerk/clerk-react'
import { useConvexAuth } from 'convex/react'

import Header from '../components/Header'

import ClerkProvider from '../integrations/clerk/provider'
import { isClerkConfigured } from '../integrations/clerk/config'

import ConvexProvider from '../integrations/convex/provider'
import { ThemeProvider } from '../components/theme-provider'
import { Toaster } from '../components/ui/sonner'
import { Button } from '../components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Calorie Counter Shell',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClerkProvider>
            <ConvexProvider>
              <Header />
              <AuthGate>{children}</AuthGate>
              <Toaster richColors />
              <TanStackDevtools
                config={{
                  position: 'bottom-right',
                }}
                plugins={[
                  {
                    name: 'Tanstack Router',
                    render: <TanStackRouterDevtoolsPanel />,
                  },
                ]}
              />
            </ConvexProvider>
          </ClerkProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

function AuthGate({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured) {
    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-10 sm:px-6">
        <Card className="mx-auto max-w-xl">
          <CardHeader className="space-y-3">
            <CardTitle>Authentication setup required</CardTitle>
            <CardDescription>
              Add `VITE_CLERK_PUBLISHABLE_KEY` to your project `.env.local` to
              sign in and access data.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  return (
    <>
      <ClerkLoading>
        <AuthStatusCard
          title="Loading session"
          description="Checking your authentication status..."
        />
      </ClerkLoading>
      <ClerkLoaded>
        <SignedIn>
          <ConvexAuthReady>{children}</ConvexAuthReady>
        </SignedIn>
        <SignedOut>
          <AuthStatusCard
            title="Sign in required"
            description="You must be signed in to view or manage calorie data."
            action={
              <SignInButton mode="modal">
                <Button>Sign in to continue</Button>
              </SignInButton>
            }
          />
        </SignedOut>
      </ClerkLoaded>
    </>
  )
}

function ConvexAuthReady({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()

  if (isLoading) {
    return (
      <AuthStatusCard
        title="Preparing secure session"
        description="Connecting your sign-in session to data access..."
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <AuthStatusCard
        title="Session verification failed"
        description="Sign out and sign in again. If this persists, create a Clerk JWT template named `convex` (audience `convex`), verify CLERK_JWT_ISSUER_DOMAIN, then restart `bunx convex dev`."
      />
    )
  }

  return <>{children}</>
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
    <main className="min-h-[calc(100vh-4rem)] px-4 py-10 sm:px-6">
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
