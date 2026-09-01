import type { BoundingBox, Finding, FindingType } from '../types'

type PatternDefinition = {
  type: FindingType
  label: string
  regex: RegExp
  confidence: number
}

const patterns: PatternDefinition[] = [
  {
    type: 'email',
    label: 'Adresse e-mail',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    confidence: 0.98,
  },
  {
    type: 'iban',
    label: 'Coordonnées bancaires',
    regex: /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi,
    confidence: 0.97,
  },
  {
    type: 'identity',
    label: "Numéro d'identité",
    regex: /\b(?:NIR|SSN|ID|PASSEPORT|PASSPORT|CARTE\s+D['’]IDENTIT[EÉ])\s*[:#-]?\s*[A-Z0-9][A-Z0-9 .-]{5,22}\b/gi,
    confidence: 0.92,
  },
  {
    type: 'phone',
    label: 'Numéro de téléphone',
    regex: /(?<!\d)(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}(?!\d)/g,
    confidence: 0.94,
  },
  {
    type: 'date',
    label: 'Date personnelle',
    regex: /\b(?:0?[1-9]|[12]\d|3[01])[/.\-](?:0?[1-9]|1[0-2])[/.\-](?:19|20)\d{2}\b/g,
    confidence: 0.76,
  },
  {
    type: 'address',
    label: 'Adresse postale',
    regex: /\b\d{1,4}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|impasse|place|quai|route)\s+[\p{L}][\p{L}\s'’.-]{2,45}/giu,
    confidence: 0.84,
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
    return Array.from(text.matchAll(definition.regex)).map((match) => ({
      type: definition.type,
      label: definition.label,
      confidence: definition.confidence,
      value: match[0],
      index: match.index ?? 0,
    }))
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
