import type { AppSnapshot, FindingStatus } from '../types'

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
  prepareExport: () => { ready: boolean; blockers: number }
}

export type WebMCPStatus = 'registering' | 'available' | 'unsupported' | 'error'

const result = (payload: unknown): WebMCPToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
})

const emptySchema = { type: 'object', properties: {}, additionalProperties: false }

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
        "Retourne uniquement l'état non sensible de la revue locale : type du fichier, pages et nombres de zones par décision. N'expose jamais le nom ni le texte du document.",
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
          privacy: 'No document text or raw sensitive value is returned by this tool.',
        })
      },
    },
    {
      name: 'list_privacy_findings',
      title: 'Lister les zones sensibles',
      description:
        "Liste les identifiants, catégories, pages, niveaux de confiance et décisions des zones trouvées. Les valeurs sensibles restent masquées.",
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
        const snapshot = actions.getSnapshot()
        const allowed = ['all', 'pending', 'approved', 'dismissed']
        const safeStatus = typeof status === 'string' && allowed.includes(status) ? status : 'all'
        const findings = snapshot.findings
          .filter((finding) => safeStatus === 'all' || finding.status === safeStatus)
          .map((finding) => ({
            id: finding.id,
            category: finding.type,
            label: finding.label,
            page: finding.pageIndex + 1,
            confidence: Math.round(finding.confidence * 100),
            status: finding.status,
            source: finding.source,
          }))
        return result({ count: findings.length, findings })
      },
    },
    {
      name: 'focus_privacy_finding',
      title: 'Afficher une zone sensible',
      description:
        "Sélectionne une zone détectée dans l'interface SafeShare pour que la personne puisse l'examiner visuellement.",
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
        "Marque une zone comme à masquer ou à conserver, ou applique la décision à toutes les zones en attente. Modifie la revue mais n'exporte rien.",
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
          return result({ success: true, changed, status })
        }
        return result({ success: actions.setFindingStatus(findingId, status), findingId, status })
      },
    },
    {
      name: 'add_manual_redaction',
      title: 'Proposer une zone manuelle',
      description:
        "Ajoute une proposition de masquage rectangulaire en coordonnées normalisées. La zone reste en attente jusqu'à sa validation et aucun contenu n'est exporté.",
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
        return result({ success: Boolean(id), findingId: id, status: id ? 'pending' : null })
      },
    },
    {
      name: 'prepare_safe_export',
      title: "Préparer l'export sécurisé",
      description:
        "Vérifie si la revue est terminée et ouvre la confirmation visuelle. Ne télécharge jamais le document : une action humaine explicite reste obligatoire.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => {
        const prepared = actions.prepareExport()
        return result({
          ...prepared,
          requiresHumanConfirmation: true,
          message: prepared.ready
            ? 'The confirmation dialog is open. The user must click the export button.'
            : `${prepared.blockers} finding(s) still need a decision.`,
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
