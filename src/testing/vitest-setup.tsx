import { vi } from 'vitest'

// NumberFlow's custom element only registers in a real browser, so under
// jsdom it renders server markup and throws on the next value change. Tests
// see the formatted figure as plain text instead; the browser suites run the
// real element.
vi.mock('@number-flow/react', () => ({
  default: ({
    value,
    prefix = '',
    locales,
    format,
  }: {
    value: number
    prefix?: string
    locales?: Intl.LocalesArgument
    format?: Intl.NumberFormatOptions
  }) => (
    <span data-number-flow="">
      {prefix}
      {new Intl.NumberFormat(locales, format).format(value)}
    </span>
  ),
}))
