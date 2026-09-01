import { PDFDocument } from 'pdf-lib'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker } from 'tesseract.js'
import { createFinding, deduplicateFindings, findSensitiveMatches } from './detection'
import type { DocumentPage, Finding, SafeDocument, ScanProgress } from '../types'

GlobalWorkerOptions.workerSrc = pdfWorker

const MAX_FILE_SIZE = 18 * 1024 * 1024
const MAX_PAGES = 12
const RENDER_SCALE = 1.6

type ProgressReporter = (progress: ScanProgress) => void

type OcrLine = {
  text: string
  confidence?: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Impossible de lire l'image."))
    image.src = url
  })
}

async function scanCanvasWithOcr(
  canvas: HTMLCanvasElement,
  pageIndex: number,
  sequenceStart: number,
  onProgress: ProgressReporter,
): Promise<Finding[]> {
  const worker = await createWorker('fra+eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress({
          phase: 'scanning',
          value: Math.round((message.progress ?? 0) * 100),
          message: `Lecture locale de la page ${pageIndex + 1}`,
        })
      }
    },
  })

  try {
    const result = await worker.recognize(canvas)
    const lines = ((result.data as unknown as { lines?: OcrLine[] }).lines ?? []).filter(
      (line) => line.text.trim().length > 0,
    )
    let sequence = sequenceStart
    const findings = lines.flatMap((line) => {
      const matches = findSensitiveMatches(line.text)
      return matches.map((match) => {
        const finding = createFinding(
          { ...match, confidence: Math.min(match.confidence, (line.confidence ?? 85) / 100) },
          pageIndex,
          {
            x: line.bbox.x0 / canvas.width,
            y: line.bbox.y0 / canvas.height,
            width: (line.bbox.x1 - line.bbox.x0) / canvas.width,
            height: (line.bbox.y1 - line.bbox.y0) / canvas.height,
          },
          'ocr',
          sequence,
        )
        sequence += 1
        return finding
      })
    })
    return findings
  } finally {
    await worker.terminate()
  }
}

function scanPdfTextItems(
  items: TextItem[],
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  convertRectangle: (rectangle: [number, number, number, number]) => number[],
  sequenceStart: number,
): Finding[] {
  let sequence = sequenceStart
  return items.flatMap((item) => {
    const matches = findSensitiveMatches(item.str)
    if (!matches.length || !item.str.length) return []

    const [rawX1, rawY1, rawX2, rawY2] = convertRectangle([
      item.transform[4],
      item.transform[5],
      item.transform[4] + item.width,
      item.transform[5] + Math.max(item.height, Math.abs(item.transform[3])),
    ])
    const x1 = Math.min(rawX1, rawX2)
    const y1 = Math.min(rawY1, rawY2)
    const width = Math.abs(rawX2 - rawX1)
    const height = Math.abs(rawY2 - rawY1)

    return matches.map((match) => {
      const characterWidth = width / item.str.length
      const finding = createFinding(
        match,
        pageIndex,
        {
          x: (x1 + characterWidth * match.index) / pageWidth,
          y: y1 / pageHeight,
          width: Math.max(characterWidth * match.value.length, 12) / pageWidth,
          height: Math.max(height, 12) / pageHeight,
        },
        'text',
        sequence,
      )
      sequence += 1
      return finding
    })
  })
}

