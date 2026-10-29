// @vitest-environment jsdom
import { Field } from '@base-ui/react/field'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { Input } from '@/components/ui/input'

afterEach(cleanup)

it('inherits its accessible label, description, and validation from a Base UI field', () => {
  render(
    <Field.Root name="food" invalid>
      <Field.Label>Food name</Field.Label>
      <Input />
      <Field.Description>Enter the food you ate.</Field.Description>
      <Field.Error match>Food name is required.</Field.Error>
    </Field.Root>,
  )

  const input = screen.getByRole('textbox', { name: 'Food name' })
  const description = screen.getByText('Enter the food you ate.')
  const error = screen.getByText('Food name is required.')

  expect(input.getAttribute('name')).toBe('food')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual(
    expect.arrayContaining([description.id, error.id]),
  )
})
