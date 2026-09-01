import type { BoundingBox, Finding, FindingType } from '../types'

type PatternEvaluation = { confidence: number; reason: string }

type PatternDefinition = {
  type: FindingType
  label: string
  regex: RegExp
  confidence: number
  reason: string
  evaluate?: (value: string, context: string) => PatternEvaluation | null
}

export function isValidIban(value: string): boolean {
  const normalized = value.replace(/[\s-]/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) return false
  const rearranged = `${normalized.slice(4)}${normalized.slice(0, 4)}`
  let remainder = 0
  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

function isPossiblePhone(value: string) {
  const normalized = value.replace(/[^+\d]/g, '')
  return /^(?:\+33[1-9]\d{8}|0[1-9]\d{8})$/.test(normalized)
}

function evaluateDate(value: string, context: string): PatternEvaluation | null {
  const [day, month, year] = value.split(/[/.\-]/).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  const personalContext = /naissance|n[ée]e?\s+le|birth|personnelle/i.test(context)
  return {
    confidence: personalContext ? 0.9 : 0.68,
    reason: personalContext
      ? 'Date valide trouvée dans un contexte personnel.'
      : 'Date valide détectée, mais son caractère personnel doit être confirmé.',
  }
}

const patterns: PatternDefinition[] = [
  {
    type: 'email',
    label: 'Adresse e-mail',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    confidence: 0.98,
    reason: 'Structure complète d’une adresse e-mail reconnue.',
  },
  {
    type: 'iban',
    label: 'Coordonnées bancaires',
    regex: /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi,
    confidence: 0.97,
    reason: 'Structure de coordonnées bancaires reconnue.',
    evaluate: (value) => isValidIban(value)
      ? { confidence: 0.99, reason: 'Structure IBAN reconnue et contrôle modulo 97 valide.' }
      : { confidence: 0.62, reason: 'Structure IBAN probable, mais contrôle modulo 97 invalide ou OCR imprécis.' },
  },
  {
    type: 'identity',
    label: "Numéro d'identité",
    regex: /\b(?:NIR|SSN|ID|PASSEPORT|PASSPORT|CARTE\s+D['’]IDENTIT[EÉ])\s*[:#-]?\s*[A-Z0-9][A-Z0-9 .-]{5,22}\b/gi,
    confidence: 0.92,
    reason: 'Identifiant trouvé à proximité d’un libellé d’identité.',
  },
  {
    type: 'phone',
    label: 'Numéro de téléphone',
    regex: /(?<!\d)(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}(?!\d)/g,
    confidence: 0.94,
    reason: 'Numéro compatible avec le plan téléphonique français.',
    evaluate: (value) => isPossiblePhone(value)
      ? { confidence: 0.96, reason: 'Numéro français de dix chiffres structurellement valide.' }
      : null,
  },
  {
    type: 'date',
    label: 'Date personnelle',
    regex: /\b(?:0?[1-9]|[12]\d|3[01])[/\.\-](?:0?[1-9]|1[0-2])[/\.\-](?:19|20)\d{2}\b/g,
    confidence: 0.76,
    reason: 'Date calendaire reconnue.',
    evaluate: evaluateDate,
  },
  {
    type: 'address',
    label: 'Adresse postale',
    regex: /\b\d{1,4}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|impasse|place|quai|route)\s+[\p{L}][\p{L}\s'’.-]{2,45}/giu,
    confidence: 0.84,
    reason: 'Numéro et type de voie reconnus dans une adresse postale.',
  },
  {
    type: 'name',
    label: 'Nom complet',
    regex: /\b(?:nom(?:\s+complet)?|titulaire|collaborat(?:eur|rice))\s*:\s*[\p{L}][\p{L}'’.-]+(?:\s+[\p{L}][\p{L}'’.-]+){1,3}\b/giu,
    confidence: 0.86,
    reason: 'Nom composé trouvé après un libellé de personne.',
  },
]

const typePrefix: Record<FindingType, string> = {
  email: 'MAIL',
  phone: 'TEL',
  iban: 'IBAN',
  identity: 'ID',
  address: 'ADR',
  date: 'DATE',
  name: 'NOM',
  manual: 'ZONE',
}

export function maskSensitiveValue(value: string, type: FindingType): string {
  const clean = value.trim().replace(/\s+/g, ' ')
  if (!clean) return '••••'

  if (type === 'email') {
    const [local = '', domain = ''] = clean.split('@')
    return `${local.slice(0, 1)}•••@${domain}`
  }

  const visible = Math.min(4, Math.max(2, Math.floor(clean.length / 5)))
  return `${clean.slice(0, visible)}${'•'.repeat(Math.min(8, clean.length - visible))}`
}

export function findSensitiveMatches(text: string) {
  return patterns.flatMap((definition) => {
    definition.regex.lastIndex = 0
    return Array.from(text.matchAll(definition.regex)).flatMap((match) => {
      const index = match.index ?? 0
      const value = match[0]
      const context = text.slice(Math.max(0, index - 48), Math.min(text.length, index + value.length + 48))
      const evaluation = definition.evaluate?.(value, context)
      if (definition.evaluate && !evaluation) return []
      return [{
        type: definition.type,
        label: definition.label,
        confidence: evaluation?.confidence ?? definition.confidence,
        reason: evaluation?.reason ?? definition.reason,
        value,
        index,
      }]
    })
  })
}

export function createFinding(
  match: ReturnType<typeof findSensitiveMatches>[number],
  pageIndex: number,
  box: BoundingBox,
  source: Finding['source'],
  sequence: number,
): Finding {
  return {
    id: `${typePrefix[match.type]}-${pageIndex + 1}-${String(sequence + 1).padStart(2, '0')}`,
    type: match.type,
    label: match.label,
    maskedPreview: maskSensitiveValue(match.value, match.type),
    confidence: match.confidence,
    pageIndex,
    box: clampBox(box),
    status: 'pending',
    source,
    reason: match.reason,
  }
}

export function clampBox(box: BoundingBox): BoundingBox {
  const x = Math.max(0, Math.min(0.99, box.x))
  const y = Math.max(0, Math.min(0.99, box.y))
  return {
    x,
    y,
    width: Math.max(0.01, Math.min(1 - x, box.width)),
    height: Math.max(0.01, Math.min(1 - y, box.height)),
  }
}

export function deduplicateFindings(findings: Finding[]): Finding[] {
  return findings.filter((finding, index, all) => {
    return !all.slice(0, index).some((candidate) => {
      if (candidate.pageIndex !== finding.pageIndex || candidate.type !== finding.type) return false
      const overlapX = Math.max(
        0,
        Math.min(candidate.box.x + candidate.box.width, finding.box.x + finding.box.width) -
          Math.max(candidate.box.x, finding.box.x),
      )
      const overlapY = Math.max(
        0,
        Math.min(candidate.box.y + candidate.box.height, finding.box.y + finding.box.height) -
          Math.max(candidate.box.y, finding.box.y),
      )
      const overlap = overlapX * overlapY
      const smallestArea = Math.min(
        candidate.box.width * candidate.box.height,
        finding.box.width * finding.box.height,
      )
      return smallestArea > 0 && overlap / smallestArea > 0.65
    })
  })
}

export function explainFinding(finding: Finding) {
  if (finding.source === 'manual') {
    return {
      summary: 'Cette zone a été ajoutée manuellement.',
      confidence: 100,
      signals: ['Sélection visuelle explicite', 'Aucune valeur du document n’est exposée'],
    }
  }
  return {
    summary: finding.reason ?? `Motif compatible avec la catégorie « ${finding.label} ».`,
    confidence: Math.round(finding.confidence * 100),
    signals: [
      `Source : ${finding.source === 'ocr' ? 'reconnaissance optique locale' : finding.source === 'demo' ? 'démonstration synthétique' : 'texte du PDF'}`,
      finding.confidence < 0.8 ? 'Contrôle humain fortement recommandé' : 'Format cohérent avec la catégorie détectée',
    ],
  }
}
