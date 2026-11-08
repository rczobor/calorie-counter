import type { ReactNode } from 'react'
import { defineMessages, rich } from '@/i18n/messages'

type Role = 'admin' | 'member'
// Wraps the part only screen readers hear, so each language places it.
type Hidden = (text: string) => ReactNode

export const messages = defineMessages({
  en: {
    household: 'Household',
    loading: 'Loading household',
    details: 'Household details',
    current: 'Current household',
    switch: 'Switch household',
    name: 'Household name',
    saveName: 'Save name',
    askAdmin:
      'Ask a household admin to rename the household or invite someone.',
    members: 'Members',
    noMembers: 'No members found.',
    memberRole: (role: Role, isYou: boolean) =>
      `${role === 'admin' ? 'Admin' : 'Member'}${isYou ? ' · You' : ''}`,
    manage: (name: string) => `Manage ${name}`,
    makeMember: 'Make member',
    makeAdmin: 'Make admin',
    remove: 'Remove',
    accessTitle: 'Household access',
    accessDescription:
      'Everyone in a household can view and manage its people, goals, meals, history, catalog, and cooking. Admins also manage invitations and membership.',
    invite: 'Invite someone',
    createLink: 'Create invitation link',
    linkTerms: 'One use. Expires in 7 days. Full household access.',
    link: 'Invitation link',
    copyLink: 'Copy link',
    openInvitations: 'Open invitations',
    expires: (date: string) => `Expires ${date}`,
    revoke: (hidden: Hidden) => rich('Revoke ', hidden('invitation')),
    loadingInvitations: 'Loading invitations',
    loadMoreInvitations: 'Load more invitations',
    leave: 'Leave household',
    removeTitle: 'Remove household access?',
    roleTitle: 'Change household role?',
    removeDescription: (name: string) =>
      `${name} will lose access to this household. Shared nutrition data will remain.`,
    roleDescription: (name: string, role: Role) =>
      `${name} will become a household ${role}. Admins can invite and remove members.`,
    confirm: 'Confirm change',
  },
  hu: {
    household: 'Háztartás',
    loading: 'Háztartás betöltése',
    details: 'Háztartás adatai',
    current: 'Jelenlegi háztartás',
    switch: 'Háztartás váltása',
    name: 'Háztartás neve',
    saveName: 'Név mentése',
    askAdmin:
      'A háztartás átnevezéséhez vagy valaki meghívásához kérd meg a háztartás egyik adminisztrátorát.',
    members: 'Tagok',
    noMembers: 'Nem található tag.',
    memberRole: (role: Role, isYou: boolean) =>
      `${role === 'admin' ? 'Adminisztrátor' : 'Tag'}${isYou ? ' · Te' : ''}`,
    manage: (name: string) => `Tag kezelése: ${name}`,
    makeMember: 'Taggá tétel',
    makeAdmin: 'Adminisztrátorrá tétel',
    remove: 'Eltávolítás',
    accessTitle: 'Hozzáférés a háztartáshoz',
    accessDescription:
      'A háztartás minden tagja megtekintheti és kezelheti a személyeket, a célokat, az étkezéseket, az előzményeket, az ételtárat és a főzéseket. Az adminisztrátorok a meghívókat és a tagságot is kezelik.',
    invite: 'Valaki meghívása',
    createLink: 'Meghívólink létrehozása',
    linkTerms:
      'Egyszer használható. 7 nap múlva lejár. Teljes hozzáférés a háztartáshoz.',
    link: 'Meghívólink',
    copyLink: 'Link másolása',
    openInvitations: 'Függőben lévő meghívók',
    expires: (date: string) => `Lejár: ${date}`,
    revoke: (hidden: Hidden) => rich('Visszavonás ', hidden('(meghívó)')),
    loadingInvitations: 'Meghívók betöltése',
    loadMoreInvitations: 'További meghívók betöltése',
    leave: 'Kilépés a háztartásból',
    removeTitle: 'Megszünteted a hozzáférést a háztartáshoz?',
    roleTitle: 'Módosítod a szerepkört?',
    removeDescription: (name: string) =>
      `${name} elveszíti a hozzáférést ehhez a háztartáshoz. A közös táplálkozási adatok megmaradnak.`,
    roleDescription: (name: string, role: Role) =>
      `${name} új szerepköre: ${role === 'admin' ? 'adminisztrátor' : 'tag'}. Az adminisztrátorok meghívhatnak és eltávolíthatnak tagokat.`,
    confirm: 'Megerősítés',
  },
})
