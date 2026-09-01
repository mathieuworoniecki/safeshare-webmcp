import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSearch,
  FileUp,
  LockKeyhole,
  RotateCcw,
  Redo2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReviewHistory } from './hooks/useReviewHistory'
import { clampBox } from './lib/detection'
import { createDemo } from './lib/demo'
import { buildExportSafetyReport } from './lib/export-safety'
import {
  registerSafeShareTools,
  WEBMCP_TOOL_COUNT,
  type WebMCPActions,
  type WebMCPStatus,
} from './lib/webmcp'
import type { AppSnapshot, BoundingBox, Finding, SafeDocument, ScanProgress } from './types'

const initialProgress: ScanProgress = {
  phase: 'idle',
  value: 0,
  message: 'En attente d’un document',
}

const statusCopy: Record<WebMCPStatus, string> = {
  registering: 'Connexion WebMCP…',
  available: `${WEBMCP_TOOL_COUNT} outils WebMCP actifs`,
  unsupported: 'Aperçu sans WebMCP',
  error: 'WebMCP indisponible',
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

function App() {
  const [safeDocument, setSafeDocument] = useState<SafeDocument | null>(null)
  const { findings, canUndo, canRedo, resetFindings, commitFindings, undo, redo } = useReviewHistory()
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState(0)
  const [scanProgress, setScanProgress] = useState<ScanProgress>(initialProgress)
  const [isExporting, setIsExporting] = useState(false)
  const [webMCPStatus, setWebMCPStatus] = useState<WebMCPStatus>('registering')
  const [dragging, setDragging] = useState(false)
  const [draftBox, setDraftBox] = useState<BoundingBox | null>(null)
  const [editingBox, setEditingBox] = useState<{ id: string; box: BoundingBox } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [maskOpacity, setMaskOpacity] = useState(0.45)
  const [showOriginal, setShowOriginal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pageSurfaceRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const editRef = useRef<{
    id: string
    mode: 'move' | 'resize'
    start: { x: number; y: number }
    initial: BoundingBox
    moved: boolean
  } | null>(null)
  const scanAbortRef = useRef<AbortController | null>(null)

  const snapshotRef = useRef<AppSnapshot>({
    document: null,
    findings: [],
    selectedFindingId: null,
    selectedPage: 0,
    scanProgress: initialProgress,
    canUndo: false,
    canRedo: false,
  })

  snapshotRef.current = {
    document: safeDocument,
    findings,
    selectedFindingId,
    selectedPage,
    scanProgress,
    canUndo,
    canRedo,
  }

  const currentPage = safeDocument?.pages[selectedPage]

  const removeFinding = useCallback((id: string) => {
    if (!snapshotRef.current.findings.some((finding) => finding.id === id)) return false
    commitFindings((current) => current.filter((finding) => finding.id !== id))
    setSelectedFindingId((selected) => selected === id ? null : selected)
    return true
  }, [commitFindings])

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
      source: 'manual',
      reason: 'Zone rectangulaire ajoutée explicitement dans l’éditeur.',
    }
    commitFindings((current) => [...current, finding])
    setSelectedPage(input.pageIndex)
    setSelectedFindingId(id)
    return id
  }, [commitFindings])

  const webMCPActions = useRef<WebMCPActions>({
    getSnapshot: () => snapshotRef.current,
    focusFinding: (id) => {
      const finding = snapshotRef.current.findings.find((candidate) => candidate.id === id)
      if (!finding) return false
      setSelectedPage(finding.pageIndex)
      setSelectedFindingId(id)
      return true
    },
    deleteFinding: removeFinding,
    addManualRedaction: addManualFinding,
    undoLastAction: () => {
      if (!snapshotRef.current.canUndo) return false
      undo()
      return true
    },
    prepareExport: () => {
      const snapshot = snapshotRef.current
      const report = buildExportSafetyReport(snapshot.document, snapshot.findings)
      setNotice(report.ready ? 'Prêt. Cliquez sur Download pour créer la copie.' : report.issues[0])
      return report
    },
  })

  useEffect(() => registerSafeShareTools(webMCPActions.current, setWebMCPStatus), [])
  useEffect(() => () => scanAbortRef.current?.abort(), [])

  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(null), 4_000)
    return () => clearTimeout(timeout)
  }, [notice])

  const loadFile = useCallback(async (file: File) => {
    scanAbortRef.current?.abort()
    const controller = new AbortController()
    scanAbortRef.current = controller
    setSafeDocument(null)
    resetFindings([])
    setSelectedFindingId(null)
    setSelectedPage(0)
    setScanProgress({ phase: 'reading', value: 1, message: 'Analyse locale en cours' })
    try {
      const { processFile } = await import('./lib/document')
      const result = await processFile(file, setScanProgress, controller.signal)
      setSafeDocument(result.document)
      resetFindings(result.findings)
      setSelectedFindingId(result.findings[0]?.id ?? null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setScanProgress(initialProgress)
        setNotice('Analyse annulée. Aucun contenu n’a été conservé.')
        return
      }
      const message = error instanceof Error ? error.message : 'Le document n’a pas pu être analysé.'
      setScanProgress({ phase: 'error', value: 0, message })
      setNotice(message)
    } finally {
      if (scanAbortRef.current === controller) scanAbortRef.current = null
    }
  }, [resetFindings])

  const loadDemo = useCallback(() => {
    const demo = createDemo()
    setSafeDocument(demo.document)
    resetFindings(demo.findings)
    setSelectedFindingId(demo.findings[0]?.id ?? null)
    setSelectedPage(0)
    setScanProgress({ phase: 'ready', value: 100, message: '6 zones masquées automatiquement' })
    setNotice('Démo chargée : les 6 zones sensibles sont déjà masquées.')
  }, [resetFindings])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') loadDemo()
  }, [loadDemo])

  const download = async () => {
    if (!safeDocument) return
    const report = buildExportSafetyReport(safeDocument, findings)
    if (!report.ready) {
      setNotice(report.issues[0] ?? 'Le téléchargement est impossible.')
      return
    }
    setIsExporting(true)
    try {
      const { exportRedactedDocument } = await import('./lib/document')
      await exportRedactedDocument(safeDocument, findings)
      setNotice('Copie téléchargée. Le document original est inchangé.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Téléchargement impossible.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleUndo = useCallback(() => {
    if (!snapshotRef.current.canUndo) return false
    undo()
    setNotice('Modification annulée.')
    return true
  }, [undo])

  const handleRedo = useCallback(() => {
    if (!snapshotRef.current.canRedo) return false
    redo()
    setNotice('Modification rétablie.')
    return true
  }, [redo])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) handleRedo()
      else handleUndo()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [handleRedo, handleUndo])

  const updateFindingBox = (id: string, box: BoundingBox) => {
    const normalized = clampBox(box)
    commitFindings((current) => {
      const target = current.find((finding) => finding.id === id)
      if (!target) return current
      const unchanged = (Object.keys(normalized) as Array<keyof BoundingBox>)
        .every((key) => Math.abs(target.box[key] - normalized[key]) < 0.0001)
      if (unchanged) return current
      return current.map((finding) => finding.id === id ? { ...finding, box: normalized } : finding)
    })
  }

  const pointerPosition = (event: React.PointerEvent<HTMLElement>) => {
    const rect = pageSurfaceRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
  }

  const startDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!currentPage || showOriginal) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = pointerPosition(event)
    dragStartRef.current = start
    setDraftBox({ ...start, width: 0, height: 0 })
  }

  const startEditing = (
    event: React.PointerEvent<HTMLElement>,
    finding: Finding,
    mode: 'move' | 'resize',
  ) => {
    if (showOriginal) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedFindingId(finding.id)
    const start = pointerPosition(event)
    editRef.current = { id: finding.id, mode, start, initial: finding.box, moved: false }
    setEditingBox({ id: finding.id, box: finding.box })
  }

  const draw = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointerPosition(event)
    if (editRef.current) {
      const { id, mode, start, initial } = editRef.current
      const dx = point.x - start.x
      const dy = point.y - start.y
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) editRef.current.moved = true
      const box = mode === 'move'
        ? {
            ...initial,
            x: Math.max(0, Math.min(1 - initial.width, initial.x + dx)),
            y: Math.max(0, Math.min(1 - initial.height, initial.y + dy)),
          }
        : {
            ...initial,
            width: Math.max(0.01, Math.min(1 - initial.x, initial.width + dx)),
            height: Math.max(0.01, Math.min(1 - initial.y, initial.height + dy)),
          }
      setEditingBox({ id, box })
      return
    }
    if (!dragStartRef.current) return
    const start = dragStartRef.current
    setDraftBox({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    })
  }

  const finishPointerInteraction = () => {
    if (editRef.current && editingBox) {
      if (editRef.current.moved) updateFindingBox(editRef.current.id, editingBox.box)
      editRef.current = null
      setEditingBox(null)
      return
    }
    if (!dragStartRef.current || !draftBox) return
    const id = addManualFinding({ ...draftBox, pageIndex: selectedPage })
    dragStartRef.current = null
    setDraftBox(null)
    if (!id) setNotice('Tracez une zone un peu plus grande.')
  }

  const cancelPointerInteraction = () => {
    editRef.current = null
    dragStartRef.current = null
    setEditingBox(null)
    setDraftBox(null)
  }

  const handleFindingKey = (event: React.KeyboardEvent<HTMLDivElement>, finding: Finding) => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && !showOriginal) {
      event.preventDefault()
      removeFinding(finding.id)
      return
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const direction = directions[event.key]
    if (!direction || showOriginal) return
    event.preventDefault()
    const step = event.shiftKey ? 0.02 : 0.005
    updateFindingBox(finding.id, {
      ...finding.box,
      x: Math.max(0, Math.min(1 - finding.box.width, finding.box.x + direction[0] * step)),
      y: Math.max(0, Math.min(1 - finding.box.height, finding.box.y + direction[1] * step)),
    })
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
        <div className="editor-summary">
          {safeDocument ? `${findings.length} zone${findings.length > 1 ? 's' : ''} masquée${findings.length > 1 ? 's' : ''}` : 'Masquage local et automatique'}
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
              SafeShare trace automatiquement les zones sensibles. Déplacez, redimensionnez ou supprimez les masques, puis téléchargez votre copie.
            </p>
            <div className="trust-row">
              <span><Check size={15} /> Aucun envoi serveur</span>
              <span><Check size={15} /> Masques automatiques</span>
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
              <div>
                <FileSearch size={20} /><strong>{scanProgress.message}</strong>
                {scanProgress.phase !== 'error' && scanProgress.phase !== 'ready' && (
                  <button className="scan-cancel" onClick={() => scanAbortRef.current?.abort()}>Annuler</button>
                )}
              </div>
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

            <div className="rail-heading"><span>PAGES</span><span>{safeDocument.pages.length}</span></div>
            <div className="page-list">
              {safeDocument.pages.map((page) => {
                const pageCount = findings.filter((finding) => finding.pageIndex === page.index).length
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
                <span className="stage-kicker">{showOriginal ? 'ORIGINAL' : `${pageFindings.length} MASQUE${pageFindings.length > 1 ? 'S' : ''}`}</span>
                <strong>Page {selectedPage + 1} sur {safeDocument.pages.length}</strong>
              </div>
              <div className="toolbar-actions">
                <div className="history-controls" aria-label="Historique des modifications">
                  <button className="icon-button" aria-label="Annuler" title="Annuler" disabled={!canUndo} onClick={handleUndo}><Undo2 size={16} /></button>
                  <button className="icon-button" aria-label="Rétablir" title="Rétablir" disabled={!canRedo} onClick={handleRedo}><Redo2 size={16} /></button>
                </div>
                <button
                  className={`compare-button ${showOriginal ? 'active' : ''}`}
                  onClick={() => setShowOriginal((value) => !value)}
                >
                  <Eye size={16} /> {showOriginal ? 'Voir les masques' : "Voir l’original"}
                </button>
                <label className="opacity-control" title="Opacité de l’aperçu des masques">
                  <span>Opacité de l’aperçu</span>
                  <input
                    type="range"
                    min="15"
                    max="85"
                    step="5"
                    value={Math.round(maskOpacity * 100)}
                    aria-label="Opacité de l’aperçu des masques"
                    onChange={(event) => setMaskOpacity(Number(event.target.value) / 100)}
                  />
                  <output>{Math.round(maskOpacity * 100)}%</output>
                </label>
                <div className="zoom-controls" aria-label="Zoom du document">
                  <button className="icon-button" aria-label="Réduire le zoom" disabled={zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}><ZoomOut size={16} /></button>
                  <span>{Math.round(zoom * 100)} %</span>
                  <button className="icon-button" aria-label="Augmenter le zoom" disabled={zoom >= 1.75} onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}><ZoomIn size={16} /></button>
                </div>
                {safeDocument.pages.length > 1 && (
                  <div className="page-controls">
                    <button className="icon-button" aria-label="Page précédente" disabled={selectedPage === 0} onClick={() => setSelectedPage((page) => page - 1)}><ChevronLeft size={18} /></button>
                    <button className="icon-button" aria-label="Page suivante" disabled={selectedPage === safeDocument.pages.length - 1} onClick={() => setSelectedPage((page) => page + 1)}><ChevronRight size={18} /></button>
                  </div>
                )}
              </div>
            </div>

            <div className="canvas-scroll">
              <div
                ref={pageSurfaceRef}
                className={`page-surface ${showOriginal ? 'show-original' : 'draw-ready'}`}
                style={{
                  aspectRatio: currentPage ? `${currentPage.width} / ${currentPage.height}` : undefined,
                  width: currentPage ? `${Math.min(currentPage.width, 760) * zoom}px` : undefined,
                  maxWidth: zoom <= 1 ? '100%' : 'none',
                }}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={finishPointerInteraction}
                onPointerCancel={cancelPointerInteraction}
              >
                {currentPage && <img src={currentPage.imageUrl} alt={`Aperçu de la page ${selectedPage + 1}`} draggable={false} />}
                {pageFindings.map((finding) => {
                  const box = editingBox?.id === finding.id ? editingBox.box : finding.box
                  const selected = selectedFindingId === finding.id
                  return (
                    <div
                      key={finding.id}
                      className={`finding-overlay ${selected ? 'selected' : ''}`}
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.width * 100}%`,
                        height: `${box.height * 100}%`,
                        backgroundColor: `rgba(37, 76, 62, ${maskOpacity})`,
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${finding.label}, masquée. Utilisez les flèches pour déplacer la zone ou Suppr pour l'enlever.`}
                      onPointerDown={(event) => startEditing(event, finding, 'move')}
                      onKeyDown={(event) => handleFindingKey(event, finding)}
                      onClick={(event) => { event.stopPropagation(); setSelectedFindingId(finding.id) }}
                    >
                      <button
                        className="delete-mask"
                        aria-label={`Supprimer la zone ${finding.label}`}
                        title="Supprimer cette zone"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          removeFinding(finding.id)
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                      {selected && !showOriginal && (
                        <button
                          className="resize-handle"
                          aria-label="Redimensionner la zone"
                          onPointerDown={(event) => startEditing(event, finding, 'resize')}
                        />
                      )}
                    </div>
                  )
                })}
                {draftBox && (
                  <div className="draft-overlay" style={{ left: `${draftBox.x * 100}%`, top: `${draftBox.y * 100}%`, width: `${draftBox.width * 100}%`, height: `${draftBox.height * 100}%` }} />
                )}
              </div>
            </div>
          </section>
        </main>
      )}

      {safeDocument && (
        <button className="floating-download-button" disabled={isExporting} onClick={() => void download()}>
          <Download size={18} /> {isExporting ? 'Downloading…' : 'Download'}
        </button>
      )}

      {notice && <div className="toast" role="status"><CheckCircle2 size={17} /> {notice}</div>}
    </div>
  )
}

export default App
