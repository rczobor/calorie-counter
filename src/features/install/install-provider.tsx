import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'

const ENGAGED_KEY = 'calorie-counter:install:has-logged-meal'
const DISMISSED_KEY = 'calorie-counter:install:dismissed'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: InstallPromptEvent
  }
}

function readFlag(key: string) {
  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, 'true')
  } catch {
    // Installation remains available through Settings when storage is blocked.
  }
}

export function rememberLoggedMeal() {
  writeFlag(ENGAGED_KEY)
}

function getPlatform() {
  if (typeof navigator === 'undefined') return 'other'
  const { userAgent, maxTouchPoints } = navigator
  if (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  )
    return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  if (
    /Macintosh/.test(userAgent) &&
    /Safari/.test(userAgent) &&
    !/Chrome|Chromium|Edg/.test(userAgent)
  )
    return 'safari'
  return 'other'
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  )
}

function subscribeDisplayMode(onChange: () => void) {
  const displayMode = window.matchMedia('(display-mode: standalone)')
  displayMode.addEventListener('change', onChange)
  return () => displayMode.removeEventListener('change', onChange)
}

const serverStandalone = () => true

function useInstallState() {
  // Snapshot engagement before children can record this visit's first meal.
  const [returning] = useState(() => readFlag(ENGAGED_KEY))
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISSED_KEY))
  const [platform] = useState(getPlatform)
  const standalone = useSyncExternalStore(
    subscribeDisplayMode,
    isStandalone,
    serverStandalone,
  )
  const [installed, setInstalled] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  )
  const [pending, setPending] = useState(false)

  useEffect(() => {
    function beforeInstall(event: InstallPromptEvent) {
      event.preventDefault()
      setInstallPrompt(event)
    }
    function appInstalled() {
      setInstalled(true)
      setInstallPrompt(null)
      writeFlag(DISMISSED_KEY)
    }
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', appInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', appInstalled)
    }
  }, [])

  function dismiss() {
    writeFlag(DISMISSED_KEY)
    setDismissed(true)
  }

  async function promptInstall() {
    if (!installPrompt || pending) return
    setPending(true)
    try {
      await installPrompt.prompt()
      await installPrompt.userChoice
      dismiss()
    } finally {
      // A browser install event can only be used once, even after dismissal.
      setInstallPrompt(null)
      setPending(false)
    }
  }

  const available = !standalone && !installed
  return {
    platform,
    available,
    suggest:
      available &&
      returning &&
      !dismissed &&
      (platform === 'ios' || installPrompt !== null),
    canPrompt: installPrompt !== null,
    pending,
    promptInstall,
    dismiss,
  }
}

const InstallContext = createContext<ReturnType<typeof useInstallState> | null>(
  null,
)

export function InstallProvider({ children }: { children: ReactNode }) {
  const value = useInstallState()
  return (
    <InstallContext.Provider value={value}>{children}</InstallContext.Provider>
  )
}

export function useInstall() {
  return useContext(InstallContext)
}
