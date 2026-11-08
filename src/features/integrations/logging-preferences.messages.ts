import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    confirmDirect:
      'Allow fully specified, non-estimated new meals you ask to log to be saved without a second approval turn? Estimates, cooking, corrections, and transfers still require review.',
    updated: 'Logging defaults updated.',
    title: 'Logging defaults',
    edit: 'Edit defaults',
    set: 'Set defaults',
    actions: 'Logging default actions',
    confirmReset:
      'Reset logging defaults? Your assistant will ask for a household and person again. Recorded meals and connections remain.',
    resetDone: 'Logging defaults reset.',
    reset: 'Reset defaults',
    loading: 'Loading logging defaults',
    household: 'Household',
    householdSelect: 'Logging household',
    selectHousehold: 'Select household',
    person: 'Person',
    personSelect: 'Logging person',
    selectPerson: 'Select person',
    loadMorePeople: 'Load more people',
    timeZone: 'Timezone',
    savePolicy: 'Save policy',
    savePolicySelect: 'Logging save policy',
    alwaysAskOption: 'Always ask before saving',
    directOption: 'Direct logging for exact new meals',
    directNote:
      'Only complete, non-estimated new meals can save directly. Estimates, cooking, corrections, and transfers still need approval. Your assistant’s own confirmation settings are separate.',
    save: 'Save defaults',
    cancel: 'Cancel',
    unavailableHousehold: 'Unavailable household',
    unavailablePerson: 'Unavailable person',
    alwaysAsk: 'Ask before saving',
    direct: 'Direct for exact new meals',
    unavailable:
      'The remembered household or person is unavailable. Choose new defaults or reset them; the assistant will not silently select another household.',
    aboutTitle: 'About these defaults',
    aboutDescription:
      'Applies across all your assistant conversations and connections. Browsing another person or household here does not change them.',
    empty:
      'No defaults saved. Your assistant will ask which household and person to use.',
  },
  hu: {
    confirmDirect:
      'Az asszisztens külön jóváhagyás nélkül mentheti azokat a pontosan megadott, nem becsült új étkezéseket, amelyek rögzítését kéred? A becsléseket, a főzéseket, a javításokat és az áthelyezéseket továbbra is jóvá kell hagynod.',
    updated: 'A rögzítési alapértelmezések frissültek.',
    title: 'Rögzítési alapértelmezések',
    edit: 'Szerkesztés',
    set: 'Beállítás',
    actions: 'Rögzítési alapértelmezések műveletei',
    confirmReset:
      'Törlöd a rögzítési alapértelmezéseket? Az asszisztens újra megkérdezi, melyik háztartást és személyt használja. A rögzített étkezések és a kapcsolatok megmaradnak.',
    resetDone: 'A rögzítési alapértelmezések törölve.',
    reset: 'Törlés',
    loading: 'Rögzítési alapértelmezések betöltése',
    household: 'Háztartás',
    householdSelect: 'Alapértelmezett háztartás',
    selectHousehold: 'Válassz háztartást',
    person: 'Személy',
    personSelect: 'Alapértelmezett személy',
    selectPerson: 'Válassz személyt',
    loadMorePeople: 'További személyek betöltése',
    timeZone: 'Időzóna',
    savePolicy: 'Mentési mód',
    savePolicySelect: 'Alapértelmezett mentési mód',
    alwaysAskOption: 'Mentés előtt mindig kérdezzen',
    directOption: 'Pontos új étkezések közvetlen rögzítése',
    directNote:
      'Csak a hiánytalanul megadott, nem becsült új étkezések menthetők közvetlenül. A becsléseket, a főzéseket, a javításokat és az áthelyezéseket továbbra is jóvá kell hagynod. Az asszisztens saját megerősítési beállításai ettől függetlenek.',
    save: 'Mentés',
    cancel: 'Mégse',
    unavailableHousehold: 'Nem elérhető háztartás',
    unavailablePerson: 'Nem elérhető személy',
    alwaysAsk: 'Mentés előtt kérdez',
    direct: 'Közvetlen mentés pontos új étkezéseknél',
    unavailable:
      'A megjegyzett háztartás vagy személy nem érhető el. Válassz új alapértelmezéseket, vagy töröld őket; az asszisztens nem választ magától másik háztartást.',
    aboutTitle: 'Az alapértelmezésekről',
    aboutDescription:
      'Minden asszisztenses beszélgetésedre és kapcsolatodra érvényesek. Ha itt egy másik személyt vagy háztartást nézel, az nem változtat rajtuk.',
    empty:
      'Nincsenek mentett alapértelmezések. Az asszisztens megkérdezi, melyik háztartást és személyt használja.',
  },
})
