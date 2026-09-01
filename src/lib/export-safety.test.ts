import { describe, expect, it } from 'vitest'
import { buildExportSafetyReport, getRedactionRects } from './export-safety'
import type { Finding, SafeDocument } from '../types'

const safeDocument: SafeDocument = {
  id: 'doc', name: 'sample.pdf', kind: 'pdf', size: 1, createdAt: 1,
  pages: [{ index: 0, imageUrl: 'data:', width: 1000, height: 1400 }],
}

const finding: Finding = {
  id: 'MAIL-1-01', type: 'email', label: 'Adresse e-mail', maskedPreview: 'm•••@example.test',
  confidence: 0.98, pageIndex: 0, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 },
  status: 'approved', source: 'text',
}

describe('export safety', () => {
  it('blocks export until every finding has a decision', () => {
    expect(buildExportSafetyReport(safeDocument, [{ ...finding, status: 'pending' }])).toMatchObject({
      ready: false,
      pending: 1,
      blockers: 1,
    })
    expect(buildExportSafetyReport(safeDocument, [finding])).toMatchObject({ ready: true, pending: 0 })
  })

  it('rasterizes approved findings only and keeps padded rectangles inside the page', () => {
    const rectangles = getRedactionRects(safeDocument.pages[0], [
      finding,
      { ...finding, id: 'MAIL-1-02', status: 'dismissed' },
      { ...finding, id: 'MAIL-1-03', box: { x: 0, y: 0, width: 0.1, height: 0.1 } },
    ])
    expect(rectangles).toHaveLength(2)
    expect(rectangles[0]).toMatchObject({ x: 97, y: 277, width: 306, height: 76 })
    expect(rectangles[1].x).toBe(0)
    expect(rectangles[1].y).toBe(0)
    expect(rectangles[1].width).toBe(103)
  })
})
