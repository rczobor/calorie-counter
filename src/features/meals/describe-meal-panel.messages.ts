import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'Describe or snap',
    hint: 'Say what you ate or add a photo of the plate or label. Claude suggests the foods; you check them before saving.',
    description: 'What did you eat?',
    descriptionPlaceholder: '2 eggs, toast with butter, a latte',
    addPhoto: 'Add photo',
    changePhoto: 'Change photo',
    removePhoto: 'Remove photo',
    photoPreview: 'Selected photo',
    suggest: 'Suggest foods',
    suggesting: 'Reading…',
    privacy:
      'Your text and photo go to Anthropic’s Claude to suggest foods. Numbers are estimates.',
    photoUnreadable: 'This photo can’t be read. Try a JPEG or PNG.',
    empty: 'No food found in that. Try describing it differently.',
    limited: 'You’ve used today’s suggestions. Try again tomorrow.',
    unavailable: 'Suggestions aren’t available right now.',
    failed: 'Something went wrong. Try again.',
    added: (count: number) =>
      `Added ${count} ${count === 1 ? 'food' : 'foods'}. Check them before saving.`,
  },
  hu: {
    title: 'Leírás vagy fotó',
    hint: 'Írd le, mit ettél, vagy adj hozzá fotót a tányérról vagy a címkéről. Claude javasolja az ételeket, te pedig mentés előtt ellenőrzöd őket.',
    description: 'Mit ettél?',
    descriptionPlaceholder: '2 tojás, vajas pirítós, egy latte',
    addPhoto: 'Fotó hozzáadása',
    changePhoto: 'Másik fotó',
    removePhoto: 'Fotó eltávolítása',
    photoPreview: 'Kiválasztott fotó',
    suggest: 'Ételek javaslása',
    suggesting: 'Olvasás…',
    privacy:
      'A szöveget és a fotót az Anthropic Claude kapja meg az ételek javaslásához. A számok becsültek.',
    photoUnreadable: 'Ez a fotó nem olvasható. Próbáld JPEG vagy PNG fájllal.',
    empty: 'Nem találtunk benne ételt. Próbáld másképp leírni.',
    limited: 'Elfogytak a mai javaslatok. Próbáld újra holnap.',
    unavailable: 'A javaslatok most nem érhetők el.',
    failed: 'Hiba történt. Próbáld újra.',
    added: (count: number) =>
      `${count} étel hozzáadva. Mentés előtt ellenőrizd őket.`,
  },
})
