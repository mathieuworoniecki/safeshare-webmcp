import { useCallback, useReducer } from 'react'
import type { Finding } from '../types'

type HistoryState = {
  past: Finding[][]
  present: Finding[]
  future: Finding[][]
}

type HistoryAction =
  | { type: 'reset'; findings: Finding[] }
  | { type: 'commit'; update: (current: Finding[]) => Finding[] }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 60

export function reviewHistoryReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'reset') {
    return { past: [], present: action.findings, future: [] }
  }

  if (action.type === 'commit') {
    const next = action.update(state.present)
    if (next === state.present) return state
    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: next,
      future: [],
    }
  }

  if (action.type === 'undo') {
    const previous = state.past.at(-1)
    if (!previous) return state
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    }
  }

  const next = state.future[0]
  if (!next) return state
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: state.future.slice(1),
  }
}

export function useReviewHistory() {
  const [state, dispatch] = useReducer(reviewHistoryReducer, {
    past: [],
    present: [],
    future: [],
  })

  const resetFindings = useCallback((findings: Finding[]) => dispatch({ type: 'reset', findings }), [])
  const commitFindings = useCallback(
    (update: (current: Finding[]) => Finding[]) => dispatch({ type: 'commit', update }),
    [],
  )
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  return {
    findings: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    resetFindings,
    commitFindings,
    undo,
    redo,
  }
}
