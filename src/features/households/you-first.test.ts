import { describe, expect, it } from 'vitest'
import { youFirst } from './you-first'

describe('youFirst', () => {
  it('moves your person to the front and keeps everyone else in order', () => {
    const people = [
      { name: 'Alex' },
      { name: 'Sam', linkedAccount: 'other' as const },
      { name: 'Viki', linkedAccount: 'you' as const },
      { name: 'Zoe' },
    ]
    expect(youFirst(people).map((person) => person.name)).toEqual([
      'Viki',
      'Alex',
      'Sam',
      'Zoe',
    ])
    expect(people[0].name).toBe('Alex')
  })
})
