// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchablePicker } from '@/components/ui/searchable-picker'

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana', keywords: 'yellow fruit' },
  { value: 'carrot', label: 'Carrot' },
]

afterEach(() => {
  cleanup()
})

describe('SearchablePicker', () => {
  it('exposes combobox semantics and supports keyboard selection', () => {
    const onValueChange = vi.fn()
    const onSearchValueChange = vi.fn()
    render(
      <SearchablePicker
        options={options}
        value=""
        onValueChange={onValueChange}
        onSearchValueChange={onSearchValueChange}
        ariaLabel="Choose food"
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Choose food' })
    expect(input.getAttribute('aria-expanded')).toBe('false')

    fireEvent.input(input, {
      target: { value: 'yellow' },
      inputType: 'insertText',
    })

    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Banana' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Apple' })).toBeNull()

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onValueChange).toHaveBeenCalledWith('banana')
    expect(onSearchValueChange.mock.calls).toEqual([['yellow'], ['']])
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('announces loading without also showing the empty state', () => {
    const { rerender } = render(
      <SearchablePicker
        options={[]}
        value=""
        onValueChange={() => undefined}
        ariaLabel="Choose food"
        loading
        loadingMessage="Fetching foods..."
        emptyMessage="No foods found"
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Choose food' })
    fireEvent.focus(input)

    expect(input.getAttribute('aria-busy')).toBe('true')
    expect(
      screen.getAllByRole('status').map((status) => status.textContent),
    ).toContainEqual(expect.stringContaining('Fetching foods...'))
    expect(
      screen
        .getAllByRole('status')
        .some((status) => status.textContent?.includes('No foods found')),
    ).toBe(false)

    rerender(
      <SearchablePicker
        options={[]}
        value=""
        onValueChange={() => undefined}
        ariaLabel="Choose food"
        emptyMessage="No foods found"
      />,
    )

    expect(input.getAttribute('aria-busy')).toBe('false')
    expect(
      screen
        .getAllByRole('status')
        .some((status) => status.textContent?.includes('Fetching foods...')),
    ).toBe(false)
    expect(
      screen.getAllByRole('status').map((status) => status.textContent),
    ).toContainEqual(expect.stringContaining('No foods found'))
  })

  it('supports a controlled remote-search query', () => {
    const onSearchValueChange = vi.fn()
    const { rerender } = render(
      <SearchablePicker
        options={[{ value: 'remote', label: 'Server result' }]}
        value=""
        onValueChange={() => undefined}
        ariaLabel="Find food"
        searchValue="oat"
        onSearchValueChange={onSearchValueChange}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Find food' })
    fireEvent.focus(input)

    expect((input as HTMLInputElement).value).toBe('oat')
    expect(screen.getByRole('option', { name: 'Server result' })).toBeTruthy()

    fireEvent.input(input, {
      target: { value: 'oats' },
      inputType: 'insertText',
    })

    expect(onSearchValueChange).toHaveBeenCalledWith('oats')
    expect((input as HTMLInputElement).value).toBe('oat')

    rerender(
      <SearchablePicker
        options={[{ value: 'remote', label: 'Server result' }]}
        value=""
        onValueChange={() => undefined}
        ariaLabel="Find food"
        searchValue="oats"
        onSearchValueChange={onSearchValueChange}
      />,
    )

    expect((input as HTMLInputElement).value).toBe('oats')

    rerender(
      <SearchablePicker
        options={[{ value: 'remote', label: 'Server result' }]}
        value=""
        onValueChange={() => undefined}
        ariaLabel="Find food"
        searchValue="oats"
        onSearchValueChange={onSearchValueChange}
        loading
      />,
    )

    expect(screen.getByRole('option', { name: 'Server result' })).toBeTruthy()
  })

  it('caps the rendered results', () => {
    render(
      <SearchablePicker
        options={options}
        value=""
        onValueChange={() => undefined}
        ariaLabel="Choose food"
        resultLimit={2}
      />,
    )

    fireEvent.focus(screen.getByRole('combobox', { name: 'Choose food' }))

    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.queryByRole('option', { name: 'Carrot' })).toBeNull()
  })

  it('normalizes invalid result limits', () => {
    const { rerender } = render(
      <SearchablePicker
        options={options}
        value=""
        onValueChange={() => undefined}
        ariaLabel="Choose food"
        resultLimit={Number.NaN}
      />,
    )

    fireEvent.focus(screen.getByRole('combobox', { name: 'Choose food' }))
    expect(screen.getAllByRole('option')).toHaveLength(options.length)

    rerender(
      <SearchablePicker
        options={options}
        value=""
        onValueChange={() => undefined}
        ariaLabel="Choose food"
        resultLimit={-2.5}
      />,
    )
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
