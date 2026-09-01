import { PDFDocument } from 'pdf-lib'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker } from 'tesseract.js'
import { createFinding, deduplicateFindings, findSensitiveMatches } from './detection'
import { getRedactionRects } from './export-safety'
import { validateUploadedFile } from './file-validation'
import { tr } from './i18n'
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

type OcrSession = {
  recognize: (
    canvas: HTMLCanvasElement,
    pageIndex: number,
    sequenceStart: number,
    onProgress: ProgressReporter,
  ) => Promise<Finding[]>
  terminate: () => Promise<void>
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
    image.onerror = () => reject(new Error(tr('Unable to read the image.', "Impossible de lire l'image.")))
    image.src = url
  })
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException(tr('Scan cancelled.', 'Analyse annulée.'), 'AbortError')
}

async function createOcrSession(signal?: AbortSignal): Promise<OcrSession> {
  let activePage = 0
  let activeProgress: ProgressReporter = () => undefined
  const worker = await createWorker('fra+eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        activeProgress({
          phase: 'scanning',
          value: Math.round((message.progress ?? 0) * 100),
          message: tr(
            `Reading page ${activePage + 1} locally`,
            `Lecture locale de la page ${activePage + 1}`,
          ),
        })
      }
    },
  })
  let terminated = false
  const terminate = async () => {
    if (terminated) return
    terminated = true
    signal?.removeEventListener('abort', abortHandler)
    await worker.terminate()
  }
  const abortHandler = () => { void terminate() }
  signal?.addEventListener('abort', abortHandler, { once: true })

  return {
    async recognize(canvas, pageIndex, sequenceStart, onProgress) {
      throwIfAborted(signal)
      activePage = pageIndex
      activeProgress = onProgress
      const result = await worker.recognize(canvas)
      throwIfAborted(signal)
      const lines = ((result.data as unknown as { lines?: OcrLine[] }).lines ?? []).filter(
        (line) => line.text.trim().length > 0,
      )
      let sequence = sequenceStart
      return lines.flatMap((line) => {
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
            sequence++,
          )
          return finding
        })
      })
    },
    terminate,
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
  const itemRectangle = (item: TextItem) => {
    const [rawX1, rawY1, rawX2, rawY2] = convertRectangle([
      item.transform[4],
      item.transform[5],
      item.transform[4] + item.width,
      item.transform[5] + Math.max(item.height, Math.abs(item.transform[3])),
    ])
    return {
      x: Math.min(rawX1, rawX2),
      y: Math.min(rawY1, rawY2),
      width: Math.abs(rawX2 - rawX1),
      height: Math.abs(rawY2 - rawY1),
    }
  }

  const lines: TextItem[][] = []
  items
    .filter((item) => item.str.trim().length > 0)
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
    .forEach((item) => {
      const line = lines.find((candidate) => Math.abs(candidate[0].transform[5] - item.transform[5]) <= 2.5)
      if (line) line.push(item)
      else lines.push([item])
    })

  return lines.flatMap((line) => {
    line.sort((a, b) => a.transform[4] - b.transform[4])
    let lineText = ''
    const segments = line.map((item, index) => {
      const previous = line[index - 1]
      const joiner = previous && item.transform[4] - (previous.transform[4] + previous.width) > 1 ? ' ' : ''
      lineText += joiner
      const start = lineText.length
      lineText += item.str
      return { item, start, end: lineText.length, rectangle: itemRectangle(item) }
    })

    return findSensitiveMatches(lineText).flatMap((match) => {
      const matchEnd = match.index + match.value.length
      const selected = segments.filter((segment) => segment.end > match.index && segment.start < matchEnd)
      if (!selected.length) return []

      if (selected.length === 1) {
        const segment = selected[0]
        const localStart = Math.max(0, match.index - segment.start)
        const localLength = Math.min(segment.item.str.length - localStart, match.value.length)
        const characterWidth = segment.rectangle.width / Math.max(1, segment.item.str.length)
        return [createFinding(
          match,
          pageIndex,
          {
            x: (segment.rectangle.x + characterWidth * localStart) / pageWidth,
            y: segment.rectangle.y / pageHeight,
            width: Math.max(characterWidth * localLength, 12) / pageWidth,
            height: Math.max(segment.rectangle.height, 12) / pageHeight,
          },
          'text',
          sequence++,
        )]
      }

      const x1 = Math.min(...selected.map((segment) => segment.rectangle.x))
      const y1 = Math.min(...selected.map((segment) => segment.rectangle.y))
      const x2 = Math.max(...selected.map((segment) => segment.rectangle.x + segment.rectangle.width))
      const y2 = Math.max(...selected.map((segment) => segment.rectangle.y + segment.rectangle.height))
      return [createFinding(
        match,
        pageIndex,
        { x: x1 / pageWidth, y: y1 / pageHeight, width: (x2 - x1) / pageWidth, height: (y2 - y1) / pageHeight },
        'text',
        sequence++,
      )]
    })
  })
}

