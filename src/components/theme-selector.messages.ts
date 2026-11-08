import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    theme: (theme: string) => `Theme: ${theme}`,
    appearance: 'Appearance',
    // Starts with the row's visible label, for voice control.
    appearanceValue: (theme: string) => `Appearance: ${theme}`,
  },
  hu: {
    light: 'Világos',
    dark: 'Sötét',
    system: 'Rendszer',
    theme: (theme: string) => `Téma: ${theme}`,
    appearance: 'Megjelenés',
    appearanceValue: (theme: string) => `Megjelenés: ${theme}`,
  },
})
