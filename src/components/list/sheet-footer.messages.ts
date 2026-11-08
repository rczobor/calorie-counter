import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    moreActions: (name: string) => `More actions for ${name}`,
    deletePermanently: 'Delete permanently',
    restore: 'Restore',
    archive: 'Archive',
  },
  hu: {
    moreActions: (name: string) => `További műveletek: ${name}`,
    deletePermanently: 'Végleges törlés',
    restore: 'Visszaállítás',
    archive: 'Archiválás',
  },
})
