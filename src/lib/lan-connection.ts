/**
 * Validate a LAN host address used to connect a secondary client.
 * This workflow is for a different device on a private network, so loopback
 * addresses are rejected: localhost on the secondary is not the main host.
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
      (url.pathname !== '/' && url.pathname !== '') ||
      url.search ||
      url.hash
    ) return null

    const host = url.hostname.toLowerCase()
    const isLocalName = host.endsWith('.local')
    const octets = host.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : -1)
    const validIpv4 = octets.length === 4 && octets.every((part) => part >= 0 && part <= 255)
    const isPrivateIpv4 = validIpv4 && (
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254)
    )
    // URL.hostname includes brackets for IPv6 literals in browser runtimes.
    const ipv6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
    const isPrivateIpv6 = ipv6.includes(':') && (
      /^f[cd][0-9a-f:]*$/i.test(ipv6) ||
      /^fe[89ab][0-9a-f:]*$/i.test(ipv6)
    )

    if (!(isLocalName || isPrivateIpv4 || isPrivateIpv6)) return null
    return url.origin
  } catch {
    return null
  }
}
