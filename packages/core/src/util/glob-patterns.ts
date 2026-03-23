export function normalizeGlobPattern(pattern: string): string {
  return pattern.replace(/\\/g, '/')
}

export function buildExtensionGlob(extensions: readonly string[]): string {
  return extensions.length === 1
    ? `*${extensions[0]}`
    : `*{${extensions.join(',')}}`
}
