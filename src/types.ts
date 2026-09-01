export type FindingType =
  | 'email'
  | 'phone'
  | 'iban'
  | 'identity'
  | 'address'
  | 'date'
  | 'name'
  | 'manual'

export type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
}

export type Finding = {
  id: string
  type: FindingType
  label: string
  maskedPreview: string
  confidence: number
  pageIndex: number
  box: BoundingBox
  source: 'text' | 'ocr' | 'manual' | 'demo'
  reason?: string
}

export type DocumentPage = {
  index: number
  imageUrl: string
  width: number
  height: number
}

export type SafeDocument = {
  id: string
  name: string
  kind: 'pdf' | 'image' | 'demo'
  size: number
  pages: DocumentPage[]
  createdAt: number
}

export type ScanProgress = {
  phase: 'idle' | 'reading' | 'rendering' | 'scanning' | 'ready' | 'error'
  value: number
  message: string
}

export type AppSnapshot = {
  document: SafeDocument | null
  findings: Finding[]
  selectedFindingId: string | null
  selectedPage: number
  scanProgress: ScanProgress
  canUndo: boolean
  canRedo: boolean
}
