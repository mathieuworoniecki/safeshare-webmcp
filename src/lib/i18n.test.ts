import { describe, expect, it } from 'vitest'
import { resolveLocale } from './i18n'

describe('locale selection', () => {
  it('uses French when the browser prefers French', () => {
    expect(resolveLocale(['fr-FR', 'en-US'])).toBe('fr')
  })

  it('falls back to English for unsupported languages', () => {
    expect(resolveLocale(['de-DE'])).toBe('en')
    expect(resolveLocale(['en-US', 'fr-FR'])).toBe('en')
  })

  it('lets the URL override the browser language for testing', () => {
    expect(resolveLocale(['fr-FR'], 'en')).toBe('en')
    expect(resolveLocale(['en-US'], 'fr')).toBe('fr')
  })
})
