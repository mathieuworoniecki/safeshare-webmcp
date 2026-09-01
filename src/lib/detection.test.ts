import { describe, expect, it } from 'vitest'
import { clampBox, deduplicateFindings, findSensitiveMatches, maskSensitiveValue } from './detection'
import type { Finding } from '../types'

describe('sensitive-data detector', () => {
  it('detects common French personal data', () => {
    const matches = findSensitiveMatches(
      'Contact: lea.martin@example.fr, 06 12 34 56 78, FR76 3000 6000 0112 3456 7890 189.',
    )
    expect(matches.map((match) => match.type)).toEqual(expect.arrayContaining(['email', 'phone', 'iban']))
  })

  it('does not expose a complete value in a masked preview', () => {
    const original = 'lea.martin@example.fr'
    const masked = maskSensitiveValue(original, 'email')
    expect(masked).not.toBe(original)
    expect(masked).toContain('@example.fr')
  })

  it('keeps boxes inside the page', () => {
    expect(clampBox({ x: -1, y: 0.95, width: 4, height: 1 })).toEqual({
      x: 0,
      y: 0.95,
      width: 1,
      height: 0.050000000000000044,
    })
  })

  it('deduplicates overlapping findings of the same type', () => {
    const base: Finding = {
      id: 'MAIL-1-01',
      type: 'email',
      label: 'Adresse e-mail',
      maskedPreview: 'l•••@example.fr',
      confidence: 0.98,
      pageIndex: 0,
      box: { x: 0.1, y: 0.1, width: 0.4, height: 0.1 },
      status: 'pending',
      source: 'text',
    }
    expect(
      deduplicateFindings([
        base,
        { ...base, id: 'MAIL-1-02', box: { x: 0.11, y: 0.11, width: 0.38, height: 0.08 } },
      ]),
    ).toHaveLength(1)
  })
})
