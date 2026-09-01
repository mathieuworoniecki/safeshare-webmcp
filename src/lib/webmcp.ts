import { explainFinding } from './detection'
import { buildExportSafetyReport, type ExportSafetyReport } from './export-safety'
import type { AppSnapshot } from '../types'

export const WEBMCP_TOOL_COUNT = 9

export type WebMCPActions = {
  getSnapshot: () => AppSnapshot
  focusFinding: (id: string) => boolean
  deleteFinding: (id: string) => boolean
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
      name: 'get_mask_editor_state',
      title: "Résumer l'éditeur SafeShare",
      description:
        "Retourne uniquement l'état non sensible de l'éditeur local : type du fichier, pages, nombre de masques et historique disponible. N'expose jamais le nom ni le texte du document.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const snapshot = actions.getSnapshot()
        return result({
          documentLoaded: Boolean(snapshot.document),
          documentKind: snapshot.document?.kind ?? null,
          pageCount: snapshot.document?.pages.length ?? 0,
          scanPhase: snapshot.scanProgress.phase,
          zoneCount: snapshot.findings.length,
          selectedPage: snapshot.selectedPage + 1,
          canUndo: snapshot.canUndo,
          canRedo: snapshot.canRedo,
          privacy: 'No document text, file name, image or sensitive value is returned.',
        })
      },
    },
    {
      name: 'list_redaction_zones',
      title: 'Lister les zones de masquage',
      description:
        'Liste les identifiants, catégories, pages et niveaux de confiance des masques actifs. Les valeurs sensibles et les coordonnées restent dans la page.',
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, description: 'Numéro de page facultatif, à partir de 1.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: ({ page }) => {
        const requestedPage = typeof page === 'number' ? page : null
        const findings = actions.getSnapshot().findings
          .filter((finding) => requestedPage === null || finding.pageIndex === requestedPage - 1)
          .map(safeFinding)
        return result({ count: findings.length, findings })
      },
    },
    {
      name: 'focus_redaction_zone',
      title: 'Afficher une zone de masquage',
      description:
        "Sélectionne un masque dans l'interface SafeShare pour permettre son examen visuel. Ne modifie ni la zone ni le document.",
      inputSchema: {
        type: 'object',
        properties: {
          findingId: { type: 'string', description: 'Identifiant retourné par list_redaction_zones.' },
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
      name: 'explain_redaction_zone',
      title: 'Expliquer une détection',
      description:
        "Explique les signaux génériques ayant conduit à tracer une zone automatique. Ne retourne ni la valeur trouvée ni ses coordonnées.",
      inputSchema: {
        type: 'object',
        properties: {
          findingId: { type: 'string', description: 'Identifiant retourné par list_redaction_zones.' },
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
      name: 'add_redaction_zone',
      title: 'Ajouter une zone de masquage',
      description:
        "Ajoute immédiatement un masque rectangulaire en coordonnées normalisées. Modifie l'éditeur de manière annulable mais ne télécharge rien.",
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
        return result({ success: Boolean(id), findingId: id, reversible: true })
      },
    },
    {
      name: 'delete_redaction_zone',
      title: 'Supprimer une zone de masquage',
      description:
        "Supprime un masque actif de l'éditeur. La suppression est visible et annulable. Ne modifie jamais le fichier source.",
      inputSchema: {
        type: 'object',
        properties: {
          findingId: { type: 'string', description: 'Identifiant retourné par list_redaction_zones.' },
        },
        required: ['findingId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, untrustedContentHint: false },
      execute: ({ findingId }) => {
        if (typeof findingId !== 'string') return result({ success: false, error: 'Invalid findingId.' })
        return result({ success: actions.deleteFinding(findingId), findingId, reversible: true })
      },
    },
    {
      name: 'undo_last_mask_change',
      title: 'Annuler la dernière modification',
      description:
        "Annule le dernier ajout, déplacement, redimensionnement ou suppression de masque. Ne modifie jamais le fichier source.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => result({ success: actions.undoLastAction() }),
    },
    {
      name: 'run_download_safety_check',
      title: 'Contrôler le téléchargement',
      description:
        "Vérifie le document et les coordonnées des masques actifs. Ne modifie pas l'interface et ne télécharge rien.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const snapshot = actions.getSnapshot()
        return result(buildExportSafetyReport(snapshot.document, snapshot.findings))
      },
    },
    {
      name: 'prepare_safe_download',
      title: 'Préparer le téléchargement sécurisé',
      description:
        "Exécute le contrôle de sûreté et attire l'attention sur le bouton Download. Ne télécharge jamais le document : le clic humain reste obligatoire.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => {
        const report = actions.prepareExport()
        return result({
          ...report,
          requiresHumanClick: true,
          message: report.ready
            ? 'Ready. The user must click Download in the visible page.'
            : 'The download remains blocked until every issue is resolved.',
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
