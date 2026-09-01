import type { DocumentPage, Finding, SafeDocument } from '../types'

export type ExportSafetyReport = {
  ready: boolean
  blockers: number
  pending: number
  approved: number
  dismissed: number
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
  const pending = findings.filter((finding) => finding.status === 'pending').length
  const approved = findings.filter((finding) => finding.status === 'approved').length
  const dismissed = findings.filter((finding) => finding.status === 'dismissed').length
  const invalidBoxes = findings.filter((finding) => !isValidBox(finding)).length
  const issues: string[] = []

  if (!safeDocument) issues.push('Aucun document chargé.')
  if (pending) issues.push(`${pending} zone${pending > 1 ? 's sont' : ' est'} encore en attente.`)
  if (invalidBoxes) issues.push(`${invalidBoxes} zone${invalidBoxes > 1 ? 's ont' : ' a'} des coordonnées invalides.`)

  return {
    ready: Boolean(safeDocument) && issues.length === 0,
    blockers: issues.length,
    pending,
    approved,
    dismissed,
    invalidBoxes,
    guarantees: [
      'Les masques validés seront fusionnés dans les pixels.',
      'Le fichier source restera inchangé.',
      'Le téléchargement exigera une confirmation humaine.',
    ],
    issues,
  }
}

export function getRedactionRects(page: DocumentPage, findings: Finding[], padding = 3) {
  return findings
    .filter((finding) => finding.pageIndex === page.index && finding.status === 'approved')
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
