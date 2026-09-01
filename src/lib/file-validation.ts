import { tr } from './i18n'

export type SupportedFileKind = 'pdf' | 'png' | 'jpeg' | 'webp'

export function detectFileSignature(bytes: Uint8Array): SupportedFileKind | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'pdf'
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  ) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'webp'
  return null
}

export async function validateUploadedFile(file: File): Promise<SupportedFileKind> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const kind = detectFileSignature(bytes)
  if (!kind) throw new Error(tr(
    'The file content is not a valid PDF, PNG, JPG or WEBP document.',
    'Le contenu du fichier ne correspond pas à un PDF, PNG, JPG ou WEBP valide.',
  ))

  const declaredKind = file.type === 'application/pdf'
    ? 'pdf'
    : file.type === 'image/png'
      ? 'png'
      : file.type === 'image/jpeg'
        ? 'jpeg'
        : file.type === 'image/webp'
          ? 'webp'
          : null

  if (declaredKind && declaredKind !== kind) {
    throw new Error(tr(
      'The declared file type does not match its content.',
      'Le type déclaré du fichier ne correspond pas à son contenu.',
    ))
  }
  return kind
}
