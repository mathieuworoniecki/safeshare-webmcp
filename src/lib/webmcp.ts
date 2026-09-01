import { explainFinding } from './detection'
import { buildExportSafetyReport, type ExportSafetyReport } from './export-safety'
import type { AppSnapshot, FindingStatus } from '../types'

export const WEBMCP_TOOL_COUNT = 10

export type WebMCPActions = {
  getSnapshot: () => AppSnapshot
  focusFinding: (id: string) => boolean
  setFindingStatus: (id: string, status: FindingStatus) => boolean
  setAllPending: (status: Exclude<FindingStatus, 'pending'>) => number
  addManualRedaction: (input: {
    pageIndex: number
    x: number
    y: number
    width: number
    height: number
  }) => string | null
  undoLastAction: () => boolean
  prepareExport: () => ExportSafetyReport
}

export type WebMCPStatus = 'registering' | 'available' | 'unsupported' | 'error'

const result = (payload: Record<string, unknown>): WebMCPToolResult => payload
const emptySchema = { type: 'object', properties: {}, additionalProperties: false }

function safeFinding(finding: AppSnapshot['findings'][number]) {
  return {
    id: finding.id,
    category: finding.type,
    label: finding.label,
    page: finding.pageIndex + 1,
    confidence: Math.round(finding.confidence * 100),
    status: finding.status,
    source: finding.source,
  }
}

