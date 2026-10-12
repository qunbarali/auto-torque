/**
 * Parse administrator-supplied LAN origins for an opt-in private-network
 * deployment. Only exact HTTP(S) origins are accepted; paths, credentials,
 * query strings, fragments, wildcards, and malformed entries are rejected.
 */
export function parseTrustedLanOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return []

  const origins = new Set<string>()

  for (const entry of value.split(',')) {
    const candidate = entry.trim()
    if (!candidate) continue

    try {
      const url = new URL(candidate)
      const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
      const hasOnlyOriginPath = url.pathname === '/' || url.pathname === ''
      if (
        isHttp &&
        !url.username &&
        !url.password &&
        hasOnlyOriginPath &&
        !url.search &&
        !url.hash
      ) {
        origins.add(url.origin)
      }
    } catch {
      // Invalid values are ignored. Never turn configuration into a wildcard.
    }
  }

  return [...origins]
}
