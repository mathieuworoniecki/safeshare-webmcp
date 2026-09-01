import { describe, expect, it, vi } from 'vitest'
import { shareFileNatively, supportsNativeFileShare } from './native-share'

describe('native file sharing', () => {
  it('checks the exact exported file type before showing the action', () => {
    const canShare = vi.fn((_data?: ShareData) => true)
    const target = { canShare, share: vi.fn(async () => undefined) }

    expect(supportsNativeFileShare('pdf', target)).toBe(true)
    expect(canShare.mock.calls[0]?.[0]?.files?.[0]?.type).toBe('application/pdf')
  })

  it('shares only after a direct call and rejects unsupported targets', async () => {
    const share = vi.fn(async () => undefined)
    const target = { canShare: vi.fn((_data?: ShareData) => true), share }
    const file = new File(['safe'], 'copy.pdf', { type: 'application/pdf' })

    await shareFileNatively(file, target)
    expect(share).toHaveBeenCalledWith({ files: [file] })
    await expect(shareFileNatively(file, null)).rejects.toThrow('unavailable')
  })
})