export function registerSafeShareTools(
  actions: WebMCPActions,
  onStatus: (status: WebMCPStatus) => void,
) {
  if (!document.modelContext) {
    onStatus('unsupported')
    return () => undefined
  }

  const controller = new AbortController()
  onStatus('registering')

  const tools: WebMCPTool[] = [
    {
      name: 'get_privacy_review',
      title: 'Résumer la revue SafeShare',
      description:
        "Retourne uniquement l'état non sensible de la revue locale : type du fichier, pages, décisions et historique disponible. N'expose jamais le nom ni le texte du document.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const snapshot = actions.getSnapshot()
        const counts = snapshot.findings.reduce(
          (summary, finding) => ({ ...summary, [finding.status]: summary[finding.status] + 1 }),
          { pending: 0, approved: 0, dismissed: 0 },
        )
        return result({
          documentLoaded: Boolean(snapshot.document),
          documentKind: snapshot.document?.kind ?? null,
          pageCount: snapshot.document?.pages.length ?? 0,
          scanPhase: snapshot.scanProgress.phase,
          findings: counts,
          canUndo: snapshot.canUndo,
          canRedo: snapshot.canRedo,
          privacy: 'No document text, file name, image or sensitive value is returned.',
        })
      },
    },
    {
      name: 'list_privacy_findings',
      title: 'Lister les zones sensibles',
      description:
        'Liste les identifiants, catégories, pages, niveaux de confiance et décisions. Les valeurs sensibles restent dans la page.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'pending', 'approved', 'dismissed'],
            description: 'Filtre de décision à appliquer.',
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: ({ status = 'all' }) => {
        const allowed = ['all', 'pending', 'approved', 'dismissed']
        const safeStatus = typeof status === 'string' && allowed.includes(status) ? status : 'all'
        const findings = actions.getSnapshot().findings
          .filter((finding) => safeStatus === 'all' || finding.status === safeStatus)
          .map(safeFinding)
        return result({ count: findings.length, findings })
      },
    },
    {
      name: 'get_next_privacy_finding',
      title: 'Trouver la prochaine décision',
      description:
        "Retourne la prochaine zone en attente après la sélection courante, sans modifier l'interface et sans révéler son contenu.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const snapshot = actions.getSnapshot()
        const currentIndex = snapshot.findings.findIndex((finding) => finding.id === snapshot.selectedFindingId)
        const ordered = [...snapshot.findings.slice(currentIndex + 1), ...snapshot.findings.slice(0, currentIndex + 1)]
        const next = ordered.find((finding) => finding.status === 'pending')
        return result({ found: Boolean(next), finding: next ? safeFinding(next) : null })
      },
    },
    {
      name: 'explain_privacy_finding',
      title: 'Expliquer une détection',
      description:
        "Explique les signaux génériques ayant conduit à une détection. Ne retourne ni la valeur trouvée ni ses coordonnées.",
      inputSchema: {
        type: 'object',
        properties: {
          findingId: { type: 'string', description: 'Identifiant retourné par list_privacy_findings.' },
        },
        required: ['findingId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: ({ findingId }) => {
        if (typeof findingId !== 'string') return result({ success: false, error: 'Invalid findingId.' })
        const finding = actions.getSnapshot().findings.find((candidate) => candidate.id === findingId)
        if (!finding) return result({ success: false, error: 'Finding not found.' })
        return result({ success: true, findingId, category: finding.type, ...explainFinding(finding) })
      },
    },
    {
      name: 'focus_privacy_finding',
      title: 'Afficher une zone sensible',
      description:
        "Sélectionne une zone dans l'interface SafeShare pour permettre son examen visuel. Cette action ne change pas sa décision.",
      inputSchema: {
        type: 'object',
        properties: {
          findingId: { type: 'string', description: 'Identifiant retourné par list_privacy_findings.' },
        },
        required: ['findingId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: ({ findingId }) => {
        if (typeof findingId !== 'string') return result({ success: false, error: 'Invalid findingId.' })
        return result({ success: actions.focusFinding(findingId), findingId })
      },
    },
    {
      name: 'decide_privacy_finding',
      title: 'Décider du masquage',
      description:
        "Marque une zone comme à masquer ou à conserver, ou applique la décision aux zones en attente. Modifie la revue de manière annulable mais n'exporte rien.",
      inputSchema: {
        type: 'object',
        properties: {
          findingId: {
            type: 'string',
            description: "Identifiant d'une zone, ou ALL_PENDING pour toutes les zones en attente.",
          },
          decision: {
            type: 'string',
            enum: ['approve', 'dismiss'],
            description: 'approve masque la zone ; dismiss la conserve visible.',
          },
        },
        required: ['findingId', 'decision'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: ({ findingId, decision }) => {
        if (typeof findingId !== 'string' || (decision !== 'approve' && decision !== 'dismiss')) {
          return result({ success: false, error: 'Invalid findingId or decision.' })
        }
        const status = decision === 'approve' ? 'approved' : 'dismissed'
        if (findingId === 'ALL_PENDING') {
          const changed = actions.setAllPending(status)
          return result({ success: true, changed, status, reversible: true })
        }
        return result({
          success: actions.setFindingStatus(findingId, status),
          findingId,
          status,
          reversible: true,
        })
      },
    },
    {
      name: 'add_manual_redaction',
      title: 'Proposer une zone manuelle',
      description:
        "Ajoute une proposition rectangulaire en coordonnées normalisées. La zone reste en attente jusqu'à sa validation et aucun contenu n'est exporté.",
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, description: 'Numéro de page, à partir de 1.' },
          x: { type: 'number', minimum: 0, maximum: 1 },
          y: { type: 'number', minimum: 0, maximum: 1 },
          width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
          height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
        },
        required: ['page', 'x', 'y', 'width', 'height'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: ({ page, x, y, width, height }) => {
        if (![page, x, y, width, height].every((value) => typeof value === 'number')) {
          return result({ success: false, error: 'Coordinates must be numbers.' })
        }
        const id = actions.addManualRedaction({
          pageIndex: Number(page) - 1,
          x: Number(x),
          y: Number(y),
          width: Number(width),
          height: Number(height),
        })
        return result({ success: Boolean(id), findingId: id, status: id ? 'pending' : null, reversible: true })
      },
    },
    {
      name: 'undo_last_review_action',
      title: 'Annuler la dernière action',
      description:
        "Annule la dernière modification apportée aux zones ou aux décisions. Ne modifie jamais le fichier source.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => result({ success: actions.undoLastAction() }),
    },
    {
      name: 'run_export_safety_check',
      title: "Contrôler la sûreté de l'export",
      description:
        "Vérifie les décisions en attente et les coordonnées de masquage. N'ouvre aucune boîte de dialogue et ne télécharge rien.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const snapshot = actions.getSnapshot()
        return result(buildExportSafetyReport(snapshot.document, snapshot.findings))
      },
    },
    {
      name: 'prepare_safe_export',
      title: "Préparer l'export sécurisé",
      description:
        "Exécute le contrôle de sûreté et ouvre la confirmation visuelle uniquement si la revue est complète. Ne télécharge jamais le document : une confirmation humaine reste obligatoire.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => {
        const report = actions.prepareExport()
        return result({
          ...report,
          requiresHumanConfirmation: true,
          message: report.ready
            ? 'The final dialog is open. The user must confirm the download.'
            : 'The export remains blocked until every issue is resolved.',
        })
      },
    },
  ]

  Promise.all(tools.map((tool) => document.modelContext!.registerTool(tool, { signal: controller.signal })))
    .then(() => onStatus('available'))
    .catch((error: unknown) => {
      if (!controller.signal.aborted) {
        console.error('SafeShare WebMCP registration failed', error)
        onStatus('error')
      }
    })

  return () => controller.abort()
}
