import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    today: 'Today',
    yesterday: 'Yesterday',
    relativeDate: (day: string, monthDay: string) => `${day}, ${monthDay}`,
  },
  hu: {
    today: 'Ma',
    yesterday: 'Tegnap',
    relativeDate: (day: string, monthDay: string) => `${day}, ${monthDay}`,
  },
})
