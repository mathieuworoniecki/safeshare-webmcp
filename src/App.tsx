import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  Eye,
  EyeOff,
  FileSearch,
  FileUp,
  Focus,
  LockKeyhole,
  MousePointer2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  SquareDashedMousePointer,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clampBox } from './lib/detection'
import { createDemo } from './lib/demo'
import {
  registerSafeShareTools,
  type WebMCPActions,
  type WebMCPStatus,
} from './lib/webmcp'
import type { AppSnapshot, BoundingBox, Finding, FindingStatus, SafeDocument, ScanProgress } from './types'

const initialProgress: ScanProgress = {
  phase: 'idle',
  value: 0,
  message: 'En attente d’un document',
}

const typeTone: Record<Finding['type'], string> = {
  email: 'blue',
  phone: 'violet',
  iban: 'red',
  identity: 'red',
  address: 'amber',
  date: 'amber',
  name: 'green',
  manual: 'slate',
}

const statusCopy: Record<WebMCPStatus, string> = {
  registering: 'Connexion WebMCP…',
  available: '6 outils WebMCP actifs',
  unsupported: 'Aperçu sans WebMCP',
  error: 'WebMCP indisponible',
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

function confidenceLabel(confidence: number) {
  if (confidence >= 0.93) return 'Confiance forte'
  if (confidence >= 0.82) return 'Confiance moyenne'
  return 'À contrôler'
}

function App() {
  const [safeDocument, setSafeDocument] = useState<SafeDocument | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState(0)
  const [scanProgress, setScanProgress] = useState<ScanProgress>(initialProgress)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [webMCPStatus, setWebMCPStatus] = useState<WebMCPStatus>('registering')
  const [dragging, setDragging] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [draftBox, setDraftBox] = useState<BoundingBox | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pageSurfaceRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  const snapshotRef = useRef<AppSnapshot>({
    document: null,
    findings: [],
    selectedFindingId: null,
    selectedPage: 0,
    scanProgress: initialProgress,
    exportDialogOpen: false,
  })

  snapshotRef.current = {
    document: safeDocument,
    findings,
    selectedFindingId,
    selectedPage,
    scanProgress,
    exportDialogOpen,
  }

  const pendingCount = findings.filter((finding) => finding.status === 'pending').length
  const approvedCount = findings.filter((finding) => finding.status === 'approved').length
  const dismissedCount = findings.filter((finding) => finding.status === 'dismissed').length
  const currentPage = safeDocument?.pages[selectedPage]
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId)

  const updateFinding = useCallback((id: string, status: FindingStatus) => {
    const changed = snapshotRef.current.findings.some((finding) => finding.id === id)
    setFindings((current) =>
      current.map((finding) => {
        if (finding.id !== id) return finding
        return { ...finding, status }
      }),
    )
    return changed
  }, [])

  const addManualFinding = useCallback((input: BoundingBox & { pageIndex: number }) => {
    const snapshot = snapshotRef.current
    if (!snapshot.document || !snapshot.document.pages[input.pageIndex]) return null
    const box = clampBox(input)
    if (box.width < 0.015 || box.height < 0.01) return null
    const id = `ZONE-${input.pageIndex + 1}-${String(Date.now()).slice(-4)}`
    const finding: Finding = {
      id,
      type: 'manual',
      label: 'Zone manuelle',
      maskedPreview: 'Sélection visuelle',
      confidence: 1,
      pageIndex: input.pageIndex,
      box,
      status: 'pending',
      source: 'manual',
    }
    setFindings((current) => [...current, finding])
    setSelectedPage(input.pageIndex)
    setSelectedFindingId(id)
    return id
  }, [])

  const webMCPActions = useRef<WebMCPActions>({
    getSnapshot: () => snapshotRef.current,
    focusFinding: (id) => {
      const finding = snapshotRef.current.findings.find((candidate) => candidate.id === id)
      if (!finding) return false
      setSelectedPage(finding.pageIndex)
      setSelectedFindingId(id)
      return true
    },
    setFindingStatus: (id, status) => updateFinding(id, status),
    setAllPending: (status) => {
      const count = snapshotRef.current.findings.filter((finding) => finding.status === 'pending').length
      setFindings((current) =>
        current.map((finding) => (finding.status === 'pending' ? { ...finding, status } : finding)),
      )
      return count
    },
    addManualRedaction: addManualFinding,
    prepareExport: () => {
      const blockers = snapshotRef.current.findings.filter((finding) => finding.status === 'pending').length
      if (snapshotRef.current.document && blockers === 0) setExportDialogOpen(true)
      if (blockers > 0) {
        const first = snapshotRef.current.findings.find((finding) => finding.status === 'pending')
        if (first) {
          setSelectedPage(first.pageIndex)
          setSelectedFindingId(first.id)
        }
      }
      return { ready: Boolean(snapshotRef.current.document) && blockers === 0, blockers }
    },
  })

  useEffect(() => registerSafeShareTools(webMCPActions.current, setWebMCPStatus), [])

  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(null), 4_000)
    return () => clearTimeout(timeout)
  }, [notice])

  const loadFile = useCallback(async (file: File) => {
    setSafeDocument(null)
    setFindings([])
    setSelectedFindingId(null)
    setSelectedPage(0)
    setExportDialogOpen(false)
    setScanProgress({ phase: 'reading', value: 1, message: 'Analyse locale en cours' })
    try {
      const { processFile } = await import('./lib/document')
      const result = await processFile(file, setScanProgress)
      setSafeDocument(result.document)
      setFindings(result.findings)
      setSelectedFindingId(result.findings[0]?.id ?? null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Le document n’a pas pu être analysé.'
      setScanProgress({ phase: 'error', value: 0, message })
      setNotice(message)
    }
  }, [])

  const loadDemo = useCallback(() => {
    const demo = createDemo()
    setSafeDocument(demo.document)
    setFindings(demo.findings)
    setSelectedFindingId(demo.findings[0].id)
    setSelectedPage(0)
    setScanProgress({ phase: 'ready', value: 100, message: '6 zones à vérifier' })
    setExportDialogOpen(false)
    setNotice('Document de démonstration chargé — toutes les données sont fictives.')
  }, [])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') loadDemo()
  }, [loadDemo])

  const selectFinding = (finding: Finding) => {
    setSelectedPage(finding.pageIndex)
    setSelectedFindingId(finding.id)
  }

  const decideFinding = (finding: Finding, status: Exclude<FindingStatus, 'pending'>) => {
    updateFinding(finding.id, status)
    const currentIndex = findings.findIndex((candidate) => candidate.id === finding.id)
    const next = findings.slice(currentIndex + 1).find((candidate) => candidate.status === 'pending')
      ?? findings.find((candidate) => candidate.status === 'pending' && candidate.id !== finding.id)
    if (next) selectFinding(next)
  }

  const openExportReview = () => {
    if (pendingCount > 0) {
      const firstPending = findings.find((finding) => finding.status === 'pending')
      if (firstPending) selectFinding(firstPending)
      setNotice(`Il reste ${pendingCount} zone${pendingCount > 1 ? 's' : ''} à décider.`)
      return
    }
    setExportDialogOpen(true)
  }

  const confirmExport = async () => {
    if (!safeDocument) return
    setIsExporting(true)
    try {
      const { exportRedactedDocument } = await import('./lib/document')
      await exportRedactedDocument(safeDocument, findings)
      setExportDialogOpen(false)
      setNotice('Copie aplatie générée. Le document source est resté intact.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Export impossible.')
    } finally {
      setIsExporting(false)
    }
  }

  const approveAllPending = () => {
    setFindings((current) =>
      current.map((finding) => (finding.status === 'pending' ? { ...finding, status: 'approved' } : finding)),
    )
    setNotice('Toutes les propositions ont été marquées pour masquage.')
  }

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = pageSurfaceRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
  }

  const startDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!manualMode || !currentPage) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = pointerPosition(event)
    dragStartRef.current = start
    setDraftBox({ ...start, width: 0, height: 0 })
  }

  const draw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!manualMode || !dragStartRef.current) return
    const point = pointerPosition(event)
    const start = dragStartRef.current
    setDraftBox({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    })
  }

  const finishDrawing = () => {
    if (!dragStartRef.current || !draftBox) return
    addManualFinding({ ...draftBox, pageIndex: selectedPage })
    dragStartRef.current = null
    setDraftBox(null)
    setManualMode(false)
  }

  const pageFindings = useMemo(
    () => findings.filter((finding) => finding.pageIndex === selectedPage),
    [findings, selectedPage],
  )

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="SafeShare, aller au contenu">
          <span className="brand-mark"><ShieldCheck size={19} strokeWidth={2.4} /></span>
          <span>SafeShare</span>
        </a>
        <div className="process-steps" aria-label="Progression">
          <span className={safeDocument ? 'done' : 'active'}><i>1</i> Importer</span>
          <ArrowRight size={14} />
          <span className={safeDocument && pendingCount > 0 ? 'active' : safeDocument ? 'done' : ''}><i>2</i> Vérifier</span>
          <ArrowRight size={14} />
          <span className={safeDocument && pendingCount === 0 ? 'active' : ''}><i>3</i> Exporter</span>
        </div>
        <div className={`webmcp-status ${webMCPStatus}`} title="État de l’intégration WebMCP">
          <span className="status-dot" />
          {statusCopy[webMCPStatus]}
        </div>
      </header>

      {!safeDocument ? (
        <main className="empty-workspace" id="main">
          <section className="intro-panel">
            <p className="eyebrow"><LockKeyhole size={15} /> CONFIDENTIALITÉ LOCALE</p>
            <h1>Partagez le document.<br /><span>Pas vos données.</span></h1>
            <p className="intro-copy">
              SafeShare repère les informations sensibles dans vos PDF et images. Vous gardez la main sur chaque masquage avant de créer une copie sûre.
            </p>
            <div className="trust-row">
              <span><Check size={15} /> Aucun envoi serveur</span>
              <span><Check size={15} /> Source jamais modifiée</span>
              <span><Check size={15} /> Export aplati</span>
            </div>
          </section>

          <section
            className={`drop-zone ${dragging ? 'dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer.files[0]
              if (file) void loadFile(file)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void loadFile(file)
                event.target.value = ''
              }}
              hidden
            />
            <div className="drop-icon"><FileUp size={30} /></div>
            <h2>Déposez un document ici</h2>
            <p>PDF, PNG, JPG ou WEBP · 18 Mo maximum</p>
            <button className="primary-button" onClick={() => fileInputRef.current?.click()}>
              Choisir un fichier <ArrowRight size={17} />
            </button>
            <div className="or-separator"><span>ou</span></div>
            <button className="demo-button" onClick={loadDemo}>
              <Sparkles size={16} /> Essayer avec un document fictif
            </button>
            <p className="local-note"><LockKeyhole size={14} /> Le traitement se fait dans cet onglet, sur votre appareil.</p>
          </section>

          {scanProgress.phase !== 'idle' && (
            <section className={`scan-card ${scanProgress.phase}`} aria-live="polite">
              <div><FileSearch size={20} /><strong>{scanProgress.message}</strong></div>
              <div className="progress-track"><span style={{ width: `${scanProgress.value}%` }} /></div>
            </section>
          )}
        </main>
      ) : (
        <main className="review-workspace" id="main">
          <aside className="document-rail">
            <div className="file-summary">
              <div className="file-icon">{safeDocument.kind === 'image' ? 'IMG' : 'PDF'}</div>
              <div>
                <strong title={safeDocument.name}>{safeDocument.name}</strong>
                <span>{safeDocument.pages.length} page{safeDocument.pages.length > 1 ? 's' : ''} · {formatBytes(safeDocument.size)}</span>
              </div>
              <button className="icon-button" aria-label="Changer de document" onClick={() => fileInputRef.current?.click()}><RotateCcw size={17} /></button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void loadFile(file)
                event.target.value = ''
              }}
              hidden
            />

            <div className="rail-heading">
              <span>PAGES</span>
              <span>{safeDocument.pages.length}</span>
            </div>
            <div className="page-list">
              {safeDocument.pages.map((page) => {
                const pageCount = findings.filter((finding) => finding.pageIndex === page.index && finding.status !== 'dismissed').length
                return (
                  <button
                    key={page.index}
                    className={`page-thumb ${selectedPage === page.index ? 'selected' : ''}`}
                    onClick={() => setSelectedPage(page.index)}
                  >
                    <span className="thumb-image"><img src={page.imageUrl} alt="" /></span>
                    <span>Page {page.index + 1}</span>
                    {pageCount > 0 && <i>{pageCount}</i>}
                  </button>
                )
              })}
            </div>

            <div className="privacy-seal">
              <LockKeyhole size={16} />
              <div><strong>100 % local</strong><span>Rien ne quitte cet appareil</span></div>
            </div>
          </aside>

          <section className="document-stage">
            <div className="stage-toolbar">
              <div>
                <span className="stage-kicker">APERÇU DE LA COPIE</span>
                <strong>Page {selectedPage + 1} sur {safeDocument.pages.length}</strong>
              </div>
              <div className="toolbar-actions">
                {safeDocument.pages.length > 1 && (
                  <div className="page-controls">
                    <button className="icon-button" aria-label="Page précédente" disabled={selectedPage === 0} onClick={() => setSelectedPage((page) => page - 1)}><ChevronLeft size={18} /></button>
                    <button className="icon-button" aria-label="Page suivante" disabled={selectedPage === safeDocument.pages.length - 1} onClick={() => setSelectedPage((page) => page + 1)}><ChevronRight size={18} /></button>
                  </div>
                )}
                <button className={`manual-button ${manualMode ? 'active' : ''}`} onClick={() => setManualMode((active) => !active)}>
                  {manualMode ? <MousePointer2 size={16} /> : <SquareDashedMousePointer size={16} />}
                  {manualMode ? 'Annuler le tracé' : 'Tracer une zone'}
                </button>
              </div>
            </div>

            <div className="canvas-scroll">
              <div
                ref={pageSurfaceRef}
                className={`page-surface ${manualMode ? 'drawing' : ''}`}
                style={{ aspectRatio: currentPage ? `${currentPage.width} / ${currentPage.height}` : undefined }}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={finishDrawing}
              >
                {currentPage && <img src={currentPage.imageUrl} alt={`Aperçu de la page ${selectedPage + 1}`} draggable={false} />}
                {pageFindings.map((finding) => (
                  <button
                    key={finding.id}
                    className={`finding-overlay ${finding.status} ${selectedFindingId === finding.id ? 'selected' : ''}`}
                    style={{
                      left: `${finding.box.x * 100}%`,
                      top: `${finding.box.y * 100}%`,
                      width: `${finding.box.width * 100}%`,
                      height: `${finding.box.height * 100}%`,
                    }}
                    aria-label={`${finding.label}, ${finding.status}`}
                    onClick={(event) => { event.stopPropagation(); selectFinding(finding) }}
                  ><span>{finding.status === 'approved' ? 'MASQUÉ' : finding.id}</span></button>
                ))}
                {draftBox && (
                  <div className="draft-overlay" style={{ left: `${draftBox.x * 100}%`, top: `${draftBox.y * 100}%`, width: `${draftBox.width * 100}%`, height: `${draftBox.height * 100}%` }} />
                )}
              </div>
            </div>
            {manualMode && <div className="drawing-hint"><Focus size={16} /> Cliquez-glissez sur le document pour proposer un masque.</div>}
          </section>

          <aside className="review-panel">
            <div className="review-header">
              <div>
                <p className="eyebrow">REVUE HUMAINE</p>
                <h2>{pendingCount > 0 ? `${pendingCount} décision${pendingCount > 1 ? 's' : ''} à prendre` : 'Revue terminée'}</h2>
              </div>
              <div className={`review-score ${pendingCount === 0 ? 'complete' : ''}`}>
                <strong>{findings.length ? Math.round(((approvedCount + dismissedCount) / findings.length) * 100) : 100}%</strong>
                <span>vérifié</span>
              </div>
            </div>

            <div className="decision-summary">
              <span><i className="pending-dot" /> {pendingCount} en attente</span>
              <span><i className="approved-dot" /> {approvedCount} masquée{approvedCount > 1 ? 's' : ''}</span>
              <span><i className="dismissed-dot" /> {dismissedCount} conservée{dismissedCount > 1 ? 's' : ''}</span>
            </div>

            <div className="finding-list">
              {findings.length === 0 ? (
                <div className="no-findings"><CheckCircle2 size={28} /><strong>Aucune donnée reconnue</strong><span>Contrôlez tout de même le document et ajoutez des zones manuelles si besoin.</span></div>
              ) : findings.map((finding) => (
                <article
                  key={finding.id}
                  className={`finding-card ${finding.status} ${selectedFindingId === finding.id ? 'selected' : ''}`}
                  onClick={() => selectFinding(finding)}
                >
                  <div className="finding-card-top">
                    <span className={`type-icon ${typeTone[finding.type]}`}><EyeOff size={16} /></span>
                    <div>
                      <strong>{finding.label}</strong>
                      <span>Page {finding.pageIndex + 1} · {confidenceLabel(finding.confidence)}</span>
                    </div>
                    <button className="locate-button" aria-label="Voir la zone" onClick={(event) => { event.stopPropagation(); selectFinding(finding) }}><Focus size={15} /></button>
                  </div>
                  <div className="masked-value">{finding.maskedPreview}<small>{finding.id}</small></div>
                  {finding.status === 'pending' ? (
                    <div className="decision-buttons">
                      <button onClick={(event) => { event.stopPropagation(); decideFinding(finding, 'approved') }}><EyeOff size={15} /> Masquer</button>
                      <button onClick={(event) => { event.stopPropagation(); decideFinding(finding, 'dismissed') }}><Eye size={15} /> Conserver</button>
                    </div>
                  ) : (
                    <div className={`decision-made ${finding.status}`}>
                      {finding.status === 'approved' ? <><Check size={15} /> Sera masquée</> : <><Eye size={15} /> Sera conservée</>}
                      <button onClick={(event) => { event.stopPropagation(); updateFinding(finding.id, 'pending') }}>Annuler</button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="review-footer">
              {pendingCount > 1 && <button className="approve-all" onClick={approveAllPending}><ShieldCheck size={16} /> Tout masquer</button>}
              <button className="export-button" onClick={openExportReview} disabled={!safeDocument}>
                <span><Download size={18} /> Préparer la copie sûre</span><ArrowRight size={18} />
              </button>
              <p><CircleAlert size={13} /> La détection est une aide : votre vérification reste indispensable.</p>
            </div>
          </aside>
        </main>
      )}

      {exportDialogOpen && safeDocument && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setExportDialogOpen(false)}>
          <section className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Fermer" onClick={() => setExportDialogOpen(false)}><X size={19} /></button>
            <div className="modal-seal"><ShieldCheck size={27} /></div>
            <p className="eyebrow">DERNIER CONTRÔLE</p>
            <h2 id="export-title">Votre copie est prête à être aplatie</h2>
            <p>Les masques seront fusionnés dans les pixels du nouveau fichier. Le texte caché ne restera pas sélectionnable sous les rectangles.</p>
            <div className="export-recap">
              <div><span>Document</span><strong>{safeDocument.name}</strong></div>
              <div><span>Zones masquées</span><strong>{approvedCount}</strong></div>
              <div><span>Zones conservées</span><strong>{dismissedCount}</strong></div>
              <div><span>En attente</span><strong className={pendingCount ? 'warning' : ''}>{pendingCount}</strong></div>
            </div>
            <label className="confirmation-line">
              <input type="checkbox" id="human-confirmation" />
              <span>J’ai contrôlé le document et je souhaite créer cette copie.</span>
            </label>
            <button
              className="confirm-export"
              disabled={isExporting}
              onClick={() => {
                const checkbox = document.getElementById('human-confirmation') as HTMLInputElement | null
                if (!checkbox?.checked) {
                  setNotice('Cochez la confirmation après votre dernier contrôle.')
                  return
                }
                void confirmExport()
              }}
            >
              {isExporting ? 'Création en cours…' : <><Download size={18} /> Télécharger la copie sûre</>}
            </button>
            <small><LockKeyhole size={13} /> Généré localement · source inchangée · aucune sauvegarde distante</small>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status"><CheckCircle2 size={17} /> {notice}</div>}
    </div>
  )
}

export default App
