import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    selectPerson: 'Select person',
    // The name says what the control does and includes the visible name, so
    // voice control users can say what they see.
    switchPerson: (visible?: string) =>
      visible ? `Switch person, ${visible}` : 'Switch person',
    // The visible name plus its "You" badge.
    nameYou: (name: string) => `${name}, you`,
    you: 'You',
  },
  hu: {
    selectPerson: 'Válassz személyt',
    switchPerson: (visible?: string) =>
      visible ? `Személy váltása, ${visible}` : 'Személy váltása',
    nameYou: (name: string) => `${name}, te`,
    you: 'Te',
  },
})