async function processPdf(file: File, onProgress: ProgressReporter) {
  onProgress({ phase: 'reading', value: 5, message: 'Ouverture du PDF en mémoire' })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data: bytes }).promise
  if (pdf.numPages > MAX_PAGES) {
    throw new Error(`Ce prototype accepte jusqu’à ${MAX_PAGES} pages par document.`)
  }

  const pages: DocumentPage[] = []
  const findings: Finding[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error("Le navigateur ne permet pas d'afficher ce PDF.")

    onProgress({
      phase: 'rendering',
      value: Math.round((pageNumber / pdf.numPages) * 45),
      message: `Préparation de la page ${pageNumber}/${pdf.numPages}`,
    })
    await page.render({ canvasContext: context, viewport }).promise
    const textContent = await page.getTextContent()
    const textItems = textContent.items.filter((item): item is TextItem => 'str' in item)
    const pageFindings = scanPdfTextItems(
      textItems,
      pageNumber - 1,
      viewport.width,
      viewport.height,
      (rectangle) => viewport.convertToViewportRectangle(rectangle),
      findings.length,
    )

    if (pageFindings.length === 0) {
      pageFindings.push(
        ...(await scanCanvasWithOcr(canvas, pageNumber - 1, findings.length, onProgress)),
      )
    }

    findings.push(...pageFindings)
    pages.push({
      index: pageNumber - 1,
      imageUrl: canvasToDataUrl(canvas),
      width: canvas.width,
      height: canvas.height,
    })
  }

  return { pages, findings: deduplicateFindings(findings) }
}

async function processImage(file: File, onProgress: ProgressReporter) {
  onProgress({ phase: 'reading', value: 8, message: "Ouverture de l'image en mémoire" })
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await imageFromUrl(objectUrl)
    const maxDimension = 2400
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error("Le navigateur ne permet pas d'afficher cette image.")
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const findings = await scanCanvasWithOcr(canvas, 0, 0, onProgress)
    return {
      pages: [
        {
          index: 0,
          imageUrl: canvasToDataUrl(canvas),
          width: canvas.width,
          height: canvas.height,
        },
      ],
      findings: deduplicateFindings(findings),
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function processFile(file: File, onProgress: ProgressReporter) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Le fichier dépasse la limite locale de 18 Mo.')
  }
  if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
    throw new Error('Format non pris en charge. Utilisez un PDF, PNG, JPG ou WEBP.')
  }

  const result = file.type === 'application/pdf'
    ? await processPdf(file, onProgress)
    : await processImage(file, onProgress)

  const safeDocument: SafeDocument = {
    id: makeId(),
    name: file.name,
    kind: file.type === 'application/pdf' ? 'pdf' : 'image',
    size: file.size,
    pages: result.pages,
    createdAt: Date.now(),
  }

  onProgress({
    phase: 'ready',
    value: 100,
    message: `${result.findings.length} zone${result.findings.length > 1 ? 's' : ''} à vérifier`,
  })
  return { document: safeDocument, findings: result.findings }
}

async function flattenPage(page: DocumentPage, findings: Finding[]) {
  const image = await imageFromUrl(page.imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = page.width
  canvas.height = page.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error("Impossible de préparer l'export.")
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  findings
    .filter((finding) => finding.pageIndex === page.index && finding.status === 'approved')
    .forEach((finding) => {
      const x = finding.box.x * canvas.width
      const y = finding.box.y * canvas.height
      const width = finding.box.width * canvas.width
      const height = finding.box.height * canvas.height
      context.fillStyle = '#17211d'
      context.fillRect(x - 3, y - 3, width + 6, height + 6)
    })

  return canvas
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export async function exportRedactedDocument(safeDocument: SafeDocument, findings: Finding[]) {
  const baseName = safeDocument.name.replace(/\.[^.]+$/, '')

  if (safeDocument.kind === 'image') {
    const canvas = await flattenPage(safeDocument.pages[0], findings)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error("Impossible de générer l'image expurgée.")
    downloadBlob(blob, `${baseName}-safeshare.png`)
    return
  }

  const output = await PDFDocument.create()
  for (const page of safeDocument.pages) {
    const flattened = await flattenPage(page, findings)
    const imageBytes = await fetch(flattened.toDataURL('image/png')).then((response) => response.arrayBuffer())
    const embedded = await output.embedPng(imageBytes)
    const pdfPage = output.addPage([page.width, page.height])
    pdfPage.drawImage(embedded, { x: 0, y: 0, width: page.width, height: page.height })
  }
  const bytes = await output.save()
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${baseName}-safeshare.pdf`)
}
