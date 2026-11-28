import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerServiceWorker,
  unregisterServiceWorkers,
  type AppUpdate,
} from './register'

function stubServiceWorker({ waiting = true } = {}) {
  const waitingWorker = { postMessage: vi.fn() }
  const registration = Object.assign(new EventTarget(), {
    unregister: vi.fn(async () => true),
    update: vi.fn(async () => undefined),
    installing: null as (EventTarget & { state: string }) | null,
    waiting: waiting ? waitingWorker : null,
  })
  const serviceWorker = Object.assign(new EventTarget(), {
    register: vi.fn(async () => registration),
    getRegistrations: vi.fn(async () => [registration]),
    controller: {},
  })
  vi.spyOn(serviceWorker, 'addEventListener')
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })
  return { serviceWorker, registration, waitingWorker }
}

function stubReload() {
  const reload = vi.fn()
  vi.stubGlobal('location', { reload })
  return reload
}

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: state,
  })
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

async function registerWhileLoaded(
  hasPendingWrites = () => false,
  { waiting = true, onUpdate = vi.fn<(update: AppUpdate) => void>() } = {},
) {
  const stub = stubServiceWorker({ waiting })
  setReadyState('complete')
  registerServiceWorker(hasPendingWrites, onUpdate)
  await vi.waitFor(() =>
    expect(stub.serviceWorker.addEventListener).toHaveBeenCalled(),
  )
  return { ...stub, onUpdate }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setVisibility('visible')
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(document, 'readyState')
  Reflect.deleteProperty(document, 'visibilityState')
  document.body.innerHTML = ''
})

describe('service worker registration', () => {
  it('waits for the page to finish loading before installing', () => {
    const { serviceWorker } = stubServiceWorker()
    setReadyState('interactive')

    registerServiceWorker(() => false, vi.fn())
    expect(serviceWorker.register).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('load'))

    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js')
  })

  it('removes installed workers for maintenance builds', async () => {
    const { registration } = stubServiceWorker()

    unregisterServiceWorkers()

    await vi.waitFor(() => expect(registration.unregister).toHaveBeenCalled())
  })
})

describe('updating a resumed app', () => {
  it('checks for a deploy when the app comes back', async () => {
    const { registration } = await registerWhileLoaded()

    setVisibility('visible')

    expect(registration.update).toHaveBeenCalled()
  })

  it('switches to a downloaded build once the app is hidden', async () => {
    const { waitingWorker } = await registerWhileLoaded()

    setVisibility('hidden')

    expect(waitingWorker.postMessage).toHaveBeenCalledWith('activate')
  })

  it('keeps the current build while a write is still on its way', async () => {
    const { waitingWorker } = await registerWhileLoaded(() => true)

    setVisibility('hidden')

    expect(waitingWorker.postMessage).not.toHaveBeenCalled()
  })

  it('keeps the current build while a dialog is open', async () => {
    const { waitingWorker } = await registerWhileLoaded()
    document.body.innerHTML = '<div role="dialog"></div>'

    setVisibility('hidden')

    expect(waitingWorker.postMessage).not.toHaveBeenCalled()
  })

  it('keeps typed input until it is cleared or its form is gone', async () => {
    const { waitingWorker } = await registerWhileLoaded()
    document.body.innerHTML = '<input />'
    const input = document.querySelector('input')!
    input.value = '120'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    setVisibility('hidden')
    expect(waitingWorker.postMessage).not.toHaveBeenCalled()

    input.value = ''
    setVisibility('hidden')
    expect(waitingWorker.postMessage).toHaveBeenCalledTimes(1)

    input.value = '80'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.remove()
    setVisibility('hidden')
    expect(waitingWorker.postMessage).toHaveBeenCalledTimes(2)
  })

  it('ignores switches, which save as they change', async () => {
    const { waitingWorker } = await registerWhileLoaded()
    document.body.innerHTML = '<input type="checkbox" />'
    document
      .querySelector('input')!
      .dispatchEvent(new Event('input', { bubbles: true }))

    setVisibility('hidden')

    expect(waitingWorker.postMessage).toHaveBeenCalledWith('activate')
  })
})

describe('offering a downloaded build', () => {
  it('offers a build that was waiting when the app opened', async () => {
    const { onUpdate } = await registerWhileLoaded()

    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('offers a build once it finishes downloading', async () => {
    const { registration, onUpdate } = await registerWhileLoaded(() => false, {
      waiting: false,
    })
    const installing = Object.assign(new EventTarget(), { state: 'installing' })
    registration.installing = installing
    registration.dispatchEvent(new Event('updatefound'))
    expect(onUpdate).not.toHaveBeenCalled()

    installing.state = 'installed'
    registration.waiting = { postMessage: vi.fn() }
    installing.dispatchEvent(new Event('statechange'))

    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('offers a build that was already downloading when the app opened', async () => {
    const { serviceWorker, registration } = stubServiceWorker({
      waiting: false,
    })
    const installing = Object.assign(new EventTarget(), { state: 'installing' })
    registration.installing = installing
    setReadyState('complete')
    const onUpdate = vi.fn()
    registerServiceWorker(() => false, onUpdate)
    await vi.waitFor(() =>
      expect(serviceWorker.addEventListener).toHaveBeenCalled(),
    )

    installing.state = 'installed'
    registration.waiting = { postMessage: vi.fn() }
    installing.dispatchEvent(new Event('statechange'))

    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('checks hourly while the app stays on screen', async () => {
    vi.useFakeTimers()
    const { registration } = await registerWhileLoaded()

    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(registration.update).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('reports typed input and writes on their way as work a refresh loses', async () => {
    let pending = false
    const { onUpdate } = await registerWhileLoaded(() => pending)
    const [update] = onUpdate.mock.lastCall!
    expect(update.wouldLoseWork()).toBe(false)

    pending = true
    expect(update.wouldLoseWork()).toBe(true)

    pending = false
    document.body.innerHTML = '<input />'
    const input = document.querySelector('input')!
    input.value = '120'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(update.wouldLoseWork()).toBe(true)
  })

  it('switches every tab when someone taps Refresh, then reloads', async () => {
    const reload = stubReload()
    const { serviceWorker, waitingWorker, onUpdate } =
      await registerWhileLoaded()

    onUpdate.mock.lastCall![0].apply()
    expect(waitingWorker.postMessage).toHaveBeenCalledWith('refresh')
    expect(reload).not.toHaveBeenCalled()

    serviceWorker.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalled()
  })

  it('reloads a hidden tab once its build is switched, if nothing is lost', async () => {
    const reload = stubReload()
    const { serviceWorker } = await registerWhileLoaded()
    setVisibility('hidden')

    serviceWorker.dispatchEvent(new Event('controllerchange'))

    expect(reload).toHaveBeenCalled()
  })

  it('offers a reload to an open tab that another tab switched', async () => {
    const reload = stubReload()
    const { serviceWorker, registration, waitingWorker, onUpdate } =
      await registerWhileLoaded()
    onUpdate.mockClear()
    registration.waiting = null

    serviceWorker.dispatchEvent(new Event('controllerchange'))
    expect(reload).not.toHaveBeenCalled()
    expect(onUpdate).toHaveBeenCalledTimes(1)

    // That build is already active, so Refresh only reloads.
    onUpdate.mock.lastCall![0].apply()
    expect(reload).toHaveBeenCalled()
    expect(waitingWorker.postMessage).not.toHaveBeenCalled()
  })
})
