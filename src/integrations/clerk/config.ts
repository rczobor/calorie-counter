import {
  IS_REACT_SHARED_VARIANT_COMPATIBLE,
  clerkUIScriptUrl,
} from '@clerk/react/internal'

export const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
export const isClerkConfigured = Boolean(clerkPublishableKey)

// The script URL helper emits the standalone UI even when Clerk's React
// compatibility check allows sharing the app's existing React runtime.
export const sharedClerkUiUrl =
  clerkPublishableKey && IS_REACT_SHARED_VARIANT_COMPATIBLE
    ? clerkUIScriptUrl({ publishableKey: clerkPublishableKey }).replace(
        /\/ui\.browser\.js$/,
        '/ui.shared.browser.js',
      )
    : undefined
