import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Toaster, toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UpdateNotice } from './update-notice'

function renderNotice(wouldLoseWork: boolean) {
  const apply = vi.fn()
  render(
    <>
      <Toaster />
      <UpdateNotice update={{ wouldLoseWork: () => wouldLoseWork, apply }} />
    </>,
  )
  return apply
}

afterEach(() => {
  toast.dismiss()
  cleanup()
})

describe('UpdateNotice', () => {
  it('refreshes straight away when nothing would be lost', async () => {
    const apply = renderNotice(false)

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }))

    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('warns before discarding unsaved work', async () => {
    const apply = renderNotice(true)

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }))
    expect(apply).not.toHaveBeenCalled()
    expect(
      await screen.findByText('Unsaved changes will be lost.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh anyway' }))
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
