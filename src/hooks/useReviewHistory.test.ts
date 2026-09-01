import { describe, expect, it } from 'vitest'
import { reviewHistoryReducer } from './useReviewHistory'
import type { Finding } from '../types'

const finding: Finding = {
  id: 'ZONE-1-01', type: 'manual', label: 'Zone manuelle', maskedPreview: 'Sélection visuelle',
  confidence: 1, pageIndex: 0, box: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
  status: 'pending', source: 'manual',
}

describe('review history', () => {
  it('undoes and redoes a review decision', () => {
    const initial = { past: [], present: [finding], future: [] }
    const committed = reviewHistoryReducer(initial, {
      type: 'commit',
      update: (current) => current.map((item) => ({ ...item, status: 'approved' as const })),
    })
    expect(committed.present[0].status).toBe('approved')
    const undone = reviewHistoryReducer(committed, { type: 'undo' })
    expect(undone.present[0].status).toBe('pending')
    expect(reviewHistoryReducer(undone, { type: 'redo' }).present[0].status).toBe('approved')
  })
})
