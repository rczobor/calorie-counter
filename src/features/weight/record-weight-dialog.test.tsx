import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'
import { RecordWeightDialog, type WeightEntry } from './record-weight-dialog'

const { mutate, sameDay } = vi.hoisted(() => ({
  mutate: vi.fn(),
  sameDay: { current: [] as WeightEntry[] },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/households/convex-hooks', () => ({
  useQuery: (_reference: unknown, args: unknown) =>
    args === 'skip' ? undefined : sameDay.current,
  useMutation:
    (reference: Parameters<typeof getFunctionName>[0]) => (args: unknown) =>
      mutate(getFunctionName(reference), args),
}))

const personId = 'person-alex' as Id<'people'>
const recorded: WeightEntry = {
  _id: 'weight-1' as Id<'weightEntries'>,
  personId,
  measuredOn: '2026-11-08',
  weightKg: 82.4,
  editRevision: 2,
}

function open(request: Parameters<typeof RecordWeightDialog>[0]['request']) {
  const onClose = vi.fn()
  render(
    <RecordWeightDialog
      personId={personId}
      personName="Alex"
      today="2026-11-08"
      request={request}
      onClose={onClose}
    />,
  )
  return onClose
}

describe('RecordWeightDialog', () => {
  afterEach(() => {
    cleanup()
    mutate.mockReset()
    sameDay.current = []
  })

  it('accepts a comma decimal and replaces the day’s weight at its revision', async () => {
    sameDay.current = [recorded]
    const onClose = open({ kind: 'new', date: '2026-11-08' })
    expect(
      screen.getByText(/This day already has 82.4 kg. Saving replaces it./),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Weight'), {
      target: { value: '82,1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }))

    expect(mutate).toHaveBeenCalledWith('weight:record', {
      personId,
      measuredOn: '2026-11-08',
      weightKg: 82.1,
      expectedEditRevision: 2,
    })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('saves an unchanged edit at its stored precision', () => {
    open({ kind: 'edit', entry: { ...recorded, weightKg: 82.45 } })
    expect(screen.getByLabelText('Weight')).toHaveProperty('value', '82.45')
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }))
    expect(mutate).toHaveBeenCalledWith(
      'weight:record',
      expect.objectContaining({ weightKg: 82.45, expectedEditRevision: 2 }),
    )
  })

  it('explains an unreadable or impossible weight instead of saving it', () => {
    open({ kind: 'new', date: '2026-11-08' })
    const input = screen.getByLabelText('Weight')
    const save = screen.getByRole('button', { name: 'Save weight' })

    fireEvent.change(input, { target: { value: '82.4kg' } })
    fireEvent.click(save)
    expect(
      screen.getByText('Enter a weight in kilograms, like 82.4.'),
    ).toBeTruthy()
    fireEvent.change(input, { target: { value: '0.4' } })
    expect(
      screen.getByText('Weight must be between 1 and 500 kg.'),
    ).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })
})
