import type { ReactNode } from 'react'
import { defineMessages, rich } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'Household invitation',
    loading: 'Loading invitation',
    unavailable:
      'This invitation has expired, was revoked, or was already used.',
    joinPrompt: (name: ReactNode) => rich('Join ', name, '?'),
    access:
      'Joining gives you access to all of this household’s nutrition data, including everyone’s past meals and goals. Members can manage the shared data. Your existing household stays separate.',
    join: 'Join household',
  },
  hu: {
    title: 'Meghívó egy háztartásba',
    loading: 'Meghívó betöltése',
    unavailable: 'Ez a meghívó lejárt, visszavonták, vagy már felhasználták.',
    joinPrompt: (name: ReactNode) =>
      rich('Csatlakozol ehhez a háztartáshoz: ', name, '?'),
    access:
      'Csatlakozás után hozzáférsz a háztartás összes táplálkozási adatához, köztük mindenki korábbi étkezéseihez és céljaihoz. A tagok kezelhetik a közös adatokat. A meglévő háztartásod külön marad.',
    join: 'Csatlakozás',
  },
})
