type NativeShareNavigator = {
  share?: (data?: ShareData) => Promise<void>
  canShare?: (data?: ShareData) => boolean
}

function currentNavigator(): NativeShareNavigator | null {
  return typeof navigator === 'undefined' ? null : navigator
}

export function supportsNativeFileShare(
  kind: 'pdf' | 'image',
  target: NativeShareNavigator | null = currentNavigator(),
) {
  if (typeof target?.share !== 'function' || typeof target.canShare !== 'function') return false
  const file = new File([], kind === 'image' ? 'safeshare.png' : 'safeshare.pdf', {
    type: kind === 'image' ? 'image/png' : 'application/pdf',
  })
  try {
    return target.canShare({ files: [file] })
  } catch {
    return false
  }
}

export async function shareFileNatively(
  file: File,
  target: NativeShareNavigator | null = currentNavigator(),
) {
  if (typeof target?.share !== 'function' || target.canShare?.({ files: [file] }) === false) {
    throw new Error('Native file sharing is unavailable.')
  }
  await target.share({ files: [file] })
}
