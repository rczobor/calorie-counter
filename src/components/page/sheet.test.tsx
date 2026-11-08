// @vitest-environment jsdom
import { Drawer } from '@base-ui/react/drawer'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Sheet } from '@/components/page/sheet'

afterEach(cleanup)

function renderSheet(pending: boolean) {
  const onClose = vi.fn()
  render(
    <Sheet onClose={onClose} pending={pending}>
      <Drawer.Title>Log meal</Drawer.Title>
    </Sheet>,
  )
  return onClose
}

it('closes on dismissal', async () => {
  const onClose = renderSheet(false)
  await screen.findByRole('dialog')

  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

  expect(onClose).toHaveBeenCalledTimes(1)
})

it('stays open while a save is pending', async () => {
  const onClose = renderSheet(true)
  await screen.findByRole('dialog')

  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeTruthy()
})
