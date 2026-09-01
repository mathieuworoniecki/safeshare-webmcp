export type Locale = 'en' | 'fr'

export function resolveLocale(languages: readonly string[] = [], override?: string | null): Locale {
  const requested = override?.trim().toLowerCase()
  if (requested === 'fr' || requested?.startsWith('fr-')) return 'fr'
  if (requested === 'en' || requested?.startsWith('en-')) return 'en'
  for (const language of languages) {
    const normalized = language.toLowerCase()
    if (normalized.startsWith('fr')) return 'fr'
    if (normalized.startsWith('en')) return 'en'
  }
  return 'en'
}

const languageOverride = typeof window === 'undefined'
  ? null
  : new URLSearchParams(window.location.search).get('lang')

const browserLanguages = typeof navigator === 'undefined'
  ? []
  : navigator.languages?.length
    ? navigator.languages
    : [navigator.language]

export const locale = resolveLocale(browserLanguages, languageOverride)

export function tr(english: string, french: string): string {
  return locale === 'fr' ? french : english
}

export function applyDocumentLocale() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.title = tr(
    'SafeShare — share the document, not your data',
    'SafeShare — partagez le document, pas vos données',
  )
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
    'content',
    tr(
      'SafeShare detects and masks sensitive data in your documents, locally in your browser.',
      'SafeShare détecte et masque les données sensibles dans vos documents, localement dans votre navigateur.',
    ),
  )
}
