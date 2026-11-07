import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker, unregisterServiceWorkers } from './register'

function stubServiceWorker() {
  const registration = { unregister: vi.fn(async () => true) }
  const serviceWorker = {
    register: vi.fn(async () => registration),
    getRegistrations: vi.fn(async () => [registration]),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })
  return { serviceWorker, registration }
}

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: state,
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(document, 'readyState')
})

describe('service worker registration', () => {
  it('waits for the page to finish loading before installing', () => {
    const { serviceWorker } = stubServiceWorker()
    setReadyState('interactive')

    registerServiceWorker()
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
