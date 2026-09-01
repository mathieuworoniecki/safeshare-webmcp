export type FindingType =
  | 'email'
  | 'phone'
  | 'iban'
  | 'identity'
  | 'address'
  | 'date'
  | 'name'
  | 'manual'

export type FindingStatus = 'pending' | 'approved' | 'dismissed'

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
  status: FindingStatus
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
  exportDialogOpen: boolean
  canUndo: boolean
  canRedo: boolean
}

export type ActivityEntry = {
  id: string
  actor: 'human' | 'agent'
  message: string
  createdAt: number
}
