import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ActionsMenu } from './actions-menu'
import { ListToolbar } from './list-toolbar'
import { RecordList, RecordRow } from './record-list'

afterEach(cleanup)

function Toolbar({ onNew }: { onNew: () => void }) {
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  return (
    <>
      <ListToolbar
        search={{
          label: 'Search ingredients',
          value: search,
          onValueChange: setSearch,
        }}
        create={{ noun: 'ingredient', onClick: onNew }}
        archived={{ checked: archived, onCheckedChange: setArchived }}
      />
      <p>{archived ? 'Including archived' : 'Active only'}</p>
    </>
  )
}

describe('list primitives', () => {
  it('names the create action, clears search, and toggles archived rows', () => {
    const onNew = vi.fn()
    render(<Toolbar onNew={onNew} />)
    fireEvent.click(screen.getByRole('button', { name: 'New ingredient' }))
    expect(onNew).toHaveBeenCalledOnce()

    const search = screen.getByLabelText('Search ingredients')
    fireEvent.change(search, { target: { value: 'oats' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect((search as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(search)
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()

    fireEvent.click(screen.getByRole('switch', { name: 'Show archived' }))
    expect(screen.getByText('Including archived')).toBeTruthy()
  })

  it('opens a row as one tap target and shows state only when informative', () => {
    const onOpen = vi.fn()
    render(
      <RecordList label="Ingredients" empty="No ingredients found.">
        <RecordRow
          title="Oats"
          verb="Edit"
          detail="Mill · per 100 g"
          value="370"
          onOpen={onOpen}
        />
        <RecordRow title="Barley" archived onOpen={onOpen} />
        <RecordRow
          title="Robi"
          badge={<span>You</span>}
          archived
          onOpen={onOpen}
        />
      </RecordList>,
    )
    // A badge and Archived stay separate words in the row's name.
    expect(
      screen.getByRole('button', { name: /Robi You Archived/ }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Edit Oats/ }))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(screen.getAllByText('Archived')).toHaveLength(2)
    expect(screen.getByRole('list', { name: 'Ingredients' })).toBeTruthy()
  })

  it('lays every list out the same: a second row only for New or a crowded sort', () => {
    const search = { label: 'Search', value: '', onValueChange: () => {} }
    const sort = {
      label: 'Sort ingredients',
      value: 'name',
      options: [{ value: 'name', label: 'Name' }],
      onValueChange: () => {},
    }
    const archived = { checked: false, onCheckedChange: () => {} }
    const rows = (container: HTMLElement) =>
      [...(container.firstElementChild?.children ?? [])].map((row) =>
        [
          ...row.querySelectorAll(
            'input:not([tabindex="-1"]), button, [role="switch"]',
          ),
        ].map(
          (control) =>
            control.closest('label')?.textContent ??
            control.getAttribute('aria-label') ??
            control.textContent,
        ),
      )
    const full = render(
      <ListToolbar
        search={search}
        sort={sort}
        create={{ noun: 'recipe', onClick: () => {} }}
        archived={archived}
      />,
    )
    expect(rows(full.container)).toEqual([
      ['Search', 'Sort ingredients'],
      ['New recipe', 'Show archived'],
    ])
    full.unmount()
    // Without a create action, Show archived joins the search row.
    const lone = render(<ListToolbar search={search} archived={archived} />)
    expect(rows(lone.container)).toEqual([['Search', 'Show archived']])
    lone.unmount()
    // Search, sort and the switch don't fit one phone row: sort and the
    // switch share the second, so neither sits alone.
    const crowded = render(
      <ListToolbar search={search} sort={sort} archived={archived} />,
    )
    expect(rows(crowded.container)).toEqual([
      ['Search'],
      ['Sort ingredients', 'Show archived'],
    ])
  })

  it('marks rows that open something with a chevron, picker rows with a check', () => {
    const { container } = render(
      <RecordList label="Foods" empty="None">
        <RecordRow title="Opens" onOpen={() => {}} />
        <RecordRow title="Picked" selected onOpen={() => {}} />
        <RecordRow title="Static" />
      </RecordList>,
    )
    const icons = [...container.querySelectorAll('li')].map(
      (row) => row.querySelector('svg')?.getAttribute('class') ?? 'none',
    )
    expect(icons[0]).toContain('chevron-right')
    expect(icons[1]).toContain('check')
    expect(icons[2]).toBe('none')
  })

  it('renders loading and empty states in place of the list', () => {
    const view = render(<RecordList label="People" loading empty="None" />)
    expect(screen.getByRole('status', { name: 'Loading people' })).toBeTruthy()
    view.rerender(<RecordList label="People" empty="No people found." />)
    expect(screen.getByText('No people found.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('keeps destructive actions in a named overflow menu', async () => {
    const remove = vi.fn()
    render(
      <ActionsMenu
        label="Oats actions"
        actions={[
          { label: 'Delete permanently', destructive: true, onSelect: remove },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Oats actions' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete permanently' }),
    )
    expect(remove).toHaveBeenCalledOnce()
  })
})
