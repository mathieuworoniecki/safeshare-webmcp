import type { DocumentPage, Finding, SafeDocument } from '../types'
import { tr } from './i18n'

export type ExportSafetyReport = {
  ready: boolean
  blockers: number
  zones: number
  invalidBoxes: number
  guarantees: string[]
  issues: string[]
}

function isValidBox(finding: Finding) {
  const { x, y, width, height } = finding.box
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1
}

export function buildExportSafetyReport(
  safeDocument: SafeDocument | null,
  findings: Finding[],
): ExportSafetyReport {
  const invalidBoxes = findings.filter((finding) => !isValidBox(finding)).length
  const issues: string[] = []

  if (!safeDocument) issues.push(tr('No document loaded.', 'Aucun document chargé.'))
  if (invalidBoxes) issues.push(tr(
    `${invalidBoxes} ${invalidBoxes === 1 ? 'area has' : 'areas have'} invalid coordinates.`,
    `${invalidBoxes} zone${invalidBoxes > 1 ? 's ont' : ' a'} des coordonnées invalides.`,
  ))

  return {
    ready: Boolean(safeDocument) && issues.length === 0,
    blockers: issues.length,
    zones: findings.length,
    invalidBoxes,
    guarantees: [
      tr('All visible masks will be flattened into the pixels.', 'Tous les masques visibles seront fusionnés dans les pixels.'),
      tr('The source file will remain unchanged.', 'Le fichier source restera inchangé.'),
      tr('The download will require human confirmation.', 'Le téléchargement exigera une confirmation humaine.'),
    ],
    issues,
  }
}

export function getRedactionRects(page: DocumentPage, findings: Finding[], padding = 3) {
  return findings
    .filter((finding) => finding.pageIndex === page.index)
    .map((finding) => {
      const x = finding.box.x * page.width
      const y = finding.box.y * page.height
      const width = finding.box.width * page.width
      const height = finding.box.height * page.height
      const left = Math.max(0, x - padding)
      const top = Math.max(0, y - padding)
      const right = Math.min(page.width, x + width + padding)
      const bottom = Math.min(page.height, y + height + padding)

      return {
        findingId: finding.id,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      }
    })
}
