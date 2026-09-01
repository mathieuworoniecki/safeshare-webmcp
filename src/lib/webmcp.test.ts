import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerSafeShareTools, type WebMCPActions, type WebMCPStatus } from './webmcp'
import type { AppSnapshot } from '../types'

const snapshot: AppSnapshot = {
  document: {
    id: 'doc-1',
    name: 'lea-martin-confidentiel.pdf',
    kind: 'pdf',
    size: 10,
    createdAt: 1,
    pages: [{ index: 0, imageUrl: 'data:', width: 100, height: 100 }],
  },
  findings: [
    {
      id: 'MAIL-1-01',
      type: 'email',
      label: 'Adresse e-mail',
      maskedPreview: 'l•••@example.fr',
      confidence: 0.98,
      pageIndex: 0,
      box: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
      source: 'text',
    },
  ],
  selectedFindingId: null,
  selectedPage: 0,
  scanProgress: { phase: 'ready', value: 100, message: 'ready' },
  canUndo: true,
  canRedo: false,
}

afterEach(() => {
  Object.defineProperty(document, 'modelContext', { value: undefined, configurable: true })
})

describe('WebMCP integration', () => {
  it('registers nine scoped tools and removes them through AbortSignal', async () => {
    const tools: WebMCPTool[] = []
    const signals: AbortSignal[] = []
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: vi.fn(async (tool: WebMCPTool, options?: { signal?: AbortSignal }) => {
          tools.push(tool)
          if (options?.signal) signals.push(options.signal)
        }),
      },
    })
    const actions: WebMCPActions = {
      getSnapshot: () => snapshot,
      focusFinding: vi.fn(() => true),
      deleteFinding: vi.fn(() => true),
      addManualRedaction: vi.fn(() => 'ZONE-1-01'),
      undoLastAction: vi.fn(() => true),
      prepareExport: vi.fn(() => ({
        ready: false, blockers: 1, zones: 1, invalidBoxes: 1,
        guarantees: [], issues: ['one invalid zone'],
      })),
    }
    let status: WebMCPStatus = 'unsupported'
    const cleanup = registerSafeShareTools(actions, (next) => { status = next })
    await vi.waitFor(() => expect(status).toBe('available'))

    expect(tools).toHaveLength(9)
    expect(tools.every((tool) => tool.inputSchema)).toBe(true)
    cleanup()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('never returns the sensitive file name or masked values to the agent', async () => {
    const tools: WebMCPTool[] = []
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: { registerTool: async (tool: WebMCPTool) => { tools.push(tool) } },
    })
    const actions = {
      getSnapshot: () => snapshot,
      focusFinding: () => true,
      deleteFinding: () => true,
      addManualRedaction: () => 'ZONE-1-01',
      undoLastAction: () => true,
      prepareExport: () => ({
        ready: false, blockers: 1, zones: 1, invalidBoxes: 1,
        guarantees: [], issues: ['one invalid zone'],
      }),
    }
    registerSafeShareTools(actions, () => undefined)
    await vi.waitFor(() => expect(tools).toHaveLength(9))

    const summary = await tools.find((tool) => tool.name === 'get_mask_editor_state')!.execute({})
    const findings = await tools.find((tool) => tool.name === 'list_redaction_zones')!.execute({})
    const combined = JSON.stringify([summary, findings])
    expect(combined).not.toContain('lea-martin-confidentiel')
    expect(combined).not.toContain('example.fr')
    expect(combined).toContain('MAIL-1-01')
  })
})
