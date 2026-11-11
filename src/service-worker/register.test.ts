import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker, unregisterServiceWorkers } from './register'

function stubServiceWorker({ waiting = true } = {}) {
  const waitingWorker = { postMessage: vi.fn() }
  const registration = {
    unregister: vi.fn(async () => true),
    update: vi.fn(async () => undefined),
    waiting: waiting ? waitingWorker : null,
  }
  const serviceWorker = {
    register: vi.fn(async () => registration),
    getRegistrations: vi.fn(async () => [registration]),
    controller: {},
    addEventListener: vi.fn(),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })
  return { serviceWorker, registration, waitingWorker }
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

async function registerWhileLoaded(hasPendingWrites = () => false) {
  const stub = stubServiceWorker()
  setReadyState('complete')
  registerServiceWorker(hasPendingWrites)
  await vi.waitFor(() =>
    expect(stub.serviceWorker.addEventListener).toHaveBeenCalled(),
  )
  return stub
}

afterEach(() => {
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

    registerServiceWorker(() => false)
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
