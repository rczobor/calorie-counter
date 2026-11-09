// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivacyNotice } from './privacy-notice'

vi.mock('@/components/page/settings-breadcrumbs', () => ({
  SettingsBreadcrumbs: () => null,
}))

afterEach(cleanup)

describe('privacy notice', () => {
  it('names the controller, the health data and how to reach them', () => {
    render(<PrivacyNotice />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy notice' }),
    ).toBeTruthy()
    expect(screen.getByText(/Last updated .*2026/)).toBeTruthy()
    expect(
      screen.getByText(/Calorie Counter is run by Robi Czobor/),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Health data' })).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Not medical advice' }),
    ).toBeTruthy()
    const links = screen.getAllByRole('link', { name: 'czobor94@gmail.com' })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'mailto:czobor94@gmail.com',
      'mailto:czobor94@gmail.com',
    ])
  })
})
