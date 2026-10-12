/**
 * Validate a LAN host address used to connect a secondary client.
 * We deliberately reject public hostnames/IPs: this workflow is for a
 * private local network, not an internet deployment.
 */
export function normalizeLanHostAddress(value: string): string | null {
  const candidate = value.trim()
  if (!candidate || candidate.length > 300) return null

  try {
    const url = new URL(candidate)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return null

    const host = url.hostname.toLowerCase()
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    const isLocalName = host.endsWith('.local')
    const octets = host.split('.').map((part) => /^\\d+$/.test(part) ? Number(part) : -1)
    const validIpv4 = octets.length === 4 && octets.every((part) => part >= 0 && part <= 255)
    const isPrivateIpv4 = validIpv4 && (
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 127)
    )
    const isPrivateIpv6 = host.startsWith('[fc') || host.startsWith('[fd') || host.startsWith('[fe80:')
    if (!(isLocalhost || isLocalName || isPrivateIpv4 || isPrivateIpv6)) return null

    return url.origin
  } catch {
    return null
  }
}
