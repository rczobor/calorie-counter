import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallEntry } from './install-entry'
import { InstallProvider, rememberLoggedMeal } from './install-provider'

const engagedKey = 'calorie-counter:install:has-logged-meal'
const dismissedKey = 'calorie-counter:install:dismissed'
let displayMode: EventTarget & { matches: boolean }

beforeEach(() => {
  window.localStorage.clear()
  displayMode = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => displayMode),
  )
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome on Windows')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function show(eligible = true) {
  return render(
    <InstallProvider>
      <InstallEntry variant="suggestion" eligible={eligible} />
      <InstallEntry variant="settings" />
    </InstallProvider>,
  )
}

function offerInstall(
  outcome: 'accepted' | 'dismissed' = 'accepted',
  prompt: () => Promise<void> = vi.fn(async () => {}),
) {
  const event = Object.assign(
    new Event('beforeinstallprompt', { cancelable: true }),
    {
      prompt,
      userChoice: Promise.resolve({ outcome }),
    },
  )
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

describe('installation discovery', () => {
  it('waits for a later visit after a logged meal and a supported install path', () => {
    let view = show()
    rememberLoggedMeal()
    offerInstall()
    expect(screen.queryByText('Keep Calorie Counter handy')).toBeNull()
    view.unmount()
    view = show()
    expect(screen.queryByText('Keep Calorie Counter handy')).toBeNull()
    offerInstall()
    expect(screen.getByText('Keep Calorie Counter handy')).toBeTruthy()
    view.unmount()
  })

  it('respects page eligibility even on a returning visit', () => {
    window.localStorage.setItem(engagedKey, 'true')
    show(false)
    offerInstall()
    expect(screen.queryByText('Keep Calorie Counter handy')).toBeNull()
    expect(
      screen.getByRole('button', { name: /Add to your device/ }),
    ).toBeTruthy()
  })

  it('remembers dismissal and leaves Settings available on subsequent visits', () => {
    window.localStorage.setItem(engagedKey, 'true')
    const view = show()
    offerInstall()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(window.localStorage.getItem(dismissedKey)).toBe('true')
    expect(screen.queryByText('Keep Calorie Counter handy')).toBeNull()
    view.unmount()
    show()
    offerInstall()
    expect(screen.queryByText('Keep Calorie Counter handy')).toBeNull()
    expect(
      screen.getByRole('button', { name: /Add to your device/ }),
    ).toBeTruthy()
  })

  it.each(['accepted', 'dismissed'] as const)(
    'opens the native prompt only on click and consumes it when %s',
    async (outcome) => {
      window.localStorage.setItem(engagedKey, 'true')
      show()
      const event = offerInstall(outcome)
      expect(event.defaultPrevented).toBe(true)
      expect(event.prompt).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
      await waitFor(() =>
        expect(screen.queryByText('Keep Calorie Counter handy')).toBeNull(),
      )
      expect(event.prompt).toHaveBeenCalledTimes(1)
      expect(window.localStorage.getItem(dismissedKey)).toBe('true')
      fireEvent.click(
        screen.getByRole('button', { name: /Add to your device/ }),
      )
      expect(await screen.findByRole('dialog')).toBeTruthy()
      expect(event.prompt).toHaveBeenCalledTimes(1)
    },
  )

  it('prevents duplicate clicks while installation is pending', async () => {
    show()
    let finish = () => {}
    const prompt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    offerInstall('accepted', prompt)
    const button = screen.getByRole('button', { name: /Add to your device/ })
    fireEvent.click(button)
    expect(button).toHaveProperty('disabled', true)
    fireEvent.click(button)
    expect(prompt).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
    })
  })

  it('provides usable manual steps when the native prompt fails', async () => {
    window.localStorage.setItem(engagedKey, 'true')
    show()
    offerInstall(
      'accepted',
      vi.fn(async () => {
        throw new Error('Unavailable')
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('couldn’t open')
    expect(screen.getByText(/Open your browser’s menu/)).toBeTruthy()
  })

  it('hides both entries after installation or when switching to standalone mode', () => {
    window.localStorage.setItem(engagedKey, 'true')
    show()
    offerInstall()
    act(() => {
      displayMode.matches = true
      displayMode.dispatchEvent(new Event('change'))
    })
    expect(screen.queryByText('Keep Calorie Counter handy')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Add to your device/ }),
    ).toBeNull()
    act(() => {
      displayMode.matches = false
      displayMode.dispatchEvent(new Event('change'))
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(
      screen.queryByRole('button', { name: /Add to your device/ }),
    ).toBeNull()
    expect(window.localStorage.getItem(dismissedKey)).toBe('true')
  })

  it.each([
    { userAgent: 'iPhone Safari', touch: 0 },
    { userAgent: 'Macintosh Safari', touch: 5 },
  ])(
    'guides $userAgent users without claiming to install for them',
    async ({ userAgent, touch }) => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
      Object.defineProperty(navigator, 'maxTouchPoints', {
        configurable: true,
        value: touch,
      })
      window.localStorage.setItem(engagedKey, 'true')
      show()
      fireEvent.click(screen.getByRole('button', { name: 'Show me how' }))
      expect(await screen.findByRole('dialog')).toBeTruthy()
      expect(screen.getByText('Share')).toBeTruthy()
      expect(screen.getByText('Add to Home Screen')).toBeTruthy()
      expect(screen.getByText('Open as Web App')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(window.localStorage.getItem(dismissedKey)).toBeNull()
    },
  )

  it.each([
    { userAgent: 'Macintosh Safari', text: 'File → Add to Dock' },
    { userAgent: 'Android Chrome', text: 'Add to Home Screen' },
    { userAgent: 'Chrome on Windows', text: /install icon in the address bar/ },
  ])(
    'keeps manual help in Settings for $userAgent',
    async ({ userAgent, text }) => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
      Object.defineProperty(navigator, 'maxTouchPoints', {
        configurable: true,
        value: 0,
      })
      show()
      fireEvent.click(
        screen.getByRole('button', { name: /Add to your device/ }),
      )
      expect(await screen.findByRole('dialog')).toBeTruthy()
      expect(screen.getByText(text)).toBeTruthy()
    },
  )

  it('keeps Settings usable when local storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    show()
    rememberLoggedMeal()
    fireEvent.click(screen.getByRole('button', { name: /Add to your device/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })
})
