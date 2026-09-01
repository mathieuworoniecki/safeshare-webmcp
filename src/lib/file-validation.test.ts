import { describe, expect, it } from 'vitest'
import { detectFileSignature } from './file-validation'

describe('file signature validation', () => {
  it('recognizes supported binary signatures instead of trusting the extension', () => {
    expect(detectFileSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf')
    expect(detectFileSignature(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('png')
    expect(detectFileSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(detectFileSignature(new TextEncoder().encode('RIFF0000WEBP'))).toBe('webp')
  })

  it('rejects unsupported content', () => {
    expect(detectFileSignature(new TextEncoder().encode('<script>alert(1)</script>'))).toBeNull()
  })
})