async function processPdf(file: File, onProgress: ProgressReporter, signal?: AbortSignal) {
  throwIfAborted(signal)
  onProgress({
    phase: 'reading',
    value: 5,
    message: tr('Opening PDF in memory', 'Ouverture du PDF en mémoire'),
  })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data: bytes }).promise
  if (pdf.numPages > MAX_PAGES) {
    throw new Error(tr(
      `This prototype accepts up to ${MAX_PAGES} pages per document.`,
      `Ce prototype accepte jusqu’à ${MAX_PAGES} pages par document.`,
    ))
  }

  const pages: DocumentPage[] = []
  const findings: Finding[] = []
  let ocrSession: OcrSession | null = null

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      throwIfAborted(signal)
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error(tr(
        'The browser cannot display this PDF.',
        "Le navigateur ne permet pas d'afficher ce PDF.",
      ))

      onProgress({
        phase: 'rendering',
        value: Math.round((pageNumber / pdf.numPages) * 45),
        message: tr(
          `Preparing page ${pageNumber}/${pdf.numPages}`,
          `Préparation de la page ${pageNumber}/${pdf.numPages}`,
        ),
      })
      await page.render({ canvasContext: context, viewport }).promise
      throwIfAborted(signal)
      const textContent = await page.getTextContent()
      const textItems = textContent.items.filter((item): item is TextItem => 'str' in item)
      const hasExtractableText = textItems.some((item) => item.str.trim().length > 0)
      const pageFindings = scanPdfTextItems(
        textItems,
        pageNumber - 1,
        viewport.width,
        viewport.height,
        (rectangle) => viewport.convertToViewportRectangle(rectangle),
        findings.length,
      )

      if (!hasExtractableText) {
        ocrSession ??= await createOcrSession(signal)
        pageFindings.push(
          ...(await ocrSession.recognize(canvas, pageNumber - 1, findings.length, onProgress)),
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
  } finally {
    await ocrSession?.terminate()
  }

  return { pages, findings: deduplicateFindings(findings) }
}

async function processImage(file: File, onProgress: ProgressReporter, signal?: AbortSignal) {
  throwIfAborted(signal)
  onProgress({
    phase: 'reading',
    value: 8,
    message: tr('Opening image in memory', "Ouverture de l'image en mémoire"),
  })
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await imageFromUrl(objectUrl)
    const maxDimension = 2400
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error(tr(
      'The browser cannot display this image.',
      "Le navigateur ne permet pas d'afficher cette image.",
    ))
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const ocrSession = await createOcrSession(signal)
    let findings: Finding[]
    try {
      findings = await ocrSession.recognize(canvas, 0, 0, onProgress)
    } finally {
      await ocrSession.terminate()
    }
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

export async function processFile(file: File, onProgress: ProgressReporter, signal?: AbortSignal) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(tr(
      'The file exceeds the local 18 MB limit.',
      'Le fichier dépasse la limite locale de 18 Mo.',
    ))
  }
  const kind = await validateUploadedFile(file)
  throwIfAborted(signal)

  const result = kind === 'pdf'
    ? await processPdf(file, onProgress, signal)
    : await processImage(file, onProgress, signal)

  const safeDocument: SafeDocument = {
    id: makeId(),
    name: file.name,
    kind: kind === 'pdf' ? 'pdf' : 'image',
    size: file.size,
    pages: result.pages,
    createdAt: Date.now(),
  }

  onProgress({
    phase: 'ready',
    value: 100,
    message: tr(
      `${result.findings.length} ${result.findings.length === 1 ? 'area' : 'areas'} to review`,
      `${result.findings.length} zone${result.findings.length > 1 ? 's' : ''} à vérifier`,
    ),
  })
  return { document: safeDocument, findings: result.findings }
}

async function flattenPage(page: DocumentPage, findings: Finding[]) {
  const image = await imageFromUrl(page.imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = page.width
  canvas.height = page.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error(tr('Unable to prepare the export.', "Impossible de préparer l'export."))
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  getRedactionRects(page, findings).forEach((rectangle) => {
      context.fillStyle = '#17211d'
      context.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
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
    if (!blob) throw new Error(tr(
      'Unable to generate the redacted image.',
      "Impossible de générer l'image expurgée.",
    ))
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
